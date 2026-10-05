import { useState } from "react";
import { Check, LoaderCircle, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { useCustomerVisit } from "@/hooks/useCustomerVisit";

type VisitState = ReturnType<typeof useCustomerVisit>;
const words = {
  en: { bill: "Your bill", table: "Table", total: "Total", paid: "Paid", due: "Remaining", request: "Request bill", requested: "Staff notified", empty: "Your orders will appear here", connecting: "Connecting to your table…", retry: "Retry", ended: "This visit has ended", newVisit: "Start a new visit", network: "The venue connection is unavailable. Your visit is saved.", storage: "This browser cannot safely restore your visit. Please ask a member of staff.", pending: "An earlier order still needs confirmation. Please ask a member of staff before starting a new visit.", settled: "Fully paid", round: "Round", requestNote: "A member of staff will bring your bill.", portionPaid: "partly paid" },
  el: { bill: "Ο λογαριασμός σας", table: "Τραπέζι", total: "Σύνολο", paid: "Πληρώθηκαν", due: "Υπόλοιπο", request: "Ζητήστε λογαριασμό", requested: "Το προσωπικό ειδοποιήθηκε", empty: "Οι παραγγελίες σας θα εμφανιστούν εδώ", connecting: "Σύνδεση με το τραπέζι σας…", retry: "Επανάληψη", ended: "Η επίσκεψη ολοκληρώθηκε", newVisit: "Νέα επίσκεψη", network: "Η σύνδεση με το κατάστημα δεν είναι διαθέσιμη. Η επίσκεψή σας διατηρήθηκε.", storage: "Δεν είναι δυνατή η ασφαλής ανάκτηση της επίσκεψης. Ζητήστε βοήθεια από το προσωπικό.", pending: "Εκκρεμεί επιβεβαίωση προηγούμενης παραγγελίας. Ζητήστε βοήθεια από το προσωπικό πριν ξεκινήσετε νέα επίσκεψη.", settled: "Εξοφλήθηκε", round: "Παραγγελία", requestNote: "Ένα μέλος του προσωπικού θα σας φέρει τον λογαριασμό.", portionPaid: "μερική πληρωμή" },
};

function errorText(state: VisitState, copy: typeof words.en) {
  return state.error === "storage" ? copy.storage : state.error === "pending" ? copy.pending : copy.network;
}

export function CustomerVisitNotice({ visitState, preferGreek }: { visitState: VisitState; preferGreek: boolean }) {
  const copy = preferGreek ? words.el : words.en;
  if (visitState.status !== "ended" && visitState.status !== "error") return null;
  return <div role="status" data-testid="visit-access-notice" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-3 text-sm">
    <p className="min-w-0 flex-1 break-words">{visitState.status === "ended" ? copy.ended : errorText(visitState, copy)}</p>
    <Button variant="outline" className="min-h-11 max-w-full whitespace-normal" disabled={visitState.busy} onClick={() => visitState.status === "ended" ? void visitState.startNewVisit() : visitState.refresh()}>
      {visitState.status === "ended" ? copy.newVisit : copy.retry}
    </Button>
    {visitState.status === "ended" && visitState.error && <p role="alert" className="basis-full break-words text-xs text-muted-foreground">{errorText(visitState, copy)}</p>}
  </div>;
}

export function CustomerBill({ visitState, preferGreek, themeClass }: { visitState: VisitState; preferGreek: boolean; themeClass: string }) {
  const [open, setOpen] = useState(false);
  const copy = preferGreek ? words.el : words.en;
  const { visit, status, busy, error } = visitState;
  const money = (cents: number) => new Intl.NumberFormat(preferGreek ? "el-GR" : "en-GB", { style: "currency", currency: visit?.currencyCode || "EUR" }).format(cents / 100);
  const orderIds = Array.from(new Set(visit?.items.map(item => item.orderId) || []));
  return <>
    <button type="button" aria-label={copy.bill} onClick={() => { setOpen(true); visitState.refresh(); }} className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card/80 shadow-sm transition-colors hover:bg-accent motion-reduce:transition-none">
      <ReceiptText className="h-5 w-5" aria-hidden="true" />
      {visit?.billRequestedAt && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />}
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={`${themeClass} flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-3xl p-0 text-foreground`} data-testid="customer-bill">
        <div className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5 pr-12">
          <DialogTitle className="break-words text-xl leading-tight">{copy.bill}</DialogTitle>
          <DialogDescription className="mt-1 break-words text-xs">{visit ? `${copy.table} ${visit.tableLabel}` : status === "ended" ? copy.ended : copy.connecting}</DialogDescription>
        </div>
        {status === "ended" ? <div className="p-5"><CustomerVisitNotice visitState={visitState} preferGreek={preferGreek} /></div>
          : !visit ? <div className="space-y-4 p-5 text-sm" role="status">
              {status === "loading" ? <LoaderCircle className="mx-auto h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <><p>{errorText(visitState, copy)}</p><Button variant="outline" onClick={visitState.refresh}>{copy.retry}</Button></>}
            </div>
          : <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4" data-testid="customer-bill-lines">
              {!visit.items.length && <p className="py-5 text-center text-sm text-muted-foreground">{copy.empty}</p>}
              {orderIds.map((orderId, index) => <section key={orderId} className="mb-5 last:mb-0">
                {orderIds.length > 1 && <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{copy.round} {index + 1}</h3>}
                <ul className="space-y-3">
                  {visit.items.filter(item => item.orderId === orderId).map(item => <li key={item.orderItemId} className="flex min-w-0 items-start justify-between gap-3 text-sm">
                    <div className="min-w-0 flex-1"><p className="break-words leading-snug"><span className="mr-2 tabular-nums text-muted-foreground">{item.quantity}×</span>{item.title}</p>
                      {item.paidCents > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{item.outstandingCents === 0 ? copy.paid : copy.portionPaid} · {money(item.paidCents)}</p>}
                    </div>
                    <span className="shrink-0 font-medium tabular-nums">{money(item.totalCents)}</span>
                  </li>)}
                </ul>
              </section>)}
            </div>
            <div className="shrink-0 space-y-3 border-t border-border/60 bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-3"><dt>{copy.total}</dt><dd className="tabular-nums">{money(visit.totalCents)}</dd></div>
                {visit.paidCents > 0 && <div className="flex justify-between gap-3 text-muted-foreground"><dt>{copy.paid}</dt><dd className="tabular-nums">{money(visit.paidCents)}</dd></div>}
                <div className="flex justify-between gap-3 text-base font-semibold"><dt>{copy.due}</dt><dd className="tabular-nums" data-testid="customer-bill-due">{money(visit.outstandingCents)}</dd></div>
              </dl>
              {error && <p role="alert" className="break-words text-xs text-muted-foreground">{errorText(visitState, copy)}</p>}
              {visit.totalCents > 0 && visit.outstandingCents === 0 ? <p role="status" className="flex items-center justify-center gap-2 py-2 text-sm text-primary"><Check className="h-4 w-4" />{copy.settled}</p>
                : <Button className="min-h-12 w-full whitespace-normal rounded-xl px-3 py-2 leading-snug" disabled={busy || status !== "ready" || !visit.items.length || visit.status === "BILL_REQUESTED"} onClick={() => void visitState.requestBill()}>
                    {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> : visit.status === "BILL_REQUESTED" ? <Check className="mr-2 h-4 w-4" /> : <ReceiptText className="mr-2 h-4 w-4" />}
                    {visit.status === "BILL_REQUESTED" ? copy.requested : copy.request}
                  </Button>}
              {visit.status === "BILL_REQUESTED" && <p className="text-center text-xs text-muted-foreground">{copy.requestNote}</p>}
            </div>
          </>}
      </DialogContent>
    </Dialog>
  </>;
}
