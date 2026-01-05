import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useEmblaCarousel from 'embla-carousel-react';
import type { MenuItem, MenuCategory } from '@/types';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ShoppingCart, Bell, Loader2, X, CreditCard, Zap, Pencil } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { useCartStore } from '@/store/cartStore';
import { ModifierDialog } from './ModifierDialog';

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
}

const matchesCategory = (
  item: MenuItem,
  categoryId: string,
  categories: Array<Pick<MenuCategory, 'id' | 'title'>>
): boolean => {
  if (categoryId === 'all') return true;
  if (item.categoryId === categoryId) return true;
  const category = categories.find((cat) => cat.id === categoryId);
  return category ? item.category === category.title : false;
};

export const SwipeableMenuView = ({
  categories,
  items,
  selectedCategory,
  onCategoryChange,
  onBack,
  onAddItem,
  onCheckout,
  onImmediateCheckout,
  callButtonLabel,
  callStatus = 'idle',
  callPrompted = false,
  onCallClick,
  checkoutBusy = false,
  openCartSignal = 0,
  orderPlacedSignal = 0,
  showPaymentButton = true,
  primaryCtaLabel,
  secondaryCtaLabel,
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
  
  const currency = typeof window !== 'undefined' ? window.localStorage.getItem('CURRENCY') || 'EUR' : 'EUR';

  // Category tabs with "All" prepended
  const allCategories = [{ id: 'all', title: t('menu.category_all', { defaultValue: 'All' }) }, ...categories];
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

  const handleInitiateCall = () => {
    setIsRinging(true);
    onCallClick?.();
    setTimeout(() => {
      setIsRinging(false);
    }, 2000);
  };

  const itemCountLabel =
    cartItems.length === 1
      ? t('menu.item', { defaultValue: '1 item' })
      : t('menu.items', { defaultValue: `${cartItems.length} items` });

  // Get items for a specific category
  const getItemsForCategory = (categoryId: string) => {
    if (categoryId === 'all') return items;
    return items.filter((item) => matchesCategory(item, categoryId, categories));
  };

  // Group items by category for "All" view
  const getGroupedItems = (categoryId: string) => {
    if (categoryId === 'all') {
      return categories.map((cat) => ({
        category: cat,
        items: items.filter((item) => matchesCategory(item, cat.id, categories))
      })).filter(group => group.items.length > 0);
    }
    return [{ 
      category: categories.find(c => c.id === categoryId) || { id: categoryId, title: '' }, 
      items: getItemsForCategory(categoryId) 
    }];
  };

  return (
    <>
      {/* Luxury Category Navigation */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative mb-6"
      >
        {/* Decorative line */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
        
        <div className="relative flex gap-2 overflow-x-auto pb-2 items-center scrollbar-hide">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="shrink-0 h-11 w-11 rounded-full bg-card/90 backdrop-blur-md border border-border/30 shadow-lg hover:shadow-xl hover:border-primary/40 transition-all duration-300"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          
          {allCategories.map((cat, idx) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.3 }}
            >
              <Button
                variant={selectedCategory === cat.id ? "default" : "ghost"}
                onClick={() => onCategoryChange(cat.id)}
                className={`shrink-0 rounded-full h-11 px-6 text-sm tracking-wide transition-all duration-400 ${
                  selectedCategory === cat.id
                    ? 'shadow-xl shadow-primary/30 font-semibold'
                    : 'bg-card/70 backdrop-blur-md border border-border/20 hover:bg-card hover:border-primary/30 font-medium'
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
          {allCategories.map((cat) => {
            const groupedItems = getGroupedItems(cat.id);
            
            return (
              <div
                key={cat.id}
                className="flex-[0_0_100%] min-w-0 px-1"
              >
                {groupedItems.map((group) => (
                  <div key={group.category.id}>
                    {cat.id === 'all' && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="relative flex items-center gap-4 my-8"
                      >
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
                      </motion.div>
                    )}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-8">
                      {group.items.map((item, itemIdx) => {
                        const price = getPrice(item);
                        const displayName = item.name ?? item.title ?? t('menu.item', { defaultValue: 'Item' });

                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: itemIdx * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <Card
                              className="group relative overflow-hidden rounded-2xl border-0 bg-card/40 backdrop-blur-sm hover:bg-card/60 transition-all duration-500 cursor-pointer shadow-lg hover:shadow-2xl hover:-translate-y-1"
                              onClick={() => handleAddItemClick(item)}
                            >
                              {/* Image container with luxury overlay */}
                              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
                                <img
                                  src={item.image}
                                  alt={displayName}
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
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Luxury Floating Action Bar */}
      <div className="fixed bottom-6 left-4 right-4 z-50 flex justify-center">
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 25, delay: 0.2 }}
          className="relative flex items-center gap-4 px-4 py-3 rounded-2xl bg-card/90 backdrop-blur-2xl border border-border/40 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)]"
        >
          {/* Subtle glow effect */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/5 via-transparent to-primary/5 pointer-events-none" />
          
          {/* Call Waiter Button */}
          <motion.button
            type="button"
            onClick={handleInitiateCall}
            disabled={callStatus === 'pending'}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            className={`relative flex items-center justify-center h-12 w-12 rounded-xl transition-all duration-300 ${
              callStatus === 'pending' 
                ? 'bg-primary/20 text-primary cursor-wait' 
                : 'bg-muted/80 hover:bg-primary/15 text-foreground hover:text-primary border border-border/30'
            }`}
          >
            {(callStatus === 'pending' || callStatus === 'accepted' || isRinging) && (
              <span className="absolute inset-0 rounded-xl bg-primary/20 animate-ping" />
            )}
            <Bell className={`h-5 w-5 relative ${isRinging ? 'animate-[wiggle_0.5s_ease-in-out_infinite]' : ''}`} />
          </motion.button>

          {/* Elegant Divider */}
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-border/60 to-transparent" />

          {/* Cart Button - Premium styling */}
          <motion.button
            onClick={() => setCartOpen(true)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="relative flex items-center gap-3 h-12 px-6 rounded-xl bg-primary text-primary-foreground font-medium transition-all duration-300 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35"
          >
            <div className="relative">
              <ShoppingCart className="h-5 w-5" />
              {cartItems.length > 0 && (
                <motion.span 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center shadow-lg ring-2 ring-primary"
                >
                  {cartItems.length}
                </motion.span>
              )}
            </div>
            {cartItems.length > 0 ? (
              <div className="flex flex-col items-start leading-tight">
                <span className="text-sm font-bold tracking-tight">{formatPrice(cartTotal)}</span>
                <span className="text-[10px] opacity-75 font-medium">{itemCountLabel}</span>
              </div>
            ) : (
              <span className="text-sm font-medium tracking-wide">{t('menu.cart', { defaultValue: 'Cart' })}</span>
            )}
          </motion.button>
        </motion.div>
      </div>

      {/* Cart Modal */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="w-[95vw] sm:w-auto max-w-2xl h-[85vh] sm:h-auto sm:max-h-[90vh] overflow-hidden p-0 bottom-0 top-auto left-1/2 translate-y-0 sm:top-[50%] sm:bottom-auto sm:translate-y-[-50%] rounded-t-3xl sm:rounded-lg">
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
