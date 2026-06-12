import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion';
import type { CartItem, MenuItem, MenuCategory } from '@/types';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ShoppingCart, Bell, Loader2, X, CreditCard, Zap, Pencil, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { useCartStore } from '@/store/cartStore';
import { ModifierDialog } from './ModifierDialog';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

interface Props {
  categories: Array<Pick<MenuCategory, 'id' | 'title'>>;
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
  callStatus?: 'idle' | 'pending' | 'accepted';
  callPrompted?: boolean;
  onCallClick?: () => void;
  checkoutBusy?: boolean;
  openCartSignal?: number;
  orderPlacedSignal?: number;
  showCartButton?: boolean;
  cartBottomOffset?: 'default' | 'raised';
}

interface ItemGridProps {
  items: MenuItem[];
  onAdd: (item: MenuItem) => void;
  formatPrice: (n: number) => string;
  getPrice: (item: MenuItem) => number;
  fallbackLabel: string;
  addItemLabel: string;
  active?: boolean;
  showPrices?: boolean;
  selectedQuantities: Map<string, number>;
}

const MENU_CARD_IMAGE_SIZES = '(min-width: 1024px) 220px, (min-width: 640px) 33vw, 50vw';
const SWIPE_DISTANCE_PX = 68;
const SWIPE_VELOCITY_PX = 900;
const SWIPE_INTENT_DEADZONE_PX = 28;
const SWIPE_REVERSAL_GUARD_PX = 8;
const CART_MINIMIZE_DISTANCE_PX = 86;
const CART_MINIMIZE_VELOCITY_PX = 650;
const CART_MINIMIZE_ANIMATION_MS = 180;
const MENU_SWIPE_SETTLE_MS = 460;
const MENU_SWIPE_TRANSITION = {
  duration: MENU_SWIPE_SETTLE_MS / 1000,
  ease: [0.32, 0.72, 0, 1] as const,
};

const getCategorySwipeOffset = (info: PanInfo): -1 | 0 | 1 => {
  const offsetX = info.offset.x;
  const velocityX = info.velocity.x;

  if (Math.abs(offsetX) >= SWIPE_DISTANCE_PX) {
    return offsetX < 0 ? 1 : -1;
  }

  if (Math.abs(offsetX) >= SWIPE_INTENT_DEADZONE_PX) {
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
            isSelected ? 'border-primary ring-2 ring-primary/50 shadow-primary/15' : 'border-border/30'
          } ${
            unavailable ? 'opacity-50' : 'hover:border-primary/30'
          }`}
          style={{ contain: 'layout paint style' }}
        >
          <button
            type="button"
            className="block h-full w-full text-left disabled:cursor-not-allowed"
            onClick={() => onAdd(item)}
            disabled={unavailable}
            aria-label={`${addItemLabel}: ${displayName}`}
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-black">
              {item.image ? (
                <img
                  src={item.image}
                  alt={displayName}
                  width={320}
                  height={400}
                  sizes={MENU_CARD_IMAGE_SIZES}
                  loading={eagerImage ? 'eager' : 'lazy'}
                  decoding="async"
                  {...({ fetchpriority: eagerImage ? 'high' : 'low' } as Record<string, string>)}
                  draggable={false}
                  className={`menu-card-image h-full w-full object-contain transition-all duration-500 ${
                    isSelected ? 'brightness-110 saturate-125' : ''
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
            <div className="space-y-1 px-3 py-3">
              <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-foreground sm:text-sm">
                {displayName}
              </h3>
              {description ? (
                <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
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
  callStatus = 'idle',
  onCallClick,
  checkoutBusy = false,
  openCartSignal = 0,
  orderPlacedSignal = 0,
  showPaymentButton = true,
  showBackButton = true,
  showAllCategory = true,
  showCartButton = true,
  cartBottomOffset = 'default',
  primaryCtaLabel,
}: Props) => {
  const { t } = useTranslation();
  const cartItems = useCartStore((state) => state.items);
  const removeItemAt = useCartStore((state) => state.removeItemAt);
  const updateQuantityAt = useCartStore((state) => state.updateQuantityAt);
  const updateItemAt = useCartStore((state) => state.updateItemAt);
  
  const [cartOpen, setCartOpen] = useState(false);
  const [cartSheetMinimizing, setCartSheetMinimizing] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [isRinging, setIsRinging] = useState(false);
  const [bellDialogOpen, setBellDialogOpen] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState(1);
  
  // Ref for category tabs container to scroll active tab into view
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const suppressClickAfterSwipeRef = useRef(false);
  const cartDragControls = useDragControls();
  const cartMinimizeTimerRef = useRef<number | null>(null);
  
  const currency = typeof window !== 'undefined' ? window.localStorage.getItem('CURRENCY') || 'EUR' : 'EUR';

  const selectedQuantities = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const cartItem of cartItems) {
      quantities.set(
        cartItem.item.id,
        (quantities.get(cartItem.item.id) ?? 0) + cartItem.quantity
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
      const categoryByTitle = categories.find((category) => category.title === item.category);
      if (categoryByTitle) {
        counts.set(categoryByTitle.id, (counts.get(categoryByTitle.id) ?? 0) + 1);
      }
    }
    counts.set('all', items.length);
    return counts;
  }, [categories, items]);

  const selectedCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of categories) counts.set(category.id, 0);

    for (const cartItem of cartItems) {
      const quantity = cartItem.quantity ?? 1;
      const item = cartItem.item;
      if (item.categoryId && counts.has(item.categoryId)) {
        counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + quantity);
        continue;
      }
      const categoryByTitle = categories.find((category) => category.title === item.category);
      if (categoryByTitle) {
        counts.set(categoryByTitle.id, (counts.get(categoryByTitle.id) ?? 0) + quantity);
      }
    }

    counts.set('all', cartItems.reduce((sum, item) => sum + (item.quantity ?? 1), 0));
    return counts;
  }, [cartItems, categories]);

  // Category tabs with optional "All" prepended
  const allCategories = useMemo(
    () => [
      ...(showAllCategory
        ? [
            {
              id: 'all',
              title: t('menu.category_all', { defaultValue: 'All' }),
              count: itemCountByCategory.get('all') ?? items.length,
            },
          ]
        : []),
      ...categories.map((category) => ({
        ...category,
        count: itemCountByCategory.get(category.id) ?? 0,
      })),
    ],
    [categories, itemCountByCategory, items.length, showAllCategory, t]
  );
  const selectedIndex = allCategories.findIndex(c => c.id === selectedCategory);
  const safeSelectedIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const handleCategorySelect = (categoryId: string) => {
    if (categoryId === selectedCategory) return;

    const nextIndex = allCategories.findIndex((category) => category.id === categoryId);
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

    flushSync(() => {
      setSwipeDirection(offset);
    });
    onCategoryChange(nextCategory.id);
    return true;
  };

  const handleContentDragStart = () => {
    suppressClickAfterSwipeRef.current = true;
  };

  const handleContentDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const categoryOffset = getCategorySwipeOffset(info);
    const changedCategory =
      categoryOffset !== 0 ? handleSwipeCategory(categoryOffset) : false;

    window.setTimeout(() => {
      suppressClickAfterSwipeRef.current = false;
    }, changedCategory ? MENU_SWIPE_SETTLE_MS : 0);
  };

  const handleContentClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickAfterSwipeRef.current) return;

    event.preventDefault();
    event.stopPropagation();
  };

  // Scroll active tab into view when category changes
  useEffect(() => {
    const activeTab = tabRefs.current.get(selectedCategory);
    if (activeTab && tabsContainerRef.current) {
      const container = tabsContainerRef.current;
      const tabRect = activeTab.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      // Calculate scroll position to center the active tab
      const scrollLeft = activeTab.offsetLeft - container.offsetWidth / 2 + activeTab.offsetWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
    }
  }, [selectedCategory]);

  const editingCartItem = editingItemIndex !== null ? cartItems[editingItemIndex] : null;

  const formatPrice = (price: number) => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price);
    } catch {
      return `€${price.toFixed(2)}`;
    }
  };

  const getPrice = (item: MenuItem) => {
    return typeof item.price === 'number'
      ? item.price
      : typeof item.priceCents === 'number'
      ? item.priceCents / 100
      : 0;
  };

  const getSharedPriceLabel = (list: MenuItem[]) => {
    if (list.length === 0) return null;
    const firstPrice = getPrice(list[0]);
    const allSamePrice = list.every((item) => Math.abs(getPrice(item) - firstPrice) < 0.001);
    return allSamePrice ? formatPrice(firstPrice) : null;
  };

  const getModifierOptionPriceDelta = (
    option: NonNullable<CartItem['item']['modifiers']>[number]['options'][number]
  ) => {
    if (typeof option.priceDelta === 'number') return option.priceDelta;
    if (typeof option.priceDeltaCents === 'number') return option.priceDeltaCents / 100;
    return 0;
  };

  const getSelectedModifiersTotal = (cartItem: CartItem) => {
    if (!cartItem.selectedModifiers) return 0;
    return Object.entries(cartItem.selectedModifiers).reduce((sum, [modifierId, optionIds]) => {
      const ids = Array.isArray(optionIds) ? optionIds : [optionIds];
      const modifierOptions = cartItem.item.modifiers?.find((modifier) => modifier.id === modifierId)?.options ?? [];
      return sum + ids.reduce((optionSum, optionId) => {
        const option = modifierOptions.find((opt) => opt.id === optionId);
        return optionSum + (option ? getModifierOptionPriceDelta(option) : 0);
      }, 0);
    }, 0);
  };

  const getCartItemUnitPrice = (cartItem: CartItem) =>
    getPrice(cartItem.item) + getSelectedModifiersTotal(cartItem);

  const cartTotal = cartItems.reduce((sum, item) => {
    return sum + getCartItemUnitPrice(item) * item.quantity;
  }, 0);
  const itemCountLabel =
    cartItems.length === 1
      ? t('menu.item_count_one', { count: cartItems.length, defaultValue: '{{count}} item' })
      : t('menu.item_count_other', { count: cartItems.length, defaultValue: '{{count}} items' });

  const handleCheckout = async () => {
    if (checkoutBusy) return;
    const res = await onCheckout(orderNote);
    if (res) {
      setOrderNote('');
    }
  };

  const handleImmediateCheckout = async () => {
    if (checkoutBusy || !onImmediateCheckout) return;
    const res = await onImmediateCheckout(orderNote);
    if (res) {
      setOrderNote('');
    }
  };

  const handleEditModifiers = (index: number) => {
    setEditingItemIndex(index);
  };

  const handleConfirmEditModifiers = (selectedModifiers: CartItem['selectedModifiers'], qty: number) => {
    if (editingItemIndex !== null) {
      updateItemAt(editingItemIndex, {
        quantity: Math.max(1, qty || 1),
        selectedModifiers,
      });
    }
    setEditingItemIndex(null);
  };

  const handleAddItemClick = (item: MenuItem) => {
    if (item.available === false) return;
    onAddItem(item);
  };

  const minimizeCartSheet = () => {
    if (typeof window === 'undefined') {
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
    info: PanInfo
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
      setOrderNote('');
      setEditingItemIndex(null);
    }
  }, [orderPlacedSignal]);

  useEffect(() => {
    return () => {
      if (cartMinimizeTimerRef.current !== null) {
        window.clearTimeout(cartMinimizeTimerRef.current);
      }
    };
  }, []);

  const handleBellClick = () => {
    setBellDialogOpen(true);
  };

  const handleConfirmCall = () => {
    setBellDialogOpen(false);
    setIsRinging(true);
    onCallClick?.();
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

      const categoryByTitle = categories.find((category) => category.title === item.category);
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
        ((it as unknown as { subcategory?: string; subCategory?: string }).subcategory ??
          (it as unknown as { subCategory?: string }).subCategory ??
          '') ||
        '';
      const key = sub.trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }
    return Array.from(groups.entries()).map(([title, items]) => ({ title, items }));
  };

  const groupedByCategoryId = useMemo(() => {
    const grouped = new Map<string, Array<{ category: Pick<MenuCategory, 'id' | 'title'>; items: MenuItem[] }>>();
    grouped.set(
      'all',
      categories
        .map((category) => ({
          category,
          items: itemsByCategory.get(category.id) ?? [],
        }))
        .filter((entry) => entry.items.length > 0)
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

  const activeCategoryId = allCategories[safeSelectedIndex]?.id ?? categories[0]?.id ?? 'all';
  const visibleGroupedItems = groupedByCategoryId.get(activeCategoryId) ?? [];

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urls = new Set(
      visibleGroupedItems
        .flatMap((group) => group.items)
        .map((item) => item.image)
        .filter((url): url is string => Boolean(url))
        .slice(0, 6)
    );

    if (urls.size === 0) return;

    const timeoutId = window.setTimeout(() => {
      for (const url of urls) {
        const image = new Image();
        image.decoding = 'async';
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
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-30 mb-4 -mx-4 border-b border-border/35 bg-background/95 px-0 py-2 backdrop-blur sm:mx-0 sm:px-3"
      >
        <div className="relative flex items-center overflow-hidden">
          <div
            ref={tabsContainerRef}
            className="relative flex flex-1 items-center gap-2 overflow-x-auto scrollbar-hide scroll-smooth px-4 sm:px-0"
          >
            {allCategories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              const selectedCount = selectedCountByCategory.get(cat.id) ?? 0;
              const hasSelectedItems = selectedCount > 0;
              return (
                <motion.button
                  key={cat.id}
                  ref={(el) => {
                    if (el) tabRefs.current.set(cat.id, el);
                  }}
                  type="button"
                  onClick={() => handleCategorySelect(cat.id)}
                  whileTap={{ scale: 0.97 }}
                  className={`relative h-10 min-w-[88px] shrink-0 rounded-full border px-3 text-center transition-colors duration-200 ${
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : hasSelectedItems
                        ? 'border-primary/45 bg-primary/10 text-foreground'
                        : 'border-border/45 bg-transparent text-muted-foreground hover:border-border hover:text-foreground'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="active-category-pill"
                      className="absolute inset-0 rounded-full bg-primary"
                      transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.8 }}
                    />
                  )}
                  {hasSelectedItems && !isActive && (
                    <span
                      className="absolute right-1 top-1 z-20 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground"
                    >
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
      </motion.div>

      {/* Selected category content */}
      <div
        className="menu-content-frame overflow-x-hidden pb-32"
        onClickCapture={handleContentClickCapture}
      >
        <div className="grid min-w-0">
        <AnimatePresence initial={false} custom={swipeDirection}>
          <motion.div
            key={activeCategoryId}
            custom={swipeDirection}
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            dragMomentum={false}
            dragSnapToOrigin
            onDragStart={handleContentDragStart}
            onDragEnd={handleContentDragEnd}
            initial={(direction: number) => ({
              x: direction > 0 ? '100%' : '-100%',
            })}
            animate={{ x: 0 }}
            exit={(direction: number) => ({
              x: direction > 0 ? '-100%' : '100%',
            })}
            transition={MENU_SWIPE_TRANSITION}
            className="menu-swipe-pane col-start-1 row-start-1 min-w-0 cursor-grab touch-pan-y active:cursor-grabbing"
          >
            {visibleGroupedItems.map((group) => {
              const subgroups = buildSubgroups(group.items);
              const hasNamedSubgroups = subgroups.some((s) => s.title);

              return (
                <section key={group.category.id} className="menu-section mb-10">
                  {activeCategoryId === 'all' && (
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
                            fallbackLabel={t('menu.item', { defaultValue: 'Item' })}
                            addItemLabel={t('menu.add_to_cart', { defaultValue: 'Add to cart' })}
                            active
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
                                  fallbackLabel={t('menu.item', { defaultValue: 'Item' })}
                                  addItemLabel={t('menu.add_to_cart', { defaultValue: 'Add to cart' })}
                                  active
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
                        fallbackLabel={t('menu.item', { defaultValue: 'Item' })}
                        addItemLabel={t('menu.add_to_cart', { defaultValue: 'Add to cart' })}
                        active
                        selectedQuantities={selectedQuantities}
                      />
                  )}
                </section>
              );
            })}
          </motion.div>
        </AnimatePresence>
        </div>
      </div>

      {/* Bottom menu controls */}
      <div
        className={`fixed left-4 right-4 z-50 flex justify-center pointer-events-none transition-[bottom] duration-300 ${
          cartBottomOffset === 'raised'
            ? 'bottom-[calc(6rem+env(safe-area-inset-bottom))]'
            : 'bottom-[calc(1rem+env(safe-area-inset-bottom))]'
        }`}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.15 }}
          className="pointer-events-auto grid w-full max-w-lg grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2 rounded-full border border-border/25 bg-card/80 p-1.5 shadow-xl backdrop-blur-md"
        >
          {showBackButton ? (
            <motion.button
              type="button"
              onClick={onBack}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              aria-label={t('common.back', { defaultValue: 'Back' })}
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
              onClick={() => setCartOpen(true)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="relative flex h-12 min-w-0 items-center justify-center gap-2 rounded-full bg-primary px-4 text-primary-foreground shadow-sm transition-all duration-300 hover:shadow-md"
            >
              <div className="relative shrink-0">
                <ShoppingCart className="h-5 w-5" />
                {cartItems.length > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground ring-1 ring-primary"
                  >
                    {cartItems.length}
                  </motion.span>
                )}
              </div>
              <span className="min-w-0 truncate text-sm font-semibold tracking-tight">
                {cartItems.length > 0
                  ? `${formatPrice(cartTotal)} · ${primaryCtaLabel || t('menu.checkout', { defaultValue: 'Place Order' })}`
                  : t('menu.cart', { defaultValue: 'Cart' })}
              </span>
            </motion.button>
          ) : (
            <div aria-hidden="true" />
          )}

          {/* Call Waiter Button */}
          <motion.button
            type="button"
            onClick={handleBellClick}
            disabled={callStatus === 'pending'}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 ${
              callStatus === 'pending' 
                ? 'bg-primary/15 text-primary cursor-wait' 
                : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {(callStatus === 'pending' || callStatus === 'accepted' || isRinging) && (
              <span className="absolute inset-0 rounded-full bg-primary/15 animate-ping" />
            )}
            <Bell className={`relative h-5 w-5 ${isRinging ? 'animate-[wiggle_0.5s_ease-in-out_infinite]' : ''}`} />
          </motion.button>
        </motion.div>
      </div>

      {/* Call Waiter Confirmation Dialog */}
      <AlertDialog open={bellDialogOpen} onOpenChange={setBellDialogOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              {t('menu.call_waiter', { defaultValue: 'Call Waiter' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('menu.call_waiter_description', { defaultValue: 'This will notify a waiter that you need assistance at your table. They will come to you shortly.' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel', { defaultValue: 'Cancel' })}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCall}>
              {t('menu.yes_call', { defaultValue: 'Yes, Call Waiter' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cart Modal */}
      {showCartButton && (
      <Dialog open={cartOpen} onOpenChange={handleCartOpenChange}>
        <DialogContent
          motionProps={{
            animate: cartSheetMinimizing
              ? { opacity: 0.96, scale: 0.98, y: '104%' }
              : { opacity: 1, scale: 1, y: 0 },
            drag: 'y',
            dragControls: cartDragControls,
            dragDirectionLock: true,
            dragConstraints: { top: 0, bottom: 0 },
            dragElastic: { top: 0, bottom: 0.36 },
            dragListener: true,
            dragMomentum: false,
            dragTransition: { bounceStiffness: 420, bounceDamping: 36 },
            onDragEnd: handleCartSheetDragEnd,
            transition: cartSheetMinimizing
              ? {
                  duration: CART_MINIMIZE_ANIMATION_MS / 1000,
                  ease: [0.32, 0.72, 0, 1],
                }
              : { type: 'spring', stiffness: 350, damping: 28, mass: 0.8 },
            whileDrag: { scale: 0.995 },
          }}
          className="!left-0 !right-0 !bottom-0 !top-auto h-[85dvh] max-h-[100dvh] !w-[100dvw] !max-w-none overflow-hidden rounded-t-3xl border-x-0 border-b-0 p-0 ![translate:0_0] xl:!left-1/2 xl:!right-auto xl:!bottom-auto xl:!top-1/2 xl:h-auto xl:max-h-[90dvh] xl:!w-auto xl:!max-w-2xl xl:rounded-lg xl:border xl:![translate:-50%_-50%]"
        >
          <DialogTitle className="sr-only">
            {t('menu.your_order', { defaultValue: 'Your Order' })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('menu.cart_summary', { defaultValue: 'Cart summary and checkout' })}
          </DialogDescription>
          <Card className="h-full min-h-0 min-w-0 overflow-hidden border-0 shadow-none flex flex-col">
            <div className="cursor-grab touch-none bg-gradient-to-br from-primary/10 to-accent/10 p-3 sm:p-4 border-b border-border/40 active:cursor-grabbing">
              <div className="flex justify-center pt-1 pb-2" aria-hidden="true">
                <div className="h-1.5 w-12 rounded-full bg-muted" />
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/20">
                  <ShoppingCart className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    {t('menu.your_order', { defaultValue: 'Your Order' })}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {itemCountLabel}
                  </p>
                </div>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              {cartItems.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
                    <ShoppingCart className="h-10 w-10 text-muted-foreground/50" />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {t('menu.cart_empty', { defaultValue: 'Your cart is empty' })}
                  </p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {cartItems.map((cartItem, idx) => {
                    const itemTotal = getCartItemUnitPrice(cartItem) * cartItem.quantity;
                    const displayName =
                      cartItem.item.displayName ??
                      cartItem.item.name ??
                      cartItem.item.title ??
                      t('menu.item', { defaultValue: 'Item' });
                    const hasModifiers = cartItem.selectedModifiers && Object.keys(cartItem.selectedModifiers).length > 0;
                    
                    return (
                      <div
                        key={`${cartItem.item.id}-${idx}`}
                        className="relative group min-w-0 overflow-hidden bg-muted/20 rounded-lg p-2 border border-border/30 hover:border-primary/30 transition-all duration-300"
                      >
                        <button
                          aria-label={t('menu.remove_item', { defaultValue: 'Remove item' })}
                          onClick={() => removeItemAt(idx)}
                          className="absolute right-2 top-2 z-10 rounded-full bg-destructive p-1.5 text-destructive-foreground shadow-lg hover:scale-110"
                        >
                          <X className="h-3 w-3" />
                        </button>

                        <div className="flex min-w-0 gap-2 pr-8">
                          <img
                            src={cartItem.item.image}
                            alt={displayName}
                            loading="lazy"
                            decoding="async"
                            className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <h4 className="font-semibold text-sm text-foreground truncate">{displayName}</h4>
                              <span className="max-w-[34vw] shrink-0 truncate text-sm font-medium text-primary sm:max-w-none">
                                {formatPrice(itemTotal)}
                              </span>
                            </div>
                            <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => updateQuantityAt(idx, Math.max(1, cartItem.quantity - 1))}
                                  className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-foreground hover:bg-primary/20 transition-colors"
                                >
                                  -
                                </button>
                                <span className="text-sm font-medium w-4 text-center">{cartItem.quantity}</span>
                                <button
                                  onClick={() => updateQuantityAt(idx, cartItem.quantity + 1)}
                                  className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-foreground hover:bg-primary/20 transition-colors"
                                >
                                  +
                                </button>
                              </div>
                              {hasModifiers && (
                                <button
                                  onClick={() => handleEditModifiers(idx)}
                                  className="min-w-0 text-xs text-primary hover:underline flex items-center gap-1"
                                >
                                  <Pencil className="h-3 w-3" />
                                  <span className="truncate">{t('menu.edit', { defaultValue: 'Edit' })}</span>
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
            </ScrollArea>

            {cartItems.length > 0 && (
              <div className="shrink-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-border/40 space-y-4 bg-card/50">
                <Textarea
                  placeholder={t('menu.order_note_placeholder', { defaultValue: 'Add a note to your order...' })}
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  className="min-h-[60px] resize-none"
                />
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="text-lg font-bold">{t('menu.total', { defaultValue: 'Total' })}</span>
                  <span className="min-w-0 truncate text-lg font-bold text-primary">{formatPrice(cartTotal)}</span>
                </div>
                <div className="flex min-w-0 gap-2">
                  <Button
                    onClick={handleCheckout}
                    disabled={checkoutBusy}
                    className="min-w-0 flex-1 h-12 text-base font-semibold"
                  >
                    {checkoutBusy ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        {showPaymentButton ? (
                          <CreditCard className="h-5 w-5 mr-2" />
                        ) : (
                          <ShoppingCart className="h-5 w-5 mr-2" />
                        )}
                        <span className="min-w-0 truncate">
                          {primaryCtaLabel || t('menu.checkout', { defaultValue: 'Place Order' })}
                        </span>
                      </>
                    )}
                  </Button>
                  {showPaymentButton && onImmediateCheckout && (
                    <Button
                      onClick={handleImmediateCheckout}
                      disabled={checkoutBusy}
                      variant="outline"
                      className="h-12"
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
        />
      )}
    </>
  );
};
