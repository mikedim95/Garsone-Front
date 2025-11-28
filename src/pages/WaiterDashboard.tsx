import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { PageTransition } from '@/components/ui/page-transition';
import { DashboardGridSkeleton } from '@/components/ui/dashboard-skeletons';

const ORDER_FETCH_LIMIT = 50;
const DEBUG_LOG = true;
const dbg = (...args: any[]) => {
  if (DEBUG_LOG) console.log("[WaiterDashboard]", ...args);
};

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
  const [unassignedTableIds, setUnassignedTableIds] = useState<Set<string>>(new Set());
  const tableLabelByIdRef = useRef<Map<string, string>>(new Map());
  const [shiftWindow, setShiftWindow] = useState<{ start?: string; end?: string } | null>(null);
  const [shiftLoaded, setShiftLoaded] = useState(false);
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);
  const [storeSlug, setStoreSlug] = useState<string>('demo-cafe');
  const [lastCallTableId, setLastCallTableId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusKey>('ALL');
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());
  const [viewFilter, setViewFilter] = useState<'ALL' | 'MY' | 'READY' | 'PENDING'>('ALL');
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    ordersRef.current = ordersAll;
  }, [ordersAll]);

  // Track new orders for brief highlight
  useEffect(() => {
    const seen = seenIdsRef.current;
    const newOnes: string[] = [];
    ordersAll.forEach((order) => {
      if (!seen.has(order.id)) {
        seen.add(order.id);
        newOnes.push(order.id);
      }
    });
    if (newOnes.length) {
      setHighlightedIds((prev) => {
        const next = new Set(prev);
        newOnes.forEach((id) => next.add(id));
        return next;
      });
      newOnes.forEach((id) => {
        setTimeout(() => {
          setHighlightedIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 1800);
      });
    }
  }, [ordersAll]);

  const shouldShowTable = useCallback(
    (tableId?: string | null) => {
      if (assignedTableIds.size === 0) return true;
      if (!tableId) return unassignedTableIds.size > 0;
      return assignedTableIds.has(tableId) || unassignedTableIds.has(tableId);
    },
    [assignedTableIds, unassignedTableIds]
  );

  const withinShift = useCallback(
    (orderLike?: { createdAt?: string; placedAt?: string } | null) => {
      if (!shiftWindow?.start) return true;
      const start = new Date(shiftWindow.start).getTime();
      const end = shiftWindow.end ? new Date(shiftWindow.end).getTime() : null;
      const tsSource = orderLike?.createdAt || orderLike?.placedAt;
      if (!tsSource) return true;
      const ts = new Date(tsSource).getTime();
      if (!Number.isFinite(ts)) return true;
      if (ts < start) return false;
      if (end && ts > end) return false;
      return true;
    },
    [shiftWindow]
  );

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
        tableLabelByIdRef.current = new Map();
        tables.forEach((t) => {
          if (t.id && t.label) tableLabelByIdRef.current.set(t.id, t.label);
        });
        const hasWaiterData = tables.some((table) => Array.isArray(table.waiters));
        if (!hasWaiterData) {
          // Avoid wiping assignments when waiter info is missing from payload
          setAssignmentsLoaded(true);
          return;
        }
        const next = new Set<string>();
        const unassigned = new Set<string>();
        tables.forEach((table) => {
          if (!table.id) return;
          const waiters = Array.isArray(table.waiters) ? table.waiters : [];
          if (waiters.length === 0) {
            unassigned.add(table.id);
          }
          if (waiters.some((waiter) => waiter?.id === myId)) {
            next.add(table.id);
          }
        });
        // Only overwrite if we actually received waiter data; otherwise keep previous assignments
        setAssignedTableIds(next);
        setUnassignedTableIds(unassigned);
        dbg("assignments loaded", {
          assignedCount: next.size,
          unassignedCount: unassigned.size,
          assigned: Array.from(next),
          unassigned: Array.from(unassigned),
          tableLabels: Array.from(next).map((id) => `${id}:${tableLabelByIdRef.current.get(id) ?? 'unknown'}`),
          myId,
        });
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
          tableIds:
            assignedTableIds.size > 0
              ? Array.from(new Set([...assignedTableIds, ...unassignedTableIds]))
              : undefined,
        });
        if (data.shift) {
          setShiftWindow({
            start: data.shift.start,
            end: data.shift.end,
          });
          dbg("shift window", data.shift);
        } else {
          setShiftWindow(null);
          dbg("shift window", "none");
        }
        const mapped = (data.orders ?? [])
          .map((order, index) => normalizeOrder(order, index))
          .filter((order): order is Order => Boolean(order))
          .filter((order) => shouldShowTable(order.tableId) && withinShift(order));
        const tableStats = mapped.reduce<Record<string, number>>((acc, order) => {
          const key = `${order.tableLabel || '??'} (${order.tableId})`;
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {});
        setOrdersLocal(mapped);
        dbg("initial orders", {
          fetched: (data.orders ?? []).length,
          mapped: mapped.length,
          assignedCount: assignedTableIds.size,
          unassignedCount: unassignedTableIds.size,
          tableIdsParam:
            assignedTableIds.size > 0
              ? Array.from(new Set([...assignedTableIds, ...unassignedTableIds]))
              : null,
          tableStats,
        });
      } catch (error) {
        console.error('Initial orders load failed', error);
      } finally {
        setShiftLoaded(true);
      }
    })();
  }, [assignmentsLoaded, user, setOrdersLocal, assignedTableIds, unassignedTableIds, shouldShowTable, withinShift]);

  // Realtime updates → mutate local cache
  useEffect(() => {
    if (!assignmentsLoaded || !shiftLoaded) return;
    let unsubscribed = false;
    const placedTopic = `${storeSlug}/orders/placed`;
    const preparingTopic = `${storeSlug}/orders/preparing`;
    const readyTopic = `${storeSlug}/orders/ready`;
    const cancelledTopic = `${storeSlug}/orders/canceled`;
    const paidTopic = `${storeSlug}/orders/paid`;
    const waiterCallTopic = `${storeSlug}/waiter/call`;

    const hydrateOrder = async (orderId: string) => {
      if (ordersRef.current.some((o) => o.id === orderId)) return;
      try {
        const res = await api.getOrder(orderId);
        const normalized = normalizeOrder(res.order, Date.now());
        if (normalized && shouldShowTable(normalized.tableId) && withinShift(normalized)) {
          upsertOrder(normalized);
          dbg("hydrated order", normalized.id, "table", normalized.tableId);
        }
      } catch (error) {
        console.error('Failed to hydrate order from realtime event', error);
      }
    };
    const handlePlaced = (payload: unknown) => {
      if (!isOrderEventPayload(payload)) return;
      if (!shouldShowTable(payload.tableId) || !withinShift({ createdAt: payload.createdAt })) {
        dbg("skip placed (not my table)", payload.orderId, payload.tableId);
        return;
      }
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
      if (!normalized || !withinShift(normalized)) return;
      upsertOrder(normalized);
      dbg("realtime placed", normalized.id, "table", normalized.tableId);
      toast({ title: t('toasts.new_order'), description: t('toasts.table', { table: normalized.tableLabel }) });
    };
    const handlePreparing = async (payload: unknown) => {
      if (!isOrderEventPayload(payload)) return;
      if (!shouldShowTable(payload.tableId)) {
        dbg("skip preparing (not my table)", payload.orderId, payload.tableId);
        return;
      }
      const existing = ordersRef.current.find((o) => o.id === payload.orderId);
      if (existing && !withinShift(existing)) {
        dbg("skip preparing (outside shift)", payload.orderId, payload.tableId);
        return;
      }
      updateLocalStatus(payload.orderId!, 'PREPARING');
      await hydrateOrder(payload.orderId!);
      dbg("realtime preparing", payload.orderId, "table", payload.tableId);
    };
    const handleReady = async (payload: unknown) => {
      if (!isOrderEventPayload(payload)) return;
      if (!shouldShowTable(payload.tableId)) {
        dbg("skip ready (not my table)", payload.orderId, payload.tableId);
        return;
      }
      const existing = ordersRef.current.find((o) => o.id === payload.orderId);
      if (existing && !withinShift(existing)) {
        dbg("skip ready (outside shift)", payload.orderId, payload.tableId);
        return;
      }
      updateLocalStatus(payload.orderId!, 'READY');
      await hydrateOrder(payload.orderId!);
      toast({ title: t('toasts.order_ready'), description: t('toasts.table', { table: payload.tableId ?? '' }) });
      dbg("realtime ready", payload.orderId, "table", payload.tableId);
    };
    const handleCancelled = async (payload: unknown) => {
      if (!isOrderEventPayload(payload)) return;
      if (!shouldShowTable(payload.tableId)) {
        dbg("skip cancelled (not my table)", payload.orderId, payload.tableId);
        return;
      }
      const existing = ordersRef.current.find((o) => o.id === payload.orderId);
      if (existing && !withinShift(existing)) {
        dbg("skip cancelled (outside shift)", payload.orderId, payload.tableId);
        return;
      }
      updateLocalStatus(payload.orderId!, 'CANCELLED');
      await hydrateOrder(payload.orderId!);
      toast({ title: t('toasts.order_cancelled'), description: t('toasts.table', { table: payload.tableId ?? '' }) });
      dbg("realtime cancelled", payload.orderId, "table", payload.tableId);
    };
    const handlePaid = async (payload: unknown) => {
      if (!isOrderEventPayload(payload)) return;
      if (!shouldShowTable(payload.tableId)) {
        dbg("skip paid (not my table)", payload.orderId, payload.tableId);
        return;
      }
      const existing = ordersRef.current.find((o) => o.id === payload.orderId);
      if (existing && !withinShift(existing)) {
        dbg("skip paid (outside shift)", payload.orderId, payload.tableId);
        return;
      }
      updateLocalStatus(payload.orderId!, 'PAID');
      await hydrateOrder(payload.orderId!);
      dbg("realtime paid", payload.orderId, "table", payload.tableId);
    };
    const handleWaiterCall = (payload: unknown) => {
      if (!isWaiterCallPayload(payload)) return;
      if (!shouldShowTable(payload.tableId)) {
        dbg("skip waiter call (not my table)", payload.tableId, payload.action);
        return;
      }
      if (payload.action === 'called') {
        setLastCallTableId(payload.tableId);
        toast({ title: t('toasts.waiter_called'), description: t('toasts.table', { table: payload.tableId }) });
      } else if (payload.action === 'cleared') {
        setLastCallTableId((current) => (current === payload.tableId ? null : current));
      }
      dbg("waiter call", payload.tableId, payload.action);
    };

    (async () => {
      await realtimeService.connect();
      if (unsubscribed) return;
      realtimeService.subscribe(placedTopic, handlePlaced);
      realtimeService.subscribe(preparingTopic, handlePreparing);
      realtimeService.subscribe(readyTopic, handleReady);
      realtimeService.subscribe(cancelledTopic, handleCancelled);
      realtimeService.subscribe(paidTopic, handlePaid);
      realtimeService.subscribe(waiterCallTopic, handleWaiterCall);
    })();

    return () => {
      unsubscribed = true;
      realtimeService.unsubscribe(placedTopic, handlePlaced);
      realtimeService.unsubscribe(preparingTopic, handlePreparing);
      realtimeService.unsubscribe(readyTopic, handleReady);
      realtimeService.unsubscribe(cancelledTopic, handleCancelled);
      realtimeService.unsubscribe(paidTopic, handlePaid);
      realtimeService.unsubscribe(waiterCallTopic, handleWaiterCall);
    };
  }, [assignmentsLoaded, shiftLoaded, storeSlug, assignedTableIds, shouldShowTable, upsertOrder, updateLocalStatus, toast, t, withinShift]);

  // Derived list from local cache
  const orders = useMemo(() => {
    let list = ordersAll.filter((o) => shouldShowTable(o.tableId) && withinShift(o));
    if (viewFilter === 'MY') {
      list = list.filter((o) => (o.tableId ? assignedTableIds.has(o.tableId) : false));
    } else if (viewFilter === 'READY') {
      list = list.filter((o) => o.status === 'READY');
    } else if (viewFilter === 'PENDING') {
      list = list.filter((o) => o.status === 'PLACED' || o.status === 'PREPARING');
    }
    if (statusFilter !== 'ALL') {
      list = list.filter((o) => o.status === statusFilter);
    }
    return list;
  }, [ordersAll, shouldShowTable, statusFilter, withinShift, viewFilter, assignedTableIds]);

  useEffect(() => {
    const tableStats = orders.reduce<Record<string, number>>((acc, order) => {
      const key = `${order.tableLabel || '??'} (${order.tableId})`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    dbg("render orders derived", {
      total: ordersAll.length,
      visible: orders.length,
      filter: statusFilter,
      tableStats,
    });
  }, [ordersAll.length, orders.length, statusFilter, orders]);

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
  const loadingOrders = !assignmentsLoaded || !shiftLoaded;

  return (
    <PageTransition className={clsx(themedWrapper, 'min-h-screen min-h-dvh')}>
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="h-1 w-10 sm:w-12 bg-gradient-primary rounded-full" />
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">{t('waiter.orders')}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {[
              { key: 'ALL', label: 'All' },
              { key: 'MY', label: 'My tables' },
              { key: 'READY', label: 'Ready' },
              { key: 'PENDING', label: 'Pending' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setViewFilter(key as 'ALL' | 'MY' | 'READY' | 'PENDING')}
                className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition active:scale-95 border shadow-sm hover:shadow-md ${
                  viewFilter === key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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

        {loadingOrders ? (
          <DashboardGridSkeleton count={6} />
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onUpdateStatus={handleUpdateStatus}
                mode="waiter"
                busy={actingIds.has(`SERVED:${order.id}`) || actingIds.has(`PAID:${order.id}`)}
                highlighted={highlightedIds.has(order.id)}
              />
            ))}
          </div>
        )}
      </div>
      </div>
    </PageTransition>
  );
}
