import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";
import {
  motion,
  useDragControls,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";
import type { CartItem, MenuItem, MenuCategory } from "@/types";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Bell,
  Loader2,
  X,
  CreditCard,
  Zap,
  Pencil,
  CheckCircle2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";
import { Textarea } from "../ui/textarea";
import { useCartStore } from "@/store/cartStore";
import { useDashboardTheme } from "@/hooks/useDashboardDark";
import { ModifierDialog } from "./ModifierDialog";
import { MAX_ITEM_QUANTITY } from "./orderValidation";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

interface Props {
  categories: Array<Pick<MenuCategory, "id" | "title">>;
  items: MenuItem[];
  selectedCategory: string;
  onCategoryChange: (categoryId: string) => void;
  onBack: () => void;
  onAddItem: (item: MenuItem) => void;
  onCheckout: (note?: string) => void | Promise<any>;
  onImmediateCheckout?: (note?: string) => void | Promise<any>;
  showPaymentButton?: boolean;
  showBackButton?: boolean;
  showAllCategory?: boolean;
  primaryCtaLabel?: string;
  secondaryCtaLabel?: string;
  callButtonLabel?: string | null;
  callStatus?: "idle" | "pending" | "accepted";
  callPrompted?: boolean;
  onCallClick?: () => void;
  onCallConfirm?: () => void;
  checkoutBusy?: boolean;
  note?: string;
  onNoteChange?: (note: string) => void;
  openCartSignal?: number;
  orderPlacedSignal?: number;
  showCartButton?: boolean;
  browseOnly?: boolean;
  imageFit?: "contain" | "cover";
  cartBottomOffset?: "default" | "raised";
}

interface ItemGridProps {
  items: MenuItem[];
  onAdd: (item: MenuItem) => void;
  formatPrice: (n: number) => string;
  getPrice: (item: MenuItem) => number;
  fallbackLabel: string;
  addItemLabel: string;
  active?: boolean;
  browseOnly?: boolean;
  imageFit?: "contain" | "cover";
  showPrices?: boolean;
  selectedQuantities: Map<string, number>;
}

const MENU_CARD_IMAGE_SIZES =
  "(min-width: 1024px) 220px, (min-width: 640px) 33vw, 50vw";
const SWIPE_DISTANCE_PX = 68;
const SWIPE_VELOCITY_PX = 900;
const SWIPE_INTENT_DEADZONE_PX = 28;
const SWIPE_REVERSAL_GUARD_PX = 8;
const CART_MINIMIZE_DISTANCE_PX = 86;
const CART_MINIMIZE_VELOCITY_PX = 650;
const CART_MINIMIZE_ANIMATION_MS = 180;
const MENU_SWIPE_SETTLE_MS = 220;
const MENU_SWIPE_TRANSITION = {
  duration: MENU_SWIPE_SETTLE_MS / 1000,
  ease: [0.32, 0.72, 0, 1] as const,
};

const getCategorySwipeOffset = (info: PanInfo): -1 | 0 | 1 => {
  const offsetX = info.offset.x;
  const velocityX = info.velocity.x;
  if (Math.abs(info.offset.y) > Math.abs(offsetX) * 0.8) return 0;

  if (Math.abs(offsetX) >= SWIPE_DISTANCE_PX) {
    return offsetX < 0 ? 1 : -1;
  }

  if (Math.abs(offsetX) < SWIPE_INTENT_DEADZONE_PX) {
    return 0;
  }

  if (Math.abs(velocityX) < SWIPE_VELOCITY_PX) {
    return 0;
  }

  if (
    Math.abs(offsetX) >= SWIPE_REVERSAL_GUARD_PX &&
    Math.sign(offsetX) !== Math.sign(velocityX)
  ) {
    return 0;
  }

  return velocityX < 0 ? 1 : -1;
};

const ItemGrid = ({
  items,
  onAdd,
  formatPrice,
  getPrice,
  fallbackLabel,
  addItemLabel,
  active = false,
  browseOnly = false,
  imageFit = "contain",
  showPrices = true,
  selectedQuantities,
}: ItemGridProps) => (
  <div className="grid grid-cols-2 gap-3 sm:gap-4">
    {items.map((item, index) => {
      const price = getPrice(item);
      const displayName =
        item.displayName ?? item.name ?? item.title ?? fallbackLabel;
      const description = item.displayDescription ?? item.description ?? "";
      const unavailable = item.available === false;
      const eagerImage = active && index < 4;
      const selectedQuantity = selectedQuantities.get(item.id) ?? 0;
      const isSelected = selectedQuantity > 0;
      return (
        <Card
          key={item.id}
          interactive={false}
          className={`menu-item-card group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-300 ${
            isSelected
              ? "border-primary ring-2 ring-primary/50 shadow-primary/15"
              : "border-border/30"
          } ${unavailable ? "opacity-50" : "hover:border-primary/30"}`}
          style={{ contain: "layout paint style" }}
        >
          <button
            type="button"
            // Native block buttons center shorter content inside stretched grid rows.
            // Explicit flex alignment keeps every image flush with the card's top.
            className="flex h-full w-full flex-col justify-start text-left disabled:cursor-default [@media(max-height:500px)_and_(orientation:landscape)]:flex-row [@media(max-height:500px)_and_(orientation:landscape)]:items-stretch"
            onClick={() => {
              if (!browseOnly) onAdd(item);
            }}
            disabled={browseOnly || unavailable}
            aria-label={
              browseOnly ? displayName : `${addItemLabel}: ${displayName}`
            }
          >
            <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-muted [@media(max-height:500px)_and_(orientation:landscape)]:aspect-auto [@media(max-height:500px)_and_(orientation:landscape)]:min-h-24 [@media(max-height:500px)_and_(orientation:landscape)]:w-24">
              {item.image ? (
                <img
                  src={item.image}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.style.visibility = "hidden";
                  }}
                  width={320}
                  height={400}
                  sizes={MENU_CARD_IMAGE_SIZES}
                  loading={eagerImage ? "eager" : "lazy"}
                  decoding="async"
                  {...({ fetchpriority: eagerImage ? "high" : "low" } as Record<
                    string,
                    string
                  >)}
                  draggable={false}
                  className={`menu-card-image block h-full w-full ${imageFit === "cover" ? "object-cover" : "object-contain"} transition-all duration-500 ${
                    isSelected ? "brightness-110 saturate-125" : ""
                  }`}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-muted/60 to-muted/20" />
              )}
              {isSelected && (
                <div className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground shadow-lg">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {selectedQuantity}
                </div>
              )}
            </div>
            <div className="space-y-1 px-3 py-3 [@media(max-height:500px)_and_(orientation:landscape)]:min-w-0 [@media(max-height:500px)_and_(orientation:landscape)]:flex-1 [@media(max-height:500px)_and_(orientation:landscape)]:py-2">
              <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-foreground sm:text-sm">
                {displayName}
              </h3>
              {description ? (
                <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground [@media(max-height:500px)_and_(orientation:landscape)]:line-clamp-1">
                  {description}
                </p>
              ) : null}
              {showPrices ? (
                <span className="block text-base font-semibold tabular-nums text-foreground sm:text-lg">
                  {formatPrice(price)}
                </span>
              ) : null}
            </div>
          </button>
        </Card>
      );
    })}
  </div>
);

export const SwipeableMenuView = ({
  categories,
  items,
  selectedCategory,
  onCategoryChange,
  onBack,
  onAddItem,
  onCheckout,
  onImmediateCheckout,
  callStatus = "idle",
  onCallClick,
  onCallConfirm,
  checkoutBusy = false,
  note,
  onNoteChange,
  openCartSignal = 0,
  orderPlacedSignal = 0,
  showPaymentButton = true,
  showBackButton = true,
  showAllCategory = true,
  showCartButton = true,
  browseOnly = false,
  imageFit = "contain",
  cartBottomOffset = "default",
  primaryCtaLabel,
}: Props) => {
  const { t } = useTranslation();
  const { dashboardDark, themeClass } = useDashboardTheme();
  const portalThemeClass = `${themeClass}${dashboardDark ? " dark" : ""}`;
  const reduceMotion = Boolean(useReducedMotion());
  const categoryIdPrefix = useId();
  const [mobileSheet, setMobileSheet] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 1279px)").matches,
  );
  const cartItems = useCartStore((state) => state.items);
  const removeItemAt = useCartStore((state) => state.removeItemAt);
  const updateQuantityAt = useCartStore((state) => state.updateQuantityAt);
  const updateItemAt = useCartStore((state) => state.updateItemAt);

  const [cartOpen, setCartOpen] = useState(false);
  const [cartSheetMinimizing, setCartSheetMinimizing] = useState(false);
  const [localOrderNote, setLocalOrderNote] = useState("");
  const orderNote = note ?? localOrderNote;
  const setOrderNote = onNoteChange ?? setLocalOrderNote;
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [isRinging, setIsRinging] = useState(false);
  const [bellDialogOpen, setBellDialogOpen] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState(1);

  // Ref for category tabs container to scroll active tab into view
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const categoryNavigationRef = useRef<HTMLDivElement>(null);
  const contentFrameRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const suppressClickAfterSwipeRef = useRef(false);
  const categoryDragControls = useDragControls();
  const categoryGestureRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    intent: "pending" | "vertical" | "horizontal";
  } | null>(null);
  const swipeReleaseTimerRef = useRef<number | null>(null);
  const cartDragControls = useDragControls();
  const cartHeaderDraggedRef = useRef(false);
  const cartMinimizeTimerRef = useRef<number | null>(null);

  const currency =
    typeof window !== "undefined"
      ? window.localStorage.getItem("CURRENCY") || "EUR"
      : "EUR";
  const cartQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px)");
    const update = () => setMobileSheet(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const selectedQuantities = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const cartItem of cartItems) {
      quantities.set(
        cartItem.item.id,
        (quantities.get(cartItem.item.id) ?? 0) + cartItem.quantity,
      );
    }
    return quantities;
  }, [cartItems]);

  const itemCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of categories) counts.set(category.id, 0);
    for (const item of items) {
      if (item.categoryId && counts.has(item.categoryId)) {
        counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
        continue;
      }
      const categoryByTitle = categories.find(
        (category) => category.title === item.category,
      );
      if (categoryByTitle) {
        counts.set(
          categoryByTitle.id,
          (counts.get(categoryByTitle.id) ?? 0) + 1,
        );
      }
    }
    counts.set("all", items.length);
    return counts;
  }, [categories, items]);

  const selectedCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of categories) counts.set(category.id, 0);

    for (const cartItem of cartItems) {
      const quantity = cartItem.quantity ?? 1;
      const item = cartItem.item;
      if (item.categoryId && counts.has(item.categoryId)) {
        counts.set(
          item.categoryId,
          (counts.get(item.categoryId) ?? 0) + quantity,
        );
        continue;
      }
      const categoryByTitle = categories.find(
        (category) => category.title === item.category,
      );
      if (categoryByTitle) {
        counts.set(
          categoryByTitle.id,
          (counts.get(categoryByTitle.id) ?? 0) + quantity,
        );
      }
    }

    counts.set(
      "all",
      cartItems.reduce((sum, item) => sum + (item.quantity ?? 1), 0),
    );
    return counts;
  }, [cartItems, categories]);

  // Category tabs with optional "All" prepended
  const allCategories = useMemo(
    () => [
      ...(showAllCategory
        ? [
            {
              id: "all",
              title: t("menu.category_all", { defaultValue: "All" }),
              count: itemCountByCategory.get("all") ?? items.length,
            },
          ]
        : []),
      ...categories.map((category) => ({
        ...category,
        count: itemCountByCategory.get(category.id) ?? 0,
      })),
    ],
    [categories, itemCountByCategory, items.length, showAllCategory, t],
  );
  const selectedIndex = allCategories.findIndex(
    (c) => c.id === selectedCategory,
  );
  const safeSelectedIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const indicatorStart = Math.max(
    0,
    Math.min(safeSelectedIndex - 2, allCategories.length - 5),
  );
  const categoryIndicators = allCategories.slice(
    indicatorStart,
    indicatorStart + 5,
  );

  const resetCategoryScroll = () => {
    const frame = contentFrameRef.current;
    const nav = categoryNavigationRef.current;
    if (!frame || !nav) return;
    const stickyTop = Number.parseFloat(window.getComputedStyle(nav).top) || 0;
    const contentTop = frame.getBoundingClientRect().top;
    const targetTop = stickyTop + nav.offsetHeight + 8;
    if (contentTop < targetTop - 8) {
      window.scrollTo({
        top: Math.max(0, window.scrollY + contentTop - targetTop),
        behavior: "instant",
      });
    }
  };

  const handleCategorySelect = (categoryId: string) => {
    if (categoryId === selectedCategory) return;
    resetCategoryScroll();

    const nextIndex = allCategories.findIndex(
      (category) => category.id === categoryId,
    );
    if (nextIndex >= 0 && nextIndex !== safeSelectedIndex) {
      flushSync(() => {
        setSwipeDirection(nextIndex > safeSelectedIndex ? 1 : -1);
      });
    }
    onCategoryChange(categoryId);
  };

  const handleSwipeCategory = (offset: -1 | 1) => {
    const nextCategory = allCategories[safeSelectedIndex + offset];
    if (!nextCategory) return false;
    resetCategoryScroll();

    flushSync(() => {
      setSwipeDirection(offset);
    });
    onCategoryChange(nextCategory.id);
    return true;
  };

  const handleContentDragStart = () => {
    suppressClickAfterSwipeRef.current = true;
  };

  const handleCategoryPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      allCategories.length < 2 ||
      (event.target as Element).closest(
        "input, textarea, select, a, [data-no-category-swipe]",
      )
    )
      return;
    categoryGestureRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      intent: "pending",
    };
  };
  const handleCategoryPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const gesture = categoryGestureRef.current;
    if (
      !gesture ||
      gesture.pointerId !== event.pointerId ||
      gesture.intent !== "pending"
    )
      return;
    const x = Math.abs(event.clientX - gesture.x);
    const y = Math.abs(event.clientY - gesture.y);
    // Commit to one axis before starting drag so reading a long menu stays a
    // native vertical scroll, even when the finger drifts sideways.
    if (y > 10 && y > x) {
      gesture.intent = "vertical";
      return;
    }
    if (x >= 14 && x > y * 1.4) {
      gesture.intent = "horizontal";
      suppressClickAfterSwipeRef.current = true;
      categoryDragControls.start(event.nativeEvent);
    }
  };
  const resetCategoryGesture = () => {
    categoryGestureRef.current = null;
    if (swipeReleaseTimerRef.current !== null)
      window.clearTimeout(swipeReleaseTimerRef.current);
    swipeReleaseTimerRef.current = window.setTimeout(() => {
      suppressClickAfterSwipeRef.current = false;
    }, 80);
  };

  const handleContentDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const categoryOffset = getCategorySwipeOffset(info);
    const changedCategory =
      categoryOffset !== 0 ? handleSwipeCategory(categoryOffset) : false;

    categoryGestureRef.current = null;
    if (swipeReleaseTimerRef.current !== null)
      window.clearTimeout(swipeReleaseTimerRef.current);
    swipeReleaseTimerRef.current = window.setTimeout(
      () => {
        suppressClickAfterSwipeRef.current = false;
      },
      changedCategory && !reduceMotion ? MENU_SWIPE_SETTLE_MS : 80,
    );
  };

  const handleContentClickCapture = (
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    if (!suppressClickAfterSwipeRef.current) return;

    event.preventDefault();
    event.stopPropagation();
  };

  // Scroll active tab into view when category changes
  useEffect(() => {
    const activeTab = tabRefs.current.get(selectedCategory);
    if (activeTab && tabsContainerRef.current) {
      const container = tabsContainerRef.current;

      // Calculate scroll position to center the active tab
      const scrollLeft =
        activeTab.offsetLeft -
        container.offsetWidth / 2 +
        activeTab.offsetWidth / 2;
      container.scrollTo({
        left: Math.max(0, scrollLeft),
        behavior: reduceMotion ? "instant" : "smooth",
      });
    }
  }, [selectedCategory, reduceMotion]);

  const editingCartItem =
    editingItemIndex !== null ? cartItems[editingItemIndex] : null;

  const formatPrice = (price: number) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(price);
    } catch {
      return `€${price.toFixed(2)}`;
    }
  };

  const getPrice = (item: MenuItem) => {
    return typeof item.price === "number"
      ? item.price
      : typeof item.priceCents === "number"
        ? item.priceCents / 100
        : 0;
  };

  const getSharedPriceLabel = (list: MenuItem[]) => {
    if (list.length === 0) return null;
    const firstPrice = getPrice(list[0]);
    const allSamePrice = list.every(
      (item) => Math.abs(getPrice(item) - firstPrice) < 0.001,
    );
    return allSamePrice ? formatPrice(firstPrice) : null;
  };

  const getModifierOptionPriceDelta = (
    option: NonNullable<
      CartItem["item"]["modifiers"]
    >[number]["options"][number],
  ) => {
    if (typeof option.priceDelta === "number") return option.priceDelta;
    if (typeof option.priceDeltaCents === "number")
      return option.priceDeltaCents / 100;
    return 0;
  };

  const getSelectedModifiersTotal = (cartItem: CartItem) => {
    if (!cartItem.selectedModifiers) return 0;
    return Object.entries(cartItem.selectedModifiers).reduce(
      (sum, [modifierId, optionIds]) => {
        const ids = Array.isArray(optionIds) ? optionIds : [optionIds];
        const modifierOptions =
          cartItem.item.modifiers?.find(
            (modifier) => modifier.id === modifierId,
          )?.options ?? [];
        return (
          sum +
          ids.reduce((optionSum, optionId) => {
            const option = modifierOptions.find((opt) => opt.id === optionId);
            return (
              optionSum + (option ? getModifierOptionPriceDelta(option) : 0)
            );
          }, 0)
        );
      },
      0,
    );
  };

  const getCartItemUnitPrice = (cartItem: CartItem) =>
    getPrice(cartItem.item) + getSelectedModifiersTotal(cartItem);

  const cartTotal = cartItems.reduce((sum, item) => {
    return sum + getCartItemUnitPrice(item) * item.quantity;
  }, 0);
  const itemCountLabel =
    cartQuantity === 1
      ? t("menu.item_count_one", {
          count: cartQuantity,
          defaultValue: "{{count}} item",
        })
      : t("menu.item_count_other", {
          count: cartQuantity,
          defaultValue: "{{count}} items",
        });

  const handleCheckout = async () => {
    if (checkoutBusy) return;
    const res = await onCheckout(orderNote);
    if (res) {
      setOrderNote("");
    }
  };

  const handleImmediateCheckout = async () => {
    if (checkoutBusy || !onImmediateCheckout) return;
    const res = await onImmediateCheckout(orderNote);
    if (res) {
      setOrderNote("");
    }
  };

  const handleEditModifiers = (index: number) => {
    if (checkoutBusy) return;
    setEditingItemIndex(index);
  };

  const handleConfirmEditModifiers = (
    selectedModifiers: CartItem["selectedModifiers"],
    qty: number,
  ) => {
    if (editingItemIndex !== null) {
      updateItemAt(editingItemIndex, {
        quantity: Math.max(1, qty || 1),
        selectedModifiers,
      });
    }
    setEditingItemIndex(null);
  };

  const handleAddItemClick = (item: MenuItem) => {
    if (checkoutBusy) return;
    if (browseOnly) return;
    if (item.available === false) return;
    onAddItem(item);
  };

  const minimizeCartSheet = () => {
    if (checkoutBusy) return;
    if (reduceMotion || !mobileSheet) {
      setCartSheetMinimizing(false);
      setCartOpen(false);
      return;
    }
    if (typeof window === "undefined") {
      setCartOpen(false);
      return;
    }

    if (cartMinimizeTimerRef.current !== null) {
      window.clearTimeout(cartMinimizeTimerRef.current);
    }

    setCartSheetMinimizing(true);
    cartMinimizeTimerRef.current = window.setTimeout(() => {
      setCartOpen(false);
      setCartSheetMinimizing(false);
      cartMinimizeTimerRef.current = null;
    }, CART_MINIMIZE_ANIMATION_MS);
  };

  const handleCartOpenChange = (open: boolean) => {
    if (open) {
      setCartSheetMinimizing(false);
      setCartOpen(true);
      return;
    }
    minimizeCartSheet();
  };

  const handleCartSheetDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const draggedDown = info.offset.y >= CART_MINIMIZE_DISTANCE_PX;
    const flungDown = info.velocity.y >= CART_MINIMIZE_VELOCITY_PX;
    if (draggedDown || flungDown) {
      minimizeCartSheet();
    }
  };

  useEffect(() => {
    if (openCartSignal > 0) {
      setCartSheetMinimizing(false);
      setCartOpen(true);
    }
  }, [openCartSignal]);

  useEffect(() => {
    if (orderPlacedSignal > 0) {
      setCartSheetMinimizing(false);
      setCartOpen(false);
      setOrderNote("");
      setEditingItemIndex(null);
    }
  }, [orderPlacedSignal]);

  useEffect(() => {
    return () => {
      if (cartMinimizeTimerRef.current !== null) {
        window.clearTimeout(cartMinimizeTimerRef.current);
      }
      if (swipeReleaseTimerRef.current !== null)
        window.clearTimeout(swipeReleaseTimerRef.current);
    };
  }, []);

  const handleBellClick = () => {
    setBellDialogOpen(true);
  };

  const handleConfirmCall = () => {
    setBellDialogOpen(false);
    setIsRinging(true);
    (onCallConfirm ?? onCallClick)?.();
    setTimeout(() => {
      setIsRinging(false);
    }, 2000);
  };

  const itemsByCategory = useMemo(() => {
    const mapped = new Map<string, MenuItem[]>();
    for (const category of categories) {
      mapped.set(category.id, []);
    }

    for (const item of items) {
      if (item.categoryId && mapped.has(item.categoryId)) {
        mapped.get(item.categoryId)?.push(item);
        continue;
      }

      const categoryByTitle = categories.find(
        (category) => category.title === item.category,
      );
      if (categoryByTitle) {
        mapped.get(categoryByTitle.id)?.push(item);
      }
    }
    return mapped;
  }, [categories, items]);

  // Build subcategory groups for a given list of items.
  // Reads an optional `subcategory` field; falls back to "" (no subcategory).
  const buildSubgroups = (list: MenuItem[]) => {
    const groups = new Map<string, MenuItem[]>();
    for (const it of list) {
      const sub =
        ((it as unknown as { subcategory?: string; subCategory?: string })
          .subcategory ??
          (it as unknown as { subCategory?: string }).subCategory ??
          "") ||
        "";
      const key = sub.trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }
    return Array.from(groups.entries()).map(([title, items]) => ({
      title,
      items,
    }));
  };

  const groupedByCategoryId = useMemo(() => {
    const grouped = new Map<
      string,
      Array<{ category: Pick<MenuCategory, "id" | "title">; items: MenuItem[] }>
    >();
    grouped.set(
      "all",
      categories
        .map((category) => ({
          category,
          items: itemsByCategory.get(category.id) ?? [],
        }))
        .filter((entry) => entry.items.length > 0),
    );
    for (const category of categories) {
      grouped.set(category.id, [
        {
          category,
          items: itemsByCategory.get(category.id) ?? [],
        },
      ]);
    }
    return grouped;
  }, [categories, itemsByCategory]);

  const activeCategoryId =
    allCategories[safeSelectedIndex]?.id ?? categories[0]?.id ?? "all";
  const visibleGroupedItems = groupedByCategoryId.get(activeCategoryId) ?? [];

  useEffect(() => {
    if (typeof window === "undefined") return;

    const urls = new Set(
      visibleGroupedItems
        .flatMap((group) => group.items)
        .map((item) => item.image)
        .filter((url): url is string => Boolean(url))
        .slice(0, 6),
    );

    if (urls.size === 0) return;

    const timeoutId = window.setTimeout(() => {
      for (const url of urls) {
        const image = new Image();
        image.decoding = "async";
        image.src = url;
        image.decode?.().catch(() => undefined);
      }
    }, 160);

    return () => window.clearTimeout(timeoutId);
  }, [visibleGroupedItems]);

  return (
    <>
      {/* Category Navigation */}
      <motion.div
        ref={categoryNavigationRef}
        initial={reduceMotion ? false : { opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: reduceMotion ? 0 : 0.18,
          ease: [0.22, 1, 0.36, 1],
        }}
        style={{ top: "var(--menu-header-height, 0px)" }}
        className="sticky z-30 mb-3 -mx-4 border-b border-border/35 bg-background/95 px-0 py-2 backdrop-blur sm:mx-0 sm:px-3"
      >
        <div className="relative flex items-center overflow-hidden">
          <div
            ref={tabsContainerRef}
            role="tablist"
            aria-label={t("menu.categories", {
              defaultValue: "Menu categories",
            })}
            aria-orientation="horizontal"
            className="relative flex flex-1 items-center gap-2 overflow-x-auto scrollbar-hide px-4 sm:px-0"
          >
            {allCategories.map((cat) => {
              const isActive = allCategories[safeSelectedIndex]?.id === cat.id;
              const selectedCount = selectedCountByCategory.get(cat.id) ?? 0;
              const hasSelectedItems = selectedCount > 0;
              return (
                <motion.button
                  key={cat.id}
                  ref={(el) => {
                    if (el) tabRefs.current.set(cat.id, el);
                  }}
                  type="button"
                  id={`${categoryIdPrefix}-tab-${cat.id}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`${categoryIdPrefix}-panel`}
                  tabIndex={isActive ? 0 : -1}
                  title={cat.title}
                  onClick={() => handleCategorySelect(cat.id)}
                  onKeyDown={(event) => {
                    const index = allCategories.findIndex(
                      (category) => category.id === cat.id,
                    );
                    const nextIndex =
                      event.key === "ArrowRight"
                        ? Math.min(index + 1, allCategories.length - 1)
                        : event.key === "ArrowLeft"
                          ? Math.max(0, index - 1)
                          : event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? allCategories.length - 1
                              : -1;
                    if (nextIndex < 0) return;
                    event.preventDefault();
                    const next = allCategories[nextIndex];
                    handleCategorySelect(next.id);
                    tabRefs.current
                      .get(next.id)
                      ?.focus({ preventScroll: true });
                  }}
                  whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                  className={`relative h-10 min-w-[88px] shrink-0 rounded-full border px-3 text-center transition-colors duration-200 ${
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : hasSelectedItems
                        ? "border-primary/45 bg-primary/10 text-foreground"
                        : "border-border/45 bg-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  {isActive && !reduceMotion && (
                    <motion.span
                      layoutId={`${categoryIdPrefix}-active-category-pill`}
                      className="absolute inset-0 rounded-full bg-primary"
                      transition={{
                        type: "spring",
                        stiffness: 520,
                        damping: 38,
                        mass: 0.8,
                      }}
                    />
                  )}
                  {hasSelectedItems && !isActive && (
                    <span className="absolute right-1 top-1 z-20 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">
                      {selectedCount}
                    </span>
                  )}
                  <span className="relative z-10 flex h-full items-center justify-center">
                    <span className="max-w-[132px] truncate text-center text-[13px] font-semibold leading-4 tracking-normal">
                      {cat.title}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
        {allCategories.length > 1 && (
          <div
            className="mx-auto mt-1 flex max-w-lg items-center justify-between gap-2 px-3"
            aria-label={t("menu.category_navigation", {
              defaultValue: "Category navigation",
            })}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-full"
              disabled={safeSelectedIndex === 0}
              aria-label={t("menu.previous_category", {
                defaultValue: "Previous category",
              })}
              onClick={() => handleSwipeCategory(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 text-center">
              <p className="text-xs leading-4 text-muted-foreground">
                <span aria-live="polite" aria-atomic="true">
                  {t("menu.category_position", {
                    current: safeSelectedIndex + 1,
                    total: allCategories.length,
                    defaultValue: "{{current}} of {{total}}",
                  })}
                </span>
                <span aria-hidden="true"> · </span>
                {t("menu.swipe_categories", {
                  defaultValue: "Swipe or use arrows",
                })}
              </p>
              <div className="flex items-center justify-center">
                {categoryIndicators.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t("menu.go_to_category", {
                      category: category.title,
                      defaultValue: "Show {{category}}",
                    })}
                    aria-current={
                      category.id === activeCategoryId ? "true" : undefined
                    }
                    onClick={() => handleCategorySelect(category.id)}
                  >
                    <span
                      className={`h-1.5 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none ${category.id === activeCategoryId ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/35"}`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-full"
              disabled={safeSelectedIndex >= allCategories.length - 1}
              aria-label={t("menu.next_category", {
                defaultValue: "Next category",
              })}
              onClick={() => handleSwipeCategory(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </motion.div>

      {/* Only the incoming category is mounted; an exiting pane could still
          receive item taps while its replacement animates into place. */}
      <div
        ref={contentFrameRef}
        className="menu-content-frame overflow-x-hidden"
        style={{
          minHeight: "min(65dvh, 36rem)",
          paddingBottom:
            cartBottomOffset === "raised"
              ? "calc(6rem + env(safe-area-inset-bottom) + var(--menu-secondary-bar-space, 5rem))"
              : "calc(6rem + env(safe-area-inset-bottom))",
        }}
        onClickCapture={handleContentClickCapture}
        onPointerDownCapture={handleCategoryPointerDown}
        onPointerMoveCapture={handleCategoryPointerMove}
        onPointerUpCapture={resetCategoryGesture}
        onPointerCancelCapture={resetCategoryGesture}
      >
        <div className="grid min-w-0">
          <motion.div
            key={activeCategoryId}
            id={`${categoryIdPrefix}-panel`}
            role="tabpanel"
            aria-labelledby={`${categoryIdPrefix}-tab-${activeCategoryId}`}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                handleSwipeCategory(event.key === "ArrowLeft" ? -1 : 1);
              }
            }}
            drag="x"
            dragControls={categoryDragControls}
            dragListener={false}
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={reduceMotion ? 0 : 0.12}
            dragMomentum={false}
            dragSnapToOrigin
            onDragStart={handleContentDragStart}
            onDragEnd={handleContentDragEnd}
            initial={
              reduceMotion ? false : { x: swipeDirection * 24, opacity: 0 }
            }
            animate={{ x: 0, opacity: 1 }}
            transition={reduceMotion ? { duration: 0 } : MENU_SWIPE_TRANSITION}
            className="menu-swipe-pane col-start-1 row-start-1 min-w-0 touch-pan-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {visibleGroupedItems.map((group) => {
              const subgroups = buildSubgroups(group.items);
              const hasNamedSubgroups = subgroups.some((s) => s.title);

              return (
                <section key={group.category.id} className="menu-section mb-10">
                  {activeCategoryId === "all" && (
                    <header className="flex items-baseline justify-between mb-5 px-1">
                      <h2 className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
                        {group.category.title}
                      </h2>
                      <span className="text-[11px] tabular-nums text-muted-foreground/70">
                        {group.items.length}
                      </span>
                    </header>
                  )}

                  {hasNamedSubgroups ? (
                    <Accordion
                      type="multiple"
                      defaultValue={subgroups
                        .filter((s) => s.title)
                        .map((s) => s.title)}
                      className="space-y-2"
                    >
                      {subgroups
                        .filter((s) => !s.title)
                        .map((s) => (
                          <ItemGrid
                            key="__no-sub__"
                            items={s.items}
                            onAdd={handleAddItemClick}
                            formatPrice={formatPrice}
                            getPrice={getPrice}
                            fallbackLabel={t("menu.item", {
                              defaultValue: "Item",
                            })}
                            addItemLabel={t("menu.add_to_cart", {
                              defaultValue: "Add to cart",
                            })}
                            active
                            browseOnly={browseOnly}
                            imageFit={imageFit}
                            selectedQuantities={selectedQuantities}
                          />
                        ))}
                      {subgroups
                        .filter((s) => s.title)
                        .map((s) => {
                          const sharedPriceLabel = getSharedPriceLabel(s.items);
                          return (
                            <AccordionItem
                              key={s.title}
                              value={s.title}
                              className="border border-border/40 rounded-xl bg-card/60 overflow-hidden"
                            >
                              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                                <div className="flex items-center gap-3">
                                  <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
                                  <span className="text-sm font-medium text-foreground tracking-wide">
                                    {s.title}
                                  </span>
                                  {sharedPriceLabel ? (
                                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
                                      {sharedPriceLabel}
                                    </span>
                                  ) : null}
                                  <span className="text-[11px] tabular-nums text-muted-foreground/70">
                                    {s.items.length}
                                  </span>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="px-3 pb-4 pt-0">
                                <ItemGrid
                                  items={s.items}
                                  onAdd={handleAddItemClick}
                                  formatPrice={formatPrice}
                                  getPrice={getPrice}
                                  fallbackLabel={t("menu.item", {
                                    defaultValue: "Item",
                                  })}
                                  addItemLabel={t("menu.add_to_cart", {
                                    defaultValue: "Add to cart",
                                  })}
                                  active
                                  browseOnly={browseOnly}
                                  imageFit={imageFit}
                                  showPrices={!sharedPriceLabel}
                                  selectedQuantities={selectedQuantities}
                                />
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                    </Accordion>
                  ) : (
                    <ItemGrid
                      items={group.items}
                      onAdd={handleAddItemClick}
                      formatPrice={formatPrice}
                      getPrice={getPrice}
                      fallbackLabel={t("menu.item", { defaultValue: "Item" })}
                      addItemLabel={t("menu.add_to_cart", {
                        defaultValue: "Add to cart",
                      })}
                      active
                      browseOnly={browseOnly}
                      imageFit={imageFit}
                      selectedQuantities={selectedQuantities}
                    />
                  )}
                </section>
              );
            })}
          </motion.div>
        </div>
      </div>

      {/* Bottom menu controls */}
      <div
        role="region"
        aria-label={t("menu.order_controls", {
          defaultValue: "Order controls",
        })}
        style={{
          bottom:
            cartBottomOffset === "raised"
              ? "calc(1rem + env(safe-area-inset-bottom) + var(--menu-secondary-bar-space, 5rem))"
              : "calc(1rem + env(safe-area-inset-bottom))",
        }}
        className="fixed left-4 right-4 z-40 flex justify-center pointer-events-none transition-[bottom] duration-200 motion-reduce:transition-none"
      >
        <motion.div
          initial={reduceMotion ? false : { y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={
            reduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }
          }
          className="pointer-events-auto grid w-full max-w-lg grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2 rounded-full border border-border/25 bg-card/80 p-1.5 shadow-xl backdrop-blur-md"
        >
          {showBackButton ? (
            <motion.button
              type="button"
              onClick={onBack}
              whileHover={reduceMotion ? undefined : { scale: 1.04 }}
              whileTap={reduceMotion ? undefined : { scale: 0.96 }}
              aria-label={t("common.back", { defaultValue: "Back" })}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/55 text-muted-foreground transition-all duration-300 hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </motion.button>
          ) : (
            <div aria-hidden="true" />
          )}

          {/* Order button - dominant center action */}
          {showCartButton ? (
            <motion.button
              type="button"
              aria-label={t("menu.open_cart", {
                count: cartQuantity,
                defaultValue: "Open cart, {{count}} items",
              })}
              onClick={() => setCartOpen(true)}
              whileHover={reduceMotion ? undefined : { scale: 1.01 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              className="relative flex h-12 min-w-0 items-center justify-center gap-2 rounded-full bg-primary px-4 text-primary-foreground shadow-sm transition-all duration-300 hover:shadow-md"
            >
              <div className="relative shrink-0">
                <ShoppingCart className="h-5 w-5" />
                {cartQuantity > 0 && (
                  <motion.span
                    initial={reduceMotion ? false : { scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground ring-1 ring-primary"
                  >
                    {cartQuantity}
                  </motion.span>
                )}
              </div>
              <span className="min-w-0 truncate text-sm font-semibold tracking-tight">
                {cartItems.length > 0
                  ? `${formatPrice(cartTotal)} · ${primaryCtaLabel || t("menu.checkout", { defaultValue: "Place Order" })}`
                  : t("menu.cart", { defaultValue: "Cart" })}
              </span>
            </motion.button>
          ) : (
            <div aria-hidden="true" />
          )}

          {browseOnly ? (
            <div aria-hidden="true" />
          ) : (
            <motion.button
              type="button"
              onClick={handleBellClick}
              aria-label={t("menu.call_waiter", {
                defaultValue: "Call Waiter",
              })}
              disabled={callStatus === "pending"}
              whileHover={reduceMotion ? undefined : { scale: 1.05 }}
              whileTap={reduceMotion ? undefined : { scale: 0.95 }}
              className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 ${
                callStatus === "pending"
                  ? "bg-primary/15 text-primary cursor-wait"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {!reduceMotion && (callStatus === "pending" || isRinging) && (
                <span className="absolute inset-0 rounded-full bg-primary/15 animate-ping" />
              )}
              <Bell
                className={`relative h-5 w-5 ${isRinging && !reduceMotion ? "animate-[wiggle_0.5s_ease-in-out_infinite]" : ""}`}
              />
            </motion.button>
          )}
        </motion.div>
      </div>
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {t("menu.cart_updated", {
          count: cartQuantity,
          total: formatPrice(cartTotal),
          defaultValue: "Cart: {{count}} items, {{total}}",
        })}
      </p>

      {/* Call Waiter Confirmation Dialog */}
      <AlertDialog open={bellDialogOpen} onOpenChange={setBellDialogOpen}>
        <AlertDialogContent className={`${portalThemeClass} max-w-sm`}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              {t("menu.call_waiter", { defaultValue: "Call Waiter" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("menu.call_waiter_description", {
                defaultValue:
                  "This will notify a waiter that you need assistance at your table. They will come to you shortly.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCall}>
              {t("menu.yes_call", { defaultValue: "Yes, Call Waiter" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cart Modal */}
      {showCartButton && (
        <Dialog open={cartOpen} onOpenChange={handleCartOpenChange}>
          <DialogContent
            motionProps={{
              initial: reduceMotion
                ? false
                : { opacity: 0, y: mobileSheet ? 24 : 8, scale: 1 },
              animate: cartSheetMinimizing
                ? { opacity: 0.96, scale: 0.98, y: "104%" }
                : { opacity: 1, scale: 1, y: 0 },
              drag: checkoutBusy || !mobileSheet ? false : "y",
              dragControls: cartDragControls,
              dragDirectionLock: true,
              dragConstraints: { top: 0, bottom: 0 },
              dragElastic: { top: 0, bottom: reduceMotion ? 0 : 0.28 },
              dragListener: false,
              dragMomentum: false,
              dragTransition: { bounceStiffness: 420, bounceDamping: 36 },
              onDragStart: () => { cartHeaderDraggedRef.current = true; },
              onDragEnd: handleCartSheetDragEnd,
              transition: reduceMotion
                ? { duration: 0 }
                : cartSheetMinimizing
                  ? {
                      duration: CART_MINIMIZE_ANIMATION_MS / 1000,
                      ease: [0.32, 0.72, 0, 1],
                    }
                  : { type: "spring", stiffness: 350, damping: 28, mass: 0.8 },
              whileDrag: reduceMotion ? undefined : { scale: 0.995 },
            }}
            className={`${portalThemeClass} !left-0 !right-0 !bottom-0 !top-auto !flex !flex-col h-[85dvh] max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] !w-[100dvw] !max-w-none !overflow-hidden rounded-t-3xl border-x-0 border-b-0 !p-0 !gap-0 ![translate:0_0] xl:!left-1/2 xl:!right-auto xl:!bottom-auto xl:!top-1/2 xl:h-[min(44rem,82dvh)] xl:!w-[min(42rem,calc(100vw-2rem))] xl:!max-w-2xl xl:rounded-2xl xl:border xl:![translate:-50%_-50%] [@media(max-height:500px)_and_(orientation:landscape)]:!h-[calc(100dvh-0.5rem)]`}
          >
            <DialogTitle className="sr-only">
              {t("menu.your_order", { defaultValue: "Your Order" })}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("menu.cart_summary", {
                defaultValue: "Cart summary and checkout",
              })}
            </DialogDescription>
            <Card
              aria-busy={checkoutBusy}
              className="h-full min-h-0 min-w-0 overflow-hidden border-0 shadow-none flex flex-col"
            >
              <div
                data-testid="cart-drag-handle"
                role={mobileSheet ? "button" : undefined}
                tabIndex={mobileSheet && !checkoutBusy ? 0 : undefined}
                aria-label={
                  mobileSheet
                    ? t("menu.minimize_cart", { defaultValue: "Close cart" })
                    : undefined
                }
                aria-disabled={checkoutBusy || undefined}
                onPointerDown={(event) => {
                  if (
                    mobileSheet &&
                    !checkoutBusy &&
                    event.isPrimary &&
                    event.button === 0
                  ) {
                    cartHeaderDraggedRef.current = false;
                    cartDragControls.start(event);
                  }
                }}
                onClick={() => { if (mobileSheet && !cartHeaderDraggedRef.current) minimizeCartSheet(); }}
                onKeyDown={(event) => {
                  if (
                    mobileSheet &&
                    !checkoutBusy &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    minimizeCartSheet();
                  }
                }}
                className={`shrink-0 bg-gradient-to-br from-primary/10 to-accent/10 p-3 sm:p-4 border-b border-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [@media(max-height:500px)_and_(orientation:landscape)]:!p-2 ${mobileSheet ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
              >
                <div
                  className="flex justify-center pt-1 pb-1 xl:hidden"
                  aria-hidden="true"
                >
                  <div className="h-1.5 w-12 rounded-full bg-muted" />
                </div>
                <p className="mb-2 text-center text-[10px] text-muted-foreground xl:hidden [@media(max-height:500px)_and_(orientation:landscape)]:hidden">
                  {t("menu.drag_cart_hint", {
                    defaultValue: "Drag down to close",
                  })}
                </p>
                <div className="flex min-w-0 items-center gap-3 pr-12">
                  <div className="shrink-0 p-2 rounded-full bg-primary/20">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-bold leading-snug text-foreground sm:text-xl">
                      {t("menu.your_order", { defaultValue: "Your Order" })}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {itemCountLabel}
                    </p>
                  </div>
                </div>
              </div>

              {/* Keep scrolling inside the bounded flex body. The header alone
                  starts sheet dragging, so scrolling items cannot dismiss it. */}
              <div
                className="min-h-0 min-w-0 w-full flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain"
                data-testid="cart-scroll-content"
              >
                {cartItems.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
                      <ShoppingCart className="h-10 w-10 text-muted-foreground/50" />
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {t("menu.cart_empty", {
                        defaultValue: "Your cart is empty",
                      })}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {cartItems.map((cartItem, idx) => {
                      const itemTotal =
                        getCartItemUnitPrice(cartItem) * cartItem.quantity;
                      const displayName =
                        cartItem.item.displayName ??
                        cartItem.item.name ??
                        cartItem.item.title ??
                        t("menu.item", { defaultValue: "Item" });
                      const hasModifiers = Boolean(
                        cartItem.item.modifiers?.length,
                      );
                      const selectedOptionLabels = (
                        cartItem.item.modifiers ?? []
                      )
                        .flatMap((modifier) => {
                          const value =
                            cartItem.selectedModifiers?.[modifier.id];
                          const ids = Array.isArray(value)
                            ? value
                            : value
                              ? [value]
                              : [];
                          return modifier.options
                            .filter((option) => ids.includes(option.id))
                            .map((option) => option.label || option.title);
                        })
                        .filter(Boolean);

                      return (
                        <div
                          key={`${cartItem.item.id}-${idx}`}
                          className="relative group min-w-0 overflow-hidden bg-muted/20 rounded-lg p-2 border border-border/30 hover:border-primary/30 transition-all duration-300"
                        >
                          <button
                            aria-label={t("menu.remove_item", {
                              defaultValue: "Remove item",
                            })}
                            onClick={() => removeItemAt(idx)}
                            disabled={checkoutBusy}
                            className="absolute right-1 top-1 z-10 flex h-10 w-10 items-center justify-center rounded-full text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                          </button>

                          <div className="flex min-w-0 gap-2 pr-10">
                            <div
                              className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-muted"
                              aria-hidden="true"
                            >
                              {cartItem.item.image && (
                                <img
                                  src={cartItem.item.image}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  onError={(event) => {
                                    event.currentTarget.style.visibility =
                                      "hidden";
                                  }}
                                  className="h-full w-full object-cover"
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                                <h4 className="min-w-0 break-words font-semibold text-sm leading-snug text-foreground [overflow-wrap:anywhere]">
                                  {displayName}
                                </h4>
                                <span className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums text-primary">
                                  {formatPrice(itemTotal)}
                                </span>
                              </div>
                              {selectedOptionLabels.length > 0 && (
                                <p className="mt-1 text-xs text-muted-foreground break-words">
                                  {selectedOptionLabels.join(", ")}
                                </p>
                              )}
                              <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() =>
                                      updateQuantityAt(
                                        idx,
                                        Math.max(1, cartItem.quantity - 1),
                                      )
                                    }
                                    disabled={
                                      checkoutBusy || cartItem.quantity <= 1
                                    }
                                    aria-label={t("menu.decrease_quantity", {
                                      defaultValue: "Decrease quantity",
                                    })}
                                    className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-foreground hover:bg-primary/20 transition-colors disabled:opacity-40"
                                  >
                                    -
                                  </button>
                                  <span className="text-sm font-medium w-4 text-center">
                                    {cartItem.quantity}
                                  </span>
                                  <button
                                    onClick={() =>
                                      updateQuantityAt(
                                        idx,
                                        Math.min(
                                          MAX_ITEM_QUANTITY,
                                          cartItem.quantity + 1,
                                        ),
                                      )
                                    }
                                    disabled={
                                      checkoutBusy ||
                                      cartItem.quantity >= MAX_ITEM_QUANTITY
                                    }
                                    aria-label={t("menu.increase_quantity", {
                                      defaultValue: "Increase quantity",
                                    })}
                                    className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-foreground hover:bg-primary/20 transition-colors disabled:opacity-40"
                                  >
                                    +
                                  </button>
                                </div>
                                {hasModifiers && (
                                  <button
                                    onClick={() => handleEditModifiers(idx)}
                                    disabled={checkoutBusy}
                                    className="min-w-0 text-xs text-primary hover:underline flex items-center gap-1"
                                  >
                                    <Pencil className="h-3 w-3" />
                                    <span className="truncate">
                                      {t("menu.edit", { defaultValue: "Edit" })}
                                    </span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {cartItems.length > 0 && (
                <div
                  className="max-h-[45dvh] shrink-0 overflow-y-auto overscroll-contain p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-border/40 space-y-3 bg-card sm:p-4 [@media(max-height:500px)_and_(orientation:landscape)]:grid [@media(max-height:500px)_and_(orientation:landscape)]:grid-cols-[minmax(0,1fr)_auto_minmax(12rem,0.9fr)] [@media(max-height:500px)_and_(orientation:landscape)]:items-center [@media(max-height:500px)_and_(orientation:landscape)]:gap-3 [@media(max-height:500px)_and_(orientation:landscape)]:space-y-0 [@media(max-height:500px)_and_(orientation:landscape)]:!p-2 [@media(max-height:500px)_and_(orientation:landscape)]:!pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
                  data-testid="cart-checkout-footer"
                >
                  <Textarea
                    placeholder={t("menu.order_note_placeholder", {
                      defaultValue: "Add a note to your order...",
                    })}
                    value={orderNote}
                    aria-label={t("menu.order_note_placeholder", {
                      defaultValue: "Add a note to your order...",
                    })}
                    maxLength={500}
                    disabled={checkoutBusy}
                    onChange={(e) => setOrderNote(e.target.value)}
                    rows={2}
                    className="min-h-[3.5rem] resize-none text-base sm:text-base [@media(max-height:500px)_and_(orientation:landscape)]:h-12 [@media(max-height:500px)_and_(orientation:landscape)]:min-h-12"
                  />
                  <div className="flex min-w-0 items-center justify-between gap-3 [@media(max-height:500px)_and_(orientation:landscape)]:flex-col [@media(max-height:500px)_and_(orientation:landscape)]:items-start [@media(max-height:500px)_and_(orientation:landscape)]:gap-0">
                    <span className="text-lg font-bold [@media(max-height:500px)_and_(orientation:landscape)]:text-sm">
                      {t("menu.total", { defaultValue: "Total" })}
                    </span>
                    <span className="min-w-0 truncate text-lg font-bold text-primary [@media(max-height:500px)_and_(orientation:landscape)]:text-sm">
                      {formatPrice(cartTotal)}
                    </span>
                  </div>
                  <div className="flex min-w-0 gap-2">
                    <Button
                      onClick={handleCheckout}
                      disabled={checkoutBusy}
                      className="min-w-0 flex-1 h-auto min-h-12 whitespace-normal py-3 text-sm font-semibold leading-snug sm:text-base"
                    >
                      {checkoutBusy ? (
                        <span
                          role="status"
                          className="inline-flex items-center gap-2"
                        >
                          <Loader2
                            aria-hidden="true"
                            className="h-5 w-5 animate-spin"
                          />
                          {t("menu.sending_order", {
                            defaultValue: "Sending order…",
                          })}
                        </span>
                      ) : (
                        <>
                          {showPaymentButton ? (
                            <CreditCard className="h-5 w-5 mr-2" />
                          ) : (
                            <ShoppingCart className="h-5 w-5 mr-2" />
                          )}
                          <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                            {primaryCtaLabel ||
                              t("menu.checkout", {
                                defaultValue: "Place Order",
                              })}
                          </span>
                        </>
                      )}
                    </Button>
                    {showPaymentButton && onImmediateCheckout && (
                      <Button
                        onClick={handleImmediateCheckout}
                        disabled={checkoutBusy}
                        variant="outline"
                        aria-label={t("menu.pay_at_venue", {
                          defaultValue: "Order and pay at the venue",
                        })}
                        className="h-auto min-h-12 shrink-0"
                      >
                        <Zap className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </DialogContent>
        </Dialog>
      )}

      {/* Modifier Edit Dialog */}
      {editingCartItem && (
        <ModifierDialog
          open={editingItemIndex !== null}
          onClose={() => setEditingItemIndex(null)}
          item={editingCartItem.item}
          onConfirm={handleConfirmEditModifiers}
          initialQty={editingCartItem.quantity}
          initialSelected={editingCartItem.selectedModifiers}
          saving={checkoutBusy}
        />
      )}
    </>
  );
};
