import { useRef, useState } from "react";
import { Banknote, CreditCard, Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { billingApi, clearPendingBillPayment, prepareBillPayment, readPendingBillPayment } from "@/lib/billingApi";
import { formatBillMoney, parseMoneyCents, selectedItemCents } from "@/lib/billingMoney";
import { cn } from "@/lib/utils";
import { billingCopy } from "@/pages/billingCopy";
import type { BillPaymentMethod, BillVisit, PendingBillPayment } from "@/types/billing";

export function BillPaymentDialog({ visit, language, currentRevision, onClose, onSaved, onPending, onRefresh }: {
  visit: BillVisit; language: "en" | "el"; currentRevision: number;
  onClose: () => void; onSaved: (visit: BillVisit) => void;
  onPending: (pending: PendingBillPayment) => void; onRefresh: () => void;
}) {
  const copy = billingCopy[language];
  const [method, setMethod] = useState<BillPaymentMethod>("CASH");
  const [mode, setMode] = useState<"full" | "amount" | "items">("full");
  const [amount, setAmount] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<"storage" | "changed" | null>(null);
  const lock = useRef(false);
  const money = (value: number) => formatBillMoney(value, visit.currencyCode, language);
  const outstanding = visit.items.filter(item => item.outstandingCents > 0);
  const selected = outstanding.map(item => ({ orderItemId: item.orderItemId, quantity: quantities[item.orderItemId] || 0 })).filter(item => item.quantity > 0);
  const amountCents = mode === "full" ? visit.outstandingCents : mode === "amount" ? parseMoneyCents(amount) : outstanding.reduce((sum, item) => sum + selectedItemCents(item, quantities[item.orderItemId] || 0), 0);
  const changed = currentRevision !== visit.revision || error === "changed";
  const valid = amountCents != null && amountCents > 0 && amountCents <= visit.outstandingCents && !changed;
  const amountError = mode === "amount" && amount.length > 0 && amountCents == null ? copy.amountInvalid : amountCents != null && amountCents > visit.outstandingCents ? copy.amountTooLarge : null;

  const submit = async () => {
    if (lock.current || !valid) return;
    lock.current = true;
    setWorking(true);
    setError(null);
    let pending: PendingBillPayment;
    try {
      pending = prepareBillPayment(visit.id, { expectedRevision: visit.revision, method,
        ...(mode === "items" ? { items: selected } : { amountCents: amountCents! }) });
    } catch {
      try {
        const existing = readPendingBillPayment(visit.id);
        if (existing) { onPending(existing); onClose(); return; }
      } catch { /* Corrupted or unavailable storage must block new payments. */ }
      setError("storage");
      lock.current = false;
      setWorking(false);
      return;
    }
    try {
      const result = await billingApi.recordPayment(pending);
      clearPendingBillPayment(pending);
      onSaved(result.visit);
      onClose();
    } catch (failure) {
      // Never forget an uncertain financial write merely because a retry has
      // lost authentication. Reconcile by its original request ID first.
      if (failure instanceof ApiError && [400, 409, 410, 422].includes(failure.status)) {
        try {
          const receipt = await billingApi.payment(pending.request.requestId);
          clearPendingBillPayment(pending);
          onSaved(receipt.visit);
          onClose();
          return;
        } catch (lookup) {
          if (lookup instanceof ApiError && lookup.status === 404) {
            clearPendingBillPayment(pending);
            setError("changed");
            onRefresh();
            return;
          }
        }
      }
      onPending(pending);
      onClose();
    } finally {
      lock.current = false;
      setWorking(false);
    }
  };

  return <Dialog open onOpenChange={open => { if (!open && !lock.current) onClose(); }}>
    <DialogContent hideCloseButton={working} className="flex max-w-xl flex-col gap-0 overflow-hidden p-0" onEscapeKeyDown={event => { if (lock.current) event.preventDefault(); }} onInteractOutside={event => { if (lock.current) event.preventDefault(); }}>
      <DialogHeader className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5 sm:px-6"><DialogTitle className="pr-8">{copy.recordPayment} · {copy.table} {visit.tableLabel}</DialogTitle><DialogDescription>{copy.paymentHint}</DialogDescription></DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6" data-testid="bill-payment-scroll">
      <div className="rounded-xl bg-muted/70 p-3"><p className="text-xs text-muted-foreground">{copy.due}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{money(visit.outstandingCents)}</p></div>
      <fieldset disabled={working || changed} className="min-w-0 space-y-2"><legend className="mb-2 text-sm font-medium">{copy.paymentMethod}</legend><div className="grid min-w-0 grid-cols-2 gap-2">{(["CASH", "CARD"] as const).map(value => <button key={value} type="button" aria-pressed={method === value} onClick={() => setMethod(value)} className={cn("flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-50", method === value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card")}>
        {value === "CASH" ? <Banknote aria-hidden className="h-5 w-5 shrink-0" /> : <CreditCard aria-hidden className="h-5 w-5 shrink-0" />}<span className="min-w-0 break-words">{value === "CASH" ? copy.cash : copy.card}</span>
      </button>)}</div></fieldset>
      <fieldset disabled={working || changed} className="min-w-0 space-y-3"><legend className="mb-2 text-sm font-medium">{copy.paymentMode}</legend><div className="grid min-w-0 grid-cols-3 gap-1 rounded-xl bg-muted p-1">{(["full", "amount", "items"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={cn("min-h-11 min-w-0 break-words rounded-lg px-2 py-2 text-xs font-medium leading-snug disabled:opacity-50", mode === value && "bg-card shadow-sm")}>{value === "full" ? copy.full : value === "amount" ? copy.amount : copy.byItems}</button>)}</div>
        {mode === "amount" && <div className="space-y-2"><Label htmlFor="bill-payment-amount">{copy.receivedAmount}</Label><Input id="bill-payment-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" aria-invalid={Boolean(amountError)} aria-describedby={amountError ? "bill-amount-error" : undefined} className="h-12 text-lg tabular-nums" /></div>}
        {mode === "items" && <div className="space-y-3"><p className="text-sm text-muted-foreground">{copy.selectItems}</p><ul className="space-y-3" data-testid="bill-split-items">{outstanding.map(item => {
          const quantity = quantities[item.orderItemId] || 0;
          return <li key={item.orderItemId} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border/70 p-3"><div className="min-w-0 flex-1 basis-36"><p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{copy.due}: {money(item.outstandingCents)}</p>{quantity > 0 && <p className="mt-1 text-xs font-medium">{money(selectedItemCents(item, quantity))}</p>}</div><div className="flex shrink-0 items-center rounded-lg border border-border"><Button type="button" variant="ghost" size="icon" className="h-11 w-11" disabled={quantity === 0 || working || changed} aria-label={`${copy.decrease}: ${item.title}`} onClick={() => setQuantities(previous => ({ ...previous, [item.orderItemId]: Math.max(0, quantity - 1) }))}><Minus aria-hidden className="h-4 w-4" /></Button><span className="min-w-7 text-center text-sm tabular-nums" aria-live="polite">{quantity}</span><Button type="button" variant="ghost" size="icon" className="h-11 w-11" disabled={quantity >= item.remainingQuantity || working || changed} aria-label={`${copy.increase}: ${item.title}`} onClick={() => setQuantities(previous => ({ ...previous, [item.orderItemId]: Math.min(item.remainingQuantity, quantity + 1) }))}><Plus aria-hidden className="h-4 w-4" /></Button></div></li>;
        })}</ul></div>}
      </fieldset>
      {amountError && <p id="bill-amount-error" role="alert" className="text-sm text-destructive">{amountError}</p>}
      {changed && <p role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm">{copy.changed}</p>}
      {error === "storage" && <p role="alert" className="text-sm text-destructive">{copy.storageError}</p>}
      </div>
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/60 p-4 sm:flex-row sm:justify-end" data-testid="bill-payment-actions"><Button type="button" variant="outline" className="min-h-11" disabled={working} onClick={onClose}>{changed ? copy.done : copy.cancel}</Button><Button type="button" className="h-auto min-h-11 min-w-0 whitespace-normal break-words py-3 leading-snug" disabled={!valid || working} onClick={() => void submit()}>{working ? <><Loader2 aria-hidden className="mr-2 h-4 w-4 shrink-0 animate-spin" />{copy.recording}</> : <span>{copy.recordReceived}{amountCents != null && amountCents > 0 ? ` · ${money(amountCents)}` : ""}</span>}</Button></div>
    </DialogContent>
  </Dialog>;
}
