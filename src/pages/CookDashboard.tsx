import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useOrdersStore } from "@/store/ordersStore";
import { api } from "@/lib/api";
import { mqttService } from "@/lib/mqtt";
import { Order } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { DashboardHeader } from "@/components/DashboardHeader";

export default function CookDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, logout, isAuthenticated } = useAuthStore();

  const ordersAll = useOrdersStore((s) => s.orders);
  const setOrdersLocal = useOrdersStore((s) => s.setOrders);
  const upsertOrder = useOrdersStore((s) => s.upsert);
  const updateLocalStatus = useOrdersStore((s) => s.updateStatus);

  const [storeSlug, setStoreSlug] = useState("demo-cafe");
  const [accepting, setAccepting] = useState<Set<string>>(new Set());
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
        const store = (await api.getStore()) as any;
        if (store?.store?.slug) {
          setStoreSlug(store.store.slug);
          try {
            localStorage.setItem('STORE_SLUG', store.store.slug);
            window.dispatchEvent(new CustomEvent('store-slug-changed', { detail: { slug: store.store.slug } }));
          } catch {}
        }
        {
          const data = (await api.getOrders()) as any;
          const mapped = (data.orders || []).map((o: any) => ({
            id: o.id,
            tableId: o.tableId,
            tableLabel: o.tableLabel ?? o.table ?? o.tableId ?? "T",
            status: o.status,
            note: o.note,
            total:
              typeof o.total === "number"
                ? o.total
                : typeof o.totalCents === "number"
                ? o.totalCents / 100
                : 0,
            createdAt: o.createdAt,
            items: (o.items || []).map((it: any) => {
              const quantity = it?.quantity ?? it?.qty ?? 1;
              const price =
                typeof it?.unitPrice === "number"
                  ? it.unitPrice
                  : typeof it?.unitPriceCents === "number"
                  ? it.unitPriceCents / 100
                  : typeof it?.priceCents === "number"
                  ? it.priceCents / 100
                  : typeof it?.price === "number"
                  ? it.price
                  : 0;
              const name =
                it?.title ??
                it?.name ??
                it?.itemTitle ??
                `Item ${String(it?.itemId || "").slice(-4)}`;
              return {
                item: {
                  id: it.itemId ?? it.id ?? name,
                  name,
                  description: "",
                  price,
                  image: "",
                  category: "",
                  available: true,
                },
                quantity,
                selectedModifiers: {},
              };
            }),
          })) as Order[];
          setOrdersLocal(mapped);
        }
      } catch (e) {
        console.error(e);
      }
    };
    init();
  }, [setOrdersLocal]);

  // MQTT updates -> local store
  useEffect(() => {
    mqttService.connect().then(() => {
      mqttService.subscribe(`${storeSlug}/orders/placed`, (msg: any) => {
        if (!msg?.orderId) return;
        const order: Order = {
          id: msg.orderId,
          tableId: msg.tableId,
          tableLabel: msg.tableLabel ?? "Table",
          status: "PLACED",
          note: msg.note ?? "",
          total: (msg.totalCents ?? 0) / 100,
          createdAt: msg.createdAt ?? new Date().toISOString(),
          items: (msg.items || []).map((it: any, idx: number) => ({
            item: {
              id: `ticket:${idx}:${it.title}`,
              name: it.title,
              description: "",
              price: (it.unitPriceCents ?? 0) / 100,
              image: "",
              category: "",
              available: true,
            },
            quantity: it.quantity ?? 1,
            selectedModifiers: {},
          })),
        } as Order;
        upsertOrder(order);
      });
    });
    return () => {
      mqttService.unsubscribe(`${storeSlug}/orders/placed`);
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
          const pa = (a as any).priority ?? Number.MAX_SAFE_INTEGER;
          const pb = (b as any).priority ?? Number.MAX_SAFE_INTEGER;
          if (pa !== pb) return pa - pb;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }),
    [ordersAll]
  );

  const accept = async (id: string) => {
    setAccepting((s) => new Set(s).add(id));
    try {
      await api.updateOrderStatus(id, "PREPARING");
      updateLocalStatus(id, "PREPARING");
      toast({
        title: "Preparing",
        description: `Order ${id} is now PREPARING`,
      });
    } finally {
      setAccepting((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  };

  const sendOrderToPrinter = (order: Order) => {
    try {
      const payload = {
        orderId: order.id,
        tableId: order.tableId,
        tableLabel: order.tableLabel,
        createdAt: order.createdAt,
        totalCents: Math.round((order.total ?? 0) * 100),
        note: order.note ?? "",
        items: (order.items || []).map((entry) => ({
          title: entry.item?.name ?? "Item",
          quantity: entry.quantity ?? 1,
          unitPriceCents: Math.round((entry.item?.price ?? 0) * 100),
          modifiers: Object.entries(entry.selectedModifiers || {}).map(
            ([, optionId]) => ({
              titleSnapshot: optionId,
            })
          ),
        })),
      };
      mqttService.publish(`${storeSlug}/orders/accepted`, payload);
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
      await accept(order.id);
      sendOrderToPrinter(order);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/30 to-background">
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
        gradientFrom="from-orange-500"
        gradientTo="to-red-600"
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

      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-8 space-y-4 sm:space-y-8">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="h-1 w-10 sm:w-12 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" />
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            {t('cook.incoming_orders')}
          </h2>
          <div className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-amber-100 text-amber-700 text-xs sm:text-sm font-semibold">
            {incoming.length}
          </div>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {incoming.map((o, idx) => (
            <Card
              key={o.id}
              className="p-3 sm:p-5 space-y-3 sm:space-y-4 bg-gradient-to-br from-card to-accent/20 border border-amber-200 hover:border-amber-400 hover:shadow-xl transition-all duration-300 animate-slide-in"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold shadow-md">
                    {o.tableLabel}
                  </div>
                  <div>
                    <div className="font-semibold text-foreground text-sm sm:text-base flex items-center gap-2">
                      <span>Table {o.tableLabel}</span>
                      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-[10px] sm:text-xs px-2 py-0.5 dark:bg-amber-900/30 dark:text-amber-200">
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
                {(o.items || []).filter(Boolean).map((it: any, idx: number) => {
                  const qty = it?.quantity ?? it?.qty ?? 1;
                  const name = it?.item?.name ?? it?.name ?? "Item";
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] sm:text-xs font-bold">
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
                  className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-md"
                  onClick={() => accept(o.id)}
                  disabled={accepting.has(o.id)}
                  aria-label={acceptLabel}
                  title={acceptLabel}
                >
                  {accepting.has(o.id) && (
                    <span className="h-4 w-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                  )}
                  {!accepting.has(o.id) && (
                    <span role="img" aria-hidden="true" className="text-2xl leading-none">
                      ✅
                    </span>
                  )}
                </Button>
                <Button
                  className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white shadow-md"
                  onClick={() => acceptWithPrint(o)}
                  disabled={accepting.has(o.id)}
                  aria-label={acceptWithPrintLabel}
                  title={acceptWithPrintLabel}
                >
                  {accepting.has(o.id) && (
                    <span className="h-4 w-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                  )}
                  {!accepting.has(o.id) && (
                    <span role="img" aria-hidden="true" className="text-2xl leading-none">
                      🖨️
                    </span>
                  )}
                </Button>
                <Button
                  className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-md transition-shadow"
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
          <div className="h-1 w-10 sm:w-12 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" />
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">{t('cook.in_preparation')}</h2>
          <div className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-blue-100 text-blue-700 text-xs sm:text-sm font-semibold">
            {preparing.length}
          </div>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {preparing.map((o) => (
            <Card
              key={o.id}
              className="p-3 sm:p-5 space-y-3 sm:space-y-4 bg-gradient-to-br from-card to-accent/20 border border-blue-200 hover:border-blue-400 hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold shadow-md">
                    {o.tableLabel}
                  </div>
                  <div>
                    <div className="font-semibold text-foreground text-sm sm:text-base">
                      Table {o.tableLabel}
                      {typeof (o as any).priority === 'number' && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 text-blue-700 text-xs px-2 py-0.5 dark:bg-blue-900/30 dark:text-blue-200">
                          Priority #{(o as any).priority}
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
                {(o.items || []).filter(Boolean).map((it: any, idx: number) => {
                  const qty = it?.quantity ?? it?.qty ?? 1;
                  const name = it?.item?.name ?? it?.name ?? "Item";
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] sm:text-xs font-bold">
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
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-md"
                  onClick={() => markReady(o.id)}
                  disabled={actingIds.has(`ready:${o.id}`)}
                  aria-label={markReadyLabel}
                  title={markReadyLabel}
                >
                  {actingIds.has(`ready:${o.id}`) && (
                    <span className="h-4 w-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
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
  );
}

