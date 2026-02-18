import type { CartItem, MenuItem, MenuCategory } from '@/types';
import { Button } from '../ui/button';
import { ShoppingCart, X, Pencil, Bell, Loader2, CreditCard, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCartStore } from '@/store/cartStore';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { ModifierDialog } from './ModifierDialog';
import { useEffect, useState, type KeyboardEvent } from 'react';

interface Props {
  categories: Array<Pick<MenuCategory, 'id' | 'title'>>;
  items: MenuItem[];
  selectedCategory: string;
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
  // When incremented by parent, opens the cart modal.
  openCartSignal?: number;
  // When incremented by parent after a successful submission, closes the cart and resets UI.
  orderPlacedSignal?: number;
  showCallButton?: boolean;
  autoOpenCart?: boolean;
  showCartButton?: boolean;
  floatingCartPosition?: 'right' | 'none';
}

export const ElegantMenuView = ({
  categories,
  items,
  selectedCategory,
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
  showCallButton = true,
  autoOpenCart = false,
  showCartButton = true,
  floatingCartPosition = 'right',
  primaryCtaLabel,
  secondaryCtaLabel,
}: Props) => {
  const { t } = useTranslation();
  const cartItems = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const updateItemModifiers = useCartStore((state) => state.updateItemModifiers);
  const [cartOpen, setCartOpen] = useState(false);
  const [expandedBubble, setExpandedBubble] = useState<'none' | 'cart' | 'call'>('none');
  const [orderNote, setOrderNote] = useState('');
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [isRinging, setIsRinging] = useState(false);
  const currency =
    typeof window !== 'undefined' ? window.localStorage.getItem('CURRENCY') || 'EUR' : 'EUR';

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

  const filteredItems =
    selectedCategory === 'all'
      ? items
      : items.filter((item) => {
          if (item.categoryId === selectedCategory) return true;
          const category = categories.find((cat) => cat.id === selectedCategory);
          return category && item.category === category.title;
        });

  // Group items by category for display with separators
  const itemsByCategory = selectedCategory === 'all' 
    ? categories.map((cat) => ({
        category: cat,
        items: items.filter((item) => {
          if (item.categoryId === cat.id) return true;
          return item.category === cat.title;
        })
      })).filter(group => group.items.length > 0)
    : [{ category: categories.find(c => c.id === selectedCategory) || { id: selectedCategory, title: '' }, items: filteredItems }];

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
    if (autoOpenCart) setCartOpen(true);
  };

  const handleImageKeyDown = (event: KeyboardEvent, item: MenuItem) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleAddItemClick(item);
    }
  };

  // Open cart when parent signals (e.g., edit existing order)
  useEffect(() => {
    if (openCartSignal > 0) {
      setCartOpen(true);
      setExpandedBubble('none');
    }
  }, [openCartSignal]);

  // Close the cart and collapse UI when a submission succeeds.
  useEffect(() => {
    if (orderPlacedSignal > 0) {
      setCartOpen(false);
      setExpandedBubble('none');
      setOrderNote('');
      setEditingItemIndex(null);
    }
  }, [orderPlacedSignal]);

  const handleCartButtonClick = () => {
    if (expandedBubble === 'cart') {
      setCartOpen(true);
      setExpandedBubble('none');
    } else {
      setExpandedBubble('cart');
    }
  };

  const handleCallButtonClick = () => {
    if (expandedBubble === 'call') {
      return; // Wait for user action
    }
    setExpandedBubble('call');
  };

  const handleInitiateCall = () => {
    setIsRinging(true);
    onCallClick?.();
    setTimeout(() => {
      setExpandedBubble('none');
      setIsRinging(false);
    }, 2000);
  };

  const itemCountLabel =
    cartItems.length === 1
      ? t('menu.item', { defaultValue: '1 item' })
      : t('menu.items', { defaultValue: `${cartItems.length} items` });

  return (
    <>
      {/* Menu Section */}
      <div className="w-full pb-32">
        {itemsByCategory.map((group, groupIdx) => (
          <div key={group.category.id}>
            {selectedCategory === 'all' && (
              <div className="flex items-center gap-4 my-8">
                <Separator className="flex-1 h-[2px] bg-border" />
                <h2 className="text-2xl font-bold text-foreground px-4">
                  {group.category.title}
                </h2>
                <Separator className="flex-1 h-[2px] bg-border" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-4 mb-6 sm:mb-8">
          {group.items.map((item) => {
            const price = getPrice(item);
            const displayName = item.name ?? item.title ?? t('menu.item', { defaultValue: 'Item' });
            const description = item.description ?? '';

            return (
              <Card
                key={item.id}
                className="group relative overflow-hidden border-border/40 bg-card/50 backdrop-blur-sm hover:border-primary/30 transition-all duration-500 hover:shadow-xl"
              >
                <div
                  className="relative aspect-square overflow-hidden cursor-pointer"
                  role="button"
                  tabIndex={item.available === false ? -1 : 0}
                  aria-disabled={item.available === false}
                  onClick={() => handleAddItemClick(item)}
                  onKeyDown={(e) => handleImageKeyDown(e, item)}
                >
                  <img
                    src={item.image}
                    alt={displayName}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-x-0 top-0 z-20 p-2 sm:p-2.5 bg-gradient-to-b from-black/70 via-black/40 to-transparent flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-xs sm:text-sm text-foreground drop-shadow-lg line-clamp-2 leading-tight">
                        {displayName}
                      </h3>
                    </div>
                    <Badge
                      variant="secondary"
                      className="shrink-0 bg-primary/90 text-primary-foreground border-0 backdrop-blur-sm font-bold text-[10px] sm:text-xs px-2 py-1 shadow-lg"
                    >
                      {formatPrice(price)}
                    </Badge>
                  </div>
                </div>
              </Card>
              );
            })}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Cart Button */}
      {showCartButton && floatingCartPosition === 'right' && (
        <button
          onClick={handleCartButtonClick}
          className={[
            'fixed bottom-4 right-4 z-50 flex items-center gap-2 sm:gap-3 rounded-full h-12 sm:h-16 shadow-2xl border border-border/60 bg-primary text-primary-foreground transition-all duration-500 ease-out',
            expandedBubble === 'cart'
              ? 'pl-4 pr-5 justify-between w-[calc(100vw-8rem)] max-w-[18rem] sm:w-80'
              : 'w-12 sm:w-16 justify-center hover:scale-110',
            expandedBubble === 'none' && 'active:scale-95',
          ].join(' ')}
        >
          <div className="flex items-center gap-3 min-w-0">
            <ShoppingCart className={`h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0 transition-transform duration-500 ${expandedBubble === 'cart' ? 'rotate-12' : ''}`} />
            {expandedBubble === 'cart' && cartItems.length > 0 && (
              <div className="flex flex-col leading-tight text-left min-w-0 animate-fade-in">
                <span className="text-xs sm:text-sm font-semibold truncate max-w-[8rem]">
                  {itemCountLabel}
                </span>
                <span className="text-xs text-primary-foreground/80 truncate max-w-[8rem]">
                  {formatPrice(cartTotal)}
                </span>
              </div>
            )}
            {expandedBubble === 'cart' && cartItems.length === 0 && (
              <span className="text-sm font-medium animate-fade-in">
                {t('menu.cart_empty', { defaultValue: 'Cart empty' })}
              </span>
            )}
          </div>
          {cartItems.length > 0 && expandedBubble !== 'cart' && (
            <span className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-accent text-accent-foreground text-[10px] sm:text-xs font-bold flex items-center justify-center shadow-lg shadow-accent/50 ring-2 ring-background/70 animate-scale-in">
              {cartItems.length}
            </span>
          )}
          {expandedBubble === 'cart' && (
            <span className="text-xs text-primary-foreground/60 whitespace-nowrap animate-fade-in">
              {t('menu.tap_checkout', { defaultValue: 'Tap to checkout' })}
            </span>
          )}
        </button>
      )}

      {/* Floating Call Button */}
      {showCallButton && (
        <button
          type="button"
          onClick={handleCallButtonClick}
          disabled={callStatus === 'pending'}
          className={[
            'fixed bottom-4 left-4 z-50 flex items-center gap-2 sm:gap-3 rounded-full h-12 sm:h-16 shadow-2xl border border-border/60 bg-primary text-primary-foreground transition-all duration-500 ease-out overflow-hidden',
            expandedBubble === 'call'
              ? 'pl-4 pr-3 justify-between w-[calc(100vw-8rem)] max-w-[18rem] sm:w-80'
              : 'w-12 sm:w-16 justify-center hover:scale-110',
            callStatus === 'pending' ? 'opacity-80 cursor-wait' : expandedBubble === 'none' && 'active:scale-95',
          ].join(' ')}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex items-center justify-center flex-shrink-0">
              {(callStatus === 'pending' || callStatus === 'accepted' || isRinging) && (
                <span className="absolute inline-flex h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary-foreground/20 animate-ping" />
              )}
              <Bell className={`h-5 w-5 sm:h-6 sm:w-6 relative transition-transform duration-300 ${isRinging ? 'animate-[wiggle_0.5s_ease-in-out_infinite]' : ''}`} />
            </span>
            {expandedBubble === 'call' && (
              <span className="text-xs sm:text-sm font-semibold whitespace-nowrap max-w-[9rem] truncate animate-fade-in">
                {t('menu.call_waiter', { defaultValue: 'Call Waiter' })}
              </span>
            )}
          </div>
          {expandedBubble === 'call' && (
            <div className="flex items-center gap-2 animate-fade-in">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedBubble('none');
                }}
                className="w-10 h-10 rounded-full bg-primary-foreground/20 hover:bg-primary-foreground/30 flex items-center justify-center transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleInitiateCall();
                }}
                className="w-10 h-10 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground flex items-center justify-center transition-colors"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </div>
          )}
        </button>
      )}

      {/* Cart Modal */}
      {showCartButton && (
      <Dialog
        open={cartOpen}
        onOpenChange={(open) => {
          setCartOpen(open);
        }}
      >
        <DialogContent className="w-[95vw] sm:w-auto max-w-2xl h-[85vh] sm:h-auto sm:max-h-[90vh] overflow-hidden p-0 bottom-0 top-auto left-1/2 [translate:-50%_0] sm:top-1/2 sm:bottom-auto sm:[translate:-50%_-50%] rounded-t-3xl sm:rounded-lg">
          <DialogTitle className="sr-only">
            {t('menu.your_order', { defaultValue: 'Your Order' })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('menu.cart_summary', { defaultValue: 'Cart summary and checkout' })}
          </DialogDescription>
          <Card className="border-0 shadow-none h-full flex flex-col">
            <div className="bg-gradient-to-br from-primary/10 to-accent/10 p-3 sm:p-4 border-b border-border/40">
              {/* Bottom-sheet drag handle (mobile only) */}
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

            <ScrollArea className="max-h-[45vh] sm:max-h-[35vh]">
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
                  const unitPrice = getCartItemUnitPrice(cartItem);
                  const itemTotal = unitPrice * cartItem.quantity;
                  const displayName =
                    cartItem.item.name ??
                    cartItem.item.title ??
                    t('menu.item', { defaultValue: 'Item' });

                  const hasModifiers = cartItem.selectedModifiers && Object.keys(cartItem.selectedModifiers).length > 0;
                  
                  return (
                    <div
                      key={`${cartItem.item.id}-${idx}`}
                      className="relative group bg-muted/20 rounded-lg p-2 border border-border/30 hover:border-primary/30 transition-all duration-300"
                    >
                      <button
                        aria-label={t('menu.remove_item', { defaultValue: 'Remove item' })}
                        onClick={() => removeItem(cartItem.item.id)}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1.5 opacity-100 transition-opacity duration-200 shadow-lg hover:scale-110 z-10"
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
                          <div className="flex items-start justify-between gap-2 mb-0.5">
                            <h4 className="font-semibold text-xs text-foreground truncate">
                              {displayName}
                            </h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditModifiers(idx)}
                              className="h-5 w-5 p-0 flex-shrink-0"
                            >
                              <Pencil className="h-2.5 w-2.5" />
                            </Button>
                          </div>
                          
                          <p className="text-xs text-primary font-bold mb-1">
                            {formatPrice(unitPrice)}
                          </p>

                          {hasModifiers && (
                            <div className="mb-1 space-y-0.5">
                              {cartItem.item.modifiers?.map((modifier) => {
                                const selectedOptionId = cartItem.selectedModifiers[modifier.id];
                                const selectedOption = modifier.options.find(opt => opt.id === selectedOptionId);
                                if (!selectedOption) return null;
                                const optionDelta = getModifierOptionPriceDelta(selectedOption);
                                
                                return (
                                  <div key={modifier.id} className="text-[10px] text-muted-foreground">
                                    <span className="font-medium">{modifier.name || modifier.title}:</span>{' '}
                                    <span>{selectedOption.label || selectedOption.title}</span>
                                    {optionDelta > 0 && (
                                      <span className="text-primary ml-1">
                                        +{formatPrice(optionDelta)}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 bg-background/50 rounded-full px-2 py-1">
                              <button
                                onClick={() =>
                                  updateQuantity(cartItem.item.id, Math.max(1, cartItem.quantity - 1))
                                }
                                aria-label={t('menu.decrease_quantity', { defaultValue: 'Decrease quantity' })}
                                className="text-muted-foreground hover:text-foreground transition-colors w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center rounded-full hover:bg-muted text-base"
                              >
                                -
                              </button>
                              <span className="text-xs font-medium w-6 text-center">
                                {cartItem.quantity}
                              </span>
                              <button
                                onClick={() => updateQuantity(cartItem.item.id, cartItem.quantity + 1)}
                                aria-label={t('menu.increase_quantity', { defaultValue: 'Increase quantity' })}
                                className="text-muted-foreground hover:text-foreground transition-colors w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center rounded-full hover:bg-muted text-base"
                              >
                                +
                              </button>
                            </div>
                            <span className="text-xs font-bold text-foreground">
                              {formatPrice(itemTotal)}
                            </span>
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
              <div className="sticky bottom-0 p-3 sm:p-4 border-t border-border/40 space-y-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-foreground">
                    {t('menu.total', { defaultValue: 'Total' })}
                  </span>
                  <span className="text-xl font-bold text-primary">
                    {formatPrice(cartTotal)}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    {t('menu.order_note', { defaultValue: 'Add a note (optional)' })}
                  </label>
                  <Textarea
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder={t('menu.order_note_placeholder', { defaultValue: 'Any special requests?' })}
                    className="resize-none h-12 text-sm"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  {showPaymentButton && (
                    <Button
                      onClick={handleCheckout}
                      disabled={checkoutBusy}
                      aria-busy={checkoutBusy}
                      data-busy={checkoutBusy ? 'true' : 'false'}
                      className="relative w-full h-10 rounded-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-bold text-sm shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] disabled:opacity-80"
                    >
                      <span className={`absolute inset-0 flex items-center justify-center transition-opacity ${checkoutBusy ? 'opacity-100' : 'opacity-0'}`}>
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </span>
                      <span className={`flex items-center gap-2 ${checkoutBusy ? 'opacity-0' : 'opacity-100'}`}>
                        <CreditCard className="h-4 w-4" />
                        {primaryCtaLabel ?? t('menu.pay_with_viva', { defaultValue: 'Pay with Viva' })}
                      </span>
                    </Button>
                  )}
                  {onImmediateCheckout && (
                    <Button
                      onClick={handleImmediateCheckout}
                      disabled={checkoutBusy}
                      variant="secondary"
                      className="w-full h-10 rounded-full font-medium text-sm transition-all duration-300"
                    >
                      <span className={`flex items-center gap-2 ${checkoutBusy ? 'opacity-0' : 'opacity-100'}`}>
                        <Zap className="h-4 w-4" />
                        {secondaryCtaLabel ?? t('menu.quick_order', { defaultValue: 'Place order now' })}
                      </span>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </DialogContent>
      </Dialog>
      )}

      {/* Edit Modifiers Dialog */}
      <ModifierDialog
        open={editingItemIndex !== null}
        item={editingCartItem?.item || null}
        initialQty={editingCartItem?.quantity || 1}
        initialSelected={editingCartItem?.selectedModifiers}
        onClose={() => setEditingItemIndex(null)}
        onConfirm={handleConfirmEditModifiers}
      />
    </>
  );
};
