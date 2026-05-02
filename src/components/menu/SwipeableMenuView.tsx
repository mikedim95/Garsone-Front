import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import useEmblaCarousel from 'embla-carousel-react';
import type { CartItem, MenuItem, MenuCategory } from '@/types';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ShoppingCart, Bell, Loader2, X, CreditCard, Zap, Pencil } from 'lucide-react';
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
}

interface ItemGridProps {
  items: MenuItem[];
  onAdd: (item: MenuItem) => void;
  formatPrice: (n: number) => string;
  getPrice: (item: MenuItem) => number;
  fallbackLabel: string;
  active?: boolean;
}

const MENU_CARD_IMAGE_SIZES = '(min-width: 1024px) 220px, (min-width: 640px) 33vw, 50vw';

const ItemGrid = ({ items, onAdd, formatPrice, getPrice, fallbackLabel, active = false }: ItemGridProps) => (
  <div className="grid grid-cols-2 gap-3 sm:gap-4 [content-visibility:auto] [contain-intrinsic-size:1px_600px]">
    {items.map((item, index) => {
      const price = getPrice(item);
      const displayName = item.name ?? item.title ?? fallbackLabel;
      const unavailable = item.available === false;
      const eagerImage = active && index < 4;
      return (
        <Card
          key={item.id}
          interactive={false}
          className={`menu-item-card group relative overflow-hidden rounded-2xl border border-border/30 bg-card shadow-sm ${
            unavailable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary/30'
          }`}
          style={{ contain: 'layout paint style' }}
          onClick={() => onAdd(item)}
        >
          <div className="relative aspect-[4/5] overflow-hidden">
            {item.image ? (
              <img
                src={item.image}
                alt={displayName}
                width={320}
                height={400}
                sizes={MENU_CARD_IMAGE_SIZES}
                loading={eagerImage ? 'eager' : 'lazy'}
                decoding="async"
                fetchPriority={eagerImage ? 'high' : 'low'}
                draggable={false}
                className="menu-card-image w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-muted/60 to-muted/20" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
              <h3 className="font-semibold text-[13px] sm:text-sm text-white drop-shadow leading-snug mb-1.5 line-clamp-2 tracking-tight">
                {displayName}
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-base sm:text-lg font-semibold text-white drop-shadow tabular-nums">
                  {formatPrice(price)}
                </span>
                <div className="w-7 h-7 rounded-full bg-white/25 border border-white/30 flex items-center justify-center group-hover:bg-primary group-hover:border-primary">
                  <span className="text-white text-base font-light leading-none">+</span>
                </div>
              </div>
            </div>
          </div>
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
  showCartButton = true,
  primaryCtaLabel,
}: Props) => {
  const { t } = useTranslation();
  const cartItems = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const updateItemModifiers = useCartStore((state) => state.updateItemModifiers);
  
  const [cartOpen, setCartOpen] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [isRinging, setIsRinging] = useState(false);
  const [bellDialogOpen, setBellDialogOpen] = useState(false);
  const [contentDragging, setContentDragging] = useState(false);
  
  // Ref for category tabs container to scroll active tab into view
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  
  const currency = typeof window !== 'undefined' ? window.localStorage.getItem('CURRENCY') || 'EUR' : 'EUR';

  // Category tabs with "All" prepended
  const allCategories = useMemo(
    () => [{ id: 'all', title: t('menu.category_all', { defaultValue: 'All' }) }, ...categories],
    [categories, t]
  );
  const selectedIndex = allCategories.findIndex(c => c.id === selectedCategory);
  const safeSelectedIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const initialEmblaIndexRef = useRef(safeSelectedIndex);
  const carouselOptions = useMemo(
    () => ({
      startIndex: initialEmblaIndexRef.current,
      loop: false,
      // Hard snap to the nearest slide — prevents the tab/carousel ping-pong.
      skipSnaps: false,
      duration: 20,
      align: 'start' as const,
    }),
    []
  );

  // Content carousel for swipeable menu pages
  const [contentEmblaRef, contentEmblaApi] = useEmblaCarousel(carouselOptions);

  // Track whether the most recent carousel movement was driven by a tab click
  // (vs. a real user swipe). When it's programmatic, we ignore the resulting
  // `select` event so we don't fight against the parent's `selectedCategory`
  // and cause the back-and-forth glitch.
  const programmaticScrollRef = useRef(false);

  // User swipe → notify parent of the new category.
  useEffect(() => {
    if (!contentEmblaApi) return;

    const onSelect = () => {
      if (programmaticScrollRef.current) return;
      const index = contentEmblaApi.selectedScrollSnap();
      const next = allCategories[index];
      if (next && next.id !== selectedCategory) {
        onCategoryChange(next.id);
      }
    };
    const onSettle = () => {
      // Re-enable user-driven sync once any programmatic animation has finished.
      programmaticScrollRef.current = false;
    };

    contentEmblaApi.on('select', onSelect);
    contentEmblaApi.on('settle', onSettle);
    return () => {
      contentEmblaApi.off('select', onSelect);
      contentEmblaApi.off('settle', onSettle);
    };
  }, [contentEmblaApi, allCategories, selectedCategory, onCategoryChange]);

  useEffect(() => {
    if (!contentEmblaApi) return;

    let pointerUpTimeout: number | undefined;
    const onPointerDown = () => setContentDragging(true);
    const onPointerUp = () => {
      window.clearTimeout(pointerUpTimeout);
      pointerUpTimeout = window.setTimeout(() => setContentDragging(false), 320);
    };
    const onSettle = () => {
      window.clearTimeout(pointerUpTimeout);
      setContentDragging(false);
    };

    contentEmblaApi.on('pointerDown', onPointerDown);
    contentEmblaApi.on('pointerUp', onPointerUp);
    contentEmblaApi.on('settle', onSettle);
    return () => {
      window.clearTimeout(pointerUpTimeout);
      contentEmblaApi.off('pointerDown', onPointerDown);
      contentEmblaApi.off('pointerUp', onPointerUp);
      contentEmblaApi.off('settle', onSettle);
    };
  }, [contentEmblaApi]);

  // Tab click / external category change → scroll carousel to match.
  useEffect(() => {
    if (!contentEmblaApi) return;
    const targetIndex = allCategories.findIndex((c) => c.id === selectedCategory);
    if (targetIndex < 0) return;
    if (contentEmblaApi.selectedScrollSnap() === targetIndex) return;
    programmaticScrollRef.current = true;
    contentEmblaApi.scrollTo(targetIndex);
  }, [selectedCategory, contentEmblaApi, allCategories]);

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

  const getModifierOptionPriceDelta = (
    option: NonNullable<CartItem['item']['modifiers']>[number]['options'][number]
  ) => {
    if (typeof option.priceDelta === 'number') return option.priceDelta;
    if (typeof option.priceDeltaCents === 'number') return option.priceDeltaCents / 100;
    return 0;
  };

  const getSelectedModifiersTotal = (cartItem: CartItem) => {
    if (!cartItem.selectedModifiers) return 0;
    return Object.entries(cartItem.selectedModifiers).reduce((sum, [modifierId, optionId]) => {
      const option = cartItem.item.modifiers
        ?.find((modifier) => modifier.id === modifierId)
        ?.options.find((opt) => opt.id === optionId);
      return sum + (option ? getModifierOptionPriceDelta(option) : 0);
    }, 0);
  };

  const getCartItemUnitPrice = (cartItem: CartItem) =>
    getPrice(cartItem.item) + getSelectedModifiersTotal(cartItem);

  const cartTotal = cartItems.reduce((sum, item) => {
    return sum + getCartItemUnitPrice(item) * item.quantity;
  }, 0);

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

  const handleConfirmEditModifiers = (selectedModifiers: Record<string, string>, qty: number) => {
    if (editingItemIndex !== null) {
      updateItemModifiers(editingItemIndex, selectedModifiers);
      if (qty !== cartItems[editingItemIndex].quantity) {
        updateQuantity(cartItems[editingItemIndex].item.id, qty);
      }
    }
    setEditingItemIndex(null);
  };

  const handleAddItemClick = (item: MenuItem) => {
    if (item.available === false) return;
    onAddItem(item);
  };

  useEffect(() => {
    if (openCartSignal > 0) {
      setCartOpen(true);
    }
  }, [openCartSignal]);

  useEffect(() => {
    if (orderPlacedSignal > 0) {
      setCartOpen(false);
      setOrderNote('');
      setEditingItemIndex(null);
    }
  }, [orderPlacedSignal]);

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

  const imageUrlsByCategoryId = useMemo(() => {
    const mapped = new Map<string, string[]>();
    const allUrls: string[] = [];

    for (const category of categories) {
      const urls = (itemsByCategory.get(category.id) ?? [])
        .map((item) => item.image)
        .filter((url): url is string => Boolean(url));
      mapped.set(category.id, urls);
      allUrls.push(...urls);
    }

    mapped.set('all', allUrls);
    return mapped;
  }, [categories, itemsByCategory]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urls = new Set<string>();
    for (const index of [safeSelectedIndex - 1, safeSelectedIndex + 1]) {
      const category = allCategories[index];
      if (!category) continue;
      for (const url of (imageUrlsByCategoryId.get(category.id) ?? []).slice(0, 6)) {
        urls.add(url);
      }
    }

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
  }, [safeSelectedIndex, allCategories, imageUrlsByCategoryId]);

  return (
    <>
      {/* Refined Category Navigation */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className={`sticky top-0 z-30 px-4 pt-3 pb-3 mb-4 border-b border-border/40 transition-[background-color,backdrop-filter] duration-150 ${
          contentDragging ? 'bg-background/95 backdrop-blur-0' : 'bg-background/80 backdrop-blur-md'
        }`}
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label={t('common.back', { defaultValue: 'Back' })}
            className="shrink-0 h-10 w-10 rounded-full hover:bg-muted/60 text-foreground/70 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div
            ref={tabsContainerRef}
            className="relative flex gap-1.5 overflow-x-auto items-center scrollbar-hide scroll-smooth flex-1"
          >
            {allCategories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  ref={(el) => {
                    if (el) tabRefs.current.set(cat.id, el);
                  }}
                  type="button"
                  onClick={() => onCategoryChange(cat.id)}
                  className={`relative shrink-0 h-9 px-4 text-[13px] tracking-wide whitespace-nowrap rounded-full transition-colors duration-200 ${
                    isActive
                      ? 'text-primary-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground font-normal'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="active-category-pill"
                      className="absolute inset-0 rounded-full bg-primary shadow-sm"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{cat.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Swipeable Content Carousel */}
      <div className="menu-swipe-viewport overflow-hidden pb-32" ref={contentEmblaRef}>
        <div className="menu-swipe-container flex">
          {allCategories.map((cat, catIdx) => {
            const shouldRenderSlide = Math.abs(catIdx - safeSelectedIndex) <= 1;
            const isActiveSlide = catIdx === safeSelectedIndex;
            const groupedItems = shouldRenderSlide
              ? groupedByCategoryId.get(cat.id) ?? []
              : [];
            
            return (
              <div
                key={cat.id}
                className="menu-swipe-slide flex-[0_0_100%] min-w-0 overflow-hidden"
              >
                {!shouldRenderSlide ? (
                  <div className="min-h-[50vh]" aria-hidden="true" />
                ) : (
                  groupedItems.map((group) => {
                    const subgroups = buildSubgroups(group.items);
                    const hasNamedSubgroups = subgroups.some((s) => s.title);

                    return (
                      <section key={group.category.id} className="menu-section mb-10">
                        {cat.id === 'all' && (
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
                            {/* Items without a subcategory go first, ungrouped */}
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
                                  active={isActiveSlide}
                                />
                              ))}
                            {subgroups
                              .filter((s) => s.title)
                              .map((s) => (
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
                                      active={isActiveSlide}
                                    />
                                  </AccordionContent>
                                </AccordionItem>
                              ))}
                          </Accordion>
                        ) : (
                          <ItemGrid
                            items={group.items}
                            onAdd={handleAddItemClick}
                            formatPrice={formatPrice}
                            getPrice={getPrice}
                            fallbackLabel={t('menu.item', { defaultValue: 'Item' })}
                            active={isActiveSlide}
                          />
                        )}
                      </section>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Delicate Floating Action Bar */}
      <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center pointer-events-none">
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.15 }}
          className={`pointer-events-auto flex items-center gap-2 px-2 py-1.5 rounded-full border border-border/20 shadow-lg transition-[background-color,backdrop-filter] duration-150 ${
            contentDragging ? 'bg-card/95 backdrop-blur-0' : 'bg-card/70 backdrop-blur-md'
          }`}
        >
          {/* Call Waiter Button - Minimal */}
          <motion.button
            type="button"
            onClick={handleBellClick}
            disabled={callStatus === 'pending'}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`relative flex items-center justify-center h-10 w-10 rounded-full transition-all duration-300 ${
              callStatus === 'pending' 
                ? 'bg-primary/15 text-primary cursor-wait' 
                : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {(callStatus === 'pending' || callStatus === 'accepted' || isRinging) && (
              <span className="absolute inset-0 rounded-full bg-primary/15 animate-ping" />
            )}
            <Bell className={`h-4 w-4 relative ${isRinging ? 'animate-[wiggle_0.5s_ease-in-out_infinite]' : ''}`} />
          </motion.button>

          {/* Cart Button - Compact */}
          {showCartButton && (
            <motion.button
              onClick={() => setCartOpen(true)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="relative flex items-center gap-2 h-10 pl-3 pr-4 rounded-full bg-primary text-primary-foreground font-medium transition-all duration-300 shadow-sm hover:shadow-md"
            >
              <div className="relative">
                <ShoppingCart className="h-4 w-4" />
                {cartItems.length > 0 && (
                  <motion.span 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-accent text-accent-foreground text-[9px] font-bold flex items-center justify-center ring-1 ring-primary"
                  >
                    {cartItems.length}
                  </motion.span>
                )}
              </div>
              {cartItems.length > 0 ? (
                <span className="text-sm font-semibold tracking-tight">{formatPrice(cartTotal)}</span>
              ) : (
                <span className="text-sm font-medium">{t('menu.cart', { defaultValue: 'Cart' })}</span>
              )}
            </motion.button>
          )}
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
            <AlertDialogCancel>{t('common.cancel', { defaultValue: 'Cancel' })}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCall}>
              {t('menu.yes_call', { defaultValue: 'Yes, Call Waiter' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cart Modal */}
      {showCartButton && (
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="w-[95vw] sm:w-auto max-w-2xl h-[85vh] sm:h-auto sm:max-h-[90vh] overflow-hidden p-0 bottom-0 top-auto left-1/2 [translate:-50%_0] sm:top-1/2 sm:bottom-auto sm:[translate:-50%_-50%] rounded-t-3xl sm:rounded-lg">
          <DialogTitle className="sr-only">
            {t('menu.your_order', { defaultValue: 'Your Order' })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('menu.cart_summary', { defaultValue: 'Cart summary and checkout' })}
          </DialogDescription>
          <Card className="border-0 shadow-none h-full flex flex-col">
            <div className="bg-gradient-to-br from-primary/10 to-accent/10 p-3 sm:p-4 border-b border-border/40">
              <div className="sm:hidden flex justify-center pt-1 pb-2" aria-hidden="true">
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
                    {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'}
                  </p>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1">
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
                    const displayName = cartItem.item.name ?? cartItem.item.title ?? t('menu.item', { defaultValue: 'Item' });
                    const hasModifiers = cartItem.selectedModifiers && Object.keys(cartItem.selectedModifiers).length > 0;
                    
                    return (
                      <div
                        key={`${cartItem.item.id}-${idx}`}
                        className="relative group bg-muted/20 rounded-lg p-2 border border-border/30 hover:border-primary/30 transition-all duration-300"
                      >
                        <button
                          aria-label={t('menu.remove_item', { defaultValue: 'Remove item' })}
                          onClick={() => removeItem(cartItem.item.id)}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1.5 shadow-lg hover:scale-110 z-10"
                        >
                          <X className="h-3 w-3" />
                        </button>

                        <div className="flex gap-2">
                          <img
                            src={cartItem.item.image}
                            alt={displayName}
                            loading="lazy"
                            decoding="async"
                            className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <h4 className="font-semibold text-sm text-foreground truncate">{displayName}</h4>
                              <span className="text-sm font-medium text-primary whitespace-nowrap">
                                {formatPrice(itemTotal)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => updateQuantity(cartItem.item.id, Math.max(1, cartItem.quantity - 1))}
                                  className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-foreground hover:bg-primary/20 transition-colors"
                                >
                                  -
                                </button>
                                <span className="text-sm font-medium w-4 text-center">{cartItem.quantity}</span>
                                <button
                                  onClick={() => updateQuantity(cartItem.item.id, cartItem.quantity + 1)}
                                  className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-foreground hover:bg-primary/20 transition-colors"
                                >
                                  +
                                </button>
                              </div>
                              {hasModifiers && (
                                <button
                                  onClick={() => handleEditModifiers(idx)}
                                  className="text-xs text-primary hover:underline flex items-center gap-1"
                                >
                                  <Pencil className="h-3 w-3" />
                                  {t('menu.edit', { defaultValue: 'Edit' })}
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
              <div className="p-4 border-t border-border/40 space-y-4 bg-card/50">
                <Textarea
                  placeholder={t('menu.order_note_placeholder', { defaultValue: 'Add a note to your order...' })}
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  className="min-h-[60px] resize-none"
                />
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">{t('menu.total', { defaultValue: 'Total' })}</span>
                  <span className="text-lg font-bold text-primary">{formatPrice(cartTotal)}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCheckout}
                    disabled={checkoutBusy}
                    className="flex-1 h-12 text-base font-semibold"
                  >
                    {checkoutBusy ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <CreditCard className="h-5 w-5 mr-2" />
                        {primaryCtaLabel || t('menu.checkout', { defaultValue: 'Place Order' })}
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
