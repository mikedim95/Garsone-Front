import type { MenuItem, MenuCategory } from '@/types';
import { Button } from '../ui/button';
import { Plus, ShoppingCart, X, Pencil, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCartStore } from '@/store/cartStore';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Dialog, DialogContent } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { ModifierDialog } from './ModifierDialog';
import { useState } from 'react';

interface Props {
  categories: Array<Pick<MenuCategory, 'id' | 'title'>>;
  items: MenuItem[];
  selectedCategory: string;
  onAddItem: (item: MenuItem) => void;
  onCheckout: (note?: string) => void;
  callButtonLabel?: string | null;
  callStatus?: 'idle' | 'pending' | 'accepted';
  callPrompted?: boolean;
  onCallClick?: () => void;
}

export const ElegantMenuView = ({
  categories,
  items,
  selectedCategory,
  onAddItem,
  onCheckout,
  callButtonLabel,
  callStatus = 'idle',
  callPrompted = false,
  onCallClick,
}: Props) => {
  const { t } = useTranslation();
  const cartItems = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const updateItemModifiers = useCartStore((state) => state.updateItemModifiers);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
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

  const cartTotal = cartItems.reduce((sum, item) => {
    const price = getPrice(item.item);
    return sum + price * item.quantity;
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

  const handleCheckout = () => {
    setCartOpen(false);
    onCheckout(orderNote);
    setOrderNote('');
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

  return (
    <>
      {/* Menu Section */}
      <div className="w-full pb-32">
        {itemsByCategory.map((group, groupIdx) => (
          <div key={group.category.id}>
            {selectedCategory === 'all' && (
              <div className="flex items-center gap-4 my-8">
                <Separator className="flex-1" />
                <h2 className="text-2xl font-bold text-foreground px-4">
                  {group.category.title}
                </h2>
                <Separator className="flex-1" />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {group.items.map((item) => {
            const price = getPrice(item);
            const displayName = item.name ?? item.title ?? t('menu.item', { defaultValue: 'Item' });
            const description = item.description ?? '';

            return (
              <Card
                key={item.id}
                className="group relative overflow-hidden border-border/40 bg-card/50 backdrop-blur-sm hover:border-primary/30 transition-all duration-500 hover:shadow-xl"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent z-10" />
                  <img
                    src={item.image}
                    alt={displayName}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute bottom-4 left-4 z-20">
                    <h3 className="font-semibold text-xl text-foreground mb-1 drop-shadow-lg">
                      {displayName}
                    </h3>
                    <Badge
                      variant="secondary"
                      className="bg-primary/90 text-primary-foreground border-0 backdrop-blur-sm font-bold text-base px-3 py-1"
                    >
                      {formatPrice(price)}
                    </Badge>
                  </div>
                </div>
                <div className="p-5">
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-2 min-h-[2.5rem]">
                    {description}
                  </p>
                  <Button
                    onClick={() => onAddItem(item)}
                    disabled={item.available === false}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-11 font-medium transition-all duration-300 hover:shadow-lg"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t('menu.add_to_cart', { defaultValue: 'Add to Cart' })}
                  </Button>
                </div>
              </Card>
              );
            })}
            </div>
          </div>
        ))}
      </div>

      {/* Simple Floating Cart Circle */}
      <button
        onClick={() => setCartOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95"
      >
        <ShoppingCart className="h-6 w-6" />
        {cartItems.length > 0 && (
          <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-accent text-accent-foreground text-xs font-bold flex items-center justify-center animate-scale-in">
            {cartItems.length}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onCallClick}
        disabled={callStatus === 'pending'}
        className={[
          'fixed bottom-6 left-6 z-50 flex items-center rounded-full h-16 shadow-2xl overflow-hidden border border-border/60 bg-primary text-primary-foreground transition-all duration-300 ease-out',
          callButtonLabel ? 'w-48 pl-5 pr-6 justify-start hover:scale-105' : 'w-16 justify-center hover:scale-110',
          callStatus === 'pending' ? 'opacity-80 cursor-wait' : 'active:scale-95',
        ].join(' ')}
      >
        <span className="relative flex items-center justify-center">
          {(callStatus === 'pending' || callStatus === 'accepted') && (
            <span className="absolute inline-flex h-10 w-10 rounded-full bg-primary-foreground/20 animate-ping" />
          )}
          <Bell className="h-6 w-6 relative" />
        </span>
        {callButtonLabel && (
          <span className="ml-3 text-sm font-semibold whitespace-nowrap">
            {callButtonLabel}
          </span>
        )}
      </button>

      {/* Cart Modal */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0">
          <Card className="border-0 shadow-none">
            <div className="bg-gradient-to-br from-primary/10 to-accent/10 p-6 border-b border-border/40">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-primary/20">
                  <ShoppingCart className="h-6 w-6 text-primary" />
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

            <ScrollArea className="max-h-[40vh]">
            {cartItems.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
                  <ShoppingBag className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <p className="text-muted-foreground text-sm">
                  {t('menu.cart_empty', { defaultValue: 'Your cart is empty' })}
                </p>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {cartItems.map((cartItem, idx) => {
                  const price = getPrice(cartItem.item);
                  const itemTotal = price * cartItem.quantity;
                  const displayName =
                    cartItem.item.name ??
                    cartItem.item.title ??
                    t('menu.item', { defaultValue: 'Item' });

                  const hasModifiers = cartItem.selectedModifiers && Object.keys(cartItem.selectedModifiers).length > 0;
                  
                  return (
                    <div
                      key={`${cartItem.item.id}-${idx}`}
                      className="relative group bg-muted/20 rounded-xl p-4 border border-border/30 hover:border-primary/30 transition-all duration-300"
                    >
                      <button
                        onClick={() => removeItem(cartItem.item.id)}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg hover:scale-110 z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>

                      <div className="flex gap-3">
                        <img
                          src={cartItem.item.image}
                          alt={displayName}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="font-semibold text-sm text-foreground truncate">
                              {displayName}
                            </h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditModifiers(idx)}
                              className="h-6 w-6 p-0"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                          
                          <p className="text-xs text-primary font-bold mb-2">
                            {formatPrice(price)}
                          </p>

                          {hasModifiers && (
                            <div className="mb-2 space-y-1">
                              {cartItem.item.modifiers?.map((modifier) => {
                                const selectedOptionId = cartItem.selectedModifiers[modifier.id];
                                const selectedOption = modifier.options.find(opt => opt.id === selectedOptionId);
                                if (!selectedOption) return null;
                                
                                return (
                                  <div key={modifier.id} className="text-xs text-muted-foreground">
                                    <span className="font-medium">{modifier.name || modifier.title}:</span>{' '}
                                    <span>{selectedOption.label || selectedOption.title}</span>
                                    {selectedOption.priceDelta > 0 && (
                                      <span className="text-primary ml-1">
                                        +{formatPrice(selectedOption.priceDelta)}
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
                                className="text-muted-foreground hover:text-foreground transition-colors w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted"
                              >
                                −
                              </button>
                              <span className="text-sm font-medium w-6 text-center">
                                {cartItem.quantity}
                              </span>
                              <button
                                onClick={() => updateQuantity(cartItem.item.id, cartItem.quantity + 1)}
                                className="text-muted-foreground hover:text-foreground transition-colors w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted"
                              >
                                +
                              </button>
                            </div>
                            <span className="text-sm font-bold text-foreground">
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
              <div className="p-6 border-t border-border/40 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t('menu.subtotal', { defaultValue: 'Subtotal' })}
                    </span>
                    <span className="font-medium">{formatPrice(cartTotal)}</span>
                  </div>
                  <Separator className="bg-border/50" />
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-foreground">
                      {t('menu.total', { defaultValue: 'Total' })}
                    </span>
                    <span className="text-2xl font-bold text-primary">
                      {formatPrice(cartTotal)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {t('menu.order_note', { defaultValue: 'Add a note (optional)' })}
                  </label>
                  <Textarea
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder={t('menu.order_note_placeholder', { defaultValue: 'Any special requests?' })}
                    className="resize-none h-20"
                  />
                </div>

                <Button
                  onClick={handleCheckout}
                  className="w-full h-12 rounded-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-bold text-base shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
                >
                  {t('menu.checkout', { defaultValue: 'Place Order' })}
                </Button>
              </div>
            )}
          </Card>
        </DialogContent>
      </Dialog>

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
