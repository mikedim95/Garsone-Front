import {
  Suspense,
  lazy,
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
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Pencil,
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

const mergeCartItems = (items: CartItem[]): CartItem[] => {
  const merged = new Map<string, CartItem>();
  for (const cartItem of items) {
    const key = `${cartItem.item.id}|${JSON.stringify(
      cartItem.selectedModifiers || {}
    )}`;
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

const getSubmittedOrderItemModifierLabels = (item?: SubmittedOrderItem | null) =>
  (item?.modifiers ?? [])
    .map((modifier) => modifier?.title?.trim())
    .filter((label): label is string => Boolean(label));

const findMappedCartIndexForOrderItem = (
  order: SubmittedOrderSummary,
  orderItemIndex: number,
  mappedItems: CartItem[],
  menuItems: MenuItem[]
) => {
  const sourceItems = order.items ?? [];
  const sourceItem = sourceItems[orderItemIndex];
  const itemId = getSubmittedOrderItemId(sourceItem);
  if (!itemId) return -1;
  let targetOccurrence = 0;
  for (let index = 0; index <= orderItemIndex; index += 1) {
    const candidateId = getSubmittedOrderItemId(sourceItems[index]);
    if (candidateId === itemId && menuItems.some((item) => item.id === candidateId)) {
      targetOccurrence += 1;
    }
  }
  let seen = 0;
  return mappedItems.findIndex((cartItem) => {
    if (cartItem.item.id !== itemId) return false;
    seen += 1;
    return seen === targetOccurrence;
  });
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
  const [highlightLastOrderButton, setHighlightLastOrderButton] = useState(
    () => {
      if (typeof window === "undefined") return false;
      return new URLSearchParams(window.location.search).get("highlightLastOrder") === "1";
    }
  );
  const [activeOrderBarExpanded, setActiveOrderBarExpanded] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<SubmittedOrderSummary | null>(null);
  const [placedOrders, setPlacedOrders] = useState<SubmittedOrderSummary[]>([]);
  const [placedLoading, setPlacedLoading] = useState(false);
  const [placedError, setPlacedError] = useState<string | null>(null);
  const [activeOrdersOpen, setActiveOrdersOpen] = useState(false);
  const [tableLabel, setTableLabel] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const tableLookupCode = tableParam || tableId || null;
  const activeTableId = tableId;
  const guestOrderingEnabled = orderingMode !== "waiter";
  const usesImmediateGuestCheckout = storeSlug?.trim().toLowerCase() === "noor";
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
  const activeOrder = lastOrder ?? placedOrders[0] ?? null;
  const activeOrderStatus = activeOrder?.status ?? "PLACED";
  const activeOrderTone = getStatusTone(activeOrderStatus);
  const activeOrderStatusLabel = t(`status.${activeOrderStatus}`, {
    defaultValue: activeOrderStatus,
  });
  const hasActiveOrderBar = Boolean(activeOrder);
  const hasExpandedActiveOrderBar = hasActiveOrderBar && activeOrderBarExpanded;
  const canEditActiveOrder =
    activeOrderStatus === "PLACED" && Boolean(activeOrder?.id);
  const activeLineCartItem =
    activeLineEditor !== null ? cartItems[activeLineEditor.cartIndex] : null;
  const activeOrderPlacedTime = new Date(
    activeOrder?.createdAt || Date.now()
  ).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const minimizeActiveOrderSheet = () => {
    setHighlightLastOrderButton(false);
    setActiveOrderBarExpanded(false);

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
      setActiveOrderBarExpanded(false);
      setActiveOrderSheetMinimizing(false);
    }
    setActiveOrderOpen(open);
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
  const notifiedOrderStatusRef = useRef<Map<string, OrderStatus>>(new Map());
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
    const shouldHighlight =
      new URLSearchParams(location.search).get("highlightLastOrder") === "1";
    if (!shouldHighlight) return;
    setHighlightLastOrderButton(true);
    const timer = window.setTimeout(
      () => setHighlightLastOrderButton(false),
      4500
    );
    return () => window.clearTimeout(timer);
  }, [location.search]);

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
    return () => {
      if (activeOrderMinimizeTimerRef.current !== null) {
        window.clearTimeout(activeOrderMinimizeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeOrder?.id) {
      setActiveOrderBarExpanded(false);
      return;
    }
    setActiveOrderBarExpanded(true);
    const timer = window.setTimeout(() => {
      setActiveOrderBarExpanded(false);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [activeOrder?.id, activeOrder?.status]);

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

  const computeOrderTotal = (order: SubmittedOrderSummary | null) => {
    if (!order) return 0;
    if (typeof order.total === "number") return order.total;
    if (typeof order.totalCents === "number") return order.totalCents / 100;
    return 0;
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
    setEditingNote(order.note ?? "");
    setSelectedCategory(selectedCategory || (usesImmediateGuestCheckout ? categories[0]?.id : "all") || "all");
    setCategorySelected(true);
    return mappedItems;
  };

  const loadOrderIntoCart = (order: SubmittedOrderSummary | null) => {
    const mappedItems = prepareOrderForEditing(order);
    if (!mappedItems) return;
    setCartOpenSignal((s) => s + 1);
  };

  const handleActiveOrderItemClick = (
    order: SubmittedOrderSummary | null,
    orderItem: SubmittedOrderItem,
    orderItemIndex: number
  ) => {
    if (!order?.id) return;
    const mappedItems = prepareOrderForEditing(order);
    if (!mappedItems || !menuData) return;
    const cartIndex = findMappedCartIndexForOrderItem(
      order,
      orderItemIndex,
      mappedItems,
      menuData.items
    );
    if (cartIndex < 0) {
      setCartOpenSignal((s) => s + 1);
      return;
    }
    setActiveOrderOpen(false);
    setActiveLineEditor({ orderId: order.id, cartIndex });
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

  const handleOrderAcceptedDuringEdit = (orderId: string) => {
    setLastOrder((prev) =>
      prev && prev.id === orderId ? { ...prev, status: "PREPARING" } : prev
    );
    setPlacedOrders((prev) =>
      prev.map((order) =>
        order.id === orderId ? { ...order, status: "PREPARING" } : order
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

  const handleEditLastOrder = async () => {
    if (!lastOrder || !lastOrder.id) return;
    setHighlightLastOrderButton(false);
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
      const wasEditing = Boolean(editingOrderId);
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
      clearCart();
      stopEditingLastOrder();
      if (approval) {
        clearStoredLocalityApproval();
      }
      void trackOrderEvent(
        "order_submit_succeeded",
        approval?.method || "direct_submit"
      );
      setCategorySelected(false);
      setSelectedCategory(null);
      setOrderPlacedSignal((s) => s + 1);
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
      if (editingOrderId && error instanceof ApiError && error.status === 409) {
        handleOrderAcceptedDuringEdit(editingOrderId);
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
        const previousStatus =
          lastOrderRef.current?.id === payload.orderId
            ? lastOrderRef.current.status
            : placedOrdersRef.current.find((order) => order.id === payload.orderId)
                ?.status;
        notifyOrderStatusChange(payload.orderId, status, previousStatus);
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

  const activeOrderFloatingBar = activeOrder ? (
    <div
      className={clsx(
        themedWrapper,
        "pointer-events-none px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      )}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: activeOrderBarExpanded ? 0 : 64,
        zIndex: 45,
      }}
    >
      {activeOrderBarExpanded ? (
        <div
          className={clsx(
            "pointer-events-auto mx-auto flex min-h-16 w-full max-w-lg items-center gap-2 rounded-3xl border px-4 py-3 text-left shadow-2xl transition-all duration-300 bg-gradient-to-r",
            activeOrderTone.bar,
            highlightLastOrderButton &&
              "animate-pulse ring-4 ring-white/35 ring-offset-2 ring-offset-background"
          )}
        >
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => {
              setHighlightLastOrderButton(false);
              setActiveOrderOpen(true);
            }}
          >
            <span className="block truncate text-sm font-semibold">
              {t("menu.active_order_heading", {
                defaultValue: "Your active order",
              })}
            </span>
            <span className={clsx("block text-xs", activeOrderTone.text)}>
              {activeOrderStatusLabel} - {(activeOrder.items ?? []).length}{" "}
              {t("menu.items_short", { defaultValue: "items" })} - EUR{" "}
              {computeOrderTotal(activeOrder).toFixed(2)}
            </span>
          </button>
          <button
            type="button"
            className={clsx(
              "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
              activeOrderTone.badge
            )}
            onClick={() => {
              setHighlightLastOrderButton(false);
              setActiveOrderOpen(true);
            }}
            aria-label={t("menu.view_active_orders", {
              defaultValue: "View order",
            })}
          >
            <span className={clsx("h-2 w-2 rounded-full", activeOrderTone.dot)} />
            {canEditActiveOrder ? (
              <Pencil className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-white/80 hover:bg-white/20 hover:text-white"
            onClick={() => setActiveOrderBarExpanded(false)}
            aria-label={t("actions.close", { defaultValue: "Close" })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={clsx(
            "pointer-events-auto ml-auto flex min-h-11 max-w-[72vw] items-center gap-2 rounded-full border px-3 py-2 text-left shadow-xl transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 bg-gradient-to-r",
            activeOrderTone.bar
          )}
          onClick={() => {
            setHighlightLastOrderButton(false);
            setActiveOrderOpen(true);
          }}
        >
          <span className={clsx("h-2 w-2 shrink-0 rounded-full", activeOrderTone.dot)} />
          <span className="min-w-0 truncate text-xs font-semibold text-white">
            {activeOrderStatusLabel}
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/80" />
        </button>
      )}
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
                setSelectedCategory(catId);
                setCategorySelected(true);
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
              onBack={() => {
                setCategorySelected(false);
                setSelectedCategory(null);
              }}
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
              showBackButton={!usesImmediateGuestCheckout}
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
              dragListener: false,
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
            className="!left-0 !right-0 !bottom-0 !top-auto h-[min(86dvh,100dvh)] max-h-[100dvh] !w-[100dvw] !max-w-none overflow-hidden rounded-t-3xl border-x-0 border-b-0 p-0 ![translate:0_0] xl:!left-1/2 xl:!right-auto xl:!bottom-auto xl:!top-1/2 xl:h-[82dvh] xl:max-h-[calc(100dvh-0.75rem)] xl:!w-auto xl:!max-w-lg xl:rounded-2xl xl:border xl:![translate:-50%_-50%]"
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
              <div className="flex h-full min-h-0 flex-col bg-background">
                <div
                  className={clsx(
                    "relative cursor-grab touch-none overflow-hidden bg-gradient-to-r px-5 pb-5 pt-4 text-white active:cursor-grabbing",
                    activeOrderTone.bar
                  )}
                  onPointerDown={handleActiveOrderSheetPointerDown}
                >
                  <div className="sm:hidden flex justify-center pb-3" aria-hidden="true">
                    <div className="h-1.5 w-12 rounded-full bg-white/35" />
                  </div>
                  <button
                    type="button"
                    className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/14 text-white hover:bg-white/22"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={minimizeActiveOrderSheet}
                    aria-label={t("actions.close", { defaultValue: "Close" })}
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="pr-11">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
                      <span className={clsx("h-2 w-2 rounded-full", activeOrderTone.dot)} />
                      {activeOrderStatusLabel}
                    </div>
                    <h2 className="mt-2 text-2xl font-bold">
                      {t("menu.active_order_heading", {
                        defaultValue: "Your active order",
                      })}
                    </h2>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/86">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-4 w-4" />
                        {activeOrderPlacedTime}
                      </span>
                      <span>#{(activeOrder.id || "").slice(-6).toUpperCase()}</span>
                      <span>EUR {computeOrderTotal(activeOrder).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 border-b border-border/60 bg-card/70 px-4 py-3">
                  <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
                    {statusSteps.map((step) => {
                      const isActive = step === activeOrder.status;
                      return (
                        <span
                          key={`active-order-step-${step}`}
                          className={clsx(
                            "shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold",
                            isActive
                              ? activeOrderTone.chip
                              : "border-border/60 bg-background/60 text-muted-foreground"
                          )}
                        >
                          {t(`status.${step}`, { defaultValue: step })}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
                      {t("menu.selected_items", {
                        defaultValue: "Selected items",
                      })}
                    </p>
                    {canEditActiveOrder ? (
                      <span className="shrink-0 text-right text-xs text-muted-foreground">
                        {t("menu.tap_item_to_edit", {
                          defaultValue: "Tap an item to edit",
                        })}
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t("menu.order_locked", { defaultValue: "Locked" })}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {(activeOrder.items ?? []).map((item, index) => {
                      const fallback = t("menu.last_order_item_fallback", {
                        index: index + 1,
                        defaultValue: `Item ${index + 1}`,
                      });
                      const name = getSubmittedOrderItemName(item, index, fallback);
                      const quantity = getSubmittedOrderItemQuantity(item);
                      const modifierLabels = getSubmittedOrderItemModifierLabels(item);
                      return (
                        <button
                          type="button"
                          key={`${activeOrder.id}-${item.id ?? item.itemId ?? index}`}
                          className={clsx(
                            "w-full overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-3 text-left transition-colors",
                            canEditActiveOrder
                              ? "hover:border-primary/50 hover:bg-card"
                              : "cursor-default"
                          )}
                          onClick={() =>
                            handleActiveOrderItemClick(activeOrder, item, index)
                          }
                        >
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-start gap-2">
                                <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-bold text-primary">
                                  {quantity}
                                </span>
                                <span className="min-w-0 break-words text-sm font-semibold leading-snug text-foreground sm:text-base">
                                  {name}
                                </span>
                              </div>
                              {modifierLabels.length > 0 ? (
                                <div className="mt-2 space-y-1 break-words pl-8 text-xs text-muted-foreground">
                                  {modifierLabels.map((label, labelIndex) => (
                                    <div key={`${item.id ?? index}-${labelIndex}`}>
                                      {label}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {t("menu.no_modifiers", {
                                    defaultValue: "No modifiers",
                                  })}
                                </p>
                              )}
                            </div>
                            <span className="max-w-[32vw] shrink-0 truncate rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground sm:max-w-none">
                              {canEditActiveOrder
                                ? t("actions.edit", { defaultValue: "Edit" })
                                : t("menu.locked", { defaultValue: "Locked" })}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="shrink-0 border-t border-border/60 bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                  {canEditActiveOrder ? (
                    <Button
                      type="button"
                      className="h-12 w-full rounded-2xl font-semibold"
                      onClick={() => {
                        setActiveOrderOpen(false);
                        loadOrderIntoCart(activeOrder);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {t("menu.edit_order", { defaultValue: "Edit order" })}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/70 px-3 py-3 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      {t("menu.order_locked_desc", {
                        defaultValue:
                          "This order has already moved forward, so item changes are closed.",
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

