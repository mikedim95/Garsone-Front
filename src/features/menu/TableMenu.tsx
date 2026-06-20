import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import clsx from "clsx";
import { createPortal } from "react-dom";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDragControls, type PanInfo } from "framer-motion";
import { CategorySelectView } from "@/components/menu/CategorySelectView";
import { SwipeableMenuView } from "@/components/menu/SwipeableMenuView";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AppBurger } from "@/components/AppBurger";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTheme } from "@/components/theme-provider-context";
import { useCartStore } from "@/store/cartStore";
import { api, ApiError, API_BASE } from "@/lib/api";
import { registerCustomerPushForOrder } from "@/lib/customerPush";
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
import {
  ChevronRight,
  Clock3,
  Info,
  ShoppingBag,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDashboardTheme } from "@/hooks/useDashboardDark";
import { Sun, Moon } from "lucide-react";
import { getStoredStoreSlug, setStoredStoreSlug } from "@/lib/storeSlug";
import { useQuery } from "@tanstack/react-query";
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
const LocalityApprovalModal = lazy(() =>
  import("@/components/menu/LocalityApprovalModal").then((mod) => ({
    default: mod.LocalityApprovalModal,
  }))
);

type CategorySummary = Pick<
  MenuCategory,
  "id" | "title" | "titleEn" | "titleEl" | "imageUrl"
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
  categories?: Array<{ id?: string; title?: string; imageUrl?: string | null }>
): CategorySummary[] =>
  (categories ?? []).reduce<CategorySummary[]>((acc, category, index) => {
    if (!category) return acc;
    const id = category.id ?? `cat-${index}`;
    const title = category.title ?? "";
    if (!title) return acc;
    acc.push({ id, title, imageUrl: category.imageUrl ?? null });
    return acc;
  }, []);

const resolveLocalizedMenuText = (
  preferGreek: boolean,
  values: {
    en?: string | null;
    el?: string | null;
    localized?: string | null;
    legacy?: string | null;
  }
) => {
  const en = values.en?.trim();
  const el = values.el?.trim();
  const localized = values.localized?.trim();
  const legacy = values.legacy?.trim();

  if (preferGreek) {
    return el || localized || en || legacy || "";
  }
  return en || localized || el || legacy || "";
};

const SHISHA_FLAVOR_DESCRIPTIONS: Record<string, { en: string; el: string }> = {
  mint: {
    en: "Fresh mint with a cool herbal finish.",
    el: "Δροσερή μέντα με καθαρή βοτανική επίγευση.",
  },
  apple: {
    en: "Crisp apple with a light sweet finish.",
    el: "Τραγανό μήλο με ελαφριά γλυκιά επίγευση.",
  },
  "big-boy": {
    en: "Sweet tropical fruits with a cool mint finish.",
    el: "Γλυκά τροπικά φρούτα με δροσερό τελείωμα μέντας.",
  },
  devil: {
    en: "Red fruit, citrus and an icy finish.",
    el: "Κόκκινα φρούτα, εσπεριδοειδή και παγωμένη επίγευση.",
  },
  "ali-baba": {
    en: "Spiced fruit blend with apple, citrus and soft sweetness.",
    el: "Μείγμα φρούτων με μήλο, εσπεριδοειδή και απαλή γλυκύτητα.",
  },
  fuck66: {
    en: "Melon, passion fruit, watermelon and cool mint.",
    el: "Πεπόνι, passion fruit, καρπούζι και δροσερή μέντα.",
  },
  love66: {
    en: "Melon, passion fruit, watermelon and cool mint.",
    el: "Πεπόνι, passion fruit, καρπούζι και δροσερή μέντα.",
  },
  "mango-lemoni": {
    en: "Ripe mango, bright lemon and a light citrus finish.",
    el: "Ώριμο μάνγκο, λεμόνι και ελαφριά citrus επίγευση.",
  },
  "pagoto-vanillia-vatomouro": {
    en: "Vanilla ice cream with raspberry and soft cream.",
    el: "Παγωτό βανίλια με βατόμουρο και απαλή κρέμα.",
  },
  marshmellow: {
    en: "Soft marshmallow cream with vanilla sweetness.",
    el: "Απαλή κρέμα marshmallow με γλυκιά βανίλια.",
  },
  lemoni: {
    en: "Bright lemon citrus with a clean sour finish.",
    el: "Φρέσκο λεμόνι με καθαρή ξινή επίγευση.",
  },
  "keik-lemoni": {
    en: "Lemon cake with vanilla sponge and citrus glaze.",
    el: "Κέικ λεμόνι με βανίλια και citrus γλάσο.",
  },
  menta: {
    en: "Fresh mint with a cool herbal finish.",
    el: "Δροσερή μέντα με καθαρή βοτανική επίγευση.",
  },
  milo: {
    en: "Green apple with a mellow sweet finish.",
    el: "Πράσινο μήλο με ήπια γλυκιά επίγευση.",
  },
  caramella: {
    en: "Caramel candy with a warm creamy finish.",
    el: "Καραμέλα με ζεστή κρεμώδη επίγευση.",
  },
  "mpiskoto-voutirou": {
    en: "Butter biscuit with vanilla and toasted cookie notes.",
    el: "Μπισκότο βουτύρου με βανίλια και ψημένη ζύμη.",
  },
  "ice-bomb": {
    en: "Icy mint and menthol with a sharp cooling finish.",
    el: "Παγωμένη μέντα και menthol με έντονη δροσιά.",
  },
  "mesh-juicy": {
    en: "Juicy mixed fruit with peach, citrus and tropical sweetness.",
    el: "Ζουμερό μείγμα φρούτων με ροδάκινο, citrus και τροπική γλυκύτητα.",
  },
  bueno: {
    en: "Hazelnut cream, chocolate and wafer biscuit.",
    el: "Κρέμα φουντουκιού, σοκολάτα και γκοφρέτα.",
  },
};

const trimLeadingShishaSeparator = (value: string) => {
  let cleaned = value.trimStart();
  while (cleaned.startsWith("-") || cleaned.startsWith(":")) {
    cleaned = cleaned.slice(1).trimStart();
  }
  return cleaned;
};

const cleanShishaDisplayName = (name: string) => {
  const cleaned = trimLeadingShishaSeparator(
    name
      .trim()
      .replace(/^(simple|special|premium)\s+shisha\s*/i, "")
      .replace(/^shisha\s*/i, "")
  )
    .replace(/\s+shisha$/i, "")
    .trim();
  return cleaned || name;
};

const getItemPresentation = ({
  name,
  description,
  category,
}: {
  name: string;
  description: string;
  category?: string | null;
}) => {
  const isShisha =
    /shisha/i.test(category || "") ||
    /^(simple|special|premium)\s+shisha\b/i.test(name) ||
    /\bshisha$/i.test(name);

  if (!isShisha) {
    return { displayName: name, displayDescription: description };
  }

  const displayName = cleanShishaDisplayName(name);

  return {
    displayName,
    displayDescription: description,
  };
};

const getLocalizedShishaSubcategory = (subcategory: string, preferGreek: boolean) => {
  const normalized = subcategory.trim().toLowerCase();
  if (!normalized) return "";
  const labels: Record<string, { en: string; el: string }> = {
    simple: { en: "Simple", el: "Απλός" },
    "απλός": { en: "Simple", el: "Απλός" },
    special: { en: "Special", el: "Σπέσιαλ" },
    premium: { en: "Premium", el: "Premium" },
  };
  const label = labels[normalized];
  if (!label) return subcategory;
  return preferGreek ? label.el : label.en;
};

const buildMenuState = (
  payload: Partial<MenuStateData> & {
    categories?: Array<{
      id?: string;
      title?: string;
      titleEn?: string;
      titleEl?: string;
      imageUrl?: string | null;
    }>;
    items?: MenuItem[];
  } = {},
  preferGreek: boolean
): MenuStateData => {
  const rawCategories = payload?.categories ?? [];
  const categories = mapCategories(
    rawCategories.map((cat) => ({
        ...cat,
        title: resolveLocalizedMenuText(preferGreek, {
          en: cat.titleEn,
          el: cat.titleEl,
          localized: cat.title,
        }),
      }))
  );
  const categoryTitleById = new Map(
    categories.map((category) => [category.id, category.title])
  );
  const rawCategoryById = new Map(rawCategories.map((category) => [category.id, category]));

  const localizedModifiers = (mods?: Modifier[]) =>
    (mods ?? [])
      .filter((m) => m.isAvailable !== false)
      .map((m) => ({
        ...m,
        name: resolveLocalizedMenuText(preferGreek, {
          en: m.titleEn,
          el: m.titleEl,
          localized: m.title,
          legacy: m.name,
        }),
        options: (m.options ?? []).map((opt) => ({
          ...opt,
          label: resolveLocalizedMenuText(preferGreek, {
            en: opt.titleEn,
            el: opt.titleEl,
            localized: opt.title,
            legacy: opt.label,
          }),
        })),
      }));

  return {
    categories,
    items: (payload?.items ?? []).map((item) => {
      const rawCategory = item.categoryId ? rawCategoryById.get(item.categoryId) : undefined;
      const name = resolveLocalizedMenuText(preferGreek, {
        en: item.titleEn ?? item.name,
        el: item.titleEl,
        localized: item.title,
        legacy: item.name,
      });
      const subcategory = resolveLocalizedMenuText(preferGreek, {
        en: item.subcategoryEn,
        el: item.subcategoryEl,
        localized: item.subcategory,
      });
      const description = resolveLocalizedMenuText(preferGreek, {
        en: item.descriptionEn,
        el: item.descriptionEl,
        localized: item.description,
      });
      const imageUrl = item.imageUrl ?? item.image ?? "";
      const categoryTitle =
        categoryTitleById.get(item.categoryId || "") ?? item.category;
      const presentation = getItemPresentation({
        name,
        description,
        category: categoryTitle,
      });
      const displaySubcategory = /shisha/i.test(categoryTitle)
        ? getLocalizedShishaSubcategory(subcategory, preferGreek)
        : subcategory;
      return {
        ...item,
        categoryId: item.categoryId,
        category: categoryTitle,
        name,
        subcategory: displaySubcategory || null,
        displayName: presentation.displayName,
        displayDescription: presentation.displayDescription,
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

const isWaiterCallMessage = (
  payload: unknown
): payload is { tableId: string; action?: string } =>
  isRecord(payload) && typeof payload.tableId === "string";

const isOrderEventMessage = (
  payload: unknown
): payload is { orderId: string; tableId?: string } =>
  isRecord(payload) && typeof payload.orderId === "string";

const mapOrderItemModifiers = (
  orderItem?: SubmittedOrderItem,
  menuItem?: MenuItem
) => {
  const selections: Record<string, string | string[]> = {};
  if (!orderItem?.modifiers || !Array.isArray(orderItem.modifiers))
    return selections;
  for (const mod of orderItem.modifiers) {
    const modId =
      mod?.modifierId ??
      (isRecord((mod as any)?.modifier) ? (mod as any).modifier.id : undefined);
    const rawOptionIds = Array.isArray((mod as any)?.optionIds)
      ? (mod as any).optionIds
      : mod?.modifierOptionId
      ? [mod.modifierOptionId]
      : isRecord((mod as any)?.modifierOption) &&
        typeof (mod as any).modifierOption.id === "string"
      ? [(mod as any).modifierOption.id]
      : [];
    if (!modId || rawOptionIds.length === 0) continue;
    // Ensure the option still exists on the menu item before pre-filling
    const matchingMod = menuItem?.modifiers?.find((m) => m.id === modId);
    const optionIds = rawOptionIds
      .map((value) => String(value))
      .filter((optId) => matchingMod?.options.some((o) => o.id === optId));
    if (matchingMod && optionIds.length > 0) {
      const current = selections[modId];
      for (const optId of optionIds) {
        if (!current) {
          selections[modId] =
            optionIds.length === 1 ? optId : [...new Set(optionIds)];
          break;
        }
        selections[modId] = Array.isArray(current)
          ? [...new Set([...current, optId])]
          : [...new Set([current, optId])];
      }
    }
  }
  return selections;
};

const getCartItemKey = (cartItem: Pick<CartItem, "item" | "selectedModifiers">) =>
  `${cartItem.item.id}|${JSON.stringify(cartItem.selectedModifiers || {})}`;

const mapSubmittedOrderItemToCartItem = (
  orderItem: SubmittedOrderItem,
  menuItems: MenuItem[]
): CartItem | null => {
  const itemId = getSubmittedOrderItemId(orderItem);
  if (!itemId || isSubmittedOrderItemCancelled(orderItem)) return null;
  const menuItem = menuItems.find((mi) => mi.id === itemId);
  if (!menuItem) return null;
  return {
    item: menuItem,
    quantity: getSubmittedOrderItemQuantity(orderItem),
    selectedModifiers: mapOrderItemModifiers(orderItem, menuItem),
  };
};

const mapOrderToCartItems = (
  order: SubmittedOrderSummary,
  menuItems: MenuItem[]
): CartItem[] => {
  if (!order.items?.length) return [];
  const mapped: CartItem[] = [];
  for (const oi of order.items) {
    const cartItem = mapSubmittedOrderItemToCartItem(oi, menuItems);
    if (cartItem) mapped.push(cartItem);
  }
  return mapped;
};

const mergeCartItems = (items: CartItem[]): CartItem[] => {
  const merged = new Map<string, CartItem>();
  for (const cartItem of items) {
    const key = getCartItemKey(cartItem);
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += cartItem.quantity;
    } else {
      merged.set(key, { ...cartItem });
    }
  }
  return Array.from(merged.values());
};

const getSubmittedOrderItemId = (item?: SubmittedOrderItem | null) =>
  item?.itemId || item?.item?.id || "";

const getSubmittedOrderItemName = (
  item: SubmittedOrderItem,
  index: number,
  fallback: string
) => item.title ?? item.name ?? item.item?.displayName ?? item.item?.name ?? fallback.replace("{{index}}", String(index + 1));

const getSubmittedOrderItemQuantity = (item?: SubmittedOrderItem | null) =>
  Math.max(1, Number(item?.quantity ?? item?.qty ?? 1));

const getSubmittedOrderItemUnitPriceCents = (
  item?: SubmittedOrderItem | null
) => {
  if (typeof item?.unitPriceCents === "number") return item.unitPriceCents;
  if (typeof item?.unitPrice === "number") return Math.round(item.unitPrice * 100);
  return null;
};

const isSubmittedOrderItemCancelled = (
  item?: SubmittedOrderItem | null
) => String(item?.status ?? "").toUpperCase() === "CANCELLED";

const computeSubmittedOrderTotal = (order: SubmittedOrderSummary | null) => {
  if (!order) return 0;
  if (order.status === "CANCELLED") return 0;
  if (order.items?.length) {
    const pricedItems = order.items
      .filter((item) => !isSubmittedOrderItemCancelled(item))
      .map((item) => {
        const unitPriceCents = getSubmittedOrderItemUnitPriceCents(item);
        if (unitPriceCents === null) return null;
        return unitPriceCents * getSubmittedOrderItemQuantity(item);
      });
    if (pricedItems.every((total): total is number => total !== null)) {
      return pricedItems.reduce((sum, total) => sum + total, 0) / 100;
    }
  }
  if (typeof order.total === "number") return order.total;
  if (typeof order.totalCents === "number") return order.totalCents / 100;
  return 0;
};

const getSubmittedOrderItemModifierLabels = (item?: SubmittedOrderItem | null) =>
  (item?.modifiers ?? [])
    .map((modifier) => modifier?.title?.trim())
    .filter((label): label is string => Boolean(label));

const getSubmittedOrderItemDisplayStatus = (
  item: SubmittedOrderItem | null | undefined,
  orderStatus: OrderStatus
): OrderStatus => {
  if (
    orderStatus === "CANCELLED" ||
    orderStatus === "PAID" ||
    orderStatus === "SERVED" ||
    orderStatus === "READY"
  ) {
    return orderStatus;
  }
  if (item?.status === "SERVED") return "READY";
  if (item?.status === "ACCEPTED" || orderStatus === "PREPARING") {
    return "PREPARING";
  }
  return "PLACED";
};

const itemStatusToneByStatus: Record<OrderStatus, string> = {
  PLACED: "border-slate-500/25 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  PREPARING:
    "border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300",
  READY:
    "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  SERVED: "border-sky-500/30 bg-sky-500/12 text-sky-700 dark:text-sky-300",
  PAID: "border-blue-500/30 bg-blue-500/12 text-blue-700 dark:text-blue-300",
  CANCELLED:
    "border-rose-500/30 bg-rose-500/12 text-rose-700 dark:text-rose-300",
};

const statusToneByStatus: Record<
  OrderStatus,
  {
    bar: string;
    badge: string;
    dot: string;
    chip: string;
    text: string;
  }
> = {
  PLACED: {
    bar: "from-violet-600 to-fuchsia-600 text-white border-violet-300/40",
    badge: "bg-white/18 text-white border-white/25",
    dot: "bg-white",
    chip: "border-violet-400/50 bg-violet-500/12 text-violet-100",
    text: "text-violet-100",
  },
  PREPARING: {
    bar: "from-amber-500 to-orange-600 text-white border-amber-200/40",
    badge: "bg-white/18 text-white border-white/25",
    dot: "bg-white",
    chip: "border-amber-400/50 bg-amber-500/12 text-amber-100",
    text: "text-amber-100",
  },
  READY: {
    bar: "from-emerald-500 to-teal-600 text-white border-emerald-200/40",
    badge: "bg-white/18 text-white border-white/25",
    dot: "bg-white",
    chip: "border-emerald-400/50 bg-emerald-500/12 text-emerald-100",
    text: "text-emerald-100",
  },
  SERVED: {
    bar: "from-sky-500 to-blue-600 text-white border-sky-200/40",
    badge: "bg-white/18 text-white border-white/25",
    dot: "bg-white",
    chip: "border-sky-400/50 bg-sky-500/12 text-sky-100",
    text: "text-sky-100",
  },
  PAID: {
    bar: "from-slate-600 to-emerald-700 text-white border-emerald-200/30",
    badge: "bg-white/18 text-white border-white/25",
    dot: "bg-white",
    chip: "border-emerald-400/50 bg-emerald-500/12 text-emerald-100",
    text: "text-emerald-100",
  },
  CANCELLED: {
    bar: "from-rose-600 to-red-700 text-white border-rose-200/40",
    badge: "bg-white/18 text-white border-white/25",
    dot: "bg-white",
    chip: "border-rose-400/50 bg-rose-500/12 text-rose-100",
    text: "text-rose-100",
  },
};

const getStatusTone = (status?: OrderStatus) =>
  statusToneByStatus[status ?? "PLACED"] ?? statusToneByStatus.PLACED;

const ACTIVE_ORDER_MINIMIZE_DISTANCE_PX = 86;
const ACTIVE_ORDER_MINIMIZE_VELOCITY_PX = 650;
const ACTIVE_ORDER_MINIMIZE_ANIMATION_MS = 180;
const CANCELLED_ORDER_VISIBLE_MS = 4500;

const getStoredName = () => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem("STORE_NAME");
    return stored && stored.trim() ? stored.trim() : null;
  } catch {
    return null;
  }
};

const readDismissedOrderIds = (storageKey: string | null) => {
  if (typeof window === "undefined" || !storageKey) return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : []
    );
  } catch {
    return new Set<string>();
  }
};

const writeDismissedOrderIds = (storageKey: string | null, ids: Set<string>) => {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(ids)));
  } catch (error) {
    console.warn("Failed to persist dismissed order notices", error);
  }
};

const clearStoredLastOrder = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("table:last-order");
  } catch {}
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
  const showActiveOrders = false;
  const location = useLocation();
  const navigate = useNavigate();
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
  const [activeOrderOpen, setActiveOrderOpen] = useState(false);
  const [activeOrderSheetMinimizing, setActiveOrderSheetMinimizing] =
    useState(false);
  const activeOrderDragControls = useDragControls();
  const activeOrderMinimizeTimerRef = useRef<number | null>(null);
  const [activeLineEditor, setActiveLineEditor] = useState<{
    orderId: string;
    cartIndex: number;
  } | null>(null);
  const [cartOpenSignal, setCartOpenSignal] = useState(0);
  const [orderPlacedSignal, setOrderPlacedSignal] = useState(0);
  const [editingNote, setEditingNote] = useState<string | undefined>(undefined);
  const [calling, setCalling] = useState<"idle" | "pending" | "accepted">(
    "idle"
  );
  const [callPrompted, setCallPrompted] = useState(false);
  const [lastOrderButtonVisible, setLastOrderButtonVisible] = useState(
    () => {
      if (typeof window === "undefined") return false;
      return new URLSearchParams(window.location.search).get("highlightLastOrder") === "1";
    }
  );
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingOrderIds, setEditingOrderIds] = useState<string[]>([]);
  const [lastOrder, setLastOrder] = useState<SubmittedOrderSummary | null>(null);
  const [placedOrders, setPlacedOrders] = useState<SubmittedOrderSummary[]>([]);
  const [dismissedOrderIds, setDismissedOrderIds] = useState<Set<string>>(
    () => new Set()
  );
  const [placedLoading, setPlacedLoading] = useState(false);
  const [placedError, setPlacedError] = useState<string | null>(null);
  const [activeOrdersOpen, setActiveOrdersOpen] = useState(false);
  const [tableLabel, setTableLabel] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const tableLookupCode = tableParam || tableId || null;
  const activeTableId = tableId;
  const guestOrderingEnabled = orderingMode !== "waiter";
  const usesImmediateGuestCheckout = storeSlug?.trim().toLowerCase() === "noor";
  const isEditingExisting = editingOrderIds.length > 0 || Boolean(editingOrderId);
  const isEditingPendingBatch = editingOrderIds.length > 1;
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
  const themedWrapper = clsx(themeClass, { dark: dashboardDark });
  const dismissedOrderStorageKey = activeTableId
    ? `menu:dismissed-orders:${storeSlug || "store"}:${activeTableId}`
    : null;
  const isOrderDismissed = (order?: SubmittedOrderSummary | null) =>
    Boolean(order?.id && dismissedOrderIds.has(order.id));
  const visiblePlacedOrders = placedOrders.filter(
    (order) => !isOrderDismissed(order)
  );
  const latestVisibleOrder = !isOrderDismissed(lastOrder)
    ? lastOrder ?? visiblePlacedOrders[0] ?? null
    : visiblePlacedOrders[0] ?? null;
  const shouldShowLastOrderButton =
    lastOrderButtonVisible &&
    !categorySelected &&
    !activeOrderOpen &&
    Boolean(latestVisibleOrder);
  const activeOrder =
    activeOrderOpen || shouldShowLastOrderButton ? latestVisibleOrder : null;
  const activeOrderStatus = activeOrder?.status ?? "PLACED";
  const activeOrderTone = getStatusTone(activeOrderStatus);
  const hasActiveOrderBar = shouldShowLastOrderButton;
  const hasExpandedActiveOrderBar = false;
  const activeLineCartItem =
    activeLineEditor !== null ? cartItems[activeLineEditor.cartIndex] : null;
  const activeOrderPlacedTime = new Date(
    activeOrder?.createdAt || Date.now()
  ).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const activeOrderSourceOrders = activeOrder
    ? visiblePlacedOrders.length > 0
      ? visiblePlacedOrders
      : [activeOrder]
    : [];
  const editablePendingOrders = activeOrderSourceOrders.filter(
    (order) => order.id && order.status === "PLACED"
  );
  const activeOrderGroups = activeOrderSourceOrders
    .map((order, orderIndex) => ({
      order,
      orderIndex,
      lines: (order.items ?? []).map((item, itemIndex) => ({
        item,
        itemIndex,
        order,
        orderIndex,
      })),
    }))
    .filter((group) => group.lines.length > 0);
  const activeOrderLineItems = activeOrderGroups.flatMap(
    (group) => group.lines
  );
  const activeOrderTotal = activeOrderSourceOrders.reduce(
    (sum, order) => sum + computeSubmittedOrderTotal(order),
    0
  );
  const activeOrderItemCountLabel = t("menu.item_count", {
    count: activeOrderLineItems.length,
    defaultValue:
      activeOrderLineItems.length === 1
        ? `${activeOrderLineItems.length} item`
        : `${activeOrderLineItems.length} items`,
  });
  const activeOrderItemSummary =
    activeOrderLineItems.length > 0
      ? (() => {
          const visibleItems = activeOrderLineItems.slice(0, 2).map((line) => {
            const fallback = t("menu.last_order_item_fallback", {
              index: line.itemIndex + 1,
              defaultValue: `Item ${line.itemIndex + 1}`,
            });
            return `${getSubmittedOrderItemQuantity(line.item)}x ${getSubmittedOrderItemName(
              line.item,
              line.itemIndex,
              fallback
            )}`;
          });
          const remaining = activeOrderLineItems.length - visibleItems.length;
          return remaining > 0
            ? `${visibleItems.join(", ")} ${t("menu.more_items", {
                count: remaining,
                defaultValue: `+${remaining} more`,
              })}`
            : visibleItems.join(", ");
        })()
      : t("menu.no_items", { defaultValue: "No items" });

  const minimizeActiveOrderSheet = () => {
    if (!categorySelected && activeOrder?.id) {
      setLastOrderButtonVisible(true);
    }

    if (typeof window === "undefined") {
      setActiveOrderOpen(false);
      return;
    }

    if (activeOrderMinimizeTimerRef.current !== null) {
      window.clearTimeout(activeOrderMinimizeTimerRef.current);
    }

    setActiveOrderSheetMinimizing(true);
    activeOrderMinimizeTimerRef.current = window.setTimeout(() => {
      setActiveOrderOpen(false);
      setActiveOrderSheetMinimizing(false);
      activeOrderMinimizeTimerRef.current = null;
    }, ACTIVE_ORDER_MINIMIZE_ANIMATION_MS);
  };

  const handleActiveOrderSheetPointerDown = (
    event: ReactPointerEvent<HTMLElement>
  ) => {
    if (activeOrderSheetMinimizing || event.button !== 0) return;
    if (
      typeof window !== "undefined" &&
      !window.matchMedia("(max-width: 1279px)").matches
    ) {
      return;
    }

    activeOrderDragControls.start(event);
  };

  const handleActiveOrderSheetDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    const draggedDown = info.offset.y >= ACTIVE_ORDER_MINIMIZE_DISTANCE_PX;
    const flungDown = info.velocity.y >= ACTIVE_ORDER_MINIMIZE_VELOCITY_PX;
    if (draggedDown || flungDown) {
      minimizeActiveOrderSheet();
    }
  };

  const handleActiveOrderOpenChange = (open: boolean) => {
    if (!open) {
      closeActiveOrderNotice(activeOrder);
      return;
    }
    setActiveOrderOpen(open);
  };

  const clearLastOrderUrlFlag = () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(location.search);
    if (!params.has("highlightLastOrder")) return;
    params.delete("highlightLastOrder");
    const search = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : "",
      },
      { replace: true }
    );
  };

  const hideLastOrderButton = () => {
    setLastOrderButtonVisible(false);
    clearLastOrderUrlFlag();
  };

  const markOrderNoticeDismissed = useCallback(
    (orderId: string) => {
      setDismissedOrderIds((prev) => {
        if (prev.has(orderId)) return prev;
        const next = new Set(prev);
        next.add(orderId);
        writeDismissedOrderIds(dismissedOrderStorageKey, next);
        return next;
      });
      setPlacedOrders((prev) => prev.filter((entry) => entry.id !== orderId));
      setLastOrder((prev) => (prev?.id === orderId ? null : prev));
    },
    [dismissedOrderStorageKey]
  );

  const dismissCancelledOrderAfterDisplay = useCallback(
    (orderId: string) => {
      markOrderNoticeDismissed(orderId);
      const hasRemainingVisibleOrder = placedOrdersRef.current.some(
        (order) => order.id !== orderId && !dismissedOrderIds.has(order.id)
      );
      if (!hasRemainingVisibleOrder) {
        hideLastOrderButton();
      }
      if (lastOrderRef.current?.id === orderId) {
        setActiveOrderOpen(false);
        setActiveOrderSheetMinimizing(false);
      }
    },
    [dismissedOrderIds, markOrderNoticeDismissed]
  );

  const dismissOrderNotice = (order: SubmittedOrderSummary | null) => {
    if (!order?.id) {
      hideLastOrderButton();
      setActiveOrderOpen(false);
      return;
    }
    const orderId = order.id;
    markOrderNoticeDismissed(orderId);
    if (editingOrderId === orderId || editingOrderIds.includes(orderId)) {
      clearCart();
      stopEditingLastOrder();
    }
    hideLastOrderButton();
    setActiveOrderOpen(false);
    setActiveOrderSheetMinimizing(false);
  };

  const closeActiveOrderNotice = (order: SubmittedOrderSummary | null) => {
    if (order?.status === "CANCELLED") {
      dismissOrderNotice(order);
      return;
    }
    if (!categorySelected && order?.id) {
      setLastOrderButtonVisible(true);
    }
    setActiveOrderOpen(false);
    setActiveOrderSheetMinimizing(false);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const visibleCancelledOrderIds = new Set(
      visiblePlacedOrders
        .filter((order) => order.id && order.status === "CANCELLED")
        .map((order) => order.id)
    );

    cancelledOrderDismissTimersRef.current.forEach((timer, orderId) => {
      if (visibleCancelledOrderIds.has(orderId)) return;
      window.clearTimeout(timer);
      cancelledOrderDismissTimersRef.current.delete(orderId);
    });

    visibleCancelledOrderIds.forEach((orderId) => {
      if (cancelledOrderDismissTimersRef.current.has(orderId)) return;
      const timer = window.setTimeout(() => {
        cancelledOrderDismissTimersRef.current.delete(orderId);
        dismissCancelledOrderAfterDisplay(orderId);
      }, CANCELLED_ORDER_VISIBLE_MS);
      cancelledOrderDismissTimersRef.current.set(orderId, timer);
    });
  }, [dismissCancelledOrderAfterDisplay, visiblePlacedOrders]);

  const handleViewLastOrder = () => {
    if (!latestVisibleOrder) return;
    hideLastOrderButton();
    setLastOrder(latestVisibleOrder);
    setActiveOrderOpen(true);
  };

  const showMenuLanding = () => {
    setCategorySelected(false);
    setSelectedCategory(null);
    setActiveOrderOpen(false);
    if (visiblePlacedOrders.length > 0) {
      setLastOrderButtonVisible(true);
    }
  };

  const pushCategoryHistoryEntry = () => {
    if (typeof window === "undefined" || categoryHistoryEntryRef.current) {
      return;
    }
    window.history.pushState(
      { ...(window.history.state ?? {}), garsoneMenuCategory: true },
      "",
      window.location.href
    );
    categoryHistoryEntryRef.current = true;
  };

  const returnToMenuLanding = () => {
    if (typeof window !== "undefined" && categoryHistoryEntryRef.current) {
      window.history.back();
      return;
    }
    showMenuLanding();
  };

  const startFreshOrderFromCategory = (catId: string) => {
    hideLastOrderButton();
    setActiveOrderOpen(false);
    setLastOrder(null);
    clearStoredLastOrder();
    if (editingOrderId) {
      clearCart();
      stopEditingLastOrder();
    }
    pushCategoryHistoryEntry();
    setSelectedCategory(catId);
    setCategorySelected(true);
  };

  const setMenuCache = useMenuStore((s) => s.setMenu);
  const clearMenuCache = useMenuStore((s) => s.clear);
  const menuPerfStartRef = useRef(
    typeof performance !== "undefined" ? performance.now() : 0
  );
  const paintMarkRef = useRef(false);
  const dataMarkRef = useRef(false);
  const cartChangeRef = useRef(false);
  const lastOrderRef = useRef<SubmittedOrderSummary | null>(null);
  const placedOrdersRef = useRef<SubmittedOrderSummary[]>([]);
  const categorySelectedRef = useRef(false);
  const categoryHistoryEntryRef = useRef(false);
  const notifiedOrderStatusRef = useRef<Map<string, OrderStatus>>(new Map());
  const cancelledOrderDismissTimersRef = useRef<Map<string, number>>(new Map());
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [localityGateOpen, setLocalityGateOpen] = useState(false);
  const localityGatePromiseRef = useRef<Promise<LocalityApproval | null> | null>(
    null
  );
  const localityGateResolveRef = useRef<((approval: LocalityApproval | null) => void) | null>(null);
  const [localitySessionId] = useState(() => getLocalitySessionId());
  const deviceContext = getDeviceContext();
  const bootstrapQueryEnabled =
    Boolean(tableLookupCode) && !isFallbackSlug(storeSlug);
  const {
    data: bootstrap,
    isLoading: bootstrapLoading,
    isFetching: bootstrapFetching,
    error: bootstrapError,
  } = useQuery({
    queryKey: ["menu-bootstrap", storeSlug || null, tableLookupCode, languageCode],
    queryFn: async () => {
      if (!tableLookupCode) {
        throw new Error("Missing table identifier");
      }
      return api.getMenuBootstrap(tableLookupCode, {
        storeSlug: storeSlug || undefined,
        lang: languageCode,
      });
    },
    enabled: bootstrapQueryEnabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  const { data: storeMeta } = useQuery({
    queryKey: ["store-meta", storeSlug || null],
    queryFn: async () => api.getStore(),
    enabled: Boolean(storeSlug || tableLookupCode),
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
    const shouldShowLastOrder =
      new URLSearchParams(location.search).get("highlightLastOrder") === "1";
    setLastOrderButtonVisible(shouldShowLastOrder);
  }, [location.search]);

  useEffect(() => {
    setDismissedOrderIds(readDismissedOrderIds(dismissedOrderStorageKey));
  }, [dismissedOrderStorageKey]);

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
      setTableId(bootstrap.table.id);
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
        console.log(
          "[perf] menu:data-ready",
          `${(performance.now() - menuPerfStartRef.current).toFixed(1)}ms`
        );
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
    if (isFallbackSlug(storeSlug) && tableLookupCode) {
      (async () => {
        try {
          const res = await fetch(
            `${API_BASE.replace(/\/$/, "")}/public/table/${encodeURIComponent(
              tableLookupCode
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
  }, [storeSlug, tableLookupCode, clearMenuCache]);

  useEffect(() => {
    if (lastOrder?.tableLabel) {
      setTableLabel(lastOrder.tableLabel);
    }
  }, [lastOrder]);

  useEffect(() => {
    lastOrderRef.current = lastOrder;
  }, [lastOrder]);

  useEffect(() => {
    placedOrdersRef.current = placedOrders;
  }, [placedOrders]);

  useEffect(() => {
    categorySelectedRef.current = categorySelected;
  }, [categorySelected]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleMenuBack = () => {
      if (!categorySelectedRef.current) {
        categoryHistoryEntryRef.current = false;
        return;
      }
      categoryHistoryEntryRef.current = false;
      showMenuLanding();
    };

    const handleBackspace = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" || !categorySelectedRef.current) return;
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isTyping =
        Boolean(target?.isContentEditable) ||
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select";
      if (isTyping) return;
      event.preventDefault();
      returnToMenuLanding();
    };

    window.addEventListener("popstate", handleMenuBack);
    window.addEventListener("keydown", handleBackspace);
    return () => {
      window.removeEventListener("popstate", handleMenuBack);
      window.removeEventListener("keydown", handleBackspace);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (activeOrderMinimizeTimerRef.current !== null) {
        window.clearTimeout(activeOrderMinimizeTimerRef.current);
      }
      cancelledOrderDismissTimersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
      cancelledOrderDismissTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      cancelledOrderDismissTimersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
      cancelledOrderDismissTimersRef.current.clear();
    };
  }, [dismissedOrderStorageKey]);

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
          unpaid: true,
          take: 10,
        });
        if (cancelled) return;
        const dismissedIds = readDismissedOrderIds(dismissedOrderStorageKey);
        const summaries = (res?.orders ?? [])
          .map(toOrderSummary)
          .filter((order) => order.status !== "PAID")
          .filter((order) => !order.id || !dismissedIds.has(order.id));
        setPlacedOrders(summaries);
        if (summaries.length === 0) {
          setLastOrder(null);
          setLastOrderButtonVisible(false);
          setActiveOrderOpen(false);
        } else if (!categorySelectedRef.current) {
          setLastOrderButtonVisible(true);
        }
        if ((lastOrderButtonVisible || activeOrderOpen) && summaries[0]) {
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
  }, [activeTableId, activeOrderOpen, dismissedOrderStorageKey, lastOrderButtonVisible, storeSlug]);

  const computeOrderTotal = (order: SubmittedOrderSummary | null) => {
    return computeSubmittedOrderTotal(order);
  };

  const toOrderSummary = (order: any): SubmittedOrderSummary => {
    const items = Array.isArray(order?.items)
      ? order.items.map((item: any) => ({
          id: item.id,
          itemId: item.itemId ?? item.item?.id,
          title: item.title ?? item.titleSnapshot ?? item.name,
          quantity: item.quantity ?? item.qty,
          modifiers: item.modifiers ?? item.orderItemOptions ?? [],
          status: item.status,
          unitPrice: item.unitPrice,
          unitPriceCents: item.unitPriceCents,
          acceptedAt: item.acceptedAt,
          servedAt: item.servedAt,
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
    if (order.status === "PAID") return;
    if (isOrderDismissed(order)) return;
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
    setEditingOrderIds([]);
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
    setEditingOrderIds([lastOrder.id]);
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
    if (typeof performance === "undefined" || paintMarkRef.current) return;
    try {
      menuPerfStartRef.current = performance.now();
    } catch {}
    const raf = requestAnimationFrame(() => {
      if (paintMarkRef.current) return;
      paintMarkRef.current = true;
      try {
        console.log(
          "[perf] menu:first-paint",
          `${(performance.now() - menuPerfStartRef.current).toFixed(1)}ms`
        );
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
    selected: Record<string, string | string[]>,
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

  const prepareOrderForEditing = (order: SubmittedOrderSummary | null) => {
    if (!order || !order.id) return null;
    if (order.status && order.status !== "PLACED") {
      toast({
        title: t("menu.toast_edit_unavailable_title", {
          defaultValue: "Order cannot be edited",
        }),
        description: t("menu.toast_edit_unavailable_desc", {
          defaultValue: "The kitchen has already started preparing your order.",
        }),
      });
      return null;
    }
    if (!menuData) {
      toast({
        title: t("menu.toast_error_title", { defaultValue: "Error" }),
        description: t("menu.toast_error_description", {
          defaultValue: "Menu data is not loaded yet. Please try again.",
        }),
      });
      return null;
    }

    const mappedItems = mapOrderToCartItems(order, menuData.items);

    if (!mappedItems.length) {
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
      return null;
    }

    setItems(mergeCartItems(mappedItems));
    setLastOrder(order);
    setEditingOrderId(order.id || null);
    setEditingOrderIds(order.id ? [order.id] : []);
    setEditingNote(order.note ?? "");
    setSelectedCategory(selectedCategory || (usesImmediateGuestCheckout ? categories[0]?.id : "all") || "all");
    setCategorySelected(true);
    return mappedItems;
  };

  const preparePendingOrdersForEditing = (
    orders: SubmittedOrderSummary[],
    options?: { openCart?: boolean }
  ) => {
    const editableOrders = orders
      .filter((order) => order.id && order.status === "PLACED")
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return aTime - bTime;
      });

    if (!editableOrders.length) {
      toast({
        title: t("menu.edit_order_locked_title", {
          defaultValue: "Kitchen already accepted",
        }),
        description: t("menu.edit_order_locked_desc", {
          defaultValue: "Edits are disabled once the kitchen starts preparing.",
        }),
      });
      stopEditingLastOrder();
      return null;
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
      return null;
    }

    const rawMappedItems = editableOrders.flatMap((order) =>
      mapOrderToCartItems(order, menuData.items)
    );
    const mappedItems = mergeCartItems(rawMappedItems);
    if (!mappedItems.length) {
      toast({
        title: t("menu.toast_edit_unavailable_title", {
          defaultValue: "Order cannot be edited",
        }),
        description: t("menu.toast_edit_items_missing_desc", {
          defaultValue:
            "We could not load your previous items. Please create a new order.",
        }),
      });
      stopEditingLastOrder();
      return null;
    }

    const sourceItemCount = editableOrders.reduce(
      (count, order) =>
        count +
        (order.items ?? []).filter((item) => !isSubmittedOrderItemCancelled(item))
          .length,
      0
    );
    const missingCount = Math.max(0, sourceItemCount - rawMappedItems.length);
    const orderIds = editableOrders
      .map((order) => order.id)
      .filter((id): id is string => Boolean(id));

    setItems(mappedItems);
    setLastOrder(editableOrders[0]);
    setEditingOrderId(orderIds[0] ?? null);
    setEditingOrderIds(orderIds);
    setEditingNote(editableOrders.find((order) => order.note)?.note ?? "");
    setSelectedCategory(
      selectedCategory ||
        (usesImmediateGuestCheckout ? categories[0]?.id : "all") ||
        "all"
    );
    setCategorySelected(true);
    setActiveOrderOpen(false);
    hideLastOrderButton();
    if (options?.openCart !== false) {
      setCartOpenSignal((s) => s + 1);
    }

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

    return { mappedItems, editableOrders };
  };

  const loadOrderIntoCart = (order: SubmittedOrderSummary | null) => {
    const mappedItems = prepareOrderForEditing(order);
    if (!mappedItems) return;
    setCartOpenSignal((s) => s + 1);
  };

  const handleActiveOrderItemClick = (
    order: SubmittedOrderSummary | null,
    orderItem: SubmittedOrderItem
  ) => {
    if (!order?.id) return;
    if (order.status !== "PLACED") return;
    if (!menuData?.items?.length) return;
    const pendingOrders = editablePendingOrders.length
      ? editablePendingOrders
      : [order];
    const prepared = preparePendingOrdersForEditing(pendingOrders, {
      openCart: false,
    });
    if (!prepared) return;
    const targetCartItem = mapSubmittedOrderItemToCartItem(
      orderItem,
      menuData.items
    );
    if (!targetCartItem) {
      setCartOpenSignal((s) => s + 1);
      return;
    }
    const targetKey = getCartItemKey(targetCartItem);
    const cartIndex = prepared.mappedItems.findIndex(
      (cartItem) => getCartItemKey(cartItem) === targetKey
    );
    if (cartIndex < 0) {
      setCartOpenSignal((s) => s + 1);
      return;
    }
    setActiveOrderOpen(false);
    setActiveLineEditor({
      orderId: prepared.editableOrders[0]?.id ?? order.id,
      cartIndex,
    });
  };

  const handleConfirmActiveLineEdit = (
    selected: Record<string, string | string[]>,
    qty: number
  ) => {
    if (!activeLineEditor) return;
    const currentItems = useCartStore.getState().items;
    const current = currentItems[activeLineEditor.cartIndex];
    if (!current) {
      setActiveLineEditor(null);
      return;
    }
    const nextItems = currentItems.map((cartItem, index) =>
      index === activeLineEditor.cartIndex
        ? {
            ...cartItem,
            quantity: Math.max(1, qty || 1),
            selectedModifiers: selected,
          }
        : cartItem
    );
    setItems(mergeCartItems(nextItems));
    setActiveLineEditor(null);
    setCartOpenSignal((s) => s + 1);
    toast({
      title: t("menu.item_updated_title", { defaultValue: "Item updated" }),
      description: t("menu.review_updated_order", {
        defaultValue: "Review your order and submit the update.",
      }),
    });
  };

  const handleOrdersAcceptedDuringEdit = (orderIds: string[]) => {
    const orderIdSet = new Set(orderIds.filter(Boolean));
    setLastOrder((prev) =>
      prev && prev.id && orderIdSet.has(prev.id)
        ? { ...prev, status: "PREPARING" }
        : prev
    );
    setPlacedOrders((prev) =>
      prev.map((order) =>
        order.id && orderIdSet.has(order.id)
          ? { ...order, status: "PREPARING" }
          : order
      )
    );
    clearCart();
    stopEditingLastOrder();
    setCategorySelected(false);
    setSelectedCategory(null);
    setOrderPlacedSignal((s) => s + 1);
    toast({
      title: t("menu.edit_order_accepted_during_edit_title", {
        defaultValue: "Order already accepted",
      }),
      description: t("menu.edit_order_accepted_during_edit_desc", {
        defaultValue:
          "The kitchen accepted this order while you were editing. Your changes were not applied.",
      }),
    });
  };

  const handleOrderAcceptedDuringEdit = (orderId: string) => {
    handleOrdersAcceptedDuringEdit([orderId]);
  };

  const handleEditLastOrder = async () => {
    if (!lastOrder || !lastOrder.id) return;
    hideLastOrderButton();
    if (activeTableId) {
      try {
        const res = await api.getPublicTableOrders(activeTableId, {
          storeSlug: storeSlug || undefined,
          take: 10,
        });
        const freshOrder = (res?.orders ?? [])
          .map(toOrderSummary)
          .find((order) => order.id === lastOrder.id);
        if (freshOrder) {
          setLastOrder((prev) =>
            prev && prev.id === freshOrder.id
              ? { ...prev, ...freshOrder }
              : freshOrder
          );
          upsertPlacedOrder(freshOrder);
          if (freshOrder.status && freshOrder.status !== "PLACED") {
            handleOrderAcceptedDuringEdit(freshOrder.id);
            return;
          }
          loadOrderIntoCart(freshOrder);
          return;
        }
      } catch (error) {
        console.warn("Failed to refresh order before edit", error);
      }
    }
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
        description: t("menu.missing_table_description", {
          defaultValue: "Missing table information. Please rescan the QR.",
        }),
      });
      return null;
    }

    const cartItems = useCartStore.getState().items;
    if (!cartItems.length) {
      toast({
        title: t("menu.cart_empty_title", {
          defaultValue: "Cart is empty",
        }),
        description: t("menu.cart_empty_description", {
          defaultValue: "Add items to your cart before placing the order.",
        }),
      });
      return null;
    }

    const approval = usesImmediateGuestCheckout
      ? null
      : getStoredLocalityApproval({
          tableId: activeTableId,
          storeSlug: storeSlug || null,
          purpose: "ORDER_SUBMIT",
          sessionId: localitySessionId,
        }) ?? (await requestLocalityApproval());

    if (!usesImmediateGuestCheckout && !approval) {
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
      ...(approval
        ? {
            localityApprovalToken: approval.token,
            localitySessionId,
          }
        : {}),
    };

    try {
      void trackOrderEvent(
        "order_submit_attempted",
        approval?.method || "direct_submit"
      );
      setCheckoutBusy(true);
      await registerCustomerPushForOrder({
        tableId: activeTableId,
        orderId: editingOrderId || undefined,
        storeSlug: storeSlug || undefined,
        requestPermission: true,
      });
      const wasEditing = Boolean(editingOrderId);
      const response = isEditingPendingBatch
        ? await api.editPendingTableOrders(activeTableId, {
            items: payload.items,
            note: payload.note,
            localityApprovalToken: payload.localityApprovalToken,
            localitySessionId: payload.localitySessionId,
            orderIds: editingOrderIds,
          })
        : editingOrderId
        ? await api.editOrder(editingOrderId, payload)
        : await api.createOrder(payload);
      const order = (response as any)?.order;
      if (!order?.id) {
        throw new Error("Order was not created");
      }
      const summary = toOrderSummary(order);
      const supersededOrderIds = Array.isArray((response as any)?.supersededOrderIds)
        ? ((response as any).supersededOrderIds as string[])
        : [];
      if (supersededOrderIds.length > 0) {
        setDismissedOrderIds((prev) => {
          const next = new Set(prev);
          supersededOrderIds.forEach((orderId) => next.add(orderId));
          writeDismissedOrderIds(dismissedOrderStorageKey, next);
          return next;
        });
        setPlacedOrders((prev) =>
          prev.filter((entry) => !entry.id || !supersededOrderIds.includes(entry.id))
        );
      }
      setLastOrder(summary);
      upsertPlacedOrder(summary);
      void registerCustomerPushForOrder({
        tableId: activeTableId,
        orderId: summary.id || order.id,
        storeSlug: storeSlug || undefined,
        requestPermission: false,
      });
      clearCart();
      stopEditingLastOrder();
      if (approval) {
        clearStoredLocalityApproval();
      }
      void trackOrderEvent(
        "order_submit_succeeded",
        approval?.method || "direct_submit"
      );
      const successParams = new URLSearchParams({ tableId: activeTableId });
      if (storeSlug) {
        successParams.set("storeSlug", storeSlug);
      }
      if (wasEditing) {
        successParams.set("updated", "1");
      }
      navigate(`/order/${summary.id}/thanks?${successParams.toString()}`);
      return summary;
    } catch (error) {
      console.error("Immediate checkout failed:", {
        error,
        storeSlug,
        tableId: activeTableId,
        editingOrderId,
        payload,
      });
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (isEditingExisting && error instanceof ApiError && error.status === 409) {
        handleOrdersAcceptedDuringEdit(editingOrderIds.length ? editingOrderIds : editingOrderId ? [editingOrderId] : []);
        return null;
      }
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
        void trackOrderEvent("order_submit_failed", approval?.method, {
          reason: message,
        });
        return null;
      }
      void trackOrderEvent(
        "order_submit_failed",
        approval?.method || "direct_submit",
        {
        reason: message,
        }
      );
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
    if (usesImmediateGuestCheckout) {
      return handleImmediateCheckout(note);
    }
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
            const optionIds = item.selectedModifiers[modId];
            const ids = Array.isArray(optionIds) ? optionIds : [optionIds];
            const options = item.item.modifiers?.find((m) => m.id === modId)?.options ?? [];
            return modSum + ids.reduce((sum, optionId) => {
              const option = options.find((o) => o.id === optionId);
              return sum + (option?.priceDeltaCents ?? 0);
            }, 0);
          },
          0
        );
        return sum + (basePrice + modifiersPrice) * item.quantity;
      }, 0);

      const totalAmount = totalCents / 100;
      await registerCustomerPushForOrder({
        tableId: activeTableId,
        storeSlug: storeSlug || undefined,
        requestPermission: true,
      });

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

  const notifyOrderStatusChange = (
    orderId: string,
    status: OrderStatus,
    previousStatus?: OrderStatus
  ) => {
    if (!previousStatus || previousStatus === status || status === "PLACED") {
      return;
    }
    if (notifiedOrderStatusRef.current.get(orderId) === status) {
      return;
    }
    notifiedOrderStatusRef.current.set(orderId, status);

    const statusLabel = t(`status.${status}`, { defaultValue: status });
    const shortOrderId = orderId.slice(-6).toUpperCase();
    const title = t("menu.order_status_notification_title", {
      defaultValue: "Order update",
    });
    const description = t(`menu.order_status_notification_${status}`, {
      orderId: shortOrderId,
      status: statusLabel,
      defaultValue: `Order #${shortOrderId} is now ${statusLabel}.`,
    });

    toast({ title, description });

    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      window.Notification.permission === "granted" &&
      document.visibilityState !== "visible"
    ) {
      new window.Notification(title, { body: description });
    }
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
        if (payload.tableId && payload.tableId !== activeTableId) return;
        if (readDismissedOrderIds(dismissedOrderStorageKey).has(payload.orderId)) {
          return;
        }
        const previousStatus =
          lastOrderRef.current?.id === payload.orderId
            ? lastOrderRef.current.status
            : placedOrdersRef.current.find((order) => order.id === payload.orderId)
                ?.status;
        notifyOrderStatusChange(payload.orderId, status, previousStatus);
        if (status === "PAID") {
          setLastOrder((prev) =>
            prev && prev.id === payload.orderId ? null : prev
          );
          setPlacedOrders((prev) => {
            const next = prev.filter((o) => o.id !== payload.orderId);
            if (next.length === 0) {
              setLastOrderButtonVisible(false);
              setActiveOrderOpen(false);
            } else if (!categorySelectedRef.current) {
              setLastOrderButtonVisible(true);
              setLastOrder((current) => current ?? next[0]);
            }
            return next;
          });
          return;
        }
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
        if (isOrderDismissed(summary)) return;
        upsertPlacedOrder(summary);
        if (!categorySelectedRef.current) {
          setLastOrderButtonVisible(true);
        }
        if (lastOrderButtonVisible || activeOrderOpen || !categorySelectedRef.current) {
          setLastOrder((prev) =>
            prev && prev.id === summary.id ? { ...prev, ...summary } : summary
          );
        }
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
  }, [storeSlug, activeTableId, activeOrderOpen, dismissedOrderStorageKey, lastOrderButtonVisible]);

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

  const activeOrderFloatingBar = shouldShowLastOrderButton && activeOrder ? (
    <div
      className={clsx(
        themedWrapper,
        "pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]"
      )}
    >
      <div
        className={clsx(
          "pointer-events-auto flex min-h-12 w-full max-w-sm items-center gap-2 rounded-full border px-3 py-2 text-left shadow-xl bg-gradient-to-r",
          activeOrderTone.bar
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={handleViewLastOrder}
        >
          <ShoppingBag className="h-4 w-4 shrink-0 text-white/90" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">
              {t("menu.last_order_heading", {
                defaultValue: "Last order",
              })}
            </span>
            <span className={clsx("block truncate text-xs", activeOrderTone.text)}>
              {activeOrderItemSummary} - EUR {activeOrderTotal.toFixed(2)}
            </span>
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/80" />
        </button>
        {activeOrder.status === "CANCELLED" ? (
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-white/80 hover:bg-white/20 hover:text-white"
            onClick={() => dismissOrderNotice(activeOrder)}
            aria-label={t("menu.dismiss_cancelled_order", {
              defaultValue: "Dismiss canceled order",
            })}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  ) : null;
  const activeOrderFloatingPortal =
    activeOrderFloatingBar && typeof document !== "undefined"
      ? createPortal(activeOrderFloatingBar, document.body)
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
              <AppBurger title={headerTitle} showChildren={false} themeOnly>
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
                  </div>
                ) : null}
              </AppBurger>
            </div>
          </div>
        </header>

        <div
          className={clsx(
            "max-w-6xl mx-auto px-4 py-8 flex-1 w-full",
            hasExpandedActiveOrderBar
              ? categorySelected
                ? "pb-44"
                : "pb-28"
              : hasActiveOrderBar && "pb-32"
          )}
        >
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
              variant={usesImmediateGuestCheckout ? "noor" : "default"}
              onSelect={(catId) => {
                startFreshOrderFromCategory(catId);
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
            <SwipeableMenuView
              categories={categories}
              items={menuData?.items ?? []}
              selectedCategory={selectedCategory || "all"}
              onCategoryChange={(catId) => setSelectedCategory(catId)}
              onBack={returnToMenuLanding}
              onAddItem={handleAddItem}
              onCheckout={
                usesImmediateGuestCheckout || isEditingExisting
                  ? handleImmediateCheckout
                  : handleCheckout
              }
              onImmediateCheckout={
                usesImmediateGuestCheckout || isEditingExisting
                  ? undefined
                  : handleImmediateCheckout
              }
              orderPlacedSignal={orderPlacedSignal}
              checkoutBusy={checkoutBusy}
              showBackButton
              showAllCategory={!usesImmediateGuestCheckout}
              primaryCtaLabel={
                isEditingExisting
                  ? t("menu.update_order", {
                      defaultValue: "Update order",
                    })
                  : usesImmediateGuestCheckout
                  ? t("menu.submit_order_return_menu", {
                      defaultValue: "Submit and return to menu",
                    })
                  : undefined
              }
              callButtonLabel={callButtonLabel}
              callStatus={calling}
              callPrompted={callPrompted}
              onCallClick={handleFloatingCallClick}
              cartBottomOffset={hasExpandedActiveOrderBar ? "raised" : "default"}
              showCartButton={guestOrderingEnabled}
              showPaymentButton={!usesImmediateGuestCheckout && !isEditingExisting}
            />
          )}
        </div>

        <Dialog open={activeOrderOpen} onOpenChange={handleActiveOrderOpenChange}>
          <DialogContent
            hideCloseButton
            motionProps={{
              animate: activeOrderSheetMinimizing
                ? { opacity: 0.96, scale: 0.98, y: "104%" }
                : { opacity: 1, scale: 1, y: 0 },
              drag: "y",
              dragControls: activeOrderDragControls,
              dragDirectionLock: true,
              dragConstraints: { top: 0, bottom: 0 },
              dragElastic: { top: 0, bottom: 0.36 },
              dragListener: true,
              dragMomentum: false,
              dragTransition: { bounceStiffness: 420, bounceDamping: 36 },
              onDragEnd: handleActiveOrderSheetDragEnd,
              transition: activeOrderSheetMinimizing
                ? {
                    duration: ACTIVE_ORDER_MINIMIZE_ANIMATION_MS / 1000,
                    ease: [0.32, 0.72, 0, 1],
                  }
                : { type: "spring", stiffness: 350, damping: 28, mass: 0.8 },
              whileDrag: { scale: 0.995 },
            }}
            className="!left-1/2 !right-auto !bottom-2 !top-auto h-[min(86dvh,calc(100dvh-1rem))] max-h-[calc(100dvh-1rem)] !w-[calc(100vw-1rem)] !max-w-lg overflow-hidden rounded-3xl border border-border/50 p-0 shadow-2xl ![translate:-50%_0] xl:!bottom-auto xl:!top-1/2 xl:h-[82dvh] xl:max-h-[calc(100dvh-0.75rem)] xl:!w-full xl:rounded-2xl xl:![translate:-50%_-50%]"
          >
            <DialogTitle className="sr-only">
              {t("menu.active_order_heading", {
                defaultValue: "Your active order",
              })}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("menu.active_order_description", {
                defaultValue: "Order status and selected items",
              })}
            </DialogDescription>
            {activeOrder ? (
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl bg-background xl:rounded-2xl">
                <div
                  className={clsx(
                    "relative cursor-grab touch-none overflow-hidden bg-gradient-to-r px-5 pb-5 pt-4 text-white active:cursor-grabbing sm:px-6",
                    activeOrderTone.bar
                  )}
                  onPointerDown={handleActiveOrderSheetPointerDown}
                >
                  <div
                    className="flex justify-center pb-4"
                    onPointerDown={handleActiveOrderSheetPointerDown}
                    aria-hidden="true"
                  >
                    <div className="h-1.5 w-12 rounded-full bg-white/35" />
                  </div>
                  <button
                    type="button"
                    className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/14 text-white shadow-sm hover:bg-white/22"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => closeActiveOrderNotice(activeOrder)}
                    aria-label={
                      activeOrder.status === "CANCELLED"
                        ? t("menu.dismiss_cancelled_order", {
                            defaultValue: "Dismiss canceled order",
                          })
                        : t("actions.close", { defaultValue: "Close" })
                    }
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="min-w-0 pr-12">
                    <h2 className="mt-1 max-w-full whitespace-normal break-words text-2xl font-bold leading-tight sm:text-3xl">
                      {t("menu.active_order_heading", {
                        defaultValue: "Your active order",
                      })}
                    </h2>
                    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-sm text-white/86">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-4 w-4" />
                        {activeOrderPlacedTime}
                      </span>
                      <span className="break-all">
                        #{(activeOrder.id || "").slice(-6).toUpperCase()}
                      </span>
                      <span className="whitespace-nowrap">
                        {activeOrderItemCountLabel}
                      </span>
                      <span className="whitespace-nowrap">
                        EUR {activeOrderTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5">
                  {placedLoading ? (
                    <div className="mb-3 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
                      {t("status.loading", { defaultValue: "Loading..." })}
                    </div>
                  ) : null}
                  {placedError ? (
                    <div className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {placedError}
                    </div>
                  ) : null}

                  <div className="mb-3 flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-semibold text-foreground">
                      {t("menu.items_heading", {
                        defaultValue: "Items",
                      })}
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {activeOrderItemCountLabel}
                    </span>
                  </div>

                  {activeOrderLineItems.length === 0 ? (
                    <div className="rounded-2xl border border-border/60 bg-card/70 px-4 py-6 text-center text-sm text-muted-foreground">
                      {t("menu.no_items", { defaultValue: "No items" })}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeOrderGroups.map((group) => {
                        const groupStatus =
                          group.order.status ?? activeOrderStatus;
                        const groupStatusLabel = t(`status.${groupStatus}`, {
                          defaultValue: groupStatus,
                        });
                        const groupTime = new Date(
                          group.order.createdAt || Date.now()
                        ).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                        const groupOrderLabel = group.order.id
                          ? `#${group.order.id.slice(-6).toUpperCase()}`
                          : t("menu.order_group_fallback", {
                              index: group.orderIndex + 1,
                              defaultValue: `Order ${group.orderIndex + 1}`,
                            });
                        const groupItemCountLabel = t("menu.item_count", {
                          count: group.lines.length,
                          defaultValue:
                            group.lines.length === 1
                              ? `${group.lines.length} item`
                              : `${group.lines.length} items`,
                        });
                        const groupTotal = computeSubmittedOrderTotal(
                          group.order
                        );

                        return (
                          <div
                            key={group.order.id ?? `order-${group.orderIndex}`}
                            className="rounded-[1.35rem] border border-border/70 bg-background/35 p-2.5 shadow-sm"
                          >
                            {activeOrderGroups.length > 1 ? (
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                                <div className="min-w-0">
                                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <span className="text-xs font-bold text-foreground">
                                      {groupOrderLabel}
                                    </span>
                                    <span className="rounded-full border border-border/60 bg-card/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                      {groupStatusLabel}
                                    </span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                    <span>{groupTime}</span>
                                    <span>{groupItemCountLabel}</span>
                                    <span>EUR {groupTotal.toFixed(2)}</span>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                            <div className="space-y-2">
                              {group.lines.map((line) => {
                        const { item, itemIndex, order, orderIndex } = line;
                        const fallback = t("menu.last_order_item_fallback", {
                          index: itemIndex + 1,
                          defaultValue: `Item ${itemIndex + 1}`,
                        });
                        const name = getSubmittedOrderItemName(
                          item,
                          itemIndex,
                          fallback
                        );
                        const quantity = getSubmittedOrderItemQuantity(item);
                        const modifierLabels =
                          getSubmittedOrderItemModifierLabels(item);
                        const itemStatus = getSubmittedOrderItemDisplayStatus(
                          item,
                          order.status ?? activeOrderStatus
                        );
                        const canEditLine =
                          order.status === "PLACED" &&
                          itemStatus === "PLACED" &&
                          !isSubmittedOrderItemCancelled(item);
                        const itemStatusLabel = t(
                          `menu.item_status_${itemStatus.toLowerCase()}`,
                          {
                            defaultValue: t(`status.${itemStatus}`, {
                              defaultValue: itemStatus,
                            }),
                          }
                        );
                        return (
                          <div
                            role={canEditLine ? "button" : undefined}
                            tabIndex={canEditLine ? 0 : undefined}
                            key={`${order.id ?? orderIndex}-${item.id ?? item.itemId ?? itemIndex}`}
                            className={clsx(
                              "relative w-full overflow-hidden rounded-2xl border p-3 text-left transition-colors",
                              canEditLine
                                ? "cursor-pointer border-primary/70 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.28),0_16px_38px_hsl(var(--primary)/0.14)] hover:border-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                : "cursor-default border-border/60 bg-card/80"
                            )}
                            onClick={() =>
                              canEditLine
                                ? handleActiveOrderItemClick(order, item)
                                : undefined
                            }
                            onKeyDown={(event) => {
                              if (!canEditLine) return;
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              handleActiveOrderItemClick(order, item);
                            }}
                          >
                            {canEditLine ? (
                              <span
                                aria-hidden="true"
                                className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-primary shadow-[0_0_18px_hsl(var(--primary)/0.55)]"
                              />
                            ) : null}
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="flex min-w-0 flex-1 items-start gap-3">
                                <span
                                  className={clsx(
                                    "inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold",
                                    canEditLine
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-primary/10 text-primary"
                                  )}
                                >
                                  x{quantity}
                                </span>
                                <span className="min-w-0 break-words text-sm font-semibold leading-snug text-foreground sm:text-base">
                                  {name}
                                </span>
                              </div>
                              {modifierLabels.length > 0 ? (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={(event) => event.stopPropagation()}
                                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground hover:text-foreground"
                                      aria-label={t("menu.item_options", {
                                        item: name,
                                        defaultValue: `Options for ${name}`,
                                      })}
                                    >
                                      <Info className="h-4 w-4" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    side="top"
                                    align="end"
                                    className="w-64 rounded-2xl p-3"
                                  >
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                      {t("menu.options", {
                                        defaultValue: "Options",
                                      })}
                                    </p>
                                    <div className="space-y-1 text-sm text-foreground">
                                      {modifierLabels.map(
                                        (label, labelIndex) => (
                                          <div
                                            key={`${order.id ?? orderIndex}-${item.id ?? itemIndex}-${labelIndex}`}
                                            className="break-words"
                                          >
                                            {label}
                                          </div>
                                        )
                                      )}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              ) : null}
                            </div>
                            <div
                              className={clsx(
                                "mt-3 flex items-center gap-3",
                                canEditLine ? "justify-between" : "justify-end"
                              )}
                            >
                              {canEditLine ? (
                                <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold text-primary">
                                  <span className="truncate">
                                    {t("menu.tap_item_to_edit", {
                                      defaultValue: "Tap item to edit",
                                    })}
                                  </span>
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                </span>
                              ) : null}
                              <span
                                className={clsx(
                                  "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                                  canEditLine
                                    ? "border-primary/60 bg-primary/15 text-primary"
                                    : itemStatusToneByStatus[itemStatus]
                                )}
                              >
                                {itemStatusLabel}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {showActiveOrders && activeOrdersOpen && !categorySelected && (
          <div className="max-w-6xl mx-auto px-4 w-full my-6">
            <div className="rounded-[28px] border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-5 border-b border-border/60">
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    {t("menu.active_orders_title", {
                      defaultValue: "Active Orders",
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("menu.active_orders_subtitle", {
                      defaultValue: "Live status updates from the kitchen",
                    })}
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
                  {t("menu.no_active_orders", {
                    defaultValue: "No placed orders for this table right now.",
                  })}
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
                            {t("menu.status_label", {
                              defaultValue: "Status",
                            })}
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

        <Suspense fallback={null}>
          <ModifierDialog
            open={Boolean(activeLineEditor && activeLineCartItem)}
            item={activeLineCartItem?.item ?? null}
            initialQty={activeLineCartItem?.quantity ?? 1}
            initialSelected={activeLineCartItem?.selectedModifiers}
            confirmLabel={t("actions.save_changes", {
              defaultValue: "Save changes",
            })}
            onClose={() => setActiveLineEditor(null)}
            onConfirm={handleConfirmActiveLineEdit}
          />
        </Suspense>
      </div>
      {activeOrderFloatingPortal}
    </div>
  );
}

