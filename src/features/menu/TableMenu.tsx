import { Suspense, lazy, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ElegantMenuView } from "@/components/menu/ElegantMenuView";
import { CategorySelectView } from "@/components/menu/CategorySelectView";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
} from "@/types";
import { Pencil, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDashboardTheme } from "@/hooks/useDashboardDark";
import { Sun, Moon } from "lucide-react";
import { getStoredStoreSlug, setStoredStoreSlug } from "@/lib/storeSlug";
import { useQuery } from "@tanstack/react-query";
import { MenuSkeleton } from "./MenuSkeleton";

const ModifierDialog = lazy(() =>
  import("@/components/menu/ModifierDialog").then((mod) => ({
    default: mod.ModifierDialog,
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
  const preferGreek = i18n.language?.toLowerCase().startsWith("el");
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { dashboardDark, themeClass } = useDashboardTheme();
  const { theme, setTheme } = useTheme();
  const { addItem, clearCart, setItems } = useCartStore();
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
  const [error, setError] = useState<string | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [cartOpenSignal, setCartOpenSignal] = useState(0);
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
  const [tableLabel, setTableLabel] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(() =>
    tableParam ? tableParam : null
  );
  const [ordersSheetOpen, setOrdersSheetOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem("ordersSheetOpen") === "1";
    } catch {
      return false;
    }
  });
  const activeTableId = tableId || tableParam || null;
  const isEditingExisting = Boolean(editingOrderId);
  const lastOrderStatus = lastOrder?.status ?? "PLACED";
  const lastOrderStatusLabel = t(`status.${lastOrderStatus}`, {
    defaultValue: (lastOrderStatus || "PLACED").toString(),
  });
  const canEditLastOrder = lastOrderStatus === "PLACED" && !!lastOrder?.id;
  const themedWrapper = clsx(themeClass, { dark: dashboardDark });

  const menuCache = useMenuStore((s) => s.data);
  const setMenuCache = useMenuStore((s) => s.setMenu);
  const clearMenuCache = useMenuStore((s) => s.clear);
  const navMarkRef = useRef(false);
  const paintMarkRef = useRef(false);
  const dataMarkRef = useRef(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [activeOrders, setActiveOrders] = useState<SubmittedOrderSummary[]>([]);
  const bootstrapQueryEnabled = Boolean(activeTableId) && !isFallbackSlug(storeSlug);
  const {
    data: bootstrap,
    isLoading: bootstrapLoading,
    isFetching: bootstrapFetching,
    error: bootstrapError,
  } = useQuery({
    queryKey: ["menu-bootstrap", storeSlug || null, activeTableId],
    queryFn: async () => {
      if (!activeTableId) {
        throw new Error("Missing table identifier");
      }
      return api.getMenuBootstrap(activeTableId, { storeSlug: storeSlug || undefined });
    },
    enabled: bootstrapQueryEnabled,
    staleTime: 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    placeholderData: (previous) => previous,
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
    if (!menuCache || menuData) return;
    setMenuData(
      buildMenuState(
        {
          categories: menuCache.categories,
          items: menuCache.items,
          modifiers: (menuCache as any).modifiers || [],
          modifierOptions: [],
          itemModifiers: (menuCache as any).itemModifiers || [],
        },
        preferGreek
      )
    );
  }, [menuCache, menuData, preferGreek]);

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

  // persist ordersSheetOpen in sessionStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (ordersSheetOpen) {
        window.sessionStorage.setItem("ordersSheetOpen", "1");
      } else {
        window.sessionStorage.removeItem("ordersSheetOpen");
      }
    } catch {}
  }, [ordersSheetOpen]);

  // Currency formatting for order totals in the sheet
  const currencyCode =
    typeof window !== "undefined"
      ? window.localStorage.getItem("CURRENCY") || "EUR"
      : "EUR";
  const formatCurrencyOrder = (value: number) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
      }).format(value);
    } catch {
      return value.toFixed(2);
    }
  };

  // Hydrate and persist all orders for current table (best-effort, client-side)
  useEffect(() => {
    if (typeof window === "undefined" || !activeTableId) return;
    try {
      const stored = window.localStorage.getItem(
        `table:orders:${activeTableId}`
      );
      if (stored) {
        const parsed = JSON.parse(stored) as SubmittedOrderSummary[];
        if (Array.isArray(parsed)) setActiveOrders(parsed);
      }
    } catch {}
  }, [activeTableId]);

  useEffect(() => {
    if (typeof window === "undefined" || !activeTableId) return;
    try {
      window.localStorage.setItem(
        `table:orders:${activeTableId}`,
        JSON.stringify(activeOrders)
      );
    } catch {}
  }, [activeOrders, activeTableId]);

  // Render grouped Active Orders with section dividers
  const renderActiveOrders = () => {
    const placed = activeOrders.filter((o) => o.status === 'PLACED');
    const preparing = activeOrders.filter((o) => o.status === 'PREPARING');
    const ready = activeOrders.filter((o) => o.status === 'READY');
    const Section = ({ title, list }: { title: string; list: SubmittedOrderSummary[] }) => (
      <>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className="text-xs text-muted-foreground">{list.length}</span>
        </div>
        <div className="space-y-3 mt-1">
          {list.map((o) => (
            <div key={o.id} className="rounded-xl border border-border/50 bg-card/70 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">#{o.id.slice(0,6)} · {o.tableLabel}</div>
                <div className="text-xs text-muted-foreground">{t(`status.${o.status}`, { defaultValue: o.status || 'PLACED' })}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-primary">{formatCurrencyOrder((o.totalCents ?? 0) / 100)}</span>
                <Button
                  size="sm"
                  variant={o.status === 'PLACED' ? 'default' : 'outline'}
                  disabled={o.status !== 'PLACED'}
                  onClick={() => handleEditOrder(o)}
                >
                  {t('actions.edit', { defaultValue: 'Edit' })}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </>
    );
    return (
      <div className="space-y-5">
        {placed.length > 0 && <Section title={t('status.PLACED', { defaultValue: 'Placed' })} list={placed} />}
        {preparing.length > 0 && (
          <>
            <div className="border-t border-border/40" />
            <Section title={t('status.PREPARING', { defaultValue: 'In Preparation' })} list={preparing} />
          </>
        )}
        {ready.length > 0 && (
          <>
            <div className="border-t border-border/40" />
            <Section title={t('status.READY', { defaultValue: 'Ready' })} list={ready} />
          </>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (lastOrder?.tableLabel) {
      setTableLabel(lastOrder.tableLabel);
    }
  }, [lastOrder]);

  const computeOrderTotal = (order: SubmittedOrderSummary | null) => {
    if (!order) return 0;
    if (typeof order.total === "number") return order.total;
    if (typeof order.totalCents === "number") return order.totalCents / 100;
    return 0;
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
          const entry =
            performance.getEntriesByName("menu:first-paint-delay").pop();
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

  // Edit an existing submitted order from the Active Orders sheet
  const handleEditOrder = (order: SubmittedOrderSummary) => {
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

    const mappedItems = mapOrderToCartItems(order, menuData.items);
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

    clearCart();
    setItems(mappedItems);
    setEditingOrderId(order.id);
    setEditingNote(order.note ?? "");
    setOrdersSheetOpen(false);
    setCategorySelected(true);
    setSelectedCategory("all");
    setCartOpenSignal((s) => s + 1);
  };

  const handleCheckout = async (note?: string) => {
    if (checkoutBusy) return null;
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
        items: cartItems.map((item) => ({
          itemId: item.item.id,
          quantity: item.quantity,
          modifiers: JSON.stringify(item.selectedModifiers),
        })),
        note: note ?? "",
        paymentSessionId: paymentResponse.sessionId,
        totalCents: totalCents,
        editingOrderId: editingOrderId ?? undefined,
      };

      try {
        window.sessionStorage.setItem(
          "pending-order",
          JSON.stringify(pendingOrder)
        );
      } catch (e) {
        console.warn("Failed to store pending order", e);
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

  // Immediate checkout handler (bypasses Viva payment for debugging)
  const handleImmediateCheckout = async (note?: string) => {
    if (checkoutBusy) return null;
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

      const payload: CreateOrderPayload = {
        tableId: activeTableId,
        items: cartItems.map((ci) => ({
          itemId: ci.item.id,
          quantity: ci.quantity,
          modifiers: JSON.stringify(ci.selectedModifiers),
        })),
        note: note ?? "",
      };

      // If editing, patch existing order instead of creating a new one
      const response = editingOrderId
        ? await api.editOrder(editingOrderId, payload)
        : await api.createOrder(payload);
      const order = (response as OrderResponse)?.order;

      if (!order?.id) {
        throw new Error("Order was not created");
      }

      // Clear cart and update state
      useCartStore.getState().clearCart();
      setLastOrder({
        id: order.id,
        status: order.status ?? "PLACED",
        createdAt: order.createdAt ?? new Date().toISOString(),
        items: order.items ?? [],
        totalCents: order.totalCents,
        tableLabel: tableLabel ?? activeTableId,
        note: note,
      });
      // If we were editing, clear editing state
      if (editingOrderId) {
        setEditingOrderId(null);
        setEditingNote(undefined);
      }

      toast({
        title: t("menu.toast_order_placed_title", {
          defaultValue: "Order placed!",
        }),
        description: t("menu.toast_order_placed_desc", {
          defaultValue: "Your order has been sent to the kitchen.",
        }),
      });

      // Track/update in active orders and open the sheet
      setActiveOrders((prev) => {
        const updated = {
          id: order.id,
          status: (order.status ?? "PLACED") as any,
          createdAt: order.createdAt ?? new Date().toISOString(),
          items: (order.items ?? []) as any,
          totalCents: order.totalCents,
          tableLabel: tableLabel ?? activeTableId,
          note: note,
        } as SubmittedOrderSummary;
        const exists = prev.some((o) => o.id === order.id);
        if (exists) return prev.map((o) => (o.id === order.id ? updated : o));
        return [updated, ...prev];
      });

      // After successful submission, guide back to category selection and open the Active Orders sheet.
      setCategorySelected(false);
      setSelectedCategory(null);
      setOrdersSheetOpen(true);

      return {
        id: order.id,
        status: order.status ?? "PLACED",
        createdAt: order.createdAt ?? new Date().toISOString(),
        items: order.items ?? [],
        totalCents: order.totalCents,
        tableLabel: tableLabel ?? activeTableId,
        note: note,
      } as SubmittedOrderSummary;
    } catch (error) {
      console.error("Failed to place order:", error);
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
      return null;
    } finally {
      setCheckoutBusy(false);
    }
  };

  useEffect(() => {
    // subscribe for call acknowledgements for this table
    if (!activeTableId || !storeSlug) return;
    let mounted = true;
    const callTopic = `${storeSlug}/waiter/call`;
    const placedTopic = `${storeSlug}/orders/placed`;
    const preparingTopicLegacy = `${storeSlug}/orders/prepairing`;
    const preparingTopic = `${storeSlug}/orders/preparing`;
    const readyTopic = `${storeSlug}/orders/ready`;
    const cancelledTopic = `${storeSlug}/orders/canceled`;
    const cancelledLegacyTopic = `${storeSlug}/orders/cancelled`;
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
      // New orders placed (any client) for this table
      realtimeService.subscribe(placedTopic, (payload) => {
        if (!mounted || !isOrderEventMessage(payload)) return;
        if (payload.tableId !== activeTableId) return;
        setActiveOrders((prev) => {
          const exists = prev.some((o) => o.id === payload.orderId);
          const entry = {
            id: payload.orderId,
            status: "PLACED" as const,
            createdAt: payload.createdAt ?? new Date().toISOString(),
            items: (payload.items ?? []) as any,
            totalCents: payload.totalCents ?? 0,
            tableLabel: tableLabel ?? activeTableId ?? undefined,
          } as SubmittedOrderSummary;
          if (exists) return prev.map((o) => (o.id === entry.id ? { ...o, ...entry } : o));
          return [entry, ...prev];
        });
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
        setActiveOrders((prev) => prev.map((o) => (o.id === payload.orderId ? { ...o, status: "READY" } : o)));
        // Optional: disconnect if no live orders remain
        const anyLive = (useOrdersStore.getState?.() ? [] : prev).length; // placeholder safeguard
      });
      realtimeService.subscribe(cancelledTopic, (payload) => {
        if (!mounted || !isOrderEventMessage(payload)) return;
        setLastOrder((prev) =>
          prev && prev.id === payload.orderId
            ? { ...prev, status: "CANCELLED" }
            : prev
        );
        setActiveOrders((prev) => prev.map((o) => (o.id === payload.orderId ? { ...o, status: "CANCELLED" } : o)));
      });
      realtimeService.subscribe(cancelledLegacyTopic, (payload) => {
        if (!mounted || !isOrderEventMessage(payload)) return;
        setLastOrder((prev) =>
          prev && prev.id === payload.orderId
            ? { ...prev, status: "CANCELLED" }
            : prev
        );
        setActiveOrders((prev) => prev.map((o) => (o.id === payload.orderId ? { ...o, status: "CANCELLED" } : o)));
      });
      realtimeService.subscribe(paidTopic, (payload) => {
        if (!mounted || !isOrderEventMessage(payload)) return;
        setLastOrder((prev) =>
          prev && prev.id === payload.orderId
            ? { ...prev, status: "PAID" }
            : prev
        );
        setActiveOrders((prev) => prev.map((o) => (o.id === payload.orderId ? { ...o, status: "PAID" } : o)));
      });
    })();
    return () => {
      mounted = false;
      realtimeService.unsubscribe(callTopic);
      realtimeService.unsubscribe(placedTopic);
      realtimeService.unsubscribe(preparingTopicLegacy);
      realtimeService.unsubscribe(preparingTopic);
      realtimeService.unsubscribe(readyTopic);
      realtimeService.unsubscribe(cancelledTopic);
      realtimeService.unsubscribe(cancelledLegacyTopic);
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

  if (!menuData && (bootstrapLoading || bootstrapFetching)) {
    return (
      <div
        className={clsx(
          themedWrapper,
          "min-h-screen min-h-dvh overflow-hidden"
        )}
      >
        <MenuSkeleton />
      </div>
    );
  }

  return (
    <div
      className={clsx(themedWrapper, "min-h-screen min-h-dvh overflow-hidden")}
    >
      <div className="min-h-screen min-h-dvh dashboard-bg overflow-x-hidden text-foreground flex flex-col">
        <header className="bg-card/80 backdrop-blur border-b border-border sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {headerTitle ? (
                <h1 className="text-xl sm:text-2xl font-bold text-primary">{headerTitle}</h1>
              ) : (
                <Skeleton className="h-7 sm:h-8 w-40 sm:w-48 rounded-full" />
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

        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8 flex-1 w-full">
          <AnimatePresence mode="wait">
            {!categorySelected ? (
              <CategorySelectView
                key="category-select"
                categories={categories}
                loading={loading}
                activeOrdersCount={activeOrders.length}
                onShowActiveOrders={() => setOrdersSheetOpen(true)}
                onSelect={(catId) => {
                  setSelectedCategory(catId);
                  setCategorySelected(true);
                }}
              />
            ) : (
              <motion.div
                key="menu-view"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {/* Category tabs bar */}
                <motion.div 
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                  className="flex gap-2 mb-6 overflow-x-auto pb-2 items-center"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setCategorySelected(false);
                      setSelectedCategory(null);
                    }}
                    className="shrink-0 h-9 w-9 rounded-full"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    key="all"
                    variant={selectedCategory === "all" ? "default" : "outline"}
                    onClick={() => setSelectedCategory("all")}
                    className="shrink-0 rounded-full h-9 text-sm"
                  >
                    {t("menu.category_all", { defaultValue: "All" })}
                  </Button>
                  {categories.map((cat) => (
                    <Button
                      key={cat.id}
                      variant={selectedCategory === cat.id ? "default" : "outline"}
                      onClick={() => setSelectedCategory(cat.id)}
                      className="shrink-0 rounded-full h-9 text-sm"
                    >
                      {cat.title}
                    </Button>
                  ))}
                </motion.div>

                {error ? (
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
                    selectedCategory={selectedCategory || "all"}
                    onAddItem={handleAddItem}
                    onCheckout={handleCheckout}
                    onImmediateCheckout={handleImmediateCheckout}
                    checkoutBusy={checkoutBusy}
                    openCartSignal={cartOpenSignal}
                    callButtonLabel={callButtonLabel}
                    callStatus={calling}
                    callPrompted={callPrompted}
                    onCallClick={handleFloatingCallClick}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Removed floating trigger; button now sits next to View Full Menu */}

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
        {/* Active Orders Sheet */}
        <Sheet open={ordersSheetOpen} onOpenChange={setOrdersSheetOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] p-0">
            <SheetHeader className="px-4 pt-4 pb-2 border-b border-border/40">
              <SheetTitle>{t('menu.active_orders', { defaultValue: 'Active Orders' })}</SheetTitle>
            </SheetHeader>
            <div className="px-4 py-3 max-h-[65vh] overflow-y-auto">
              {activeOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('menu.no_active_orders', { defaultValue: 'No active orders yet.' })}</p>
              ) : (
                <div className="space-y-3">
                  {activeOrders.map((o) => (
                    <div key={o.id} className="rounded-xl border border-border/50 bg-card/70 p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">#{o.id.slice(0,6)} · {o.tableLabel}</div>
                        <div className="text-xs text-muted-foreground">
                          {t(`status.${o.status}`, { defaultValue: o.status || 'PLACED' })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-primary">ƒ,ª{((o.totalCents ?? 0)/100).toFixed(2)}</span>
                        <Button
                          size="sm"
                          variant={o.status === 'PLACED' ? 'default' : 'outline'}
                          disabled={o.status !== 'PLACED'}
                          onClick={() => handleEditOrder(o)}
                        >
                          {t('actions.edit', { defaultValue: 'Edit' })}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
