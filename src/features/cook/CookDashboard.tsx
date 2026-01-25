import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { api } from "@/lib/api";
import { formatTableLabel } from "@/lib/formatTableLabel";
import { realtimeService } from "@/lib/realtime";
import type { Order, CartItem, OrderItemStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PageTransition } from "@/components/ui/page-transition";
import { DashboardGridSkeleton } from "@/components/ui/dashboard-skeletons";
import { useToast } from "@/hooks/use-toast";
import { DashboardHeader } from "@/components/DashboardHeader";
import { useDashboardTheme } from "@/hooks/useDashboardDark";
import { CookProView } from "@/components/cook/CookProView";
import { OrderModifiersDialog } from "@/components/cook/OrderModifiersDialog";
import { LayoutGrid, List, ListChecks } from "lucide-react";
import { getStoredStoreSlug, setStoredStoreSlug } from "@/lib/storeSlug";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizePrinterTopicValue = (value?: string | null) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const pickOptionId = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const option = value.find((entry) => typeof entry === "string");
    return typeof option === "string" ? option : null;
  }
  if (isRecord(value)) {
    if (typeof value.id === "string") return value.id;
  }
  return null;
};

const normalizeModifierSelections = (value: unknown): Record<string, string> => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return normalizeModifierSelections(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (Array.isArray(value)) {
    return value.reduce<Record<string, string>>((acc, entry) => {
      if (!isRecord(entry)) return acc;
      const modifierId =
        typeof entry.modifierId === "string"
          ? entry.modifierId
          : typeof entry.id === "string"
            ? entry.id
            : null;
      if (!modifierId) return acc;
      const optionId = pickOptionId(
        entry.modifierOptionId ?? entry.optionId ?? entry.optionIds ?? entry.options
      );
      if (optionId) acc[modifierId] = optionId;
      return acc;
    }, {});
  }
  if (isRecord(value)) {
    if (typeof value.modifierId === "string") {
      const optionId = pickOptionId(
        value.modifierOptionId ?? value.optionId ?? value.optionIds ?? value.options
      );
      return optionId ? { [value.modifierId]: optionId } : {};
    }
    return Object.entries(value).reduce<Record<string, string>>((acc, [modifierId, option]) => {
      const optionId = pickOptionId(option);
      if (optionId) acc[modifierId] = optionId;
      return acc;
    }, {});
  }
  return {};
};

const normalizeItemStatus = (value: unknown): OrderItemStatus | undefined => {
  if (typeof value !== "string") return undefined;
  const upper = value.toUpperCase();
  if (upper === "PLACED" || upper === "ACCEPTED" || upper === "SERVED") {
    return upper as OrderItemStatus;
  }
  return undefined;
};

const getSelectedModifiers = (record: Record<string, unknown>) => {
  const direct = normalizeModifierSelections(record.selectedModifiers);
  if (Object.keys(direct).length > 0) return direct;
  return normalizeModifierSelections(record.modifiers);
};

const normalizeOrderItem = (raw: unknown, idx: number): CartItem => {
  const record = isRecord(raw) ? raw : {};
  const orderItemId = typeof record.id === "string" ? record.id : undefined;
  const status = normalizeItemStatus(record.status);
  const acceptedAt = typeof record.acceptedAt === "string" ? record.acceptedAt : null;
  const servedAt = typeof record.servedAt === "string" ? record.servedAt : null;
  const itemRecord = isRecord(record.item) ? record.item : null;
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
    (itemRecord && typeof itemRecord.name === 'string' && itemRecord.name) ||
    (itemRecord && typeof itemRecord.title === 'string' && itemRecord.title) ||
    `Item ${idx + 1}`;
  const itemId =
    (typeof record.itemId === 'string' && record.itemId) ||
    (typeof record.id === 'string' && record.id) ||
    `${name}-${idx}`;
  const printerTopic =
    typeof record.printerTopic === 'string'
      ? record.printerTopic
      : itemRecord && typeof itemRecord.printerTopic === 'string'
        ? itemRecord.printerTopic
        : null;
  const selectedModifiers = getSelectedModifiers(record);
  return {
    item: {
      id: itemId,
      name,
      description:
        typeof record.description === 'string'
          ? record.description
          : itemRecord && typeof itemRecord.description === 'string'
            ? itemRecord.description
            : '',
      price,
      image: typeof record.image === 'string' ? record.image : '',
      category: typeof record.category === 'string' ? record.category : '',
      printerTopic,
      available: record.available !== false,
      modifiers: itemRecord && Array.isArray(itemRecord.modifiers) ? itemRecord.modifiers : undefined,
    },
    quantity,
    selectedModifiers,
    orderItemId,
    status,
    acceptedAt,
    servedAt,
  };
};

const normalizeOrder = (
  raw: unknown,
  fallbackIndex: number,
  printerTopic?: string | null
): Order | null => {
  if (!isRecord(raw)) return null;
  const id =
    typeof raw.id === 'string' && raw.id
      ? raw.id
      : typeof raw.orderId === 'string' && raw.orderId
        ? raw.orderId
        : `order-${fallbackIndex}-${Date.now()}`;
  const tableId =
    typeof raw.tableId === 'string' && raw.tableId
      ? raw.tableId
      : `table-${fallbackIndex}`;
  const tableLabel =
    (typeof raw.tableLabel === 'string' && raw.tableLabel) ||
    (typeof raw.table === 'string' && raw.table) ||
    tableId;
  const status = (typeof raw.status === 'string' && raw.status) || 'PLACED';
  const note = typeof raw.note === 'string' ? raw.note : '';
  const total =
    typeof raw.total === 'number'
      ? raw.total
      : typeof raw.totalCents === 'number'
        ? raw.totalCents / 100
        : 0;
  const createdAt =
    typeof raw.createdAt === 'string' && raw.createdAt
      ? raw.createdAt
      : new Date().toISOString();
  const itemsArray = Array.isArray(raw.items) ? raw.items : [];
  const items = itemsArray.map((item, index) => normalizeOrderItem(item, index));
  const normalizedTopic = normalizePrinterTopicValue(printerTopic);
  const filteredItems = normalizedTopic
    ? items.filter(
        (item) =>
          normalizePrinterTopicValue(item.item?.printerTopic) ===
          normalizedTopic
      )
    : items;
  if (normalizedTopic && filteredItems.length === 0) {
    return null;
  }
  return {
    id,
    tableId,
    tableLabel,
    status: status as Order['status'],
    note,
    total,
    createdAt,
    items: filteredItems,
  };
};

const isOrderPlacedPayload = (payload: unknown): payload is { 
  orderId?: string; 
  tableId?: string;
  tableLabel?: string;
  note?: string;
  totalCents?: number;
  createdAt?: string;
  items?: any[];
} =>
  isRecord(payload) && typeof payload.orderId === 'string';

export default function CookDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, logout, isAuthenticated } = useAuthStore();
  const { dashboardDark, themeClass } = useDashboardTheme();
  const cookPrinterTopic = user?.cookType?.printerTopic ?? null;

  const ordersAll = useOrdersStore((s) => s.orders);
  const setOrdersLocal = useOrdersStore((s) => s.setOrders);
  const upsertOrder = useOrdersStore((s) => s.upsert);
  const updateLocalStatus = useOrdersStore((s) => s.updateStatus);

  const [storeSlug, setStoreSlug] = useState(() => getStoredStoreSlug() || "");
  const [accepting, setAccepting] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState<Set<string>>(new Set());
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());
  const [itemBusy, setItemBusy] = useState<Set<string>>(new Set());
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [viewMode, setViewMode] = useState<"classic" | "pro">(() => {
    try {
      const saved = localStorage.getItem("COOK_VIEW_MODE");
      if (saved === "classic" || saved === "pro") return saved;
    } catch {}
    return "classic";
  });
  const [modifierOrder, setModifierOrder] = useState<Order | null>(null);

  // Ensure the active store context matches the authenticated user (avoid stale STORE_SLUG from other tabs/sessions)
  useEffect(() => {
    const slug = (user?.storeSlug || "").trim();
    if (slug) {
      setStoreSlug(slug);
      setStoredStoreSlug(slug);
    } else if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem("STORE_SLUG");
      } catch {}
    }
  }, [user?.storeSlug]);

  const toggleViewMode = () => {
    const next = viewMode === "classic" ? "pro" : "classic";
    setViewMode(next);
    try {
      localStorage.setItem("COOK_VIEW_MODE", next);
    } catch {}
  };
  useEffect(() => {
    if (
      !isAuthenticated() ||
      (user?.role !== "cook" && user?.role !== "manager")
    ) {
      navigate("/login");
    }
  }, [isAuthenticated, user, navigate]);

  // Initial hydrate: always replace local cache on mount
  useEffect(() => {
    const init = async () => {
      try {
        const store = await api.getStore();
        if (store?.store?.name) {
          try {
            localStorage.setItem('STORE_NAME', store.store.name);
          } catch (error) {
            console.warn('Failed to persist STORE_NAME', error);
          }
        }
        if (store?.store?.slug) {
          setStoreSlug(store.store.slug);
          try {
            setStoredStoreSlug(store.store.slug);
            window.dispatchEvent(new CustomEvent('store-slug-changed', { detail: { slug: store.store.slug } }));
          } catch (error) {
            console.warn('Failed to persist STORE_SLUG', error);
          }
        }
        const data = await api.getOrders();
        const mapped = (data.orders ?? [])
          .map((order, index) => normalizeOrder(order, index, cookPrinterTopic))
          .filter((order): order is Order => Boolean(order));
        setOrdersLocal(mapped);
      } catch (error) {
        console.error('Failed to load cook dashboard data', error);
      } finally {
        setLoadingOrders(false);
      }
    };
    init();
  }, [cookPrinterTopic, setOrdersLocal]);

  // Realtime (WSS): listen for newly placed orders
  useEffect(() => {
    const normalizedCookTopic = normalizePrinterTopicValue(cookPrinterTopic);
    const topic = normalizedCookTopic
      ? `${storeSlug}/orders/placed/${normalizedCookTopic}`
      : `${storeSlug}/orders/placed`;
    const itemTopic = `${storeSlug}/orders/items`;
    const handler = (payload: unknown) => {
      if (!isOrderPlacedPayload(payload)) return;
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
        Date.now(),
        cookPrinterTopic
      );
      if (normalized) upsertOrder(normalized);
    };
    const handleItemStatus = (payload: unknown) => {
      if (!isRecord(payload)) return;
      const rawOrder = (payload as any).order;
      if (!rawOrder) return;
      const normalized = normalizeOrder(rawOrder, Date.now(), cookPrinterTopic);
      if (normalized) upsertOrder(normalized);
    };
    realtimeService.connect();
    realtimeService.subscribe(topic, handler);
    realtimeService.subscribe(itemTopic, handleItemStatus);
    return () => {
      realtimeService.unsubscribe(topic, handler);
      realtimeService.unsubscribe(itemTopic, handleItemStatus);
    };
  }, [storeSlug, cookPrinterTopic, upsertOrder]);

  // Incoming orders: priority based on createdAt (older first => priority 1)
  const incoming = useMemo(
    () =>
      ordersAll
        .filter((o) => o.status === "PLACED")
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [ordersAll]
  );
  // Preparing: priority is maintained by the store (priorityQueue); sort by priority asc then createdAt
  const preparing = useMemo(
    () =>
      ordersAll
        .filter((o) => o.status === "PREPARING")
        .sort((a, b) => {
          const pa = a.priority ?? Number.MAX_SAFE_INTEGER;
          const pb = b.priority ?? Number.MAX_SAFE_INTEGER;
          if (pa !== pb) return pa - pb;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }),
    [ordersAll]
  );

  const transitionToPreparing = async (
    id: string,
    setTracker: React.Dispatch<React.SetStateAction<Set<string>>>,
    options?: { skipMqtt?: boolean }
  ) => {
    setTracker((s) => new Set(s).add(id));
    try {
      const res = await api.updateOrderStatus(id, "PREPARING", {
        ...(options?.skipMqtt ? { skipMqtt: true } : {}),
      });
      const normalized = normalizeOrder(res.order, Date.now(), cookPrinterTopic);
      if (normalized) {
        upsertOrder(normalized);
      } else {
        updateLocalStatus(id, "PREPARING");
      }
      toast({
        title: "Preparing",
        description: `Order ${id} is now PREPARING`,
      });
    } finally {
      setTracker((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };

  const accept = (id: string) =>
    transitionToPreparing(id, setAccepting, { skipMqtt: true });

  const sendOrderToPrinter = async (order: Order) => {
    try {
      await api.printOrder(order.id);
    } catch (error) {
      console.error("Failed to publish print job", error);
      toast({
        title: t("toasts.update_failed"),
        description: "Unable to send order to printer",
      });
    }
  };

  const acceptWithPrint = async (order: Order) => {
    try {
      await transitionToPreparing(order.id, setPrinting, { skipMqtt: true });
      await sendOrderToPrinter(order);
    } catch (error) {
      console.error("Accept with print failed", error);
    }
  };

  const cancelOrder = async (id: string) => {
    setActingIds((s) => new Set(s).add(`cancel:${id}`));
    try {
      const res = await api.updateOrderStatus(id, "CANCELLED");
      const normalized = normalizeOrder(res.order, Date.now(), cookPrinterTopic);
      if (normalized) {
        upsertOrder(normalized);
      } else {
        updateLocalStatus(id, "CANCELLED");
      }
      toast({ title: "Cancelled", description: `Order ${id} cancelled` });
    } finally {
      setActingIds((s) => {
        const n = new Set(s);
        n.delete(`cancel:${id}`);
        return n;
      });
    }
  };

  const markReady = async (id: string) => {
    setActingIds((s) => new Set(s).add(`ready:${id}`));
    try {
      const res = await api.updateOrderStatus(id, "READY");
      const normalized = normalizeOrder(res.order, Date.now(), cookPrinterTopic);
      if (normalized) {
        upsertOrder(normalized);
      } else {
        updateLocalStatus(id, "READY");
      }
      toast({ title: "Ready", description: `Order ${id} is READY` });
    } finally {
      setActingIds((s) => {
        const n = new Set(s);
        n.delete(`ready:${id}`);
        return n;
      });
    }
  };

  const handleItemStatus = async (
    orderId: string,
    orderItemId: string,
    status: OrderItemStatus
  ) => {
    const key = `${orderId}:${orderItemId}`;
    setItemBusy((s) => new Set(s).add(key));
    try {
      const res = await api.updateOrderItemStatus(orderId, orderItemId, status);
      const normalized = normalizeOrder(res.order, Date.now(), cookPrinterTopic);
      if (normalized) {
        upsertOrder(normalized);
      }
    } catch (error) {
      toast({
        title: t("toasts.update_failed"),
        description: "Unable to update item status",
      });
    } finally {
      setItemBusy((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  };

  const acceptLabel = t('actions.accept');
  const acceptWithPrintLabel = t('actions.accept_with_print', { defaultValue: 'Accept with print' });
  const cancelLabel = t('actions.cancel');
  const markReadyLabel = t('actions.mark_ready');

  const themedWrapper = clsx(themeClass, { dark: dashboardDark });
  const storeTitle =
    (() => {
      try {
        return localStorage.getItem('STORE_NAME');
      } catch {
        return null;
      }
    })() || user?.storeSlug || t('cook.dashboard') || 'Cook Dashboard';

  return (
    <PageTransition className={clsx(themedWrapper, 'min-h-screen min-h-dvh')}>
      <div className="min-h-screen min-h-dvh dashboard-bg text-foreground flex flex-col">
        <DashboardHeader
          supertitle={t('cook.dashboard') || 'Cook Dashboard'}
          title={storeTitle}
          subtitle={undefined}
          rightContent={
            <div className="flex items-center gap-3">
              {/* View Toggle */}
              <button
                type="button"
                onClick={toggleViewMode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card/80 hover:bg-accent transition-colors text-sm font-medium"
                aria-label={viewMode === "classic" ? "Switch to Pro view" : "Switch to Classic view"}
              >
                {viewMode === "classic" ? (
                  <>
                    <LayoutGrid className="h-4 w-4" />
                    <span className="hidden sm:inline">Pro</span>
                  </>
                ) : (
                  <>
                    <List className="h-4 w-4" />
                    <span className="hidden sm:inline">Classic</span>
                  </>
                )}
              </button>
              {user && (
                <div className="hidden sm:flex items-center text-sm">
                  <span className="font-medium">{user.displayName}</span>
                </div>
              )}
            </div>
          }
          icon="👨‍🍳"
          tone="primary"
          burgerActions={null}
        />

        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-8 flex-1">
          {viewMode === "pro" ? (
            <CookProView
              incoming={incoming}
              preparing={preparing}
              loadingOrders={loadingOrders}
              accepting={accepting}
              printing={printing}
              actingIds={actingIds}
              itemBusy={itemBusy}
              onAccept={accept}
              onAcceptWithPrint={acceptWithPrint}
              onCancel={cancelOrder}
              onMarkReady={markReady}
              onViewModifiers={setModifierOrder}
              onUpdateItemStatus={handleItemStatus}
            />
          ) : (
            <>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="h-1 w-10 sm:w-12 bg-gradient-primary rounded-full" />
                <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                  {t('cook.incoming_orders')}
                </h2>
                <div className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-semibold">
                  {incoming.length}
                </div>
              </div>
              {loadingOrders ? (
                <DashboardGridSkeleton count={4} />
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                  {incoming.map((o, idx) => (
                    <Card
                      key={o.id}
                      className="p-3 sm:p-5 space-y-3 sm:space-y-4 bg-card border border-border hover:border-primary/50 hover:shadow-xl transition-all duration-300 animate-slide-in"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-primary flex items-center justify-center text-primary-foreground font-bold shadow-md">
                            {o.tableLabel}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground text-sm sm:text-base flex items-center gap-2">
                              <span>{formatTableLabel(o.tableLabel)}</span>
                              <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-[10px] sm:text-xs px-2 py-0.5">
                                Priority #{idx + 1}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(o.createdAt).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 text-xs sm:text-sm bg-card/50 rounded-lg p-2 sm:p-3 border border-border">
                        {(o.items ?? []).map((line, idx: number) => {
                          const qty = line.quantity;
                          const name = line.item?.name ?? line.item?.title ?? 'Item';
                          const orderItemId = line.orderItemId;
                          const isAccepted = line.status === 'ACCEPTED' || line.status === 'SERVED';
                          const isServed = line.status === 'SERVED';
                          const busyKey = orderItemId ? `${o.id}:${orderItemId}` : null;
                          const canToggle =
                            Boolean(orderItemId) &&
                            !isAccepted &&
                            (o.status === 'PLACED' || o.status === 'PREPARING');
                          const toggleDisabled =
                            !canToggle || (busyKey ? itemBusy.has(busyKey) : false);
                          return (
                            <div key={idx} className="flex items-center gap-2">
                              <Checkbox
                                checked={isAccepted}
                                disabled={toggleDisabled}
                                onCheckedChange={(checked) => {
                                  if (!orderItemId || checked !== true) return;
                                  handleItemStatus(o.id, orderItemId, 'ACCEPTED');
                                }}
                              />
                              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-[10px] sm:text-xs font-bold">
                                {qty}
                              </div>
                              <span
                                className={clsx(
                                  'font-medium',
                                  isServed
                                    ? 'text-muted-foreground line-through'
                                    : isAccepted
                                      ? 'text-muted-foreground'
                                      : 'text-foreground'
                                )}
                              >
                                {name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <Button
                          className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                          onClick={() => accept(o.id)}
                          disabled={accepting.has(o.id)}
                          aria-label={acceptLabel}
                          title={acceptLabel}
                        >
                          {accepting.has(o.id) && (
                            <span className="h-4 w-4 border-2 border-primary-foreground/60 border-t-transparent rounded-full animate-spin" />
                          )}
                          {!accepting.has(o.id) && (
                            <span role="img" aria-hidden="true" className="text-2xl leading-none">
                              ✅
                            </span>
                          )}
                        </Button>
                        <Button
                          className="w-full inline-flex items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-md"
                          onClick={() => acceptWithPrint(o)}
                          disabled={printing.has(o.id)}
                          aria-label={acceptWithPrintLabel}
                          title={acceptWithPrintLabel}
                        >
                          {printing.has(o.id) && (
                            <span className="h-4 w-4 border-2 border-secondary-foreground/60 border-t-transparent rounded-full animate-spin" />
                          )}
                          {!printing.has(o.id) && (
                            <span role="img" aria-hidden="true" className="text-2xl leading-none">
                              🖨️
                            </span>
                          )}
                        </Button>
                        <Button
                          className="w-full inline-flex items-center justify-center gap-2 bg-muted text-foreground hover:bg-muted/80 shadow-md"
                          onClick={() => setModifierOrder(o)}
                          aria-label={t("cook.view_modifiers", { defaultValue: "Modifiers" })}
                          title={t("cook.view_modifiers", { defaultValue: "Modifiers" })}
                        >
                          <ListChecks className="h-4 w-4" />
                        </Button>
                        <Button
                          className="w-full inline-flex items-center justify-center gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md transition-shadow"
                          onClick={() => cancelOrder(o.id)}
                          disabled={actingIds.has(`cancel:${o.id}`)}
                          aria-label={cancelLabel}
                          title={cancelLabel}
                        >
                          {actingIds.has(`cancel:${o.id}`) && (
                            <span className="h-4 w-4 border-2 border-current/60 border-t-transparent rounded-full animate-spin" />
                          )}
                          {!actingIds.has(`cancel:${o.id}`) && (
                            <span role="img" aria-hidden="true" className="text-2xl leading-none">
                              ❌
                            </span>
                          )}
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 sm:gap-3 mt-10">
                <div className="h-1 w-10 sm:w-12 bg-gradient-secondary rounded-full" />
                <h2 className="text-xl sm:text-2xl font-bold text-foreground">{t('cook.in_preparation')}</h2>
                <div className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-semibold">
                  {preparing.length}
                </div>
              </div>
              {loadingOrders ? (
                <DashboardGridSkeleton count={3} />
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                  {preparing.map((o) => (
                    <Card
                      key={o.id}
                      className="p-3 sm:p-5 space-y-3 sm:space-y-4 bg-card border border-border hover:border-primary/50 hover:shadow-xl transition-all duration-300"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-primary flex items-center justify-center text-primary-foreground font-bold shadow-md">
                            {o.tableLabel}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground text-sm sm:text-base">
                              {formatTableLabel(o.tableLabel)}
                              {typeof o.priority === 'number' && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">
                                  Priority #{o.priority}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(o.createdAt).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 text-xs sm:text-sm bg-card/50 rounded-lg p-2 sm:p-3 border border-border">
                        {(o.items ?? []).map((line, idx: number) => {
                          const qty = line.quantity;
                          const name = line.item?.name ?? line.item?.title ?? 'Item';
                          const orderItemId = line.orderItemId;
                          const isAccepted = line.status === 'ACCEPTED' || line.status === 'SERVED';
                          const isServed = line.status === 'SERVED';
                          const busyKey = orderItemId ? `${o.id}:${orderItemId}` : null;
                          const canToggle =
                            Boolean(orderItemId) &&
                            !isAccepted &&
                            (o.status === 'PLACED' || o.status === 'PREPARING');
                          const toggleDisabled =
                            !canToggle || (busyKey ? itemBusy.has(busyKey) : false);
                          return (
                            <div key={idx} className="flex items-center gap-2">
                              <Checkbox
                                checked={isAccepted}
                                disabled={toggleDisabled}
                                onCheckedChange={(checked) => {
                                  if (!orderItemId || checked !== true) return;
                                  handleItemStatus(o.id, orderItemId, 'ACCEPTED');
                                }}
                              />
                              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-[10px] sm:text-xs font-bold">
                                {qty}
                              </div>
                              <span
                                className={clsx(
                                  'font-medium',
                                  isServed
                                    ? 'text-muted-foreground line-through'
                                    : isAccepted
                                      ? 'text-muted-foreground'
                                      : 'text-foreground'
                                )}
                              >
                                {name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                          onClick={() => markReady(o.id)}
                          disabled={actingIds.has(`ready:${o.id}`)}
                          aria-label={markReadyLabel}
                          title={markReadyLabel}
                        >
                          {actingIds.has(`ready:${o.id}`) && (
                            <span className="h-4 w-4 border-2 border-primary-foreground/60 border-t-transparent rounded-full animate-spin" />
                          )}
                          {!actingIds.has(`ready:${o.id}`) && (
                            <span role="img" aria-hidden="true" className="text-2xl leading-none">
                              🍽️
                            </span>
                          )}
                        </Button>
                        <Button
                          className="flex-1 inline-flex items-center justify-center gap-2 bg-muted text-foreground hover:bg-muted/80 shadow-md"
                          onClick={() => setModifierOrder(o)}
                          aria-label={t("cook.view_modifiers", { defaultValue: "Modifiers" })}
                          title={t("cook.view_modifiers", { defaultValue: "Modifiers" })}
                        >
                          <ListChecks className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <OrderModifiersDialog
        order={modifierOrder}
        open={Boolean(modifierOrder)}
        onOpenChange={(open) => {
          if (!open) setModifierOrder(null);
        }}
      />
    </PageTransition>
  );
}

