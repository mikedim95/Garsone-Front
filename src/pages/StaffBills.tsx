import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRightLeft, Banknote, BellRing, CheckCircle2, ChevronRight, CreditCard, Loader2, ReceiptText, RefreshCw, Search } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BillPaymentDialog } from "@/components/billing/BillPaymentDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBillingVisits } from "@/hooks/useBillingVisits";
import { api, ApiError } from "@/lib/api";
import { billingApi, clearPendingBillPayment, readPendingBillPayment } from "@/lib/billingApi";
import { formatBillMoney } from "@/lib/billingMoney";
import { realtimeService } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import type { BillVisit, BillVisitSummary, LegacyBillOrder, PendingBillPayment } from "@/types/billing";
import { billingCopy } from "./billingCopy";

const card = "min-w-0 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5";
const actionClass = "h-auto min-h-11 min-w-0 whitespace-normal break-words py-2.5 leading-snug";
const legacyUnpaid = (order: LegacyBillOrder) => order.status !== "CANCELLED" && order.status !== "PAID" && !order.paidAt && !["COMPLETED", "PAID", "SUCCEEDED"].includes(order.paymentStatus);
type VisitAction = { type: "close"; visit: BillVisit } | { type: "transfer"; visit: BillVisit } | { type: "adopt"; tableId: string; tableLabel: string; orders: LegacyBillOrder[] };

export function StaffBillsPanel({ embedded = false }: { embedded?: boolean }) {
  const { user, token } = useAuthStore();
  const { i18n } = useTranslation();
  const language = (i18n.resolvedLanguage || i18n.language).startsWith("el") ? "el" : "en";
  const copy = billingCopy[language];
  const allowed = Boolean(token && user && ["manager", "architect", "waiter", "hybrid"].includes(user.role));
  const [params, setParams] = useSearchParams();
  const visitId = params.get("visitId");
  const tableId = params.get("tableId");
  const queryClient = useQueryClient();
  const [closed, setClosed] = useState(false);
  const [search, setSearch] = useState("");
  const [paymentVisit, setPaymentVisit] = useState<BillVisit | null>(null);
  const [pending, setPending] = useState<PendingBillPayment | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [pendingMissing, setPendingMissing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [action, setAction] = useState<VisitAction | null>(null);
  const [targetTable, setTargetTable] = useState("");
  const [legacySelection, setLegacySelection] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now);
  const lock = useRef(false);
  const pendingLock = useRef(false);
  const currentVisitId = useRef(visitId);
  currentVisitId.current = visitId;
  const openList = useBillingVisits();
  const closedList = useQuery({ queryKey: ["billing-visits", user?.storeSlug, user?.id, true], queryFn: ({ signal }) => billingApi.list(true, signal), enabled: allowed && closed, retry: false, refetchInterval: 15_000, refetchOnWindowFocus: "always", networkMode: "always" });
  const list = closed ? closedList : openList;
  const detailKey = ["billing-visit", user?.storeSlug, user?.id, visitId];
  const detail = useQuery({ queryKey: detailKey, queryFn: ({ signal }) => billingApi.visit(visitId!, signal), enabled: allowed && Boolean(visitId), retry: false, refetchInterval: 15_000, refetchOnWindowFocus: "always", refetchOnReconnect: "always", networkMode: "always" });
  const { refetch: refetchDetail } = detail;
  const tables = useQuery({ queryKey: ["billing-tables", user?.storeSlug, user?.id], queryFn: () => api.getTables(), enabled: allowed && action?.type === "transfer", retry: false, staleTime: 0, networkMode: "always" });
  const visit = detail.data?.visit;
  const stale = Boolean(visit && clock - detail.dataUpdatedAt > 35_000);
  const frozen = !visit || visit.status === "CLOSED" || detail.isError || stale || working || checking || Boolean(pending) || storageError;
  const backPath = user?.role === "hybrid" ? "/hybrid" : user?.role === "waiter" ? "/waiter" : user?.role === "architect" ? "/GarsoneAdmin" : "/manager";
  const money = (cents: number, currency = visit?.currencyCode || openList.data?.currencyCode || "EUR") => formatBillMoney(cents, currency, language);
  const date = (value: string) => new Intl.DateTimeFormat(language === "el" ? "el-GR" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const visits = useMemo(() => [...(list.data?.visits || [])].filter(value => value.tableLabel.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())).sort((a, b) => Number(b.status === "BILL_REQUESTED") - Number(a.status === "BILL_REQUESTED") || a.tableLabel.localeCompare(b.tableLabel, undefined, { numeric: true })), [list.data?.visits, search]);
  const legacyGroups = useMemo(() => {
    const groups = new Map<string, { tableLabel: string; orders: LegacyBillOrder[] }>();
    for (const order of openList.data?.legacyOrders || []) {
      if (order.status === "CANCELLED") continue;
      const group = groups.get(order.tableId) || { tableLabel: order.tableLabel, orders: [] };
      group.orders.push(order);
      groups.set(order.tableId, group);
    }
    return [...groups.entries()].filter(([, group]) => group.tableLabel.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
  }, [openList.data?.legacyOrders, search]);
  const emptyTables = (tables.data?.tables || []).filter(table => table.active !== false && table.isActive !== false && table.id !== visit?.tableId && !(openList.data?.visits || []).some(active => active.tableId === table.id) && !(openList.data?.legacyOrders || []).some(order => order.tableId === table.id && legacyUnpaid(order)));
  const servicePending = Boolean(visit?.orders.some(order => !["SERVED", "PAID", "CANCELLED"].includes(order.status)));

  const setVisitParam = useCallback((id: string | null, replace = false) => {
    // Bill selection must retain the Manager dashboard tab and unrelated filters.
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete("visitId");
      next.delete("tableId");
      if (id) next.set("visitId", id);
      return next;
    }, { replace });
  }, [setParams]);
  const chooseVisit = useCallback((id: string | null) => { setVisitParam(id); setError(null); setSuccess(null); }, [setVisitParam]);
  const refreshAll = useCallback(async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["billing-visits"] }), queryClient.invalidateQueries({ queryKey: ["billing-visit"] }), queryClient.invalidateQueries({ queryKey: ["billing-tables"] })]);
  }, [queryClient]);
  const saved = (updated: BillVisit) => {
    queryClient.setQueryData(["billing-visit", user?.storeSlug, user?.id, updated.id], { visit: updated });
    setSuccess(copy.paymentRecorded);
    setError(null);
    setPending(null);
    setPendingMissing(false);
    void refreshAll();
  };

  useEffect(() => {
    if (!visitId && tableId && openList.data) {
      const current = openList.data.visits.find(value => value.tableId === tableId);
      if (current) setVisitParam(current.id, true);
    }
  }, [visitId, tableId, openList.data, setVisitParam]);
  useEffect(() => {
    if (!allowed || !visitId) { setPending(null); setStorageError(false); return; }
    const read = () => {
      try { setPending(readPendingBillPayment(visitId)); setStorageError(false); }
      catch { setStorageError(true); }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("billing-pending-changed", read);
    return () => { window.removeEventListener("storage", read); window.removeEventListener("billing-pending-changed", read); };
  }, [allowed, visitId, user?.id, user?.storeSlug]);
  useEffect(() => {
    if (!allowed || !visitId || !user?.storeSlug) return;
    const topic = `${user.storeSlug}/billing/updated`;
    const refresh = (payload?: { visitId?: string }) => { if (!payload?.visitId || payload.visitId === visitId) void refetchDetail(); };
    const recovered = (event: Event) => { if ((event as CustomEvent<{ connected: boolean }>).detail?.connected) refresh(); };
    realtimeService.subscribe(topic, refresh);
    window.addEventListener("realtime-status", recovered);
    return () => { realtimeService.unsubscribe(topic, refresh); window.removeEventListener("realtime-status", recovered); };
  }, [allowed, visitId, user?.storeSlug, refetchDetail]);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 5_000); return () => window.clearInterval(timer); }, []);

  const reconcilePending = useCallback(async (candidate: PendingBillPayment) => {
    if (pendingLock.current) return;
    pendingLock.current = true;
    setChecking(true);
    try {
      const receipt = await billingApi.payment(candidate.request.requestId);
      clearPendingBillPayment(candidate);
      if (currentVisitId.current === candidate.visitId) {
        queryClient.setQueryData(["billing-visit", user?.storeSlug, user?.id, candidate.visitId], { visit: receipt.visit });
        setPending(null); setPendingMissing(false); setSuccess(billingCopy[language].paymentRecorded); setError(null);
      }
      void refreshAll();
    } catch (failure) {
      if (currentVisitId.current === candidate.visitId) setPendingMissing(failure instanceof ApiError && failure.status === 404);
    } finally { pendingLock.current = false; setChecking(false); }
  }, [queryClient, user?.storeSlug, user?.id, language, refreshAll]);
  useEffect(() => {
    if (!pending) { setPendingMissing(false); return; }
    void reconcilePending(pending);
    const recover = () => { if (document.visibilityState !== "hidden") void reconcilePending(pending); };
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);
    return () => { window.removeEventListener("online", recover); window.removeEventListener("focus", recover); };
  }, [pending?.request.requestId, reconcilePending]);

  const retryPending = async () => {
    if (!pending || lock.current || checking || detail.isError || stale) return;
    lock.current = true; setWorking(true); setError(null);
    try {
      const result = await billingApi.recordPayment(pending);
      clearPendingBillPayment(pending);
      saved(result.visit);
    } catch (failure) {
      if (failure instanceof ApiError && [400, 409, 410, 422].includes(failure.status)) {
        try {
          const result = await billingApi.payment(pending.request.requestId);
          clearPendingBillPayment(pending); saved(result.visit); return;
        } catch (lookup) {
          if (lookup instanceof ApiError && lookup.status === 404) {
            clearPendingBillPayment(pending); setPending(null); setError(copy.changed); void refreshAll(); return;
          }
        }
      }
      setError(copy.unknownHint);
    } finally { lock.current = false; setWorking(false); }
  };

  const openAction = (next: VisitAction) => {
    if (working || pending || storageError) return;
    setAction(next); setTargetTable(""); setLegacySelection([]); setError(null); setSuccess(null);
  };
  const runAction = async () => {
    if (!action || lock.current) return;
    lock.current = true; setWorking(true); setError(null);
    try {
      let updated: BillVisit;
      if (action.type === "close") updated = (await billingApi.close(action.visit)).visit;
      else if (action.type === "transfer") updated = (await billingApi.transfer(action.visit, targetTable)).visit;
      else {
        const current = (await billingApi.open(action.tableId)).visit;
        updated = (await billingApi.adopt(current, legacySelection)).visit;
      }
      queryClient.setQueryData(["billing-visit", user?.storeSlug, user?.id, updated.id], { visit: updated });
      setVisitParam(updated.id, true);
      setSuccess(action.type === "close" ? copy.closedSuccess : action.type === "transfer" ? copy.moved : copy.added);
      setAction(null); await refreshAll();
    } catch (failure) {
      setError(failure instanceof ApiError && failure.code === "VISIT_SERVICE_PENDING" ? copy.activeOrders : failure instanceof ApiError && failure.status === 409 ? copy.changed : copy.actionUnknown);
      void refreshAll();
    } finally { lock.current = false; setWorking(false); }
  };

  if (!allowed) return <Navigate to="/login" replace />;

  const renderVisitCard = (summary: BillVisitSummary) => <button key={summary.id} type="button" onClick={() => chooseVisit(summary.id)} aria-current={visitId === summary.id ? "page" : undefined} className={cn("w-full min-w-0 rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", visitId === summary.id ? "border-primary bg-primary/5" : "border-border/70")} data-testid={`bill-table-${summary.tableId}`}>
    <div className="flex min-w-0 items-start gap-3"><span className="min-w-0 flex-1 break-words text-base font-semibold">{copy.table} {summary.tableLabel}</span><ChevronRight aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /></div>
    {summary.status === "BILL_REQUESTED" && <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-200"><BellRing aria-hidden className="h-4 w-4 shrink-0" />{copy.requested}</p>}
    <div className="mt-3 flex min-w-0 flex-wrap items-end justify-between gap-2"><span className="text-xs text-muted-foreground">{summary.status === "CLOSED" ? copy.closed : copy.due}</span><span className="break-words text-lg font-semibold tabular-nums">{money(summary.outstandingCents, summary.currencyCode)}</span></div>
  </button>;

  const HeaderTag = embedded ? "div" : "header";
  const TitleTag = embedded ? "h2" : "h1";
  const ContentTag = embedded ? "div" : "main";

  return <div className={embedded ? "min-w-0 text-foreground" : "min-h-dvh bg-background text-foreground"}>
    <HeaderTag className={embedded ? "mb-4" : "sticky top-0 z-40 border-b border-border/70 bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl"}><div className={embedded ? "flex items-center gap-2" : "mx-auto flex max-w-6xl items-center gap-2 px-3 py-3 sm:px-6"}>
      {visitId ? <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-full" aria-label={copy.allTables} onClick={() => chooseVisit(null)}><ArrowLeft aria-hidden className="h-5 w-5" /></Button> : !embedded && <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-full" asChild><Link to={backPath} aria-label={copy.back}><ArrowLeft aria-hidden className="h-5 w-5" /></Link></Button>}
      <div className="min-w-0 flex-1"><TitleTag className="break-words text-lg font-semibold tracking-tight sm:text-xl">{visit ? `${copy.table} ${visit.tableLabel}` : copy.title}</TitleTag>{visit && <p className="text-xs text-muted-foreground">{copy.bill}</p>}</div>
      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-full" aria-label={copy.refresh} disabled={list.isFetching || detail.isFetching} onClick={() => void refreshAll()}><RefreshCw aria-hidden className={cn("h-4 w-4", (list.isFetching || detail.isFetching) && "animate-spin motion-reduce:animate-none")} /></Button>{!embedded && <LanguageSwitcher />}
    </div></HeaderTag>
    <ContentTag className={embedded ? "grid min-w-0 gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]" : "mx-auto grid max-w-6xl gap-5 px-3 py-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:grid-cols-[19rem_minmax(0,1fr)]"}>
      <aside className={cn("min-w-0 space-y-4", visitId && "hidden lg:block")} aria-label={copy.allTables}>
        <div className="relative"><Search aria-hidden className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input className="h-11 pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder={copy.search} aria-label={copy.search} /></div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">{[false, true].map(value => <button key={String(value)} type="button" aria-pressed={closed === value} onClick={() => { setClosed(value); chooseVisit(null); }} className={cn("min-h-11 rounded-lg px-3 py-2 text-sm font-medium", closed === value && "bg-card shadow-sm")}>{value ? copy.closed : copy.open}</button>)}</div>
        {list.isError && <p role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm">{list.error instanceof ApiError && [401, 403].includes(list.error.status) ? copy.accessError : copy.lostConnection}</p>}
        {list.isPending && <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 aria-hidden className="h-4 w-4 animate-spin" />{copy.loading}</p>}
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1">{visits.map(renderVisitCard)}</div>
        {!list.isPending && !list.isError && visits.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{search ? copy.noResults : closed ? copy.noClosed : copy.noBills}</p>}
        {!closed && legacyGroups.length > 0 && <details className={card} open={Boolean(tableId && !visitId)}><summary className="cursor-pointer text-sm font-semibold">{copy.legacy}</summary><p className="mt-3 text-xs leading-relaxed text-muted-foreground">{copy.legacyHint}</p><div className="mt-4 space-y-4">{legacyGroups.map(([id, group]) => <div key={id} className="min-w-0 space-y-2 border-t border-border/60 pt-3"><h3 className="break-words text-sm font-medium">{copy.table} {group.tableLabel}</h3>{group.orders.filter(legacyUnpaid).length > 0 ? <Button variant="outline" className={cn(actionClass, "w-full")} disabled={openList.isError || pending !== null} onClick={() => openAction({ type: "adopt", tableId: id, tableLabel: group.tableLabel, orders: group.orders.filter(legacyUnpaid) })}>{copy.adopt} ({group.orders.filter(legacyUnpaid).length})</Button> : <p className="text-xs text-muted-foreground">{copy.legacyPaid}</p>}</div>)}</div></details>}
      </aside>
      <section className="min-w-0 space-y-4" aria-label={copy.bill}>
        {success && <p role="status" className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"><CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{success}</p>}
        {error && !action && <p role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm">{error}</p>}
        {visitId && (detail.isError || stale) && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{detail.error instanceof ApiError && detail.error.status === 404 ? copy.unavailable : detail.isError ? copy.lostConnection : copy.stale}</p>}
        {storageError && <p role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm">{copy.storageError}</p>}
        {pending && <div role="status" className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4"><h2 className="flex items-start gap-2 font-semibold"><AlertCircle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />{copy.unknownTitle}</h2><p className="text-sm leading-relaxed text-muted-foreground">{copy.unknownHint}</p>{pendingMissing && <p className="text-sm">{copy.notFound}</p>}<div className="flex flex-wrap gap-2"><Button variant="outline" className={actionClass} disabled={checking || working} onClick={() => void reconcilePending(pending)}>{checking && <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />}{copy.checkPayment}</Button>{pendingMissing && <Button className={actionClass} disabled={checking || working || detail.isError || stale} onClick={() => void retryPending()}>{working && <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />}{copy.retrySame}</Button>}</div></div>}
        {visitId && detail.isPending && <p role="status" className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 aria-hidden className="h-4 w-4 animate-spin" />{copy.loading}</p>}
        {!visitId && <div className="hidden rounded-2xl border border-dashed border-border/70 p-12 text-center lg:block"><ReceiptText aria-hidden className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" /><p className="text-sm text-muted-foreground">{copy.allTables}</p></div>}
        {visit && <>
          {visit.status === "BILL_REQUESTED" && <div className="flex items-start gap-3 rounded-2xl bg-amber-500/10 p-4"><BellRing aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" /><div className="min-w-0"><h2 className="break-words text-sm font-semibold">{copy.requested}</h2><p className="mt-1 text-xs text-muted-foreground">{copy.billRequestHint}{visit.billRequestedAt ? ` · ${date(visit.billRequestedAt)}` : ""}</p></div></div>}
          <div className={card}><div className="grid grid-cols-2 gap-x-4 gap-y-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">{copy.total}</p><p className="mt-1 break-words text-lg font-medium tabular-nums">{money(visit.totalCents)}</p></div><div className="min-w-0 text-right"><p className="text-xs text-muted-foreground">{copy.collected}</p><p className="mt-1 break-words text-lg font-medium tabular-nums">{money(visit.paidCents)}</p></div><div className="col-span-2 flex min-w-0 flex-wrap items-end justify-between gap-2 border-t border-border/60 pt-3"><span className="text-sm font-medium">{visit.outstandingCents === 0 ? copy.settled : copy.due}</span><span className="break-words text-3xl font-semibold tracking-tight tabular-nums" data-testid="bill-outstanding">{money(visit.outstandingCents)}</span></div></div>
            {visit.status !== "CLOSED" && <div className="mt-4 grid gap-2"><Button className={cn(actionClass, "w-full")} disabled={frozen || visit.outstandingCents <= 0} onClick={() => { setError(null); setSuccess(null); setPaymentVisit(visit); }}><Banknote aria-hidden className="mr-2 h-4 w-4 shrink-0" />{copy.recordPayment}</Button><div className="grid grid-cols-2 gap-2"><Button variant="outline" className={actionClass} disabled={frozen} onClick={() => openAction({ type: "transfer", visit })}><ArrowRightLeft aria-hidden className="mr-2 h-4 w-4 shrink-0" />{copy.transfer}</Button><Button variant="outline" className={actionClass} disabled={frozen || visit.outstandingCents !== 0 || servicePending} onClick={() => openAction({ type: "close", visit })}>{copy.close}</Button></div>{visit.outstandingCents === 0 && servicePending && <p className="text-xs text-muted-foreground">{copy.activeOrders}</p>}</div>}
            {visit.status === "CLOSED" && <p className="mt-4 text-sm text-muted-foreground">{copy.closedHint}</p>}
          </div>
          <section className={card}><h2 className="mb-4 font-semibold">{copy.items}</h2>{visit.items.length === 0 ? <p className="text-sm text-muted-foreground">{copy.emptyVisit}</p> : <ul className="divide-y divide-border/60">{visit.items.map(item => <li key={item.orderItemId} className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0"><span className="mt-0.5 shrink-0 rounded-lg bg-muted px-2 py-1 text-xs font-medium tabular-nums">{item.quantity}×</span><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{copy.due}: {money(item.outstandingCents)}</p></div><span className="shrink-0 text-sm tabular-nums">{money(item.totalCents)}</span></li>)}</ul>}</section>
          <section className={card}><h2 className="mb-4 font-semibold">{copy.payments}</h2>{visit.payments.length === 0 ? <p className="text-sm text-muted-foreground">{copy.noPayments}</p> : <ul className="divide-y divide-border/60">{visit.payments.map(payment => <li key={payment.id} className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">{payment.method === "CARD" ? <CreditCard aria-hidden className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" /> : <Banknote aria-hidden className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />}<div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{payment.method === "CARD" ? copy.card : copy.cash}</p><time dateTime={payment.recordedAt} className="mt-1 block text-xs text-muted-foreground">{date(payment.recordedAt)}</time></div><span className="shrink-0 text-sm font-medium tabular-nums">{money(payment.amountCents)}</span></li>)}</ul>}</section>
          <p className="text-xs text-muted-foreground">{copy.startedAt} · <time dateTime={visit.openedAt}>{date(visit.openedAt)}</time></p>
        </>}
      </section>
    </ContentTag>
    {paymentVisit && <BillPaymentDialog key={paymentVisit.id} visit={paymentVisit} language={language} currentRevision={visit?.revision ?? paymentVisit.revision} onClose={() => setPaymentVisit(null)} onSaved={saved} onPending={value => { setPending(value); setPendingMissing(false); }} onRefresh={() => void refreshAll()} />}
    <Dialog open={Boolean(action)} onOpenChange={open => { if (!open && !lock.current) { setAction(null); setError(null); } }}><DialogContent hideCloseButton={working} onEscapeKeyDown={event => { if (lock.current) event.preventDefault(); }} onInteractOutside={event => { if (lock.current) event.preventDefault(); }}><DialogHeader><DialogTitle>{action?.type === "close" ? copy.closeTitle : action?.type === "transfer" ? copy.transferTitle : copy.adoptTitle}</DialogTitle><DialogDescription>{action?.type === "close" ? copy.closeDescription : action?.type === "transfer" ? copy.transferHint : copy.adoptHint}</DialogDescription></DialogHeader>
      {action?.type === "transfer" && <div className="space-y-2"><Label htmlFor="bill-transfer-table">{copy.transferTarget}</Label><select id="bill-transfer-table" className="h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm" value={targetTable} disabled={working || tables.isPending || tables.isError || openList.isError} onChange={event => setTargetTable(event.target.value)}><option value="">{tables.isPending ? copy.loadingTables : copy.transferTarget}</option>{emptyTables.map(table => <option key={table.id} value={table.id}>{copy.table} {table.label}</option>)}</select>{!tables.isPending && emptyTables.length === 0 && <p className="text-sm text-muted-foreground">{copy.noEmptyTables}</p>}{tables.isError && <p className="text-sm text-destructive">{copy.lostConnection}</p>}</div>}
      {action?.type === "adopt" && <div className="space-y-3"><h3 className="break-words text-sm font-medium">{copy.table} {action.tableLabel}</h3><ul className="max-h-[40dvh] space-y-2 overflow-y-auto overscroll-contain">{action.orders.map(order => <li key={order.id}><label className="flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-border p-3"><Checkbox checked={legacySelection.includes(order.id)} disabled={working} onCheckedChange={checked => setLegacySelection(previous => checked ? [...previous, order.id] : previous.filter(id => id !== order.id))} className="mt-0.5" /><span className="min-w-0 flex-1"><span className="block break-words text-sm">{date(order.createdAt)}</span><span className="mt-1 block text-xs text-muted-foreground">{copy.legacyUnpaid}</span></span><span className="shrink-0 text-sm tabular-nums">{money(order.totalCents)}</span></label></li>)}</ul></div>}
      {error && <p role="alert" className="text-sm leading-relaxed text-destructive">{error}</p>}<DialogFooter><Button variant="outline" className={actionClass} disabled={working} onClick={() => { setAction(null); setError(null); }}>{copy.cancel}</Button><Button className={actionClass} disabled={working || (action?.type === "transfer" && (!targetTable || tables.isError || openList.isError)) || (action?.type === "adopt" && legacySelection.length === 0)} onClick={() => void runAction()}>{working && <Loader2 aria-hidden className="mr-2 h-4 w-4 shrink-0 animate-spin" />}{action?.type === "close" ? copy.close : action?.type === "transfer" ? copy.transferConfirm : copy.adopt}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}

export default function StaffBills() {
  const { user } = useAuthStore();
  const [params] = useSearchParams();

  if (user?.role === "manager") {
    const next = new URLSearchParams(params);
    next.set("tab", "bills");
    return <Navigate to={{ pathname: "/manager", search: next.toString() }} replace />;
  }

  return <StaffBillsPanel />;
}
