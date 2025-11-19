import { useState, useEffect } from "react";
import clsx from "clsx";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MenuItemCard } from "@/components/menu/MenuItemCard";
import { ModifierDialog } from "@/components/menu/ModifierDialog";
import { Cart } from "@/components/menu/Cart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { HomeLink } from "@/components/HomeLink";
import { AppBurger } from "./AppBurger";
import { useCartStore } from "@/store/cartStore";
import { api } from "@/lib/api";
import { useMenuStore } from "@/store/menuStore";
import { realtimeService } from "@/lib/realtime";
import type {
  CreateOrderPayload,
  MenuCategory,
  MenuData,
  MenuItem,
  Modifier,
  ModifierOption,
  OrderResponse,
  SubmittedOrderItem,
  SubmittedOrderSummary,
} from "@/types";
import { Bell } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDashboardTheme } from "@/hooks/useDashboardDark";

type CategorySummary = Pick<MenuCategory, "id" | "title">;
type MenuModifierLink = { itemId: string; modifierId: string; isRequired?: boolean };
interface MenuStateData {
  categories: CategorySummary[];
  items: MenuItem[];
  modifiers: Modifier[];
  modifierOptions: ModifierOption[];
  itemModifiers: MenuModifierLink[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const mapCategories = (categories?: Array<{ id?: string; title?: string }>): CategorySummary[] =>
  (categories ?? []).reduce<CategorySummary[]>((acc, category, index) => {
    if (!category) return acc;
    const id = category.id ?? `cat-${index}`;
    const title = category.title ?? "";
    if (!title) return acc;
    acc.push({ id, title });
    return acc;
  }, []);

const buildMenuState = (payload?: Partial<MenuStateData> & { categories?: Array<{ id?: string; title?: string }>; items?: MenuItem[] }): MenuStateData => ({
  categories: mapCategories(payload?.categories),
  items: payload?.items ?? [],
  modifiers: payload?.modifiers ?? [],
  modifierOptions: payload?.modifierOptions ?? [],
  itemModifiers: payload?.itemModifiers ?? [],
});

const matchesCategory = (item: MenuItem, categoryId: string, categoryList: CategorySummary[]): boolean => {
  if (item.categoryId === categoryId) return true;
  const category = categoryList.find((cat) => cat.id === categoryId);
  if (!category) return false;
  return item.category === category.title;
};

const parseStoredOrder = (value: string): SubmittedOrderSummary | null => {
  try {
    return JSON.parse(value) as SubmittedOrderSummary;
  } catch (error) {
    console.warn("Failed to parse stored order", error);
    return null;
  }
};

const isWaiterCallMessage = (payload: unknown): payload is { tableId: string; action?: string } =>
  isRecord(payload) && typeof payload.tableId === "string";

const isOrderEventMessage = (payload: unknown): payload is { orderId: string } =>
  isRecord(payload) && typeof payload.orderId === "string";

export default function TableMenu() {
  const { tableId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { dashboardDark, themeClass } = useDashboardTheme();
  const { addItem, clearCart } = useCartStore();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [menuData, setMenuData] = useState<MenuStateData | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [storeSlug, setStoreSlug] = useState<string>("demo-cafe");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [calling, setCalling] = useState<"idle" | "pending" | "accepted">("idle");
  const [lastOrder, setLastOrder] = useState<SubmittedOrderSummary | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem("table:last-order");
      return stored ? parseStoredOrder(stored) : null;
    } catch (error) {
      console.warn("Failed to hydrate stored order", error);
      return null;
    }
  });
  const [tableLabel, setTableLabel] = useState<string | null>(null);
  const [tableTranslations, setTableTranslations] = useState<Record<string, string>>({});
  const resolvedTableLabel =
    tableLabel ||
    lastOrder?.tableLabel ||
    lastOrder?.table ||
    (tableId ? tableTranslations[tableId] : null) ||
    null;
  const tableLabelDisplay = resolvedTableLabel ?? '—';
  const tableLabelReady = Boolean(resolvedTableLabel);
  const lastOrderStatus = lastOrder?.status ?? 'PLACED';
  const lastOrderStatusLabel = t(`status.${lastOrderStatus}`, {
    defaultValue: (lastOrderStatus || 'PLACED').toString(),
  });
  const fallbackCategoryLabel = t('menu.category_label', { defaultValue: 'Category' });
  const offlineFallbackMessage = t('menu.load_error_offline', {
    defaultValue: 'Failed to load menu. Using offline mode.',
  });
  const themedWrapper = clsx(themeClass, { dark: dashboardDark });

  const menuCache = useMenuStore((s) => s.data);
  const menuTs = useMenuStore((s) => s.ts);
  const setMenuCache = useMenuStore((s) => s.setMenu);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (lastOrder) {
        window.localStorage.setItem("table:last-order", JSON.stringify(lastOrder));
      } else {
        window.localStorage.removeItem("table:last-order");
      }
    } catch (error) {
      console.warn("Failed to persist last order", error);
    }
  }, [lastOrder]);

  useEffect(() => {
    if (lastOrder?.tableLabel) {
      setTableLabel(lastOrder.tableLabel);
    }
  }, [lastOrder]);

  useEffect(() => {
    if (!tableId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await api.getTables();
        if (cancelled) return;
        const map = (response?.tables ?? []).reduce<Record<string, string>>((acc, table) => {
          if (table.id && table.label) acc[table.id] = table.label;
          return acc;
        }, {});
        setTableTranslations(map);
        if (map[tableId]) setTableLabel(map[tableId]);
      } catch (error) {
        console.warn('Failed to fetch table label', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  const computeOrderTotal = (order: SubmittedOrderSummary | null) => {
    if (!order) return 0;
    if (typeof order.total === "number") return order.total;
    if (typeof order.totalCents === "number") return order.totalCents / 100;
    return 0;
  };

  useEffect(() => {
    const hydrate = async () => {
      try {
        setLoading(true);
        const now = Date.now();
        const fresh = menuCache && now - menuTs < 60_000; // 60s TTL
        const storeRes = await api.getStore();
        const store = storeRes?.store;
        if (store?.name) {
          setStoreName(store.name);
          try {
            localStorage.setItem("STORE_NAME", store.name);
          } catch (error) {
            console.warn("Failed to persist STORE_NAME", error);
          }
        }
        if (store?.slug) {
          setStoreSlug(store.slug);
          try {
            localStorage.setItem("STORE_SLUG", store.slug);
            window.dispatchEvent(new CustomEvent("store-slug-changed", { detail: { slug: store.slug } }));
          } catch (error) {
            console.warn("Failed to persist STORE_SLUG", error);
          }
        }

        let data: MenuData | null = null;
        if (fresh && menuCache) {
          data = menuCache;
        } else {
          data = await api.getMenu();
          setMenuCache(data);
        }

        setMenuData(
          buildMenuState({
            categories: data?.categories,
            items: data?.items,
            modifiers: [],
            modifierOptions: [],
            itemModifiers: [],
          })
        );
        setError(null);
      } catch (err) {
        console.error("Failed to fetch menu:", err);
        setError(offlineFallbackMessage);
        const { MENU_ITEMS } = await import("@/lib/menuData");
        const fallbackCategories: CategorySummary[] = Array.from(
          new Set(MENU_ITEMS.map((item) => item.category ?? fallbackCategoryLabel))
        ).map((name, idx) => ({
          id: String(idx),
          title: name || `${fallbackCategoryLabel} ${idx + 1}`,
        }));
        setMenuData(
          buildMenuState({
            categories: fallbackCategories,
            items: MENU_ITEMS,
            modifiers: [],
            modifierOptions: [],
            itemModifiers: [],
          })
        );
      } finally {
        setLoading(false);
      }
    };
    hydrate();
  }, [menuCache, menuTs, setMenuCache, offlineFallbackMessage, fallbackCategoryLabel]);

  // Live refresh when manager updates menu
  useEffect(() => {
    let subscribed: string | null = null;
    realtimeService.connect().then(() => {
      const topic = `stores/${storeSlug}/menu/updated`;
      subscribed = topic;
      realtimeService.subscribe(topic, async () => {
        try {
          const data = await api.getMenu();
          setMenuCache(data);
          setMenuData(
            buildMenuState({
              categories: data?.categories,
              items: data?.items,
              modifiers: [],
              modifierOptions: [],
              itemModifiers: [],
            })
          );
        } catch (error) {
          console.error("Failed to refresh menu after realtime event", error);
        }
      });
    });
    return () => {
      if (subscribed) realtimeService.unsubscribe(subscribed);
    };
  }, [storeSlug, setMenuCache]);

  // Fallback polling ONLY when realtime channel is not connected
  useEffect(() => {
    let intervalId: number | undefined;
    let lastSnapshot: string | undefined;

    const normalizeAndSet = (data: MenuData | null) => {
      setMenuData(
        buildMenuState({
          categories: data?.categories,
          items: data?.items,
          modifiers: [],
          modifierOptions: [],
          itemModifiers: [],
        })
      );
    };

    const poll = async () => {
      try {
        // If realtime is connected, stop polling immediately
        if (realtimeService.isConnected()) {
          stop();
          return;
        }
        const data = await api.getMenu();
        // Avoid unnecessary re-renders when data is unchanged
        const snapshot = JSON.stringify({
          items: (data?.items || []).map((item) => ({
            id: item.id,
            isAvailable: item.available ?? item.isAvailable,
            priceCents: item.priceCents,
          })),
          categories: mapCategories(data?.categories),
        });
        if (snapshot !== lastSnapshot) {
          lastSnapshot = snapshot;
          setMenuCache(data);
          normalizeAndSet(data);
        }
      } catch (error) {
        console.error("Menu polling failed", error);
      }
    };

    const start = () => {
      if (intervalId || realtimeService.isConnected()) return;
      // Less aggressive: 20s to reduce UX disturbance
      intervalId = window.setInterval(poll, 20_000);
    };
    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!realtimeService.isConnected()) {
          poll();
          start();
        } else {
          stop();
        }
      } else {
        stop();
      }
    };

    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [setMenuCache]);

  const categories = menuData ? menuData.categories : [];
  const filteredItems = menuData
    ? selectedCategory === "all"
      ? menuData.items
      : menuData.items.filter((item) => matchesCategory(item, selectedCategory, categories))
    : [];

  const handleAddItem = (item: MenuItem) => {
    // Always open the customize dialog, even if there are no modifiers,
    // so the user can set quantity before adding to the cart.
    setCustomizeItem(item);
    setCustomizeOpen(true);
  };

  const handleConfirmModifiers = (selected: Record<string, string>, qty: number) => {
    if (!customizeItem) return;
    addItem({ item: customizeItem, quantity: Math.max(1, qty || 1), selectedModifiers: selected });
    toast({
      title: t('menu.toast_added_title', { defaultValue: 'Added to cart' }),
      description: customizeItem.name,
    });
    setCustomizeOpen(false);
    setCustomizeItem(null);
  };

  const handleCheckout = async (note?: string) => {
    if (!tableId || !menuData) return null;

    try {
      const cartItems = useCartStore.getState().items;

      const orderData: CreateOrderPayload = {
        tableId,
        items: cartItems.map((item) => ({
          itemId: item.item.id,
          quantity: item.quantity,
          modifiers: JSON.stringify(item.selectedModifiers),
        })),
        note: note ?? "",
      };

      const response = await api.createOrder(orderData);
      const orderFromResponse = response?.order ?? null;
      if (orderFromResponse) {
        const normalized = {
          ...orderFromResponse,
          tableId: orderFromResponse.tableId ?? tableId,
          tableLabel:
            orderFromResponse.tableLabel ??
            orderFromResponse.table ??
            tableId,
        };
        setLastOrder(normalized);
        if (normalized.tableLabel) setTableLabel(normalized.tableLabel);
      }
      // Backend publishes realtime events; avoid duplicate client emits
      clearCart();
      const legacyResponse = response as OrderResponse & { orderId?: string };
      const orderId = orderFromResponse?.id || legacyResponse.orderId;
      // pass tableId so the thanks page can subscribe to the ready topic
      const params = new URLSearchParams({ tableId });
      navigate(`/order/${orderId}/thanks?${params.toString()}`);
      return orderFromResponse;
    } catch (error) {
      console.error("Failed to create order:", error);
      toast({
        title: t('menu.toast_error_title', { defaultValue: 'Error placing order' }),
        description:
          error instanceof Error
            ? error.message
            : t('menu.toast_error_description', {
                defaultValue: 'Failed to place order. Please try again.',
              }),
      });
    }
    return null;
  };

  useEffect(() => {
    // subscribe for call acknowledgements for this table
    if (!tableId) return;
    let mounted = true;
    const callTopic = `${storeSlug}/waiter/call`;
    const preparingTopic = `${storeSlug}/orders/prepairing`;
    const readyTopic = `${storeSlug}/orders/ready`;
    const cancelledTopic = `${storeSlug}/orders/cancelled`;
    const paidTopic = `${storeSlug}/orders/paid`;
    (async () => {
      await realtimeService.connect();
      realtimeService.subscribe(callTopic, (payload) => {
        if (!mounted || !isWaiterCallMessage(payload) || payload.tableId !== tableId) return;
        if (payload.action === 'accepted') setCalling('accepted');
        else if (payload.action === 'cleared') setCalling('idle');
      });
      realtimeService.subscribe(preparingTopic, (payload) => {
        if (!mounted || !isOrderEventMessage(payload)) return;
        setLastOrder((prev) =>
          prev && prev.id === payload.orderId ? { ...prev, status: 'PREPARING' } : prev
        );
      });
      realtimeService.subscribe(readyTopic, (payload) => {
        if (!mounted || !isOrderEventMessage(payload)) return;
        setLastOrder((prev) =>
          prev && prev.id === payload.orderId ? { ...prev, status: 'READY' } : prev
        );
      });
      realtimeService.subscribe(cancelledTopic, (payload) => {
        if (!mounted || !isOrderEventMessage(payload)) return;
        setLastOrder((prev) =>
          prev && prev.id === payload.orderId ? { ...prev, status: 'CANCELLED' } : prev
        );
      });
      realtimeService.subscribe(paidTopic, (payload) => {
        if (!mounted || !isOrderEventMessage(payload)) return;
        setLastOrder((prev) =>
          prev && prev.id === payload.orderId ? { ...prev, status: 'PAID' } : prev
        );
      });
    })();
    return () => {
      mounted = false;
      realtimeService.unsubscribe(callTopic);
      realtimeService.unsubscribe(preparingTopic);
      realtimeService.unsubscribe(readyTopic);
      realtimeService.unsubscribe(cancelledTopic);
      realtimeService.unsubscribe(paidTopic);
    };
  }, [storeSlug, tableId]);

  const handleCallWaiter = async () => {
    if (!tableId) return;
    try {
      setCalling("pending");
      await api.callWaiter(tableId);
      toast({
        title: t('menu.call_waiter_success_title', { defaultValue: 'Waiter called' }),
        description: t('menu.call_waiter_success_desc', {
          defaultValue: 'A waiter will be with you shortly',
        }),
      });
      // safety re-enable after 45s
      setTimeout(() => setCalling((s) => (s === "pending" ? "idle" : s)), 45000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error ?? '');
      toast({
        title: t('menu.call_waiter_error_title', { defaultValue: 'Call failed' }),
        description:
          msg.includes('403') || msg.includes('whitelist')
            ? t('menu.call_waiter_whitelist_error', {
                defaultValue: 'Device not allowed by IP whitelist. See ALLOWED_IPS in backend.',
              })
            : msg || t('menu.call_waiter_generic_error', { defaultValue: 'Unable to call waiter.' }),
      });
      setCalling("idle");
    }
  };

  return (
    <div className={clsx(themedWrapper, 'min-h-screen min-h-dvh')}>
      <div className="min-h-screen min-h-dvh dashboard-bg overflow-x-hidden text-foreground flex flex-col">
      <header className="bg-card/80 backdrop-blur border-b border-border sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {storeName ? (
              <h1 className="text-2xl font-bold text-primary">{storeName}</h1>
            ) : (
              <Skeleton className="h-8 w-48 rounded-full" />
            )}
            {tableLabelReady ? (
              <p className="text-sm text-muted-foreground">
                {t('menu.table_label', {
                  label: tableLabelDisplay,
                  defaultValue: `Table ${tableLabelDisplay}`,
                })}
              </p>
            ) : (
              <Skeleton className="h-4 w-20 rounded-full" />
            )}
          </div>
          <div className="flex gap-2 items-center">
            <AppBurger title={storeName}>
              {lastOrder ? (
                <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {t('menu.last_order_heading', { defaultValue: 'Your last order' })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('menu.last_order_placed_time', {
                          time: new Date(lastOrder.createdAt || Date.now()).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          }),
                          defaultValue: `Placed ${new Date(
                            lastOrder.createdAt || Date.now()
                          ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                        })}
                      </p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-primary/10 text-primary">
                      {lastOrderStatusLabel}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    {(lastOrder?.items ?? []).map((item: SubmittedOrderItem, idx: number) => (
                      <div key={`last-order-${idx}`} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">
                          {item?.title ??
                            item?.item?.name ??
                            t('menu.last_order_item_fallback', {
                              index: idx + 1,
                              defaultValue: `Item ${idx + 1}`,
                            })}
                        </span>
                        <span className="text-muted-foreground">×{item?.quantity ?? item?.qty ?? 1}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>{t('menu.total')}</span>
                    <span>
                      €{computeOrderTotal(lastOrder).toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : null}
              <button
                disabled={calling !== "idle"}
                onClick={handleCallWaiter}
                className={`w-full justify-center relative inline-flex items-center gap-2 rounded-full border px-4 py-3 text-sm transition ${
                  calling === "idle"
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent"
                    : "bg-muted text-muted-foreground border-border"
                } ${calling !== "idle" ? "opacity-80 cursor-not-allowed" : ""}`}
              >
                <span className="relative inline-flex">
                  {calling !== "idle" && (
                    <span className="absolute inline-flex h-full w-full rounded-full animate-ping bg-primary/40 opacity-60" />
                  )}
                  <Bell className="h-4 w-4 relative" />
                </span>
                {calling === "idle" && t("menu.call_waiter")}
                {calling === "pending" &&
                  t('menu.call_status_pending', { defaultValue: 'Calling…' })}
                {calling === "accepted" &&
                  t('menu.call_status_accepted', { defaultValue: 'Coming…' })}
              </button>
            </AppBurger>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 flex-1 w-full">
        {loading ? (
          <div className="flex gap-2 mb-8 overflow-x-hidden pb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-full" />
            ))}
          </div>
        ) : (
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
            <Button
              key="all"
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              onClick={() => setSelectedCategory('all')}
              className="shrink-0"
            >
              {t('menu.category_all', { defaultValue: 'All' })}
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? "default" : "outline"}
                onClick={() => setSelectedCategory(cat.id)}
                className="shrink-0"
              >
                {cat.title}
              </Button>
            ))}
          </div>
        )}

        {loading ? (
          selectedCategory === 'all' ? (
            <div className="space-y-8">
              {Array.from({ length: 3 }).map((_, sectionIdx) => (
                <section key={sectionIdx}>
                  <div className="flex items-center gap-3 mb-3">
                    <Skeleton className="h-5 w-32" />
                    <div className="h-px bg-border flex-1" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <Card
                        key={`skeleton-${sectionIdx}-${idx}`}
                        className="p-0 rounded-2xl overflow-hidden"
                      >
                        <Skeleton className="w-full aspect-square" />
                        <div className="p-4 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                          <div className="flex items-center justify-between pt-2">
                            <Skeleton className="h-6 w-16" />
                            <Skeleton className="h-9 w-24 rounded-full" />
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Card key={`skeleton-${idx}`} className="p-0 rounded-2xl overflow-hidden">
                  <Skeleton className="w-full aspect-square" />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <div className="flex items-center justify-between pt-2">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-9 w-24 rounded-full" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>
              {t('actions.retry', { defaultValue: 'Retry' })}
            </Button>
          </div>
        ) : (
          <>
            {selectedCategory === 'all' ? (
              <div className="space-y-8">
                {categories.map((cat) => {
                  const catItems = (menuData?.items ?? []).filter((item) =>
                    matchesCategory(item, cat.id, categories)
                  );
                  if (catItems.length === 0) return null;
                  return (
                    <section key={cat.id}>
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-lg font-semibold text-foreground">{cat.title}</h3>
                        <div className="h-px bg-border flex-1" />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {catItems.map((item, idx) => (
                          <div
                            key={item.id}
                            className="animate-slide-in"
                            style={{ animationDelay: `${idx * 80}ms` }}
                          >
                            <MenuItemCard item={item} onAdd={handleAddItem} />
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {filteredItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="animate-slide-in"
                    style={{ animationDelay: `${idx * 80}ms` }}
                  >
                    <MenuItemCard item={item} onAdd={handleAddItem} />
                  </div>
                ))}
                {filteredItems.length === 0 && (
                  <div className="col-span-full text-center text-muted-foreground py-10">
                    {t('menu.no_items', { defaultValue: 'No menu items available yet.' })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <Cart onCheckout={handleCheckout} />
      <ModifierDialog
        open={customizeOpen}
        item={customizeItem}
        initialQty={1}
        onClose={() => { setCustomizeOpen(false); setCustomizeItem(null); }}
        onConfirm={handleConfirmModifiers}
      />
    </div>
    </div>
  );
}
