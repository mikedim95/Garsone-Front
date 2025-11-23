import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCartStore } from "@/store/cartStore";
import { Button } from "../ui/button";
import {
  Loader2,
  CheckCircle2,
  ShoppingCart,
  Trash2,
  Pencil,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Textarea } from "../ui/textarea";
import { ModifierDialog } from "@/components/menu/ModifierDialog";
import type { OrderQueueSummary, SubmittedOrderSummary } from "@/types";
import { api } from "@/lib/api";

const computeOrderTotal = (order?: SubmittedOrderSummary | null) => {
  if (!order) return 0;
  if (typeof order.total === "number") return order.total;
  if (typeof order.totalCents === "number") return order.totalCents / 100;
  return 0;
};

const formatOrderTime = (order?: SubmittedOrderSummary | null) => {
  if (!order?.createdAt)
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  return new Date(order.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getErrorMessage = (error: unknown, fallback = "Unexpected error") =>
  error instanceof Error ? error.message : fallback;

const getItemName = (item: { name?: string; title?: string }) =>
  item.name ?? item.title ?? "Item";

interface CartProps {
  onCheckout: (note?: string) => Promise<SubmittedOrderSummary | null>;
  editing?: boolean;
}

export const Cart = ({ onCheckout, editing }: CartProps) => {
  const { t } = useTranslation();
  const { items, removeItem, getTotal } = useCartStore();

  const [reviewOpen, setReviewOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [submittedOrder, setSubmittedOrder] =
    useState<SubmittedOrderSummary | null>(null);
  const [note, setNote] = useState("");
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
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (reviewOpen && items.length > 0) {
      setQueueLoading(true);
      setQueueError(null);
      api
        .getOrderQueueSummary()
        .then((res: OrderQueueSummary) => {
          if (!active) return;
          const ahead = Number(res?.ahead ?? 0);
          setQueueAhead(Number.isFinite(ahead) ? ahead : 0);
        })
        .catch((error: unknown) => {
          if (!active) return;
          setQueueError(getErrorMessage(error, "Unable to load queue"));
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

  const subtotal = getTotal();
  const hasItems = items.length > 0;

  return (
    <>
      {/* MOBILE: full-width bar just under header */}
      <div
        className="fixed inset-x-0 z-50 px-4 sm:hidden"
        // header is sticky at top-0 with py-4 → ~64px, give it a bit more
        style={{ top: "4.5rem" }}
      >
        <div className="mx-auto w-[min(600px,100%)] rounded-3xl border border-border/60 bg-background/95 shadow-2xl backdrop-blur px-5 py-3 flex items-center gap-3">
          <div className="relative inline-flex">
            <ShoppingCart className="h-6 w-6 text-primary" />
            {hasItems && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[11px] rounded-full h-4 w-4 flex items-center justify-center">
                {items.length}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground truncate">
            {hasItems
              ? `${items.length} item${items.length === 1 ? "" : "s"}`
              : "Cart is empty"}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="font-semibold text-foreground whitespace-nowrap">
              €{subtotal.toFixed(2)}
            </div>
            <Button
              size="sm"
              onClick={() => setCartOpen(true)}
              disabled={!hasItems}
              className="rounded-xl px-4"
            >
              {hasItems ? "Checkout" : "Add items"}
            </Button>
          </div>
        </div>
      </div>

      {/* DESKTOP/TABLET: compact pill top-right under header */}
      <div className="hidden sm:block fixed top-4 right-4 md:top-5 md:right-5 z-50">
        <Button
          size="lg"
          variant="default"
          disabled={!hasItems}
          onClick={() => setCartOpen(true)}
          className="rounded-full shadow-lg shadow-black/20 pl-3 pr-4 flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/10">
            <ShoppingCart className="h-4 w-4" />
            {hasItems && (
              <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-[3px]">
                {items.length}
              </span>
            )}
          </span>
          <div className="flex flex-col items-start leading-tight text-left">
            <span className="text-xs opacity-80">
              {editing ? "Editing order" : "Cart"}
            </span>
            <span className="text-sm font-semibold">
              €{subtotal.toFixed(2)} • {items.length} item
              {items.length === 1 ? "" : "s"}
            </span>
          </div>
        </Button>
      </div>

      {/* CART DIALOG */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="sm:max-w-lg flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("menu.cart")}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-1 py-2 space-y-2">
            {items.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Cart is empty
              </p>
            ) : (
              <>
                {items.map((cartItem, idx) => {
                  const hasModifiers =
                    (cartItem.item.modifiers?.length ?? 0) > 0;
                  const displayName = getItemName(cartItem.item);
                  return (
                    <div
                      key={idx}
                      className="relative overflow-hidden select-none rounded-lg"
                    >
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20 pointer-events-auto">
                        {hasModifiers && (
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
                        {!hasModifiers && (
                          <>
                            <Button
                              variant="outline"
                              size="icon"
                              className="w-8 h-8 rounded-full p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                useCartStore
                                  .getState()
                                  .updateQuantity(
                                    cartItem.item.id,
                                    Math.max(1, cartItem.quantity - 1)
                                  );
                              }}
                              aria-label="Decrease"
                            >
                              -
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="w-8 h-8 rounded-full p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                useCartStore
                                  .getState()
                                  .updateQuantity(
                                    cartItem.item.id,
                                    cartItem.quantity + 1
                                  );
                              }}
                              aria-label="Increase"
                            >
                              +
                            </Button>
                          </>
                        )}
                      </div>
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
                          if (hasModifiers) {
                            setModifyIndex(idx);
                            setModifyOpen(true);
                          }
                        }}
                        title="Edit item"
                      >
                        <img
                          src={cartItem.item.image}
                          alt={displayName}
                          className="w-16 h-16 rounded object-cover"
                        />
                        <div className="flex-1">
                          <h4 className="font-medium">{displayName}</h4>
                          <p className="text-xs text-muted-foreground">
                            Qty: {cartItem.quantity}
                          </p>
                          <div className="text-xs text-muted-foreground">
                            {Object.entries(
                              cartItem.selectedModifiers || {}
                            ).map(([modId, optId]) => {
                              const mod = cartItem.item.modifiers?.find(
                                (m) => m.id === modId
                              );
                              const opt = mod?.options.find(
                                (o) => o.id === optId
                              );
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
                  );
                })}
                <div className="pt-2 pb-1 space-y-3">
                  <div className="bg-primary/5 border border-primary/20 rounded-2xl px-5 py-4 shadow-sm backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">
                        {t("menu.total")}
                      </span>
                      <span className="text-2xl font-bold text-primary">
                        €{getTotal().toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <Button
                    className="w-full py-6 text-base rounded-2xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                    onClick={() => setReviewOpen(true)}
                  >
                    {t("menu.checkout")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Quantity editor for items without modifiers */}
      <Dialog
        open={qtyOpen}
        onOpenChange={(open) => {
          setQtyOpen(open);
          if (!open) {
            setQtyIndex(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Edit quantity</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center gap-3 py-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQtyValue((v) => Math.max(1, v - 1))}
            >
              -
            </Button>
            <span className="text-lg font-semibold w-8 text-center">
              {qtyValue}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQtyValue((v) => v + 1)}
            >
              +
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setQtyOpen(false);
                setQtyIndex(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (qtyIndex != null) {
                  const id = items[qtyIndex]?.item?.id;
                  if (id) useCartStore.getState().updateQuantity(id, qtyValue);
                }
                setQtyOpen(false);
                setQtyIndex(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REVIEW DIALOG */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Review your changes" : "Review your order"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-primary">
                  Priority number
                </p>
                <p className="text-xs text-muted-foreground">
                  Orders ahead (PLACED / PREPARING)
                </p>
              </div>
              <div className="flex items-center gap-2">
                {queueLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : queueError ? (
                  <span className="text-xs text-destructive max-w-[140px] text-right">
                    {queueError}
                  </span>
                ) : (
                  <span className="text-2xl font-bold text-primary">
                    {queueAhead ?? 0}
                  </span>
                )}
              </div>
            </div>

            {items.map((cartItem, idx) => {
              const displayName = getItemName(cartItem.item);
              return (
                <div key={idx} className="flex items-start gap-3 pb-3 border-b">
                  <img
                    src={cartItem.item.image}
                    alt={displayName}
                    className="w-14 h-14 rounded object-cover"
                  />
                  <div className="flex-1">
                    <div className="font-medium">
                      {displayName} — {cartItem.quantity}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Object.entries(cartItem.selectedModifiers || {}).map(
                        ([modId, optId]) => {
                          const mod = cartItem.item.modifiers?.find(
                            (m) => m.id === modId
                          );
                          const opt = mod?.options.find((o) => o.id === optId);
                          return (
                            <div key={modId}>
                              {mod?.name}: {opt?.label}
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div>
              <label className="block text-sm font-medium mb-2">
                Order note (optional)
              </label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g., No onions on the salad"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setReviewOpen(false)}
              disabled={placing}
            >
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
                  setNote("");
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
              {placing && (
                <span className="animate-spin h-4 w-4 border-2 border-current/60 border-t-transparent rounded-full" />
              )}
              {placing
                ? editing
                  ? "Updating…"
                  : "Placing…"
                : editing
                ? "Update order"
                : "Place order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SUCCESS DIALOG */}
      <Dialog
        open={successOpen}
        onOpenChange={(open) => {
          setSuccessOpen(open);
          if (!open) {
            setSubmittedOrder(null);
            setSubmittedAhead(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Order submitted
              </h2>
              <p className="text-sm text-muted-foreground">
                Your order is on its way to the kitchen. Priority number:{" "}
                {submittedAhead ?? queueAhead ?? 0}
              </p>
            </div>
          </div>

          {submittedOrder ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl bg-muted p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Order ID</span>
                  <span className="font-semibold">
                    {(submittedOrder.id || "").slice(-6)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Placed</span>
                  <span className="font-medium">
                    {formatOrderTime(submittedOrder)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold">
                    €{computeOrderTotal(submittedOrder).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {(submittedOrder.items ?? []).map((item, idx) => {
                  const lineLabel =
                    item?.title ??
                    item?.name ??
                    item?.item?.name ??
                    `Item ${idx + 1}`;
                  const quantity = item?.quantity ?? item?.qty ?? 1;
                  return (
                    <div
                      key={`${lineLabel}-${idx}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="font-medium text-foreground">
                        {lineLabel}
                      </span>
                      <span className="text-muted-foreground">×{quantity}</span>
                    </div>
                  );
                })}
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
        item={modifyIndex != null ? items[modifyIndex]?.item ?? null : null}
        initialSelected={
          modifyIndex != null
            ? items[modifyIndex]?.selectedModifiers
            : undefined
        }
        initialQty={modifyIndex != null ? items[modifyIndex]?.quantity ?? 1 : 1}
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
