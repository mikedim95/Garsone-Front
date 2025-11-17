import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { api } from "@/lib/api";
import { realtimeService } from "@/lib/realtime";
import type { Order, CartItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DashboardThemeToggle } from "@/components/DashboardThemeToggle";
import { useDashboardTheme } from "@/hooks/useDashboardDark";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeOrderItem = (raw: unknown, idx: number): CartItem => {
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
  return {
    item: {
      id: itemId,
      name,
      description: typeof record.description === 'string' ? record.description : '',
      price,
      image: typeof record.image === 'string' ? record.image : '',
      category: typeof record.category === 'string' ? record.category : '',
      available: record.available !== false,
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
  return {
    id,
    tableId,
    tableLabel,
    status: status as Order['status'],
    note,
    total,
    createdAt,
    items,
  };
};

const isOrderPlacedPayload = (payload: unknown): payload is { orderId?: string; tableId?: string } =>
  isRecord(payload) && typeof payload.orderId === 'string';

export default function CookDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, logout, isAuthenticated } = useAuthStore();
  const { dashboardDark, themeClass } = useDashboardTheme();

  const ordersAll = useOrdersStore((s) => s.orders);
  const setOrdersLocal = useOrdersStore((s) => s.setOrders);
  const upsertOrder = useOrdersStore((s) => s.upsert);
  const updateLocalStatus = useOrdersStore((s) => s.updateStatus);

  const [storeSlug, setStoreSlug] = useState("demo-cafe");
  const [accepting, setAccepting] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState<Set<string>>(new Set());
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());

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
        if (store?.store?.slug) {
          setStoreSlug(store.store.slug);
          try {
            localStorage.setItem('STORE_SLUG', store.store.slug);
            window.dispatchEvent(new CustomEvent('store-slug-changed', { detail: { slug: store.store.slug } }));
          } catch (error) {
            console.warn('Failed to persist STORE_SLUG', error);
          }
        }
        const data = await api.getOrders();
        const mapped = (data.orders ?? [])
          .map((order, index) => normalizeOrder(order, index))
          .filter((order): order is Order => Boolean(order));
        setOrdersLocal(mapped);
      } catch (error) {
        console.error('Failed to load cook dashboard data', error);
      }
    };
    init();
  }, [setOrdersLocal]);

  // Realtime updates -> local store
  useEffect(() => {
    realtimeService.connect().then(() => {
      realtimeService.subscribe(`${storeSlug}/orders/placed`, (payload) => {
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
          Date.now()
        );
        if (!normalized) return;
        upsertOrder(normalized);
      });
    });
    return () => {
      realtimeService.unsubscribe(`${storeSlug}/orders/placed`);
    };
  }, [storeSlug, upsertOrder]);

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
      await api.updateOrderStatus(id, "PREPARING", {
        ...(options?.skipMqtt ? { skipMqtt: true } : {}),
      });
      updateLocalStatus(id, "PREPARING");
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
      await transitionToPreparing(order.id, setPrinting);
      await sendOrderToPrinter(order);
    } catch (error) {
      console.error("Accept with print failed", error);
    }
  };

  const cancelOrder = async (id: string) => {
    setActingIds((s) => new Set(s).add(`cancel:${id}`));
    try {
      await api.updateOrderStatus(id, "CANCELLED");
      updateLocalStatus(id, "CANCELLED");
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
      await api.updateOrderStatus(id, "READY");
      updateLocalStatus(id, "READY");
      toast({ title: "Ready", description: `Order ${id} is READY` });
    } finally {
      setActingIds((s) => {
        const n = new Set(s);
        n.delete(`ready:${id}`);
        return n;
      });
    }
  };

  const acceptLabel = t('actions.accept');
  const acceptWithPrintLabel = t('actions.accept_with_print', { defaultValue: 'Accept with print' });
  const cancelLabel = t('actions.cancel');
  const markReadyLabel = t('actions.mark_ready');

  const themedWrapper = clsx(themeClass, { dark: dashboardDark });

  return (
    <div className={clsx(themedWrapper, 'min-h-screen min-h-dvh')}>
      <div className="min-h-screen min-h-dvh dashboard-bg text-foreground flex flex-col">
        <DashboardHeader
        title={t('cook.dashboard') || 'Cook Dashboard'}
        subtitle={user?.displayName}
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
        icon="👨‍🍳"
        tone="primary"
        burgerActions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="w-full shadow-sm hover:shadow-md transition-shadow"
          >
            {t('actions.logout')}
          </Button>
        }
      />

      <div className="max-w-6xl mx-auto px-4 pt-4">
        <DashboardThemeToggle />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-8 space-y-4 sm:space-y-8 flex-1 w-full">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="h-1 w-10 sm:w-12 bg-gradient-primary rounded-full" />
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            {t('cook.incoming_orders')}
          </h2>
          <div className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-semibold">
            {incoming.length}
          </div>
        </div>
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
                      <span>Table {o.tableLabel}</span>
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
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-[10px] sm:text-xs font-bold">
                        {qty}
                      </div>
                      <span className="text-foreground font-medium">
                        {name}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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

        <div className="flex items-center gap-2 sm:gap-3 mt-10">
          <div className="h-1 w-10 sm:w-12 bg-gradient-secondary rounded-full" />
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">{t('cook.in_preparation')}</h2>
          <div className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-semibold">
            {preparing.length}
          </div>
        </div>
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
                      Table {o.tableLabel}
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
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-[10px] sm:text-xs font-bold">
                        {qty}
                      </div>
                      <span className="text-foreground font-medium">
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
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
    </div>
  );
}
