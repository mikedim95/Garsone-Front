import { useState, useEffect } from "react";
import clsx from "clsx";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MenuItemCard } from "@/components/menu/MenuItemCard";
import { ModifierDialog } from "@/components/menu/ModifierDialog";
import { ElegantMenuView } from "@/components/menu/ElegantMenuView";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppBurger } from "./AppBurger";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTheme } from "@/components/theme-provider-context";
import { useCartStore } from "@/store/cartStore";
import { api, ApiError } from "@/lib/api";
import { realtimeService } from "@/lib/realtime";
import { useMenuStore } from "@/store/menuStore";
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
import { Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDashboardTheme } from "@/hooks/useDashboardDark";
import { Sun, Moon } from "lucide-react";

type CategorySummary = Pick<MenuCategory, "id" | "title" | "titleEn" | "titleEl">;
type MenuModifierLink = {
  itemId: string;
  modifierId: string;
  isRequired?: boolean;
};
interface MenuStateData {
  categories: CategorySummary[];
  items: MenuItem[];
  modifiers: Modifier[];
  modifierOptions: ModifierOption[];
  itemModifiers: MenuModifierLink[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const mapCategories = (
  categories?: Array<{ id?: string; title?: string }>
): CategorySummary[] =>
  (categories ?? []).reduce<CategorySummary[]>((acc, category, index) => {
    if (!category) return acc;
    const id = category.id ?? `cat-${index}`;
    const title = category.title ?? "";
    if (!title) return acc;
    acc.push({ id, title });
    return acc;
  }, []);

const isUuid = (value?: string | null) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const buildMenuState = (
  payload: Partial<MenuStateData> & {
    categories?: Array<{ id?: string; title?: string; titleEn?: string; titleEl?: string }>;
    items?: MenuItem[];
  } = {},
  preferGreek: boolean
): MenuStateData => {
  const localizeText = (en?: string, el?: string, fallback?: string) =>
    preferGreek ? el || en || fallback || '' : en || el || fallback || '';

  const localizedModifiers = (mods?: Modifier[]) =>
    (mods ?? [])
      .filter((m) => m.isAvailable !== false)
      .map((m) => ({
        ...m,
        name: localizeText(m.titleEn, m.titleEl, m.name),
        options: (m.options ?? []).map((opt) => ({
          ...opt,
          label: localizeText(opt.titleEn, opt.titleEl, opt.label),
        })),
      }));

  return {
    categories: mapCategories(
      (payload?.categories ?? []).map((cat) => ({
        ...cat,
        title: localizeText(cat.titleEn, cat.titleEl, cat.title),
      }))
    ),
    items: (payload?.items ?? []).map((item) => {
      const name = localizeText(item.titleEn || item.name, item.titleEl, item.name || item.title);
      const description = localizeText(item.descriptionEn, item.descriptionEl, item.description);
      const imageUrl = item.imageUrl ?? item.image ?? '';
      return {
        ...item,
        name,
        displayName: name,
        displayDescription: description,
        description,
        // Prefer backend-provided URL so the browser downloads directly once per /menu response.
        image: imageUrl,
        imageUrl,
        modifiers: localizedModifiers(item.modifiers),
      };
    }),
    modifiers: localizedModifiers(payload?.modifiers),
    modifierOptions: payload?.modifierOptions ?? [],
    itemModifiers: payload?.itemModifiers ?? [],
  };
};

const matchesCategory = (
  item: MenuItem,
  categoryId: string,
  categoryList: CategorySummary[]
): boolean => {
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

const isWaiterCallMessage = (
  payload: unknown
): payload is { tableId: string; action?: string } =>
  isRecord(payload) && typeof payload.tableId === "string";

const isOrderEventMessage = (
  payload: unknown
): payload is { orderId: string } =>
  isRecord(payload) && typeof payload.orderId === "string";

export default function TableMenu() {
  const { tableId: tableParam } = useParams();
  const { t, i18n } = useTranslation();
  const preferGreek = i18n.language?.toLowerCase().startsWith('el');
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { dashboardDark, themeClass } = useDashboardTheme();
  const { theme, setTheme } = useTheme();
  const { addItem, clearCart } = useCartStore();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [menuData, setMenuData] = useState<MenuStateData | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [storeSlug, setStoreSlug] = useState<string>("demo-cafe");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [calling, setCalling] = useState<"idle" | "pending" | "accepted">(
    "idle"
  );
  const [callPrompted, setCallPrompted] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<SubmittedOrderSummary | null>(
    () => {
      if (typeof window === "undefined") return null;
      try {
        const stored = window.localStorage.getItem("table:last-order");
        return stored ? parseStoredOrder(stored) : null;
      } catch (error) {
        console.warn("Failed to hydrate stored order", error);
        return null;
      }
    }
  );
  const [tableLabel, setTableLabel] = useState<string | null>(null);
  const [tableTranslations, setTableTranslations] = useState<
    Record<string, string>
  >({});
  const [tableId, setTableId] = useState<string | null>(() =>
    tableParam && isUuid(tableParam) ? tableParam : null
  );
  const activeTableId = tableId || (tableParam && isUuid(tableParam) ? tableParam : null);
  const lastOrderStatus = lastOrder?.status ?? "PLACED";
  const lastOrderStatusLabel = t(`status.${lastOrderStatus}`, {
    defaultValue: (lastOrderStatus || "PLACED").toString(),
  });
  const canEditLastOrder = lastOrderStatus === "PLACED" && !!lastOrder?.id;
  const fallbackCategoryLabel = t("menu.category_label", {
    defaultValue: "Category",
  });
  const offlineFallbackMessage = t("menu.load_error_offline", {
    defaultValue: "Failed to load menu. Using offline mode.",
  });
  const themedWrapper = clsx(themeClass, { dark: dashboardDark });

  const menuCache = useMenuStore((s) => s.data);
  const menuTs = useMenuStore((s) => s.ts);
  const setMenuCache = useMenuStore((s) => s.setMenu);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (lastOrder) {
        window.localStorage.setItem(
          "table:last-order",
          JSON.stringify(lastOrder)
        );
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
    if (!tableParam) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await api.getTables();
        if (cancelled) return;
        const map = (response?.tables ?? []).reduce<Record<string, string>>(
          (acc, table) => {
            if (table.id && table.label) acc[table.id] = table.label;
            return acc;
          },
          {}
        );
        setTableTranslations(map);

        const paramLower = tableParam.toLowerCase();
        if (map[tableParam]) {
          setTableLabel(map[tableParam]);
          if (!tableId && isUuid(tableParam)) setTableId(tableParam);
          return;
        }

        const found = Object.entries(map).find(
          ([, label]) => label && label.toLowerCase() === paramLower
        );
        if (found) {
          const [id, label] = found;
          setTableLabel(label);
          setTableId((prev) => prev ?? id);
        }
      } catch (error) {
        console.warn("Failed to fetch table label", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableParam, tableId]);

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
            window.dispatchEvent(
              new CustomEvent("store-slug-changed", {
                detail: { slug: store.slug },
              })
            );
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
          }, preferGreek)
        );
        setError(null);
      } catch (err) {
        console.error("Failed to fetch menu:", err);
        setError(offlineFallbackMessage);
        const { MENU_ITEMS } = await import("@/lib/menuData");
        const fallbackCategories: CategorySummary[] = Array.from(
          new Set(
            MENU_ITEMS.map((item) => item.category ?? fallbackCategoryLabel)
          )
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
          }, preferGreek)
        );
      } finally {
        setLoading(false);
      }
    };
    hydrate();
  }, [
    menuCache,
    menuTs,
    setMenuCache,
    offlineFallbackMessage,
    fallbackCategoryLabel,
    preferGreek,
  ]);

  // Poll for menu updates (realtime disabled)
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
        }, preferGreek)
      );
    };

    const poll = async () => {
      try {
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
      if (intervalId) return;
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
      if (document.visibilityState === "visible") {
        poll();
        start();
      } else {
        stop();
      }
    };

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [setMenuCache, preferGreek]);

  const categories = menuData ? menuData.categories : [];
  const filteredItems = menuData
    ? selectedCategory === "all"
      ? menuData.items
      : menuData.items.filter((item) =>
          matchesCategory(item, selectedCategory, categories)
        )
    : [];

  const handleAddItem = (item: MenuItem) => {
    // Always open the customize dialog, even if there are no modifiers,
    // so the user can set quantity before adding to the cart.
    setCustomizeItem(item);
    setCustomizeOpen(true);
  };

  const handleConfirmModifiers = (
    selected: Record<string, string>,
    qty: number
  ) => {
    if (!customizeItem) return;
    addItem({
      item: customizeItem,
      quantity: Math.max(1, qty || 1),
      selectedModifiers: selected,
    });
    toast({
      title: t("menu.toast_added_title", { defaultValue: "Added to cart" }),
      description: customizeItem.name,
    });
    setCustomizeOpen(false);
    setCustomizeItem(null);
  };

  const handleEditLastOrder = () => {
    if (!lastOrder || !lastOrder.id) return;
    if (lastOrder.status && lastOrder.status !== "PLACED") {
      toast({
        title: t("menu.toast_edit_unavailable_title", {
          defaultValue: "Order cannot be edited",
        }),
        description: t("menu.toast_edit_unavailable_desc", {
          defaultValue: "The kitchen has already started preparing your order.",
        }),
      });
      return;
    }
    if (!menuData) {
      toast({
        title: t("menu.toast_error_title", { defaultValue: "Error" }),
        description: t("menu.toast_error_description", {
          defaultValue: "Menu data is not loaded yet. Please try again.",
        }),
      });
      return;
    }

    clearCart();

    const orderItems = (lastOrder.items ?? []) as Array<
      SubmittedOrderItem & { itemId?: string; modifiers?: any }
    >;
    let addedCount = 0;

    for (const orderItem of orderItems) {
      const rawItemId =
        (orderItem as any).itemId ?? (orderItem as any).item?.id;
      if (!rawItemId) continue;

      const menuItem = menuData.items.find((it) => it.id === rawItemId);
      if (!menuItem) continue;

      const selectedModifiers: Record<string, string> = {};
      const modifiers = (orderItem as any).modifiers as any;
      if (Array.isArray(modifiers)) {
        for (const mod of modifiers) {
          const modifierId =
            (mod && (mod.modifierId || (mod.modifier && mod.modifier.id))) ??
            undefined;
          const optionId =
            (mod &&
              (mod.modifierOptionId ||
                (Array.isArray(mod.optionIds) && mod.optionIds[0]))) ??
            undefined;
          if (modifierId && optionId) {
            selectedModifiers[String(modifierId)] = String(optionId);
          }
        }
      }

      const quantity =
        typeof orderItem.quantity === "number"
          ? orderItem.quantity
          : typeof (orderItem as any).qty === "number"
          ? (orderItem as any).qty
          : 1;

      addItem({
        item: menuItem,
        quantity: Math.max(1, quantity || 1),
        selectedModifiers,
      });
      addedCount += 1;
    }

    if (!addedCount) {
      toast({
        title: t("menu.toast_edit_unavailable_title", {
          defaultValue: "Order cannot be edited",
        }),
        description: t("menu.toast_edit_items_missing_desc", {
          defaultValue:
            "We could not load your previous items. Please create a new order.",
        }),
      });
      setEditingOrderId(null);
      return;
    }

    setEditingOrderId(lastOrder.id || null);
    toast({
      title: t("menu.toast_edit_loaded_title", {
        defaultValue: "Order ready to edit",
      }),
      description: t("menu.toast_edit_loaded_desc", {
        defaultValue: "Your previous order has been loaded into the cart.",
      }),
    });
  };

  const handleCheckout = async (note?: string) => {
    if (checkoutBusy) return null;
    if (!activeTableId || !menuData) {
      toast({
        title: t("menu.toast_error_title", { defaultValue: "Error placing order" }),
        description: t("menu.toast_error_description", { defaultValue: "Missing table information. Please rescan the QR." }),
      });
      return null;
    }

    try {
      setCheckoutBusy(true);
      const cartItems = useCartStore.getState().items;

      const orderData: CreateOrderPayload = {
        tableId: activeTableId,
        items: cartItems.map((item) => ({
          itemId: item.item.id,
          quantity: item.quantity,
          modifiers: JSON.stringify(item.selectedModifiers),
        })),
        note: note ?? "",
      };

      const response = editingOrderId
        ? await api.editOrder(editingOrderId, orderData)
        : await api.createOrder(orderData);
      const orderFromResponse = response?.order ?? null;
      if (orderFromResponse) {
        const normalized = {
          ...orderFromResponse,
          tableId: orderFromResponse.tableId ?? activeTableId,
          tableLabel: orderFromResponse.tableLabel ?? tableLabel ?? tableParam ?? activeTableId,
        };
        setLastOrder(normalized);
        if (normalized.tableLabel) setTableLabel(normalized.tableLabel);
      }
      // Backend publishes realtime events; avoid duplicate client emits
      clearCart();
      const legacyResponse = response as OrderResponse & { orderId?: string };
      const orderId =
        orderFromResponse?.id || legacyResponse.orderId || editingOrderId || "";
      setEditingOrderId(null);
      // pass tableId so the thanks page can subscribe to the ready topic
      const params = new URLSearchParams({ tableId: activeTableId });
      if (orderId) {
        navigate(`/order/${orderId}/thanks?${params.toString()}`);
      }
      return orderFromResponse;
    } catch (error) {
      console.error("Failed to submit order:", error);
      if (error instanceof ApiError && error.status === 403) {
        toast({
          title: t("menu.toast_error_title", {
            defaultValue: "Session expired",
          }),
          description: t("menu.toast_error_description", {
            defaultValue: "Scan the table QR again to start a new order.",
          }),
        });
      } else if (error instanceof ApiError && error.status === 409 && editingOrderId) {
        setEditingOrderId(null);
        toast({
          title: t("menu.toast_edit_unavailable_title", {
            defaultValue: "Order cannot be edited",
          }),
          description: t("menu.toast_edit_unavailable_desc", {
            defaultValue:
              "The kitchen has already started preparing your order. Please place a new order if needed.",
          }),
        });
      } else {
        toast({
          title: t("menu.toast_error_title", {
            defaultValue: "Error placing order",
          }),
          description:
            error instanceof Error
              ? error.message
              : t("menu.toast_error_description", {
                  defaultValue: "Failed to place order. Please try again.",
                }),
        });
      }
      setCheckoutBusy(false);
    }
    return null;
  };

  useEffect(() => {
    // subscribe for call acknowledgements for this table
    if (!activeTableId) return;
    let mounted = true;
    const callTopic = `${storeSlug}/waiter/call`;
    const preparingTopicLegacy = `${storeSlug}/orders/prepairing`;
    const preparingTopic = `${storeSlug}/orders/preparing`;
    const readyTopic = `${storeSlug}/orders/ready`;
    const cancelledTopic = `${storeSlug}/orders/cancelled`;
    const paidTopic = `${storeSlug}/orders/paid`;
    (async () => {
      await realtimeService.connect();
      const handlePreparing = (payload: unknown) => {
        if (!mounted || !isOrderEventMessage(payload)) return;
        setLastOrder((prev) =>
          prev && prev.id === payload.orderId
            ? { ...prev, status: "PREPARING" }
            : prev
        );
      };

      realtimeService.subscribe(callTopic, (payload) => {
        if (
          !mounted ||
          !isWaiterCallMessage(payload) ||
          payload.tableId !== activeTableId
        )
          return;
        if (payload.action === "accepted") setCalling("accepted");
        else if (payload.action === "cleared") setCalling("idle");
      });
      realtimeService.subscribe(preparingTopicLegacy, handlePreparing);
      realtimeService.subscribe(preparingTopic, handlePreparing);
      realtimeService.subscribe(readyTopic, (payload) => {
        if (!mounted || !isOrderEventMessage(payload)) return;
        setLastOrder((prev) =>
          prev && prev.id === payload.orderId
            ? { ...prev, status: "READY" }
            : prev
        );
      });
      realtimeService.subscribe(cancelledTopic, (payload) => {
        if (!mounted || !isOrderEventMessage(payload)) return;
        setLastOrder((prev) =>
          prev && prev.id === payload.orderId
            ? { ...prev, status: "CANCELLED" }
            : prev
        );
      });
      realtimeService.subscribe(paidTopic, (payload) => {
        if (!mounted || !isOrderEventMessage(payload)) return;
        setLastOrder((prev) =>
          prev && prev.id === payload.orderId
            ? { ...prev, status: "PAID" }
            : prev
        );
      });
    })();
    return () => {
      mounted = false;
      realtimeService.unsubscribe(callTopic);
      realtimeService.unsubscribe(preparingTopicLegacy);
      realtimeService.unsubscribe(preparingTopic);
      realtimeService.unsubscribe(readyTopic);
      realtimeService.unsubscribe(cancelledTopic);
      realtimeService.unsubscribe(paidTopic);
    };
  }, [storeSlug, activeTableId]);

  useEffect(() => {
    // Collapse the call CTA while a call is in-flight/accepted
    if (calling !== "idle") {
      setCallPrompted(false);
    }
  }, [calling]);

  useEffect(() => {
    if (typeof window === "undefined" || !callPrompted) return;
    const timer = window.setTimeout(() => setCallPrompted(false), 5000);
    return () => window.clearTimeout(timer);
  }, [callPrompted]);

  const handleCallWaiter = async () => {
    if (!activeTableId) return;
    try {
      setCalling("pending");
      await api.callWaiter(activeTableId);
      toast({
        title: t("menu.call_waiter_success_title", {
          defaultValue: "Waiter called",
        }),
        description: t("menu.call_waiter_success_desc", {
          defaultValue: "A waiter will be with you shortly",
        }),
      });
      // safety re-enable after 45s
      setTimeout(
        () => setCalling((s) => (s === "pending" ? "idle" : s)),
        45000
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        toast({
          title: t("menu.call_waiter_error_title", {
            defaultValue: "Call failed",
          }),
          description: t("menu.toast_error_description", {
            defaultValue: "Scan the table QR again to refresh your session.",
          }),
        });
        setCalling("idle");
        return;
      }
      const msg = error instanceof Error ? error.message : String(error ?? "");
      toast({
        title: t("menu.call_waiter_error_title", {
          defaultValue: "Call failed",
        }),
        description:
          msg.includes("403") || msg.includes("whitelist")
            ? t("menu.call_waiter_whitelist_error", {
                defaultValue:
                  "Device not allowed by IP whitelist. See ALLOWED_IPS in backend.",
              })
            : msg ||
              t("menu.call_waiter_generic_error", {
            defaultValue: "Unable to call waiter.",
          }),
      });
      setCalling("idle");
    }
  };

  const handleFloatingCallClick = () => {
    if (calling === "pending") return;
    if (!callPrompted) {
      setCallPrompted(true);
      return;
    }
    setCallPrompted(false);
    handleCallWaiter();
  };

  const callButtonLabel =
    calling === "pending"
      ? t("menu.call_status_pending", { defaultValue: "Calling…" })
      : calling === "accepted"
      ? t("menu.call_status_accepted", { defaultValue: "Coming…" })
      : callPrompted
      ? t("menu.call_waiter_prompt", { defaultValue: "Call waiter?" })
      : null;

  return (
    <div className={clsx(themedWrapper, "min-h-screen min-h-dvh overflow-hidden")}>
      <div className="min-h-screen min-h-dvh dashboard-bg overflow-x-hidden text-foreground flex flex-col">
        <header className="bg-card/80 backdrop-blur border-b border-border sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {storeName ? (
                <h1 className="text-2xl font-bold text-primary">{storeName}</h1>
              ) : (
                <Skeleton className="h-8 w-48 rounded-full" />
              )}
              {/* Table label intentionally hidden per request */}
            </div>
            <div className="flex gap-2 items-center">
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-border/60 bg-card/80 shadow-sm hover:bg-accent transition-colors"
              >
                {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </button>
              <LanguageSwitcher />
              <AppBurger title={storeName}>
                {lastOrder ? (
                  <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-4 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {t("menu.last_order_heading", {
                            defaultValue: "Your last order",
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("menu.last_order_placed_time", {
                            time: new Date(
                              lastOrder.createdAt || Date.now()
                            ).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            }),
                            defaultValue: `Placed ${new Date(
                              lastOrder.createdAt || Date.now()
                            ).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`,
                          })}
                        </p>
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-primary/10 text-primary">
                        {lastOrderStatusLabel}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm">
                      {(lastOrder?.items ?? []).map(
                        (item: SubmittedOrderItem, idx: number) => (
                          <div
                            key={`last-order-${idx}`}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="font-medium text-foreground">
                              {item?.title ??
                                item?.item?.name ??
                                t("menu.last_order_item_fallback", {
                                  index: idx + 1,
                                  defaultValue: `Item ${idx + 1}`,
                                })}
                            </span>
                            <span className="text-muted-foreground">
                              ×{item?.quantity ?? item?.qty ?? 1}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>{t("menu.total")}</span>
                      <span>€{computeOrderTotal(lastOrder).toFixed(2)}</span>
                    </div>
                {canEditLastOrder && (
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full justify-center"
                      onClick={handleEditLastOrder}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      {t("actions.edit", { defaultValue: "Edit order" })}
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
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
                variant={selectedCategory === "all" ? "default" : "outline"}
                onClick={() => setSelectedCategory("all")}
                className="shrink-0"
              >
                {t("menu.category_all", { defaultValue: "All" })}
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
            selectedCategory === "all" ? (
              <div className="space-y-8">
                {Array.from({ length: 3 }).map((_, sectionIdx) => (
                  <section key={sectionIdx}>
                    <div className="flex items-center justify-center gap-4 my-8 max-w-3xl mx-auto w-full">
                      <div className="flex-1 h-px bg-border" />
                      <Skeleton className="h-6 w-40" />
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <div className="grid grid-cols-1 gap-6 mb-8">
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <Card
                          key={`skeleton-${sectionIdx}-${idx}`}
                          className="p-0 rounded-2xl overflow-hidden"
                        >
                          <Skeleton className="w-full aspect-[16/10]" />
                          <div className="p-4 space-y-3">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                            <div className="flex items-center justify-between pt-1">
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
              <div className="grid grid-cols-1 gap-6 mb-8">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <Card
                    key={`skeleton-${idx}`}
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
            )
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>
                {t("actions.retry", { defaultValue: "Retry" })}
              </Button>
            </div>
          ) : (
            <ElegantMenuView
              categories={categories}
              items={menuData?.items ?? []}
              selectedCategory={selectedCategory}
              onAddItem={handleAddItem}
              onCheckout={handleCheckout}
              checkoutBusy={checkoutBusy}
              callButtonLabel={callButtonLabel}
              callStatus={calling}
              callPrompted={callPrompted}
              onCallClick={handleFloatingCallClick}
            />
          )}
        </div>

        <ModifierDialog
          open={customizeOpen}
          item={customizeItem}
          initialQty={1}
          onClose={() => {
            setCustomizeOpen(false);
            setCustomizeItem(null);
          }}
          onConfirm={handleConfirmModifiers}
        />
      </div>
    </div>
  );
}
