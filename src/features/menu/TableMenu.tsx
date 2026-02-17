import { Suspense, lazy, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CategorySelectView } from "@/components/menu/CategorySelectView";
import { Button } from "@/components/ui/button";
import { AppBurger } from "@/components/AppBurger";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTheme } from "@/components/theme-provider-context";
import { useCartStore } from "@/store/cartStore";
import { api, ApiError, API_BASE } from "@/lib/api";
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
  CartItem,
  SubmittedOrderItem,
  SubmittedOrderSummary,
  OrderStatus,
  OrderingMode,
} from "@/types";
import { Pencil, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDashboardTheme } from "@/hooks/useDashboardDark";
import { Sun, Moon } from "lucide-react";
import { getStoredStoreSlug, setStoredStoreSlug } from "@/lib/storeSlug";
import { useQuery } from "@tanstack/react-query";
import { MenuSkeleton } from "./MenuSkeleton";
import {
  clearStoredLocalityApproval,
  getDeviceContext,
  getLocalitySessionId,
  getStoredLocalityApproval,
  type LocalityApproval,
} from "@/lib/locality";

const ModifierDialog = lazy(() =>
  import("@/components/menu/ModifierDialog").then((mod) => ({
    default: mod.ModifierDialog,
  }))
);
const SwipeableMenuView = lazy(() =>
  import("@/components/menu/SwipeableMenuView").then((mod) => ({
    default: mod.SwipeableMenuView,
  }))
);
const LocalityApprovalModal = lazy(() =>
  import("@/components/menu/LocalityApprovalModal").then((mod) => ({
    default: mod.LocalityApprovalModal,
  }))
);

type CategorySummary = Pick<
  MenuCategory,
  "id" | "title" | "titleEn" | "titleEl"
>;
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

const buildMenuState = (
  payload: Partial<MenuStateData> & {
    categories?: Array<{
      id?: string;
      title?: string;
      titleEn?: string;
      titleEl?: string;
    }>;
    items?: MenuItem[];
  } = {},
  preferGreek: boolean
): MenuStateData => {
  const localizeText = (en?: string, el?: string, fallback?: string) =>
    preferGreek ? el || en || fallback || "" : en || el || fallback || "";

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
      const name = localizeText(
        item.titleEn || item.name,
        item.titleEl,
        item.name || item.title
      );
      const description = localizeText(
        item.descriptionEn,
        item.descriptionEl,
        item.description
      );
      const imageUrl = item.imageUrl ?? item.image ?? "";
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

const normalizeOrderingMode = (mode?: string | null): OrderingMode =>
  mode === "waiter" || mode === "hybrid" ? mode : "qr";

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

const mapOrderItemModifiers = (
  orderItem?: SubmittedOrderItem,
  menuItem?: MenuItem
) => {
  const selections: Record<string, string> = {};
  if (!orderItem?.modifiers || !Array.isArray(orderItem.modifiers))
    return selections;
  for (const mod of orderItem.modifiers) {
    const modId = mod?.modifierId;
    const optId = mod?.modifierOptionId;
    if (!modId || !optId) continue;
    // Ensure the option still exists on the menu item before pre-filling
    const matchingMod = menuItem?.modifiers?.find((m) => m.id === modId);
    const matchingOpt = matchingMod?.options.find((o) => o.id === optId);
    if (matchingMod && matchingOpt) {
      selections[modId] = optId;
    }
  }
  return selections;
};

const mapOrderToCartItems = (
  order: SubmittedOrderSummary,
  menuItems: MenuItem[]
): CartItem[] => {
  if (!order.items?.length) return [];
  const mapped: CartItem[] = [];
  for (const oi of order.items) {
    const itemId = oi?.itemId || oi?.item?.id;
    if (!itemId) continue;
    const menuItem = menuItems.find((mi) => mi.id === itemId);
    if (!menuItem) continue;
    const quantity = Math.max(1, Number(oi?.quantity ?? oi?.qty ?? 1));
    const selectedModifiers = mapOrderItemModifiers(oi, menuItem);
    mapped.push({ item: menuItem, quantity, selectedModifiers });
  }
  return mapped;
};

const getStoredName = () => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem("STORE_NAME");
    return stored && stored.trim() ? stored.trim() : null;
  } catch {
    return null;
  }
};

export default function TableMenu() {
  const { tableId: tableParam } = useParams();
  const { t, i18n } = useTranslation();
  const activeLanguage = (
    i18n.resolvedLanguage ||
    i18n.language ||
    "el"
  ).toLowerCase();
  const languageCode = activeLanguage.startsWith("el") ? "el" : "en";
  const preferGreek = languageCode === "el";
  const showActiveOrders = false; // Temporarily hide the Active Orders UI
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { dashboardDark, themeClass } = useDashboardTheme();
  const { theme, setTheme } = useTheme();
  const { addItem, clearCart, setItems } = useCartStore();
  const cartItems = useCartStore((s) => s.items);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categorySelected, setCategorySelected] = useState(false);
  const [menuData, setMenuData] = useState<MenuStateData | null>(null);
  const [storeName, setStoreName] = useState<string | null>(getStoredName());
  const isFallbackSlug = (slug: string | null | undefined) =>
    !slug || !slug.trim() || slug.trim().toLowerCase() === "default-store";

  const [storeSlug, setStoreSlug] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const slugFromUrl = params.get("storeSlug");
      if (slugFromUrl && slugFromUrl.trim()) return slugFromUrl.trim();
    }
    const stored = getStoredStoreSlug();
    return isFallbackSlug(stored) ? "" : stored || "";
  });
  const [orderingMode, setOrderingMode] = useState<OrderingMode>("qr");
  const [error, setError] = useState<string | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [cartOpenSignal, setCartOpenSignal] = useState(0);
  const [orderPlacedSignal, setOrderPlacedSignal] = useState(0);
  const [editingNote, setEditingNote] = useState<string | undefined>(undefined);
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
  const [placedOrders, setPlacedOrders] = useState<SubmittedOrderSummary[]>([]);
  const [placedLoading, setPlacedLoading] = useState(false);
  const [placedError, setPlacedError] = useState<string | null>(null);
  const [activeOrdersOpen, setActiveOrdersOpen] = useState(true);
  const [tableLabel, setTableLabel] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(() =>
    tableParam ? tableParam : null
  );
  const activeTableId = tableId || tableParam || null;
  const guestOrderingEnabled = orderingMode !== "waiter";
  const isEditingExisting = Boolean(editingOrderId);
  const lastOrderStatus = lastOrder?.status ?? "PLACED";
  const lastOrderStatusLabel = t(`status.${lastOrderStatus}`, {
    defaultValue: (lastOrderStatus || "PLACED").toString(),
  });
  const statusSteps: OrderStatus[] = [
    "PLACED",
    "PREPARING",
    "READY",
    "SERVED",
    "PAID",
    "CANCELLED",
  ];
  const canEditLastOrder = lastOrderStatus === "PLACED" && !!lastOrder?.id;
  const themedWrapper = clsx(themeClass, { dark: dashboardDark });

  const setMenuCache = useMenuStore((s) => s.setMenu);
  const clearMenuCache = useMenuStore((s) => s.clear);
  const navMarkRef = useRef(false);
  const paintMarkRef = useRef(false);
  const dataMarkRef = useRef(false);
  const cartChangeRef = useRef(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [localityGateOpen, setLocalityGateOpen] = useState(false);
  const localityGatePromiseRef = useRef<Promise<LocalityApproval | null> | null>(
    null
  );
  const localityGateResolveRef = useRef<((approval: LocalityApproval | null) => void) | null>(null);
  const [localitySessionId] = useState(() => getLocalitySessionId());
  const deviceContext = getDeviceContext();
  const bootstrapQueryEnabled =
    Boolean(activeTableId) && !isFallbackSlug(storeSlug);
  const {
    data: bootstrap,
    isLoading: bootstrapLoading,
    isFetching: bootstrapFetching,
    error: bootstrapError,
  } = useQuery({
    queryKey: ["menu-bootstrap", storeSlug || null, activeTableId, languageCode],
    queryFn: async () => {
      if (!activeTableId) {
        throw new Error("Missing table identifier");
      }
      return api.getMenuBootstrap(activeTableId, {
        storeSlug: storeSlug || undefined,
        lang: languageCode,
      });
    },
    enabled: bootstrapQueryEnabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  const { data: storeMeta } = useQuery({
    queryKey: ["store-meta", storeSlug || null],
    queryFn: async () => api.getStore(),
    enabled: Boolean(storeSlug || activeTableId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    // Capture storeSlug from URL (e.g., QR redirect) and persist before API calls
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(location.search);
      const slugFromUrl = params.get("storeSlug");
      if (slugFromUrl && slugFromUrl.trim()) {
        const trimmed = slugFromUrl.trim();
        if (isFallbackSlug(trimmed)) return;
        setStoreSlug((prev) => {
          if (prev === trimmed) return prev;
          // Clear cached menu when switching stores
          clearMenuCache();
          return trimmed;
        });
        try {
          setStoredStoreSlug(trimmed);
          window.dispatchEvent(
            new CustomEvent("store-slug-changed", {
              detail: { slug: trimmed },
            })
          );
        } catch (error) {
          console.warn("Failed to persist store slug from URL", error);
        }
      }
    }
  }, [location.search, clearMenuCache]);

  useEffect(() => {
    if (!guestOrderingEnabled) {
      clearCart();
    }
  }, [guestOrderingEnabled, clearCart]);

  useEffect(() => {
    if (!cartChangeRef.current) {
      cartChangeRef.current = true;
      return;
    }
    clearStoredLocalityApproval();
  }, [cartItems]);

  useEffect(() => {
    if (!bootstrapError) return;
    const message =
      bootstrapError instanceof Error
        ? bootstrapError.message
        : t("menu.load_error_title", { defaultValue: "Failed to load menu" });
    setError(message);
  }, [bootstrapError, t]);

  useEffect(() => {
    if (!bootstrap?.menu) return;
    const payload = bootstrap.menu;
    setMenuCache(payload as MenuData);
    setMenuData(
      buildMenuState(
        {
          categories: payload.categories,
          items: payload.items,
          modifiers: payload.modifiers || [],
          modifierOptions: [],
          itemModifiers: payload.itemModifiers || [],
        },
        preferGreek
      )
    );
    setError(null);
    if (bootstrap.table?.label) {
      setTableLabel(bootstrap.table.label);
    }
    if (bootstrap.table?.id) {
      setTableId((prev) => prev || bootstrap.table?.id || null);
    }
    setOrderingMode(normalizeOrderingMode(bootstrap.store?.orderingMode));
    if (bootstrap.store?.name || bootstrap.store?.slug) {
      const name = bootstrap.store.name || bootstrap.store.slug || null;
      setStoreName(name);
      try {
        if (name) {
          localStorage.setItem("STORE_NAME", name);
        }
      } catch (error) {
        console.warn("Failed to persist STORE_NAME", error);
      }
    }
    if (bootstrap.store?.slug && !isFallbackSlug(bootstrap.store.slug)) {
      setStoreSlug((prev) => prev || bootstrap.store.slug);
      try {
        setStoredStoreSlug(bootstrap.store.slug);
        window.dispatchEvent(
          new CustomEvent("store-slug-changed", {
            detail: { slug: bootstrap.store.slug },
          })
        );
      } catch (error) {
        console.warn("Failed to persist STORE_SLUG", error);
      }
    }

    // If we still don't have a storeName, fall back to slug
    if (!storeName && (bootstrap.store?.name || bootstrap.store?.slug)) {
      const name = bootstrap.store?.name || bootstrap.store?.slug || null;
      if (name) setStoreName(name);
    }

    if (!dataMarkRef.current && typeof performance !== "undefined") {
      dataMarkRef.current = true;
      try {
        performance.mark("menu:data-ready");
        if (performance.getEntriesByName("menu:nav-start").length) {
          performance.measure(
            "menu:nav-to-data",
            "menu:nav-start",
            "menu:data-ready"
          );
          const entry = performance.getEntriesByName("menu:nav-to-data").pop();
          if (entry) {
            console.log(
              "[perf] menu:data-ready",
              `${entry.duration.toFixed(1)}ms`
            );
          }
        }
      } catch {}
    }
  }, [bootstrap, preferGreek, setMenuCache]);

  useEffect(() => {
    if (!storeMeta?.store) return;
    setOrderingMode(normalizeOrderingMode(storeMeta.store.orderingMode));
    if (storeMeta.store.name && !storeName) {
      setStoreName(storeMeta.store.name);
    }
  }, [storeMeta, storeName]);

  // If no usable storeSlug yet (or only the fallback), try to resolve it via public table lookup
  useEffect(() => {
    if (isFallbackSlug(storeSlug) && activeTableId) {
      (async () => {
        try {
          const res = await fetch(
            `${API_BASE.replace(/\/$/, "")}/public/table/${encodeURIComponent(
              activeTableId
            )}`
          );
          if (!res.ok) return;
          const data = await res.json();
          if (data?.storeSlug) {
            clearMenuCache();
            setStoreSlug(data.storeSlug);
            try {
              setStoredStoreSlug(data.storeSlug);
              window.dispatchEvent(
                new CustomEvent("store-slug-changed", {
                  detail: { slug: data.storeSlug },
                })
              );
            } catch {}
          }
        } catch (err) {
          console.warn("Failed to resolve store slug for table", err);
        }
      })();
    }
  }, [storeSlug, activeTableId, clearMenuCache]);

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
    if (!activeTableId) {
      setPlacedOrders([]);
      return;
    }
    let cancelled = false;
    const fetchPlaced = async () => {
      try {
        setPlacedLoading(true);
        setPlacedError(null);
        const res = await api.getPublicTableOrders(activeTableId, {
          storeSlug: storeSlug || undefined,
          take: 10,
        });
        if (cancelled) return;
        const summaries = (res?.orders ?? []).map(toOrderSummary);
        setPlacedOrders(summaries);
        if (summaries.length > 0) {
          setActiveOrdersOpen(true);
        }
        if (summaries[0]) {
          setLastOrder((prev) =>
            prev && prev.id === summaries[0].id
              ? { ...prev, ...summaries[0] }
              : summaries[0]
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to load placed orders", error);
          setPlacedError(
            error instanceof Error ? error.message : "Failed to load orders"
          );
        }
      } finally {
        if (!cancelled) setPlacedLoading(false);
      }
    };
    // One-time fetch to hydrate; live updates handled via realtime subscriptions below.
    fetchPlaced();
    return () => {
      cancelled = true;
    };
  }, [activeTableId, storeSlug]);

  useEffect(() => {
    if (lastOrder) {
      setActiveOrdersOpen(true);
    }
  }, [lastOrder?.id]);

  const computeOrderTotal = (order: SubmittedOrderSummary | null) => {
    if (!order) return 0;
    if (typeof order.total === "number") return order.total;
    if (typeof order.totalCents === "number") return order.totalCents / 100;
    return 0;
  };

  const toOrderSummary = (order: any): SubmittedOrderSummary => {
    const items = Array.isArray(order?.items)
      ? order.items.map((item: any) => ({
          itemId: item.itemId ?? item.item?.id,
          title: item.title ?? item.titleSnapshot ?? item.name,
          quantity: item.quantity ?? item.qty,
          modifiers: item.modifiers ?? item.orderItemOptions ?? [],
        }))
      : [];
    return {
      id: order?.id ?? order?.orderId,
      tableId: order?.tableId,
      tableLabel: order?.tableLabel ?? order?.table?.label,
      createdAt: order?.placedAt ?? order?.createdAt,
      updatedAt: order?.updatedAt,
      total: order?.total ?? (order?.totalCents ? order.totalCents / 100 : 0),
      totalCents: order?.totalCents,
      status: (order?.status as OrderStatus) ?? "PLACED",
      note: order?.note,
      ticketNumber: order?.ticketNumber,
      items,
    };
  };

  const upsertPlacedOrder = (order: SubmittedOrderSummary) => {
    setPlacedOrders((prev) => {
      const next = prev.filter((o) => o.id !== order.id);
      next.unshift(order);
      next.sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });
      return next;
    });
  };

  const stopEditingLastOrder = () => {
    setEditingOrderId(null);
    setEditingNote(undefined);
  };

  const startEditingLastOrder = () => {
    if (!lastOrder?.id) {
      toast({
        title: t("menu.edit_order_unavailable_title", {
          defaultValue: "No order to edit",
        }),
        description: t("menu.edit_order_unavailable_desc", {
          defaultValue: "Place an order first.",
        }),
      });
      return;
    }
    if (lastOrder.status && lastOrder.status !== "PLACED") {
      toast({
        title: t("menu.edit_order_locked_title", {
          defaultValue: "Kitchen already accepted",
        }),
        description: t("menu.edit_order_locked_desc", {
          defaultValue: "Edits are disabled once the kitchen starts preparing.",
        }),
      });
      stopEditingLastOrder();
      return;
    }
    if (!menuData?.items?.length) {
      toast({
        title: t("menu.load_error_title", {
          defaultValue: "Menu still loading",
        }),
        description: t("menu.load_error_description", {
          defaultValue: "Please try again in a moment.",
        }),
      });
      return;
    }

    const mappedItems = mapOrderToCartItems(lastOrder, menuData.items);
    if (!mappedItems.length) {
      toast({
        title: t("menu.edit_order_unavailable_title", {
          defaultValue: "Unable to edit order",
        }),
        description: t("menu.edit_order_items_missing", {
          defaultValue: "Items are no longer available to edit.",
        }),
      });
      return;
    }

    const missingCount = Math.max(
      0,
      (lastOrder.items?.length ?? 0) - mappedItems.length
    );
    setItems(mappedItems);
    setEditingOrderId(lastOrder.id);
    setEditingNote(lastOrder.note ?? "");
    setCartOpenSignal((s) => s + 1);
    if (missingCount > 0) {
      toast({
        title: t("menu.edit_order_partial_title", {
          defaultValue: "Some items were skipped",
        }),
        description: t("menu.edit_order_partial_desc", {
          count: missingCount,
          defaultValue: `${missingCount} item(s) are unavailable and were removed.`,
        }),
      });
    }
  };

  useEffect(() => {
    if (typeof performance === "undefined" || navMarkRef.current) return;
    navMarkRef.current = true;
    try {
      performance.mark("menu:nav-start");
    } catch {}
    const raf = requestAnimationFrame(() => {
      if (paintMarkRef.current) return;
      paintMarkRef.current = true;
      try {
        performance.mark("menu:first-paint");
        if (performance.getEntriesByName("menu:nav-start").length) {
          performance.measure(
            "menu:first-paint-delay",
            "menu:nav-start",
            "menu:first-paint"
          );
          const entry = performance
            .getEntriesByName("menu:first-paint-delay")
            .pop();
          if (entry) {
            console.log(
              "[perf] menu:first-paint",
              `${entry.duration.toFixed(1)}ms`
            );
          }
        }
      } catch {}
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const categories = menuData ? menuData.categories : [];
  const loading = (bootstrapLoading || bootstrapFetching) && !menuData;
  const filteredItems = menuData
    ? selectedCategory === "all"
      ? menuData.items
      : menuData.items.filter((item) =>
          matchesCategory(item, selectedCategory, categories)
        )
    : [];

  const headerTitle =
    storeName ||
    bootstrap?.store?.name ||
    bootstrap?.store?.slug ||
    storeSlug ||
    t("menu.store_title_fallback", { defaultValue: "Store" });

  const handleAddItem = (item: MenuItem) => {
    if (!guestOrderingEnabled) {
      toast({
        title: t("menu.waiter_only_title", {
          defaultValue: "Ordering with waiter only",
        }),
        description: t("menu.waiter_only_desc", {
          defaultValue: "Please ask your waiter to place the order.",
        }),
      });
      return;
    }
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

  const loadOrderIntoCart = (order: SubmittedOrderSummary | null) => {
    if (!order || !order.id) return;
    if (order.status && order.status !== "PLACED") {
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

    const orderItems = (order.items ?? []) as Array<
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

    setLastOrder(order);
    setEditingOrderId(order.id || null);
    setActiveOrdersOpen(false);
    setCartOpenSignal((s) => s + 1);
  };

  const handleEditLastOrder = () => {
    if (!lastOrder || !lastOrder.id) return;
    loadOrderIntoCart(lastOrder);
  };

  const resolveLocalityGate = (approval: LocalityApproval | null) => {
    setLocalityGateOpen(false);
    if (localityGateResolveRef.current) {
      localityGateResolveRef.current(approval);
    }
    localityGateResolveRef.current = null;
    localityGatePromiseRef.current = null;
  };

  const requestLocalityApproval = () => {
    if (localityGatePromiseRef.current) {
      return localityGatePromiseRef.current;
    }
    setLocalityGateOpen(true);
    localityGatePromiseRef.current = new Promise((resolve) => {
      localityGateResolveRef.current = resolve;
    });
    return localityGatePromiseRef.current;
  };

  const trackOrderEvent = async (
    event: Parameters<typeof api.trackPublicEvent>[0]["event"],
    method?: string,
    meta?: Record<string, unknown>
  ) => {
    if (!activeTableId) return;
    try {
      await api.trackPublicEvent({
        event,
        storeSlug: storeSlug || undefined,
        tableId: activeTableId,
        sessionId: localitySessionId,
        deviceType: deviceContext.deviceType,
        platform: deviceContext.platform,
        method,
        ts: new Date().toISOString(),
        meta,
      });
    } catch {}
  };

  const handleImmediateCheckout = async (
    note?: string
  ): Promise<SubmittedOrderSummary | null> => {
    if (checkoutBusy) return null;
    if (!guestOrderingEnabled) {
      toast({
        title: t("menu.waiter_only_title", {
          defaultValue: "Ordering with waiter only",
        }),
        description: t("menu.waiter_only_desc", {
          defaultValue: "Please ask your waiter to place the order.",
        }),
      });
      return null;
    }
    if (!activeTableId || !menuData) {
      toast({
        title: t("menu.toast_error_title", {
          defaultValue: "Error placing order",
        }),
        description: t("menu.toast_error_description", {
          defaultValue: "Missing table information. Please rescan the QR.",
        }),
      });
      return null;
    }

    const cartItems = useCartStore.getState().items;
    if (!cartItems.length) {
      toast({
        title: t("menu.toast_error_title", {
          defaultValue: "Cart is empty",
        }),
        description: t("menu.toast_error_description", {
          defaultValue: "Add items to your cart before placing the order.",
        }),
      });
      return null;
    }

    const approval =
      getStoredLocalityApproval({
        tableId: activeTableId,
        storeSlug: storeSlug || null,
        purpose: "ORDER_SUBMIT",
        sessionId: localitySessionId,
      }) ?? (await requestLocalityApproval());

    if (!approval) {
      return null;
    }

    const payload: CreateOrderPayload = {
      tableId: activeTableId,
      items: cartItems.map((item) => ({
        itemId: item.item.id,
        quantity: item.quantity,
        modifiers: JSON.stringify(item.selectedModifiers),
      })),
      ...(note ? { note } : {}),
      localityApprovalToken: approval.token,
      localitySessionId,
    };

    try {
      void trackOrderEvent("order_submit_attempted", approval.method);
      setCheckoutBusy(true);
      const response = editingOrderId
        ? await api.editOrder(editingOrderId, payload)
        : await api.createOrder(payload);
      const order = (response as any)?.order;
      if (!order?.id) {
        throw new Error("Order was not created");
      }
      const summary = toOrderSummary(order);
      setLastOrder(summary);
      upsertPlacedOrder(summary);
      setActiveOrdersOpen(true);
      clearCart();
      stopEditingLastOrder();
      clearStoredLocalityApproval();
      void trackOrderEvent("order_submit_succeeded", approval.method);
      setCategorySelected(false);
      setSelectedCategory(null);
      setOrderPlacedSignal((s) => s + 1);
      const qs = new URLSearchParams();
      if (activeTableId) {
        qs.set("tableId", activeTableId);
      }
      const qsString = qs.toString();
      navigate(
        qsString
          ? `/order/${summary.id}/thanks?${qsString}`
          : `/order/${summary.id}/thanks`
      );
      return summary;
    } catch (error) {
      console.error("Immediate checkout failed:", error);
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (
        error instanceof ApiError &&
        error.status === 403 &&
        (message.includes("LOCALITY_APPROVAL_INVALID") ||
          message.includes("LOCALITY_APPROVAL_REQUIRED"))
      ) {
        clearStoredLocalityApproval();
        toast({
          title: t("menu.toast_error_title", {
            defaultValue: "Approval expired",
          }),
          description: t("menu.toast_error_description", {
            defaultValue: "Please scan the table tag again to submit.",
          }),
        });
        void trackOrderEvent("order_submit_failed", approval.method, {
          reason: message,
        });
        return null;
      }
      void trackOrderEvent("order_submit_failed", approval.method, {
        reason: message,
      });
      toast({
        title: t("menu.toast_error_title", {
          defaultValue: "Order not placed",
        }),
        description:
          error instanceof Error
            ? error.message
            : t("menu.toast_error_description", {
                defaultValue:
                  "We could not place your order right now. Please try again.",
              }),
      });
      return null;
    } finally {
      setCheckoutBusy(false);
    }
  };

  const handleCheckout = async (note?: string) => {
    if (checkoutBusy) return null;
    if (!guestOrderingEnabled) {
      toast({
        title: t("menu.waiter_only_title", {
          defaultValue: "Ordering with waiter only",
        }),
        description: t("menu.waiter_only_desc", {
          defaultValue: "Please ask your waiter to place the order.",
        }),
      });
      return null;
    }
    if (!activeTableId || !menuData) {
      toast({
        title: t("menu.toast_error_title", {
          defaultValue: "Error placing order",
        }),
        description: t("menu.toast_error_description", {
          defaultValue: "Missing table information. Please rescan the QR.",
        }),
      });
      return null;
    }

    try {
      setCheckoutBusy(true);
      const cartItems = useCartStore.getState().items;

      // Calculate total amount
      const totalCents = cartItems.reduce((sum, item) => {
        const basePrice = item.item.priceCents;
        const modifiersPrice = Object.keys(item.selectedModifiers).reduce(
          (modSum, modId) => {
            const optionId = item.selectedModifiers[modId];
            const option = item.item.modifiers
              ?.find((m) => m.id === modId)
              ?.options.find((o) => o.id === optionId);
            return modSum + (option?.priceDeltaCents ?? 0);
          },
          0
        );
        return sum + (basePrice + modifiersPrice) * item.quantity;
      }, 0);

      const totalAmount = totalCents / 100;

      // Step 1: Get Viva payment checkout URL
      const paymentResponse = await api.getVivaCheckoutUrl(
        activeTableId,
        totalAmount,
        `Order for Table ${tableLabel || activeTableId}`
      );

      // Step 2: Store order data temporarily in sessionStorage
      const pendingOrder = {
        tableId: activeTableId,
        storeSlug: storeSlug || null,
        expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
        items: cartItems.map((item) => ({
          itemId: item.item.id,
          quantity: item.quantity,
          modifiers: JSON.stringify(item.selectedModifiers),
        })),
        note: note ?? "",
        paymentSessionId: paymentResponse.sessionId,
        totalCents: totalCents,
      };

      const pendingOrderJson = JSON.stringify(pendingOrder);
      // Persist in both sessionStorage (primary) and localStorage (fallback) to survive cross-origin redirects
      try {
        window.sessionStorage.setItem("pending-order", pendingOrderJson);
      } catch (e) {
        console.warn("Failed to store pending order in sessionStorage", e);
      }
      try {
        window.localStorage.setItem("pending-order", pendingOrderJson);
      } catch (e) {
        console.warn("Failed to store pending order in localStorage", e);
      }

      // Step 3: Redirect to Viva payment
      window.location.href = paymentResponse.checkoutUrl;

      return null;
    } catch (error) {
      console.error("Failed to initiate payment:", error);
      if (error instanceof ApiError && error.status === 403) {
        toast({
          title: t("menu.toast_error_title", {
            defaultValue: "Session expired",
          }),
          description: t("menu.toast_error_description", {
            defaultValue: "Scan the table QR again to start a new order.",
          }),
        });
      } else {
        toast({
          title: t("menu.toast_error_title", {
            defaultValue: "Error initiating payment",
          }),
          description:
            error instanceof Error
              ? error.message
              : t("menu.toast_error_description", {
                  defaultValue: "Failed to initiate payment. Please try again.",
                }),
        });
      }
      setCheckoutBusy(false);
    }
    return null;
  };

  useEffect(() => {
    // subscribe for call acknowledgements for this table
    if (!activeTableId || !storeSlug) return;
    let mounted = true;
    const callTopic = `${storeSlug}/waiter/call`;
    const preparingTopicLegacy = `${storeSlug}/orders/prepairing`;
    const preparingTopic = `${storeSlug}/orders/preparing`;
    const readyTopic = `${storeSlug}/orders/ready`;
    const cancelledTopic = `${storeSlug}/orders/canceled`;
    const cancelledLegacyTopic = `${storeSlug}/orders/cancelled`;
    const paidTopic = `${storeSlug}/orders/paid`;
    const servedTopic = `${storeSlug}/orders/served`;
    const placedTopic = `${storeSlug}/orders/placed`;
    (async () => {
      await realtimeService.connect();
      const updateStatus = (status: OrderStatus) => (payload: unknown) => {
        if (!mounted || !isOrderEventMessage(payload)) return;
        setLastOrder((prev) =>
          prev && prev.id === payload.orderId ? { ...prev, status } : prev
        );
        setPlacedOrders((prev) =>
          prev.map((o) =>
            o.id === payload.orderId ? { ...o, status } : o
          )
        );
      };

      const handlePreparing = updateStatus("PREPARING");
      const handleReady = updateStatus("READY");
      const handleCancelled = updateStatus("CANCELLED");
      const handlePaid = updateStatus("PAID");
      const handleServed = updateStatus("SERVED");
      const handlePlaced = (payload: any) => {
        if (
          !mounted ||
          !payload ||
          (payload as any).tableId !== activeTableId
        )
          return;
        const summary = toOrderSummary((payload as any).order ?? payload);
        upsertPlacedOrder(summary);
        setLastOrder((prev) =>
          prev && prev.id === summary.id ? { ...prev, ...summary } : summary
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
      realtimeService.subscribe(readyTopic, handleReady);
      realtimeService.subscribe(cancelledTopic, handleCancelled);
      realtimeService.subscribe(cancelledLegacyTopic, handleCancelled);
      realtimeService.subscribe(paidTopic, handlePaid);
      realtimeService.subscribe(servedTopic, handleServed);
      realtimeService.subscribe(placedTopic, handlePlaced);
    })();
    return () => {
      mounted = false;
      realtimeService.unsubscribe(callTopic);
      realtimeService.unsubscribe(preparingTopicLegacy);
      realtimeService.unsubscribe(preparingTopic);
      realtimeService.unsubscribe(readyTopic);
      realtimeService.unsubscribe(cancelledTopic);
      realtimeService.unsubscribe(cancelledLegacyTopic);
      realtimeService.unsubscribe(paidTopic);
      realtimeService.unsubscribe(servedTopic);
      realtimeService.unsubscribe(placedTopic);
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
    <div
      className={clsx(themedWrapper, "min-h-screen min-h-dvh overflow-hidden")}
    >
      <div className="min-h-screen min-h-dvh dashboard-bg overflow-x-hidden text-foreground flex flex-col">
        <header className="bg-card/80 backdrop-blur border-b border-border sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {headerTitle ? (
                <h1 className="text-2xl font-bold text-primary">
                  {headerTitle}
                </h1>
              ) : (
                <Skeleton className="h-8 w-48 rounded-full" />
              )}
              {/* Table label intentionally hidden per request */}
            </div>
            <div className="flex gap-2 items-center">
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label={
                  theme === "dark"
                    ? "Switch to light theme"
                    : "Switch to dark theme"
                }
                className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-border/60 bg-card/80 shadow-sm hover:bg-accent transition-colors"
              >
                {theme === "dark" ? (
                  <Moon className="h-5 w-5" />
                ) : (
                  <Sun className="h-5 w-5" />
                )}
              </button>
              <LanguageSwitcher />
              <AppBurger title={headerTitle}>
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
          {!guestOrderingEnabled && (
            <div className="mb-6 rounded-2xl border border-border/60 bg-card/80 px-4 py-3 shadow-sm">
              <p className="text-sm font-semibold text-foreground">
                {t("menu.waiter_only_title", {
                  defaultValue: "Ordering is handled by your waiter",
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("menu.waiter_only_desc", {
                  defaultValue: "Browse the menu and let your waiter place the order for you.",
                })}
              </p>
            </div>
          )}
          {!categorySelected ? (
            <CategorySelectView
              key="category-select"
              categories={categories}
              loading={loading}
              onSelect={(catId) => {
                setSelectedCategory(catId);
                setCategorySelected(true);
                setActiveOrdersOpen(false);
              }}
            />
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>
                {t("actions.retry", { defaultValue: "Retry" })}
              </Button>
            </div>
          ) : (
            <Suspense fallback={<MenuSkeleton />}>
              <SwipeableMenuView
                categories={categories}
                items={menuData?.items ?? []}
                selectedCategory={selectedCategory || "all"}
                onCategoryChange={(catId) => setSelectedCategory(catId)}
                onBack={() => {
                  setCategorySelected(false);
                  setSelectedCategory(null);
                }}
                onAddItem={handleAddItem}
                onCheckout={handleCheckout}
                onImmediateCheckout={handleImmediateCheckout}
                orderPlacedSignal={orderPlacedSignal}
                checkoutBusy={checkoutBusy}
                callButtonLabel={callButtonLabel}
                callStatus={calling}
                callPrompted={callPrompted}
                onCallClick={handleFloatingCallClick}
                showCartButton={guestOrderingEnabled}
              />
            </Suspense>
          )}
        </div>

        {showActiveOrders && activeOrdersOpen && !categorySelected && (
          <div className="max-w-6xl mx-auto px-4 w-full my-6">
            <div className="rounded-[28px] border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-5 border-b border-border/60">
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    Active Orders
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Live status updates from the kitchen
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {placedOrders[0] && (
                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary">
                      {t(
                        `status.${placedOrders[0].status ?? "PLACED"}`,
                        {
                          defaultValue: placedOrders[0].status ?? "Placed",
                        }
                      )}
                    </span>
                  )}
                  {placedLoading && (
                    <span className="text-xs text-muted-foreground">
                      {t("status.loading", { defaultValue: "Loading..." })}
                    </span>
                  )}
                  {placedError && (
                    <span className="text-xs text-destructive">
                      {placedError}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={() => setActiveOrdersOpen(false)}
                    aria-label={t("actions.close", { defaultValue: "Close" })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {placedOrders.length === 0 ? (
                <div className="px-6 py-8 text-sm text-muted-foreground">
                  No placed orders for this table right now.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {placedOrders.map((order) => {
                    const statusLabel = t(
                      `status.${order.status ?? "PLACED"}`,
                      { defaultValue: order.status ?? "Placed" }
                    );
                    const placedTime = new Date(
                      order.createdAt || Date.now()
                    ).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <div
                        key={order.id}
                        className="px-6 py-5 bg-gradient-to-br from-background/60 to-background"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                              <span>#{(order.id || "").slice(-6)}</span>
                              {order.tableLabel && (
                                <span className="text-muted-foreground">
                                  - {order.tableLabel}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {placedTime}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-lg font-bold text-foreground">
                              €{computeOrderTotal(order).toFixed(2)}
                            </div>
                            <Button
                              size="sm"
                              variant="default"
                              className="rounded-full px-4"
                              disabled={order.status !== "PLACED"}
                              onClick={() => loadOrderIntoCart(order)}
                            >
                              {t("actions.edit", { defaultValue: "Edit" })}
                            </Button>
                          </div>
                        </div>

                        <div className="mt-4">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">
                            STATUS
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {statusSteps.map((step) => {
                              const isActive = step === order.status;
                              return (
                                <span
                                  key={`${order.id}-${step}`}
                                  className={clsx(
                                    "px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
                                    isActive
                                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                                      : "border-border/60 text-muted-foreground bg-background/70"
                                  )}
                                >
                                  {t(`status.${step}`, {
                                    defaultValue: step,
                                  })}
                                </span>
                              );
                            })}
                          </div>
                          <p className="sr-only">{statusLabel}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {showActiveOrders && !activeOrdersOpen && placedOrders.length > 0 && (
          <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center pointer-events-none">
            <Button
              variant="secondary"
              className="pointer-events-auto rounded-full shadow-2xl bg-card/90 border border-border/70 px-4 py-3"
              onClick={() => setActiveOrdersOpen(true)}
            >
              {t("menu.view_active_orders", { defaultValue: "Active Orders" })}
              <span className="ml-2 inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {placedOrders.length}
              </span>
            </Button>
          </div>
        )}

        {localityGateOpen ? (
          <Suspense fallback={null}>
            <LocalityApprovalModal
              open={localityGateOpen}
              tableId={activeTableId || ""}
              storeSlug={storeSlug || null}
              sessionId={localitySessionId}
              purpose="ORDER_SUBMIT"
              onCancel={() => resolveLocalityGate(null)}
              onApproved={(approval) => resolveLocalityGate(approval)}
            />
          </Suspense>
        ) : null}

        <Suspense fallback={null}>
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
        </Suspense>
      </div>
    </div>
  );
}

