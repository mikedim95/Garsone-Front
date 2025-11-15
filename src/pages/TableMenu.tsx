import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MenuItemCard } from "@/components/menu/MenuItemCard";
import { ModifierDialog } from "@/components/menu/ModifierDialog";
import { Cart } from "@/components/menu/Cart";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { HomeLink } from "@/components/HomeLink";
import { AppBurger } from "./AppBurger";
import { useCartStore } from "@/store/cartStore";
import { api } from "@/lib/api";
import { useMenuStore } from "@/store/menuStore";
import { realtimeService } from "@/lib/realtime";
import { MenuItem } from "@/types";
import { Bell, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function TableMenu() {
  const { tableId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { addItem, clearCart } = useCartStore();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [menuData, setMenuData] = useState<{
    categories: Array<{ id: string; title: string }>;
    items: MenuItem[];
    modifiers: any[];
    modifierOptions: any[];
    itemModifiers: any[];
  } | null>(null);
  const [storeName, setStoreName] = useState<string>("Demo Cafe");
  const [storeSlug, setStoreSlug] = useState<string>("demo-cafe");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [calling, setCalling] = useState<"idle" | "pending" | "accepted">("idle");
  const [lastOrder, setLastOrder] = useState<any>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem("table:last-order");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

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
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  }, [lastOrder]);

  const computeOrderTotal = (order: any) => {
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
        const storeRes = await api.getStore() as any;
        if (storeRes?.store?.name) setStoreName(storeRes.store.name);
        if (storeRes?.store?.slug) {
          setStoreSlug(storeRes.store.slug);
          try {
            localStorage.setItem('STORE_SLUG', storeRes.store.slug);
            window.dispatchEvent(new CustomEvent('store-slug-changed', { detail: { slug: storeRes.store.slug } }));
          } catch {}
        }

        let data: any;
        if (fresh) {
          data = menuCache;
        } else {
          data = await api.getMenu();
          setMenuCache(data);
        }

        const categories = data?.categories?.map((c: any) => ({ id: c.id, title: c.title })) || [];
        setMenuData({
          categories,
          items: data?.items || [],
          modifiers: data?.modifiers || [],
          modifierOptions: [],
          itemModifiers: [],
        });
        setError(null);
      } catch (err) {
        console.error("Failed to fetch menu:", err);
        setError("Failed to load menu. Using offline mode.");
        const { MENU_ITEMS } = await import("@/lib/menuData");
        setMenuData({
          categories: Array.from(new Set(MENU_ITEMS.map((i) => i.category))).map((name, idx) => ({ id: String(idx), title: name })),
          items: MENU_ITEMS,
          modifiers: [],
          modifierOptions: [],
          itemModifiers: [],
        });
      } finally {
        setLoading(false);
      }
    };
    hydrate();
  }, [menuCache, menuTs, setMenuCache]);

  // Live refresh when manager updates menu
  useEffect(() => {
    let subscribed: string | null = null;
    realtimeService.connect().then(() => {
      const topic = `stores/${storeSlug}/menu/updated`;
      subscribed = topic;
      realtimeService.subscribe(topic, async () => {
        try {
          const data: any = await api.getMenu();
          setMenuCache(data);
          const categories = data?.categories?.map((c: any) => ({ id: c.id, title: c.title })) || [];
          setMenuData({
            categories,
            items: data?.items || [],
            modifiers: data?.modifiers || [],
            modifierOptions: [],
            itemModifiers: [],
          });
        } catch {}
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

    const normalizeAndSet = (data: any) => {
      const categories = data?.categories?.map((c: any) => ({ id: c.id, title: c.title })) || [];
      setMenuData({
        categories,
        items: data?.items || [],
        modifiers: data?.modifiers || [],
        modifierOptions: [],
        itemModifiers: [],
      });
    };

    const poll = async () => {
      try {
        // If realtime is connected, stop polling immediately
        if (realtimeService.isConnected()) {
          stop();
          return;
        }
        const data: any = await api.getMenu();
        // Avoid unnecessary re-renders when data is unchanged
        const snapshot = JSON.stringify({
          items: (data?.items || []).map((i: any) => ({ id: i.id, isAvailable: i.available ?? i.isAvailable, priceCents: i.priceCents })),
          categories: (data?.categories || []).map((c: any) => ({ id: c.id, title: c.title })),
        });
        if (snapshot !== lastSnapshot) {
          lastSnapshot = snapshot;
          setMenuCache(data);
          normalizeAndSet(data);
        }
      } catch {}
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
      : menuData.items.filter((i: any) => i.categoryId === selectedCategory || i.category === categories.find(c => c.id === selectedCategory)?.title)
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
    toast({ title: "Added to cart", description: customizeItem.name });
    setCustomizeOpen(false);
    setCustomizeItem(null);
  };

  const handleCheckout = async (note?: string) => {
    if (!tableId || !menuData) return null;

    try {
      const cartItems = useCartStore.getState().items;

      const orderData = {
        tableId,
        items: cartItems.map((item) => ({
          itemId: item.item.id,
          quantity: item.quantity,
          modifiers: JSON.stringify(item.selectedModifiers),
        })),
        note: note ?? "",
      };

      const response = (await api.createOrder(orderData)) as any;
      const orderFromResponse = response?.order || null;
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
      }
      // Backend publishes realtime events; avoid duplicate client emits
      clearCart();
      const orderId = orderFromResponse?.id || response?.orderId;
      // pass tableId so the thanks page can subscribe to the ready topic
      const params = new URLSearchParams({ tableId });
      navigate(`/order/${orderId}/thanks?${params.toString()}`);
      return orderFromResponse;
    } catch (err) {
      console.error("Failed to create order:", err);
      toast({
        title: "Error",
        description: (err as any)?.message || "Failed to place order. Please try again.",
      });
    }
    return null;
  };

  useEffect(() => {
    // subscribe for call acknowledgements for this table
    if (!tableId) return;
    let mounted = true;
    (async () => {
      await realtimeService.connect();
      realtimeService.subscribe(`${storeSlug}/waiter/call`, (msg: any) => {
        if (!mounted) return;
        if (!msg || msg.tableId !== tableId) return;
        if (msg.action === 'accepted') setCalling('accepted');
        else if (msg.action === 'cleared') setCalling('idle');
      });
      realtimeService.subscribe(`${storeSlug}/orders/prepairing`, (msg: any) => {
        if (!mounted) return;
        if (msg?.orderId) {
          setLastOrder((prev: any) =>
            prev && prev.id === msg.orderId ? { ...prev, status: 'PREPARING' } : prev
          );
        }
      });
      realtimeService.subscribe(`${storeSlug}/orders/ready`, (msg: any) => {
        if (!mounted) return;
        if (msg?.orderId) {
          setLastOrder((prev: any) =>
            prev && prev.id === msg.orderId
              ? { ...prev, status: 'READY' }
              : prev
          );
        }
      });
      realtimeService.subscribe(`${storeSlug}/orders/cancelled`, (msg: any) => {
        if (!mounted) return;
        if (msg?.orderId) {
          setLastOrder((prev: any) =>
            prev && prev.id === msg.orderId
              ? { ...prev, status: 'CANCELLED' }
              : prev
          );
        }
      });
    })();
    return () => {
      mounted = false;
      realtimeService.unsubscribe(`${storeSlug}/waiter/call`);
      realtimeService.unsubscribe(`${storeSlug}/orders/prepairing`);
      realtimeService.unsubscribe(`${storeSlug}/orders/ready`);
      realtimeService.unsubscribe(`${storeSlug}/orders/cancelled`);
    };
  }, [storeSlug, tableId]);

  const handleCallWaiter = async () => {
    if (!tableId) return;
    try {
      setCalling("pending");
      await api.callWaiter(tableId);
      toast({
        title: "Waiter called",
        description: "A waiter will be with you shortly",
      });
      // safety re-enable after 45s
      setTimeout(() => setCalling((s) => (s === "pending" ? "idle" : s)), 45000);
    } catch (err: any) {
      const msg = err?.message || '';
      toast({
        title: "Call failed",
        description:
          msg.includes('403') || msg.includes('whitelist')
            ? "Device not allowed by IP whitelist. See ALLOWED_IPS in backend."
            : msg || "Unable to call waiter.",
      });
      setCalling("idle");
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-purple-600">{storeName}</h1>
            <p className="text-sm text-muted-foreground">Table {tableId}</p>
          </div>
          <div className="flex gap-2 items-center">
            <AppBurger title={storeName}>
              {lastOrder ? (
                <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Your last order</p>
                      <p className="text-xs text-muted-foreground">
                        Placed {new Date(lastOrder.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-primary/10 text-primary">
                      {(lastOrder.status || 'PLACED').toString()}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    {(lastOrder.items || []).map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">
                          {item?.title ?? item?.item?.name ?? `Item ${idx + 1}`}
                        </span>
                        <span className="text-muted-foreground">×{item?.quantity ?? item?.qty ?? 1}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Total</span>
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
                    : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/20 dark:text-blue-100 dark:border-blue-500/40"
                } ${calling !== "idle" ? "opacity-80 cursor-not-allowed" : ""}`}
              >
                <span className="relative inline-flex">
                  {calling !== "idle" && (
                    <span className="absolute inline-flex h-full w-full rounded-full animate-ping bg-blue-300 dark:bg-blue-400 opacity-60" />
                  )}
                  <Bell className="h-4 w-4 relative" />
                </span>
                {calling === "idle" && t("menu.call_waiter")}
                {calling === "pending" && "Calling…"}
                {calling === "accepted" && "Coming…"}
              </button>
            </AppBurger>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
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
              All
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl shadow-md overflow-hidden">
                <Skeleton className="w-full aspect-square" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="flex items-center justify-between pt-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-9 w-24 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </div>
        ) : (
          <>
            {selectedCategory === 'all' ? (
              <div className="space-y-8">
                {categories.map((cat) => {
                  const catItems = menuData!.items.filter((i: any) => i.categoryId === cat.id || i.category === cat.title);
                  if (catItems.length === 0) return null;
                  return (
                    <section key={cat.id}>
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-lg font-semibold text-foreground">{cat.title}</h3>
                        <div className="h-px bg-border flex-1" />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {catItems.map((item) => (
                          <MenuItemCard key={item.id} item={item} onAdd={handleAddItem} />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {filteredItems.map((item) => (
                  <MenuItemCard key={item.id} item={item} onAdd={handleAddItem} />
                ))}
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
  );
}









