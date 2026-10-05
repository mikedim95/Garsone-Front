import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ReceiptText, RefreshCcw } from "lucide-react";
import { ApiError, fetchApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type BillingSummary = {
  currencyCode: string;
  salesCents: number; collectedCents: number; outstandingCents: number;
  legacyPaidCents: number; paymentCount: number; cashCents: number; cardCents: number; asOf: string;
};

export function BillingReport({ from, to }: { from: string; to: string }) {
  const { i18n } = useTranslation();
  const greek = i18n.language.startsWith("el");
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const duration = Date.parse(to) - Date.parse(from);
  const validRange = Number.isFinite(duration) && duration > 0 && duration <= 366 * 86_400_000;
  const report = useQuery({
    queryKey: ["billing-summary", user?.storeSlug, user?.id, from, to],
    queryFn: ({ signal }) => fetchApi<BillingSummary>(`/manager/billing/summary?${new URLSearchParams({ from, to })}`, { signal }),
    enabled: Boolean(user && ["manager", "architect"].includes(user.role) && validRange),
    networkMode: "always", refetchInterval: 15_000, refetchIntervalInBackground: false,
    refetchOnWindowFocus: true, retry: false,
  });
  const mixedCurrencies = report.error instanceof ApiError && report.error.code === "MIXED_BILLING_CURRENCIES";
  const data = mixedCurrencies ? undefined : report.data;
  const currency = new Intl.NumberFormat(greek ? "el-GR" : "en-IE", { style: "currency", currency: data?.currencyCode || "EUR" });
  const amount = (cents: number | undefined) => cents === undefined ? "—" : currency.format(cents / 100);
  const cards = [
    { key: "collected", title: greek ? "Εισπράχθηκαν" : "Money collected", value: data?.collectedCents, hint: greek ? "Καταγεγραμμένες πληρωμές περιόδου" : "Payments recorded in this period" },
    { key: "sales", title: greek ? "Αξία παραγγελιών" : "Sales value", value: data?.salesCents, hint: greek ? "Χωρίς ακυρωμένες παραγγελίες" : "Orders placed, excluding cancellations" },
    { key: "outstanding", title: greek ? "Ανοιχτό υπόλοιπο" : "Outstanding now", value: data?.outstandingCents, hint: greek ? "Όλες οι ανοιχτές επισκέψεις τώρα" : "All active visits, as of now" },
  ];

  return <Card className="min-w-0 space-y-4 p-4 sm:p-6" data-testid="billing-report" aria-busy={report.isFetching}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold">{greek ? "Πωλήσεις και εισπράξεις" : "Sales and collections"}</h3>
      <Button variant="outline" className="min-h-11 max-w-full whitespace-normal" onClick={() => navigate("/staff/bills")}>
        <ReceiptText className="mr-2 h-4 w-4 shrink-0" />{greek ? "Λογαριασμοί" : "Table bills"}
      </Button>
    </div>
    {!validRange ? <p role="alert" className="text-sm text-destructive">{greek ? "Επιλέξτε έγκυρη περίοδο έως 366 ημερών." : "Choose a valid period of up to 366 days."}</p>
      : report.isError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
        <span>{mixedCurrencies ? (greek ? "Η περίοδος περιλαμβάνει διαφορετικά νομίσματα και δεν μπορεί να αθροιστεί." : "This period includes different currencies, so a combined total is unavailable.") : data ? (greek ? "Η ενημέρωση απέτυχε. Εμφανίζονται τα τελευταία στοιχεία." : "Could not refresh. Showing the last received figures.")
          : (greek ? "Τα οικονομικά στοιχεία δεν είναι διαθέσιμα." : "Financial figures are currently unavailable.")}</span>
        <Button size="sm" variant="ghost" disabled={report.isFetching} onClick={() => void report.refetch()} className="min-h-11"><RefreshCcw className="mr-2 h-4 w-4" />{greek ? "Ανανέωση" : "Retry"}</Button>
      </div> : null}
    <div className="grid min-w-0 gap-3 min-[480px]:grid-cols-3">
      {cards.map(card => <div key={card.key} className="min-w-0 rounded-2xl border border-border/60 p-4">
        <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
        <p className="my-1 break-words text-2xl font-semibold tabular-nums" data-testid={`billing-${card.key}`}>{validRange ? amount(card.value) : "—"}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{card.hint}</p>
      </div>)}
    </div>
    {data && validRange && <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
      <span>{greek ? "Μετρητά" : "Cash"}: <strong className="font-medium text-foreground">{amount(data.cashCents)}</strong></span>
      <span>{greek ? "Κάρτα" : "Card"}: <strong className="font-medium text-foreground">{amount(data.cardCents)}</strong></span>
      <span>{greek ? "Πληρωμές" : "Payments"}: <strong className="font-medium text-foreground">{data.paymentCount}</strong></span>
    </div>}
    {data && data.legacyPaidCents > 0 && validRange && <p className="rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground" data-testid="billing-legacy">
      {greek ? "Παλαιές παραγγελίες με ένδειξη εξόφλησης" : "Older orders marked paid"}: <strong>{amount(data.legacyPaidCents)}</strong>.
      {greek ? " Εμφανίζονται χωριστά, χωρίς επιβεβαιωμένη εγγραφή πληρωμής." : " Shown separately because no payment record exists."}
    </p>}
  </Card>;
}
