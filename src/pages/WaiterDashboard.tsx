import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useOrdersStore } from '@/store/ordersStore';
import { Order, OrderStatus } from '@/types';
import { OrderCard } from '@/components/waiter/OrderCard';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { DashboardHeader } from '@/components/DashboardHeader';
import { realtimeService } from '@/lib/realtime';
import { useToast } from '@/hooks/use-toast';
import { LogOut, Check, X } from 'lucide-react';

type StatusKey = 'ALL' | 'PLACED' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';

export default function WaiterDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { user, logout, isAuthenticated } = useAuthStore();

  const ordersAll = useOrdersStore((s) => s.orders);
  const setOrdersLocal = useOrdersStore((s) => s.setOrders);
  const upsertOrder = useOrdersStore((s) => s.upsert);
  const updateLocalStatus = useOrdersStore((s) => s.updateStatus);

  const [assignedTableIds, setAssignedTableIds] = useState<Set<string>>(new Set());
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);
  const [storeSlug, setStoreSlug] = useState<string>('demo-cafe');
  const [lastCallTableId, setLastCallTableId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusKey>('ALL');
  const [take] = useState<number>(50);
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated() || user?.role !== 'waiter') {
      navigate('/login');
    }
  }, [isAuthenticated, user, navigate]);

  // Load assignments + store slug
  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        const store = (await api.getStore()) as any;
        if (store?.store?.slug) {
          setStoreSlug(store.store.slug);
          try {
            localStorage.setItem('STORE_SLUG', store.store.slug);
            window.dispatchEvent(new CustomEvent('store-slug-changed', { detail: { slug: store.store.slug } }));
          } catch {}
        }
        const tablesRes = (await api.getTables()) as any;
        const myId = user?.id;
        const next = new Set<string>();
        for (const t of tablesRes?.tables || []) {
          if ((t.waiters || []).some((w: any) => w.id === myId)) {
            next.add(t.id);
          }
        }
        setAssignedTableIds(next);
        setAssignmentsLoaded(true);
      } catch {
        // ignore
      }
    };
    fetchAssignments();
    const int = setInterval(fetchAssignments, 30000);
    return () => clearInterval(int);
  }, [user?.id]);

  // Initial hydrate from backend (always replace local cache once per mount)
  useEffect(() => {
    if (!assignmentsLoaded || !user) return;
    (async () => {
      try {
        const data = (await api.getOrders({ take })) as any;
        const mapped = (data.orders || []).map((o: any) => ({
          id: o.id,
          tableId: o.tableId,
          tableLabel: o.tableLabel ?? o.table ?? o.tableId ?? 'T',
          status: o.status,
          note: o.note,
          total: typeof o.total === 'number' ? o.total : (typeof o.totalCents === 'number' ? o.totalCents / 100 : 0),
          createdAt: o.createdAt,
          items: (o.items || []).map((it: any) => {
            const quantity = it?.quantity ?? it?.qty ?? 1;
            const price = typeof it?.unitPrice === 'number'
              ? it.unitPrice
              : typeof it?.unitPriceCents === 'number'
                ? it.unitPriceCents / 100
                : typeof it?.priceCents === 'number'
                  ? it.priceCents / 100
                  : typeof it?.price === 'number'
                    ? it.price
                    : 0;
            const name = it?.title ?? it?.name ?? it?.itemTitle ?? `Item ${String(it?.itemId || '').slice(-4)}`;
            return ({
              item: {
                id: it.itemId ?? it.id ?? name,
                name,
                description: '',
                price,
                image: '',
                category: '',
                available: true,
              },
              quantity,
              selectedModifiers: {},
            });
          }),
        })) as Order[];
        setOrdersLocal(mapped);
      } catch (e) {
        console.error('Initial orders load failed', e);
      }
    })();
  }, [assignmentsLoaded, user, setOrdersLocal, take]);

  // Realtime updates → mutate local cache
  useEffect(() => {
    if (!assignmentsLoaded) return;
    realtimeService.connect().then(() => {
      // New orders
      realtimeService.subscribe(`${storeSlug}/orders/placed`, (msg: any) => {
        if (!msg?.orderId) return;
        const order: Order = {
          id: msg.orderId,
          tableId: msg.tableId,
          tableLabel: msg.tableLabel ?? 'Table',
          status: 'PLACED',
          note: msg.note ?? '',
          total: (msg.totalCents ?? 0) / 100,
          createdAt: msg.createdAt ?? new Date().toISOString(),
          items: (msg.items || []).map((it: any, idx: number) => ({
            item: {
              id: `ticket:${idx}:${it.title}`,
              name: it.title,
              description: '',
              price: (it.unitPriceCents ?? 0) / 100,
              image: '',
              category: '',
              available: true,
            },
            quantity: it.quantity ?? 1,
            selectedModifiers: {},
          })),
        } as Order;
        upsertOrder(order);
        // Let the waiter know
        toast({ title: t('toasts.new_order'), description: t('toasts.table', { table: order.tableLabel }) });
      });

      // Accepted → PREPARING (accept synonym for preparing)
      const onPreparing = async (msg: any) => {
        if (!msg?.orderId) return;
        updateLocalStatus(msg.orderId, 'PREPARING');
        // If order wasn't in cache yet, fetch and upsert (late join)
        const exists = ordersAll.some(o => o.id === msg.orderId);
        if (!exists) {
          try {
            const res = (await api.getOrder(msg.orderId)) as any;
            if (res?.order) upsertOrder(res.order as Order);
          } catch {}
        }
      };
      // Some publishers used a misspelled topic `prepairing`; support both.
      realtimeService.subscribe(`${storeSlug}/orders/prepairing`, onPreparing);
      realtimeService.subscribe(`${storeSlug}/orders/preparing`, onPreparing);

      // Ready
      realtimeService.subscribe(`${storeSlug}/orders/ready`, async (msg: any) => {
        if (!msg?.orderId) return;
        updateLocalStatus(msg.orderId, 'READY');
        const exists = ordersAll.some(o => o.id === msg.orderId);
        if (!exists) {
          try {
            const res = (await api.getOrder(msg.orderId)) as any;
            if (res?.order) upsertOrder(res.order as Order);
          } catch {}
        }
        toast({ title: t('toasts.order_ready'), description: t('toasts.table', { table: msg?.tableId ?? '' }) });
      });

      // Cancelled
      const onCancelled = async (msg: any) => {
        if (!msg?.orderId) return;
        updateLocalStatus(msg.orderId, 'CANCELLED');
        const exists = ordersAll.some(o => o.id === msg.orderId);
        if (!exists) {
          try {
            const res = (await api.getOrder(msg.orderId)) as any;
            if (res?.order) upsertOrder(res.order as Order);
          } catch {}
        }
        toast({ title: t('toasts.order_cancelled'), description: t('toasts.table', { table: msg?.tableId ?? '' }) });
      };
      realtimeService.subscribe(`${storeSlug}/orders/cancelled`, onCancelled);
      realtimeService.subscribe(`${storeSlug}/orders/canceled`, onCancelled);

      // Call waiter (new topic)
      realtimeService.subscribe(`${storeSlug}/waiter/call`, (msg: any) => {
        if (!msg?.tableId) return;
        if (assignedTableIds.size > 0 && !assignedTableIds.has(msg.tableId)) return;
        if (msg.action === 'called') {
          setLastCallTableId(msg.tableId);
          toast({ title: t('toasts.waiter_called'), description: t('toasts.table', { table: msg.tableId }) });
        }
      });
    });
    return () => {
      realtimeService.unsubscribe(`${storeSlug}/orders/placed`);
      realtimeService.unsubscribe(`${storeSlug}/orders/prepairing`);
      realtimeService.unsubscribe(`${storeSlug}/orders/preparing`);
      realtimeService.unsubscribe(`${storeSlug}/orders/ready`);
      realtimeService.unsubscribe(`${storeSlug}/orders/cancelled`);
      realtimeService.unsubscribe(`${storeSlug}/orders/canceled`);
      realtimeService.unsubscribe(`${storeSlug}/waiter/call`);
    };
  }, [assignmentsLoaded, storeSlug, assignedTableIds, upsertOrder, updateLocalStatus, toast]);

  // Derived list from local cache
  const orders = useMemo(() => {
    let list = ordersAll;
    if (user?.role === 'waiter' && assignedTableIds.size > 0) {
      list = list.filter((o) => assignedTableIds.has(o.tableId));
    }
    if (statusFilter !== 'ALL') {
      list = list.filter((o) => o.status === statusFilter);
    }
    return list;
  }, [ordersAll, user?.role, assignedTableIds, statusFilter]);

  const handleUpdateStatus = async (orderId: string, status: OrderStatus) => {
    const key = `${status}:${orderId}`;
    // eslint-disable-next-line no-console
    console.log('[WaiterDashboard] handleUpdateStatus start', { orderId, status, key });
    setActingIds((s) => new Set(s).add(key));
    try {
      await api.updateOrderStatus(orderId, status);
      // eslint-disable-next-line no-console
      console.log('[WaiterDashboard] api.updateOrderStatus ok', { orderId, status });
      updateLocalStatus(orderId, status);
      toast({ title: t('toasts.order_updated'), description: t('toasts.status_changed', { status }) });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[WaiterDashboard] handleUpdateStatus error', { orderId, status, err });
      toast({ title: t('toasts.update_failed'), description: err?.message || 'Could not update status' });
    } finally {
      setActingIds((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
      // eslint-disable-next-line no-console
      console.log('[WaiterDashboard] handleUpdateStatus finally (cleared)', { orderId, status, key });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/30 to-background">
      <DashboardHeader
        title={t('waiter.dashboard')}
        subtitle={user?.displayName}
        icon="🍽️"
        gradientFrom="from-blue-500"
        gradientTo="to-indigo-600"
        rightContent={user ? (
          <div className="text-sm">
            <a href={user.email ? `mailto:${user.email}` : undefined} className="font-medium underline underline-offset-2 hover:text-foreground">
              {user.displayName}
            </a>
            {user.email ? (
              <>
                <span className="mx-2 text-muted-foreground">•</span>
                <a href={`mailto:${user.email}`} className="text-muted-foreground hover:text-foreground">{user.email}</a>
              </>
            ) : null}
          </div>
        ) : undefined}
        burgerActions={
          <>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!lastCallTableId}
                onClick={() => {
                  if (!lastCallTableId) return;
                  realtimeService.publish(`${storeSlug}/waiter/call`, {
                    tableId: lastCallTableId,
                    action: 'accepted',
                    ts: new Date().toISOString(),
                  });
                  toast({ title: t('toasts.call_accepted'), description: t('toasts.table', { table: lastCallTableId }) });
                }}
                className="gap-2 w-full"
                title={t('actions.accept_call')}
              >
                <Check className="h-4 w-4" /> {t('actions.accept_call')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!lastCallTableId}
                onClick={() => {
                  if (!lastCallTableId) return;
                  realtimeService.publish(`${storeSlug}/waiter/call`, {
                    tableId: lastCallTableId,
                    action: 'cleared',
                    ts: new Date().toISOString(),
                  });
                  setLastCallTableId(null);
                  toast({ title: t('toasts.call_cleared'), description: t('toasts.table', { table: lastCallTableId }) });
                }}
                className="gap-2 w-full"
                title={t('actions.clear_call')}
              >
                <X className="h-4 w-4" /> {t('actions.clear_call')}
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className="w-full mt-2">
              <LogOut className="h-4 w-4" /> {t('actions.logout')}
            </Button>
          </>
        }
      />

      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-8">
        <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          <div className="h-1 w-10 sm:w-12 bg-gradient-to-r from-primary to-indigo-500 rounded-full" />
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">{t('waiter.orders')}</h2>
        </div>

        {/* Status filter toolbar */}
        <div className="flex flex-wrap gap-2 sm:gap-3 mb-6 sm:mb-8 p-2 sm:p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border shadow-sm">
          {([
            { key: 'ALL', cls: 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-800 hover:from-gray-200 hover:to-gray-300' },
            { key: 'PLACED', cls: 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-800 hover:from-blue-200 hover:to-blue-300' },
            { key: 'PREPARING', cls: 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-800 hover:from-amber-200 hover:to-amber-300' },
            { key: 'READY', cls: 'bg-gradient-to-br from-green-100 to-green-200 text-green-800 hover:from-green-200 hover:to-green-300' },
            { key: 'SERVED', cls: 'bg-gradient-to-br from-gray-200 to-gray-300 text-gray-700 hover:from-gray-300 hover:to-gray-400' },
            { key: 'CANCELLED', cls: 'bg-gradient-to-br from-red-100 to-red-200 text-red-800 hover:from-red-200 hover:to-red-300' },
          ] as Array<{ key: 'ALL'|'PLACED'|'PREPARING'|'READY'|'SERVED'|'CANCELLED'; cls: string }>).map((b: any) => (
            <button
              key={b.key}
              onClick={() => setStatusFilter(b.key)}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 border shadow-sm hover:shadow-md ${b.cls} ${statusFilter===b.key ? 'ring-2 ring-primary ring-offset-2 scale-105' : ''}`}
            >
              {t(`status.${b.key}`)}
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onUpdateStatus={handleUpdateStatus}
              mode="waiter"
              busy={actingIds.has(`SERVED:${order.id}`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}


