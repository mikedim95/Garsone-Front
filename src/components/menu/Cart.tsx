import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCartStore } from '@/store/cartStore';
import { Button } from '../ui/button';
import { Loader2, CheckCircle2, ShoppingCart, Trash2, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { ModifierDialog } from '@/components/menu/ModifierDialog';
import type { MenuItem } from '@/types';
import { api } from '@/lib/api';

const computeOrderTotal = (order: any) => {
  if (!order) return 0;
  if (typeof order.total === 'number') return order.total;
  if (typeof order.totalCents === 'number') return order.totalCents / 100;
  return 0;
};

const formatOrderTime = (order: any) => {
  const ts = order?.createdAt ? new Date(order.createdAt) : new Date();
  return ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const Cart = ({ onCheckout }: { onCheckout: (note?: string) => Promise<any> }) => {
  const { t } = useTranslation();
  const { items, removeItem, getTotal } = useCartStore();

  const [reviewOpen, setReviewOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<any | null>(null);
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);

  const [queueAhead, setQueueAhead] = useState<number | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [submittedAhead, setSubmittedAhead] = useState<number | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);

  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyIndex, setModifyIndex] = useState<number | null>(null);
  const [qtyOpen, setQtyOpen] = useState(false);
  const [qtyIndex, setQtyIndex] = useState<number | null>(null);
  const [qtyValue, setQtyValue] = useState<number>(1);
  const [swipeX, setSwipeX] = useState<Record<number, number>>({});
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (reviewOpen && items.length > 0) {
      setQueueLoading(true);
      setQueueError(null);
      api
        .getOrderQueueSummary()
        .then((res: any) => {
          if (!active) return;
          const ahead = Number(res?.ahead ?? 0);
          setQueueAhead(Number.isFinite(ahead) ? ahead : 0);
        })
        .catch((err: any) => {
          if (!active) return;
          setQueueError(err?.message || 'Unable to load queue');
          setQueueAhead(null);
        })
        .finally(() => {
          if (active) setQueueLoading(false);
        });
    } else {
      setQueueAhead(null);
      setQueueError(null);
    }
    return () => {
      active = false;
    };
  }, [reviewOpen, items.length]);

  return (
    <>
      {/* Floating cart button opens a modal dialog */}
      <Button className="fixed bottom-4 right-4 rounded-full h-14 w-14 shadow-lg" onClick={() => setCartOpen(true)}>
        <ShoppingCart className="h-6 w-6" />
        {items.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {items.length}
          </span>
        )}
      </Button>

      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="sm:max-w-lg flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('menu.cart')}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-1 py-2 space-y-2">
            {items.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Cart is empty</p>
            ) : (
              <>
                {items.map((cartItem, idx) => (
                  <div key={idx} className="relative overflow-hidden select-none rounded-lg">
                    {/* Top-right controls: either Edit (with modifiers) or -/+ (no modifiers) */}
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20 pointer-events-auto">
                      {/* Show Edit only when item has modifiers */}
                      {((((cartItem.item as any)?.modifiers) || []).length > 0) && (
                        <Button
                          variant="secondary"
                          size="icon"
                          className="shadow-sm w-8 h-8 rounded-full p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModifyIndex(idx);
                            setModifyOpen(true);
                          }}
                          title="Edit"
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}

                      {/* For items without modifiers: quick -/+ only */}
                      {((((cartItem.item as any)?.modifiers) || []).length === 0) && (
                        <>
                          <Button variant="outline" size="icon" className="w-8 h-8 rounded-full p-0"
                            onClick={(e) => { e.stopPropagation(); useCartStore.getState().updateQuantity(cartItem.item.id, Math.max(1, cartItem.quantity - 1)); }}
                            aria-label="Decrease">
                            -
                          </Button>
                          <Button variant="outline" size="icon" className="w-8 h-8 rounded-full p-0"
                            onClick={(e) => { e.stopPropagation(); useCartStore.getState().updateQuantity(cartItem.item.id, cartItem.quantity + 1); }}
                            aria-label="Increase">
                            +
                          </Button>
                        </>
                      )}
                    </div>
                    {/* Bottom-right: Delete always visible */}
                    <div className="absolute bottom-2 right-2 z-20 pointer-events-auto">
                      <Button
                        variant="destructive"
                        size="icon"
                        className="shadow-sm w-8 h-8 rounded-full p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeItem(cartItem.item.id);
                        }}
                        title="Delete"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div
                      className="flex items-center gap-3 py-3 border-b bg-card/50 backdrop-blur-sm pl-3 pr-16 rounded-lg transition-shadow hover:shadow-md"
                      onClick={() => {
                        const it = items[idx];
                        const hasMods = (((it?.item as any)?.modifiers) || []).length > 0;
                        if (hasMods) { setModifyIndex(idx); setModifyOpen(true); }
                      }}
                      title="Edit item"
                    >
                      <img src={cartItem.item.image} alt={cartItem.item.name} className="w-16 h-16 rounded object-cover" />
                      <div className="flex-1">
                        <h4 className="font-medium">{cartItem.item.name}</h4>
                        <p className="text-xs text-muted-foreground">Qty: {cartItem.quantity}</p>
                        <div className="text-xs text-muted-foreground">
                          {Object.entries(cartItem.selectedModifiers || {}).map(([modId, optId]) => {
                            const mod = cartItem.item.modifiers?.find((m) => m.id === modId);
                            const opt = mod?.options.find((o) => o.id === optId);
                            return (
                              <div key={modId}>
                                {mod?.name}: {opt?.label}
                              </div>
                            );
                          })}
                        </div>
                        
                    </div>
                    </div>
                  </div>
                ))}
                <div className="pt-2 pb-1 space-y-3">
                  <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl px-5 py-4 shadow-sm backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">{t('menu.total')}</span>
                      <span className="text-2xl font-bold text-primary">€{getTotal().toFixed(2)}</span>
                    </div>
                  </div>
                  <Button
                    className="w-full py-6 text-base rounded-2xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                    onClick={() => setReviewOpen(true)}
                  >
                    {t('menu.checkout')}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Quantity editor for items without modifiers */}
      <Dialog open={qtyOpen} onOpenChange={(open) => {
        setQtyOpen(open);
        if (!open) { setQtyIndex(null); }
      }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Edit quantity</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center gap-3 py-2">
            <Button variant="outline" size="icon" onClick={() => setQtyValue((v) => Math.max(1, v - 1))}>-</Button>
            <span className="text-lg font-semibold w-8 text-center">{qtyValue}</span>
            <Button variant="outline" size="icon" onClick={() => setQtyValue((v) => v + 1)}>+</Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setQtyOpen(false); setQtyIndex(null); }}>Cancel</Button>
            <Button onClick={() => {
              if (qtyIndex != null) {
                const id = items[qtyIndex]?.item?.id;
                if (id) useCartStore.getState().updateQuantity(id, qtyValue);
              }
              setQtyOpen(false);
              setQtyIndex(null);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review your order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-primary">Priority number</p>
                <p className="text-xs text-muted-foreground">Orders ahead (PLACED / PREPARING)</p>
              </div>
              <div className="flex items-center gap-2">
                {queueLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : queueError ? (
                  <span className="text-xs text-destructive max-w-[140px] text-right">{queueError}</span>
                ) : (
                  <span className="text-2xl font-bold text-primary">{queueAhead ?? 0}</span>
                )}
              </div>
            </div>

            {items.map((cartItem, idx) => (
              <div key={idx} className="flex items-start gap-3 pb-3 border-b">
                <img src={cartItem.item.image} alt={cartItem.item.name} className="w-14 h-14 rounded object-cover" />
                <div className="flex-1">
                  <div className="font-medium">
                    {cartItem.item.name} — {cartItem.quantity}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {Object.entries(cartItem.selectedModifiers || {}).map(([modId, optId]) => {
                      const mod = cartItem.item.modifiers?.find((m) => m.id === modId);
                      const opt = mod?.options.find((o) => o.id === optId);
                      return (
                        <div key={modId}>
                          {mod?.name}: {opt?.label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium mb-2">Order note (optional)</label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g., No onions on the salad" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewOpen(false)} disabled={placing}>
              Back
            </Button>
            <Button
              onClick={async () => {
                try {
                  setPlacing(true);
                  const result = await onCheckout(note || undefined);
                  const aheadValue = queueAhead ?? 0;
                  setReviewOpen(false);
                  setQueueAhead(null);
                  setNote('');
                  if (result) {
                    setSubmittedAhead(aheadValue);
                    setSubmittedOrder(result);
                    setSuccessOpen(true);
                  }
                } finally {
                  setPlacing(false);
                }
              }}
              disabled={placing}
              className="inline-flex items-center gap-2"
            >
              {placing && <span className="animate-spin h-4 w-4 border-2 border-white/60 border-t-transparent rounded-full" />}
              {placing ? 'Placing…' : 'Place order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={successOpen} onOpenChange={(open) => {
        setSuccessOpen(open);
        if (!open) {
          setSubmittedOrder(null);
          setSubmittedAhead(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Order submitted</h2>
              <p className="text-sm text-muted-foreground">
                Your order is on its way to the kitchen. Priority number: {submittedAhead ?? queueAhead ?? 0}
              </p>
            </div>
          </div>

          {submittedOrder ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl bg-muted p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Order ID</span>
                  <span className="font-semibold">{(submittedOrder.id || '').slice(-6)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Placed</span>
                  <span className="font-medium">{formatOrderTime(submittedOrder)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold">€{computeOrderTotal(submittedOrder).toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2">
                {(submittedOrder.items || []).map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">
                      {item?.title ?? item?.item?.name ?? `Item ${idx + 1}`}
                    </span>
                    <span className="text-muted-foreground">×{item?.quantity ?? item?.qty ?? 1}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button onClick={() => setSuccessOpen(false)} className="w-full">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ModifierDialog
        open={modifyOpen}
        item={modifyIndex != null ? (items[modifyIndex]?.item as unknown as MenuItem) : null}
        initialSelected={modifyIndex != null ? items[modifyIndex]?.selectedModifiers : undefined}
        initialQty={modifyIndex != null ? (items[modifyIndex]?.quantity ?? 1) : 1}
        onClose={() => {
          setModifyOpen(false);
          setModifyIndex(null);
        }}
        onConfirm={(selected, quantity) => {
          if (modifyIndex != null) {
            useCartStore.getState().updateItemModifiers(modifyIndex, selected);
            const id = items[modifyIndex]?.item?.id;
            if (id) useCartStore.getState().updateQuantity(id, quantity);
          }
          setModifyOpen(false);
          setModifyIndex(null);
        }}
      />
    </>
  );
};













