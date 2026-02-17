import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import useEmblaCarousel from 'embla-carousel-react';
import type { MenuItem, MenuCategory } from '@/types';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ShoppingCart, Bell, Loader2, X, CreditCard, Zap, Pencil } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { useCartStore } from '@/store/cartStore';
import { ModifierDialog } from './ModifierDialog';
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

  // Content carousel for swipeable menu pages
  const [contentEmblaRef, contentEmblaApi] = useEmblaCarousel({ 
    startIndex: safeSelectedIndex,
    loop: false,
    skipSnaps: false,
  });

  // Sync category selection with carousel
  useEffect(() => {
    if (!contentEmblaApi) return;
    
    const onSelect = () => {
      const index = contentEmblaApi.selectedScrollSnap();
      if (allCategories[index] && allCategories[index].id !== selectedCategory) {
        onCategoryChange(allCategories[index].id);
      }
    };

    contentEmblaApi.on('select', onSelect);
    return () => {
      contentEmblaApi.off('select', onSelect);
    };
  }, [contentEmblaApi, allCategories, selectedCategory, onCategoryChange]);

  // Scroll carousel when category tab is clicked
  useEffect(() => {
    if (!contentEmblaApi) return;
    const targetIndex = allCategories.findIndex(c => c.id === selectedCategory);
    if (targetIndex >= 0 && contentEmblaApi.selectedScrollSnap() !== targetIndex) {
      contentEmblaApi.scrollTo(targetIndex);
    }
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

  const cartTotal = cartItems.reduce((sum, item) => {
    const price = getPrice(item.item);
    return sum + price * item.quantity;
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

  return (
    <>
      {/* Luxury Category Navigation */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative mb-6"
      >
        <div 
          ref={tabsContainerRef}
          className="relative flex gap-2 overflow-x-auto pb-2 items-center scrollbar-hide scroll-smooth"
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="shrink-0 h-10 w-10 rounded-full bg-card/80 backdrop-blur-md border border-border/20 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          
          {allCategories.map((cat, idx) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03, duration: 0.25 }}
            >
              <Button
                ref={(el) => {
                  if (el) tabRefs.current.set(cat.id, el);
                }}
                variant={selectedCategory === cat.id ? "default" : "ghost"}
                onClick={() => onCategoryChange(cat.id)}
                className={`shrink-0 rounded-full h-9 px-5 text-sm tracking-wide transition-all duration-300 whitespace-nowrap ${
                  selectedCategory === cat.id
                    ? 'shadow-md shadow-primary/20 font-medium'
                    : 'bg-card/60 backdrop-blur-md border border-border/15 hover:bg-card/80 hover:border-primary/20 font-normal text-muted-foreground'
                }`}
              >
                {cat.title}
              </Button>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Swipeable Content Carousel */}
      <div className="overflow-hidden pb-32" ref={contentEmblaRef}>
        <div className="flex">
          {allCategories.map((cat, catIdx) => {
            const shouldRenderSlide = Math.abs(catIdx - safeSelectedIndex) <= 2;
            const groupedItems = shouldRenderSlide
              ? groupedByCategoryId.get(cat.id) ?? []
              : [];
            
            return (
              <div
                key={cat.id}
                className="flex-[0_0_100%] min-w-0 px-1"
              >
                {!shouldRenderSlide ? (
                  <div className="min-h-[50vh]" aria-hidden="true" />
                ) : (
                  groupedItems.map((group) => (
                    <div key={group.category.id}>
                      {cat.id === 'all' && (
                        <div className="relative flex items-center gap-4 my-8">
                          {/* Elegant category divider */}
                          <div className="flex-1 flex items-center gap-2">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-border/30" />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                          </div>
                          <h2 className="text-lg font-semibold text-foreground tracking-wide uppercase px-2">
                            {group.category.title}
                          </h2>
                          <div className="flex-1 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                            <div className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-border/30" />
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-8">
                        {group.items.map((item) => {
                          const price = getPrice(item);
                          const displayName = item.name ?? item.title ?? t('menu.item', { defaultValue: 'Item' });

                          return (
                            <Card
                              key={item.id}
                              className="group relative overflow-hidden rounded-2xl border-0 bg-card/40 backdrop-blur-sm hover:bg-card/60 transition-all duration-500 cursor-pointer shadow-lg hover:shadow-2xl hover:-translate-y-1"
                              onClick={() => handleAddItemClick(item)}
                            >
                              {/* Image container with luxury overlay */}
                              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
                                <img
                                  src={item.image}
                                  alt={displayName}
                                  loading="lazy"
                                  decoding="async"
                                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                />
                                
                                {/* Premium gradient overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10 pointer-events-none" />
                                
                                {/* Subtle top shine */}
                                <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                                
                                {/* Content overlay at bottom */}
                                <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                                  {/* Title with elegant typography */}
                                  <h3 className="font-semibold text-sm sm:text-base text-white drop-shadow-lg leading-tight mb-2 line-clamp-2 tracking-tight">
                                    {displayName}
                                  </h3>
                                  
                                  {/* Price with luxury styling */}
                                  <div className="flex items-center justify-between">
                                    <span className="text-lg sm:text-xl font-bold text-white drop-shadow-lg tracking-tight">
                                      {formatPrice(price)}
                                    </span>
                                    
                                    {/* Subtle add indicator */}
                                    <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:scale-110">
                                      <span className="text-white text-lg font-light">+</span>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Corner accent */}
                                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg">
                                  <span className="text-primary-foreground text-xs font-bold">+</span>
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ))
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
          className="pointer-events-auto flex items-center gap-2 px-2 py-1.5 rounded-full bg-card/70 backdrop-blur-xl border border-border/20 shadow-lg"
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
                    const price = getPrice(cartItem.item);
                    const itemTotal = price * cartItem.quantity;
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
