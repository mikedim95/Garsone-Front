import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useOrdersStore } from '@/store/ordersStore';
import { Order, OrderStatus, Table } from '@/types';
import { OrderCard } from '@/components/waiter/OrderCard';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { DashboardHeader } from '@/components/DashboardHeader';
import { realtimeService } from '@/lib/realtime';
import { useToast } from '@/hooks/use-toast';
import { LogOut, Check, X } from 'lucide-react';
import { useDashboardTheme } from '@/hooks/useDashboardDark';

const ORDER_FETCH_LIMIT = 50;

type StatusKey = 'ALL' | 'PLACED' | 'PREPARING' | 'READY' | 'SERVED' | 'PAID' | 'CANCELLED';
type OrderEventPayload = {
  orderId?: string;
  tableId?: string;
  tableLabel?: string;
  note?: string;
  totalCents?: number;
  createdAt?: string;
  items?: unknown[];
};
type WaiterCallPayload = {
  tableId?: string;
  action?: string;
};
type TableWaiter = { id?: string | null };
interface TableWithWaiters extends Table {
  waiters?: TableWaiter[];
}
const ORDER_STATUS_VALUES: OrderStatus[] = ['PLACED', 'PREPARING', 'READY', 'SERVED', 'PAID', 'CANCELLED'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isOrderStatus = (value: unknown): value is OrderStatus =>
  typeof value === 'string' && ORDER_STATUS_VALUES.includes(value as OrderStatus);

const centsToCurrency = (value?: number | null) =>
  typeof value === 'number' ? value / 100 : 0;

const normalizeOrderItem = (raw: unknown, idx: number): Order['items'][number] => {
  const record = isRecord(raw) ? raw : {};
  const quantityCandidate = record.quantity ?? record.qty;
  const quantity = typeof quantityCandidate === 'number' && quantityCandidate > 0 ? quantityCandidate : 1;
  const price =
    typeof record.unitPrice === 'number'
      ? record.unitPrice
      : typeof record.unitPriceCents === 'number'
        ? record.unitPriceCents / 100
        : typeof record.priceCents === 'number'
          ? record.priceCents / 100
          : typeof record.price === 'number'
            ? record.price
            : 0;
  const name =
    (typeof record.title === 'string' && record.title) ||
    (typeof record.name === 'string' && record.name) ||
    (typeof record.itemTitle === 'string' && record.itemTitle) ||
    `Item ${idx + 1}`;
  const itemId =
    (typeof record.itemId === 'string' && record.itemId) ||
    (typeof record.id === 'string' && record.id) ||
    `${name}-${idx}`;
  if (isRecord(record.item)) {
    const itemRecord = record.item;
    const modifiersRaw = record.selectedModifiers;
    const selectedModifiers =
      isRecord(modifiersRaw)
        ? Object.entries(modifiersRaw).reduce<Record<string, string>>((acc, [key, value]) => {
            if (typeof value === 'string') acc[key] = value;
            return acc;
          }, {})
        : {};
    return {
      item: {
        id: typeof itemRecord.id === 'string' ? itemRecord.id : itemId,
        name: typeof itemRecord.name === 'string' ? itemRecord.name : name,
        description: typeof itemRecord.description === 'string' ? itemRecord.description : '',
        price:
          typeof itemRecord.price === 'number'
            ? itemRecord.price
            : typeof itemRecord.priceCents === 'number'
              ? itemRecord.priceCents / 100
              : price,
        image: typeof itemRecord.image === 'string' ? itemRecord.image : '',
        category: typeof itemRecord.category === 'string' ? itemRecord.category : '',
        available: itemRecord.available !== false,
      },
      quantity,
      selectedModifiers,
    };
  }
  return {
    item: {
      id: itemId,
      name,
      description: '',
      price,
      image: '',
      category: '',
      available: true,
    },
    quantity,
    selectedModifiers: {},
  };
};

const normalizeOrder = (raw: unknown, fallbackIndex: number): Order | null => {
  if (!isRecord(raw)) return null;
  const id =
    typeof raw.id === 'string' && raw.id
      ? raw.id
      : `order-${fallbackIndex}-${Date.now()}`;
  const tableId =
    typeof raw.tableId === 'string' && raw.tableId
      ? raw.tableId
      : `table-${fallbackIndex}`;
  const tableLabel =
    (typeof raw.tableLabel === 'string' && raw.tableLabel) ||
    (typeof raw.table === 'string' && raw.table) ||
    tableId;
  const rawStatus = typeof raw.status === 'string' ? raw.status.toUpperCase() : undefined;
  const status =
    isOrderStatus(rawStatus)
      ? rawStatus
      : rawStatus === 'ACCEPTED'
        ? 'PREPARING'
        : 'PLACED';
  const note = typeof raw.note === 'string' ? raw.note : '';
  const total =
    typeof raw.total === 'number'
      ? raw.total
      : centsToCurrency(typeof raw.totalCents === 'number' ? raw.totalCents : null);
  const createdAt =
    typeof raw.createdAt === 'string' && raw.createdAt
      ? raw.createdAt
      : new Date().toISOString();
  const itemsArray = Array.isArray(raw.items) ? raw.items : [];
  const items = itemsArray.map((item, idx) => normalizeOrderItem(item, idx));
  return {
    id,
    tableId,
    tableLabel,
    status,
    note,
    total,
    createdAt,
    items,
  };
};

const isOrderEventPayload = (payload: unknown): payload is OrderEventPayload =>
  isRecord(payload) && typeof payload.orderId === 'string';

const isWaiterCallPayload = (payload: unknown): payload is WaiterCallPayload =>
  isRecord(payload) && typeof payload.tableId === 'string';

export default function WaiterDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { user, logout, isAuthenticated } = useAuthStore();
  const { dashboardDark, themeClass } = useDashboardTheme();

  const ordersAll = useOrdersStore((s) => s.orders);
  const setOrdersLocal = useOrdersStore((s) => s.setOrders);
  const upsertOrder = useOrdersStore((s) => s.upsert);
  const updateLocalStatus = useOrdersStore((s) => s.updateStatus);
  const ordersRef = useRef<Order[]>(ordersAll);

  const [assignedTableIds, setAssignedTableIds] = useState<Set<string>>(new Set());
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);
  const [storeSlug, setStoreSlug] = useState<string>('demo-cafe');
  const [lastCallTableId, setLastCallTableId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusKey>('ALL');
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    ordersRef.current = ordersAll;
  }, [ordersAll]);

  useEffect(() => {
    if (!isAuthenticated() || user?.role !== 'waiter') {
      navigate('/login');
    }
  }, [isAuthenticated, user, navigate]);

  // Load assignments + store slug
  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        const store = await api.getStore();
        const slug = store?.store?.slug;
        const name = store?.store?.name;
        if (name) {
          try {
            localStorage.setItem('STORE_NAME', name);
          } catch (error) {
            console.warn('Failed to persist STORE_NAME', error);
          }
        }
        if (slug) {
          setStoreSlug(slug);
          try {
            localStorage.setItem('STORE_SLUG', slug);
            window.dispatchEvent(new CustomEvent('store-slug-changed', { detail: { slug } }));
          } catch (error) {
            console.warn('Failed to persist STORE_SLUG', error);
          }
        }
        const tablesRes = await api.getTables();
        const myId = user?.id;
        const tables = (tablesRes.tables ?? []) as TableWithWaiters[];
        const hasWaiterData = tables.some((table) => Array.isArray(table.waiters));
        if (!hasWaiterData) {
          // Avoid wiping assignments when waiter info is missing from payload
          setAssignmentsLoaded(true);
          return;
        }
        const next = new Set<string>();
        tables.forEach((table) => {
          if (!table.id) return;
          const waiters = Array.isArray(table.waiters) ? table.waiters : [];
          if (waiters.some((waiter) => waiter?.id === myId)) {
            next.add(table.id);
          }
        });
        // Only overwrite if we actually received waiter data; otherwise keep previous assignments
        setAssignedTableIds(next);
      } catch (error) {
        console.error('Failed to load waiter assignments', error);
      } finally {
        setAssignmentsLoaded(true);
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
        const data = await api.getOrders({
          take: ORDER_FETCH_LIMIT,
          tableIds: assignedTableIds.size > 0 ? Array.from(assignedTableIds) : undefined,
        });
        const mapped = (data.orders ?? [])
          .map((order, index) => normalizeOrder(order, index))
          .filter((order): order is Order => Boolean(order))
          .filter((order) => assignedTableIds.size === 0 || assignedTableIds.has(order.tableId));
        setOrdersLocal(mapped);
      } catch (error) {
        console.error('Initial orders load failed', error);
      }
    })();
  }, [assignmentsLoaded, user, setOrdersLocal, assignedTableIds]);

  // Realtime updates → mutate local cache
  useEffect(() => {
    if (!assignmentsLoaded) return;
    let unsubscribed = false;
    const hydrateOrder = async (orderId: string) => {
      if (ordersRef.current.some((o) => o.id === orderId)) return;
      try {
        const res = await api.getOrder(orderId);
        const normalized = normalizeOrder(res.order, Date.now());
        if (normalized && (assignedTableIds.size === 0 || assignedTableIds.has(normalized.tableId))) {
          upsertOrder(normalized);
        }
      } catch (error) {
        console.error('Failed to hydrate order from realtime event', error);
      }
    };
    const handlePlaced = (payload: unknown) => {
      if (!isOrderEventPayload(payload)) return;
      if (assignedTableIds.size > 0 && payload.tableId && !assignedTableIds.has(payload.tableId)) return;
      const normalized = normalizeOrder(
        {
          id: payload.orderId,
          tableId: payload.tableId,
          tableLabel: payload.tableLabel,
          note: payload.note,
          totalCents: payload.totalCents,
          createdAt: payload.createdAt,
          status: 'PLACED',
          items: payload.items,
        },
        Date.now()
      );
      if (!normalized) return;
      upsertOrder(normalized);
      toast({ title: t('toasts.new_order'), description: t('toasts.table', { table: normalized.tableLabel }) });
    };
    const handlePreparing = async (payload: unknown) => {
      if (!isOrderEventPayload(payload)) return;
      if (assignedTableIds.size > 0 && payload.tableId && !assignedTableIds.has(payload.tableId)) return;
      updateLocalStatus(payload.orderId!, 'PREPARING');
      await hydrateOrder(payload.orderId!);
    };
    const handleReady = async (payload: unknown) => {
      if (!isOrderEventPayload(payload)) return;
      if (assignedTableIds.size > 0 && payload.tableId && !assignedTableIds.has(payload.tableId)) return;
      updateLocalStatus(payload.orderId!, 'READY');
      await hydrateOrder(payload.orderId!);
      toast({ title: t('toasts.order_ready'), description: t('toasts.table', { table: payload.tableId ?? '' }) });
    };
    const handleCancelled = async (payload: unknown) => {
      if (!isOrderEventPayload(payload)) return;
      if (assignedTableIds.size > 0 && payload.tableId && !assignedTableIds.has(payload.tableId)) return;
      updateLocalStatus(payload.orderId!, 'CANCELLED');
      await hydrateOrder(payload.orderId!);
      toast({ title: t('toasts.order_cancelled'), description: t('toasts.table', { table: payload.tableId ?? '' }) });
    };
    const handlePaid = async (payload: unknown) => {
      if (!isOrderEventPayload(payload)) return;
      if (assignedTableIds.size > 0 && payload.tableId && !assignedTableIds.has(payload.tableId)) return;
      updateLocalStatus(payload.orderId!, 'PAID');
      await hydrateOrder(payload.orderId!);
    };
    const handleWaiterCall = (payload: unknown) => {
      if (!isWaiterCallPayload(payload)) return;
      if (assignedTableIds.size > 0 && !assignedTableIds.has(payload.tableId)) return;
      if (payload.action === 'called') {
        setLastCallTableId(payload.tableId);
        toast({ title: t('toasts.waiter_called'), description: t('toasts.table', { table: payload.tableId }) });
      } else if (payload.action === 'cleared') {
        setLastCallTableId((current) => (current === payload.tableId ? null : current));
      }
    };
    realtimeService
      .connect()
      .then(() => {
        if (unsubscribed) return;
        realtimeService.subscribe(`${storeSlug}/orders/placed`, handlePlaced);
        realtimeService.subscribe(`${storeSlug}/orders/prepairing`, handlePreparing);
        realtimeService.subscribe(`${storeSlug}/orders/preparing`, handlePreparing);
        realtimeService.subscribe(`${storeSlug}/orders/ready`, handleReady);
        realtimeService.subscribe(`${storeSlug}/orders/cancelled`, handleCancelled);
        realtimeService.subscribe(`${storeSlug}/orders/canceled`, handleCancelled);
        realtimeService.subscribe(`${storeSlug}/orders/paid`, handlePaid);
        realtimeService.subscribe(`${storeSlug}/waiter/call`, handleWaiterCall);
      })
      .catch((error) => {
        console.warn('Realtime connection failed', error);
      });
    return () => {
      unsubscribed = true;
      realtimeService.unsubscribe(`${storeSlug}/orders/placed`, handlePlaced);
      realtimeService.unsubscribe(`${storeSlug}/orders/prepairing`, handlePreparing);
      realtimeService.unsubscribe(`${storeSlug}/orders/preparing`, handlePreparing);
      realtimeService.unsubscribe(`${storeSlug}/orders/ready`, handleReady);
      realtimeService.unsubscribe(`${storeSlug}/orders/cancelled`, handleCancelled);
      realtimeService.unsubscribe(`${storeSlug}/orders/canceled`, handleCancelled);
      realtimeService.unsubscribe(`${storeSlug}/orders/paid`, handlePaid);
      realtimeService.unsubscribe(`${storeSlug}/waiter/call`, handleWaiterCall);
    };
  }, [assignmentsLoaded, storeSlug, assignedTableIds, upsertOrder, updateLocalStatus, toast, t]);

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

  const statusButtons: Array<{ key: StatusKey; cls: string }> = [
    { key: 'ALL', cls: 'bg-muted text-foreground hover:bg-muted/80' },
    { key: 'PLACED', cls: 'bg-secondary text-secondary-foreground hover:bg-secondary/80' },
    { key: 'PREPARING', cls: 'bg-accent text-accent-foreground hover:bg-accent/80' },
    { key: 'READY', cls: 'bg-primary/10 text-primary hover:bg-primary/20' },
    { key: 'SERVED', cls: 'bg-card text-muted-foreground hover:bg-muted' },
    { key: 'PAID', cls: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
    { key: 'CANCELLED', cls: 'bg-destructive/10 text-destructive hover:bg-destructive/20' },
  ];

  const handleUpdateStatus = async (orderId: string, status: OrderStatus) => {
    const key = `${status}:${orderId}`;
    setActingIds((s) => new Set(s).add(key));
    try {
      await api.updateOrderStatus(orderId, status);
      updateLocalStatus(orderId, status);
      toast({ title: t('toasts.order_updated'), description: t('toasts.status_changed', { status }) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update status';
      toast({ title: t('toasts.update_failed'), description: message });
    } finally {
      setActingIds((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const themedWrapper = clsx(themeClass, { dark: dashboardDark });

  return (
    <div className={clsx(themedWrapper, 'min-h-screen min-h-dvh')}>
      <div className="min-h-screen min-h-dvh dashboard-bg text-foreground flex flex-col">
      <DashboardHeader
        title={t('waiter.dashboard')}
        subtitle={user?.displayName}
        icon="🍽️"
        tone="accent"
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
        burgerActions={null}
      />

      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-8 flex-1 w-full">
        <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          <div className="h-1 w-10 sm:w-12 bg-gradient-primary rounded-full" />
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">{t('waiter.orders')}</h2>
        </div>

        {/* Status filter toolbar */}
        <div className="flex flex-wrap gap-2 sm:gap-3 mb-6 sm:mb-8 p-2 sm:p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border shadow-sm">
          {statusButtons.map(({ key, cls }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 border shadow-sm hover:shadow-md ${cls} ${statusFilter===key ? 'ring-2 ring-primary ring-offset-2 scale-105' : ''}`}
            >
              {t(`status.${key}`)}
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
              busy={actingIds.has(`SERVED:${order.id}`) || actingIds.has(`PAID:${order.id}`)}
            />
          ))}
        </div>
      </div>
    </div>
    </div>
  );
}
