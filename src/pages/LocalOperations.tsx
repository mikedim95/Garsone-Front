import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock3, Database, HardDrive, Loader2, Printer, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ApiError } from "@/lib/api";
import { getLocalOperations, performLocalOperation, type LocalOperationAction, type LocalPrintJob } from "@/lib/localOperations";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { localOperationsCopy } from "./localOperationsCopy";

const LOCAL_ONLY = import.meta.env.VITE_LOCAL_ONLY === "true";
const cardClass = "min-w-0 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5";
const actionClass = "h-auto min-h-11 whitespace-normal break-words py-2 text-left leading-snug";

export default function LocalOperations() {
  const { user, token } = useAuthStore();
  const { i18n } = useTranslation();
  const language = (i18n.resolvedLanguage || i18n.language).startsWith("el") ? "el" : "en";
  const copy = localOperationsCopy[language];
  const allowed = Boolean(token && (user?.role === "manager" || user?.role === "architect"));
  const [now, setNow] = useState(Date.now);
  const [action, setAction] = useState<LocalOperationAction | null>(null);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<"unknown" | "conflict" | "rejected" | null>(null);
  const [success, setSuccess] = useState<LocalOperationAction["type"] | null>(null);
  const actionLock = useRef(false);
  const status = useQuery({
    queryKey: ["local-operations", user?.storeSlug, user?.id],
    queryFn: ({ signal }) => getLocalOperations(signal),
    enabled: LOCAL_ONLY && allowed,
    retry: false,
    refetchInterval: 15_000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    // Internet access is unnecessary; always attempt the venue's LAN endpoint.
    networkMode: "always",
  });

  useEffect(() => {
    // Probe the Pi itself: a browser's internet indicator does not establish
    // whether an isolated venue LAN is reachable.
    const update = () => { if (LOCAL_ONLY && allowed) void status.refetch(); };
    const clock = window.setInterval(() => setNow(Date.now()), 5_000);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.clearInterval(clock);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [allowed, status.refetch]);

  if (!allowed) return <Navigate to="/login" replace />;

  const data = status.data;
  const stale = Boolean(data && now - status.dataUpdatedAt > 35_000);
  const accessError = status.error instanceof ApiError && [401, 403].includes(status.error.status);
  const disconnected = status.isError;
  const queueKnown = Boolean(data && data.printing.pendingCount !== null);
  const canAct = Boolean(data?.localOnly && data.system.database.ok && queueKnown && !disconnected && !stale && !working);
  const jobs = data?.printing.jobs || [];
  const needsCheck = jobs.filter(job => job.state === "uncertain" && !job.resolvedAt && !job.busy);
  const waiting = jobs.filter(job => (job.state === "queued" || job.busy) && !job.resolvedAt);
  const recent = jobs.filter(job => job.state === "delivered" || job.resolvedAt);
  const backupDate = data?.backup.lastSuccessfulAt ? new Date(data.backup.lastSuccessfulAt) : null;
  const backupValid = Boolean(backupDate && Number.isFinite(backupDate.getTime()));
  const backupOld = backupValid && now - backupDate!.getTime() > 86_400_000;
  const formatDate = (value: string, withDate = true) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(language === "el" ? "el-GR" : "en-GB", {
      ...(withDate ? { day: "numeric", month: "short" } as const : {}), hour: "2-digit", minute: "2-digit",
    }).format(date) : copy.unknown;
  };
  const uptime = (seconds: number) => {
    const minutes = Math.max(0, Math.floor(seconds / 60));
    if (minutes < 1) return copy.now;
    if (minutes < 60) return `${minutes} ${copy.minute}`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} ${copy.hour} ${minutes % 60} ${copy.minute}`;
    return `${Math.floor(minutes / 1440)} ${copy.day} ${Math.floor((minutes % 1440) / 60)} ${copy.hour}`;
  };

  const openAction = (next: LocalOperationAction) => {
    if (!canAct || actionLock.current) return;
    setSuccess(null);
    setActionError(null);
    setAction(next);
  };
  const runAction = async () => {
    if (!action || actionLock.current || !canAct) return;
    actionLock.current = true;
    setWorking(true);
    setActionError(null);
    try {
      await performLocalOperation(action);
      setSuccess(action.type);
      setAction(null);
      await status.refetch();
    } catch (error) {
      setActionError(error instanceof ApiError && error.status === 409 ? "conflict"
        : error instanceof ApiError && error.status >= 400 && error.status < 500 ? "rejected" : "unknown");
      void status.refetch();
    } finally {
      actionLock.current = false;
      setWorking(false);
    }
  };

  const jobTitle = (job: LocalPrintJob) => job.ticketNumber != null ? `${copy.ticket} #${job.ticketNumber}` : copy.testTicket;
  const renderJob = (job: LocalPrintJob, actionable = false) => (
    <li key={job.id} className="min-w-0 space-y-3 py-4 first:pt-0 last:pb-0" data-testid={`print-job-${job.id}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="break-words text-sm font-semibold">{jobTitle(job)}{job.tableLabel ? ` · ${copy.table} ${job.tableLabel}` : ""}</h3>
          <p className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <time dateTime={job.createdAt}>{formatDate(job.createdAt)}</time>
            {job.reprintOfId && <span>{copy.copy}</span>}
          </p>
        </div>
        {job.busy ? <Loader2 aria-label={copy.printing} className="h-4 w-4 shrink-0 animate-spin text-primary" />
          : actionable ? <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            : job.state === "queued" ? <Clock3 aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
              : <Check aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </div>
      {!actionable && <p className="text-xs text-muted-foreground">{job.busy ? copy.sending : job.resolution === "printed" ? copy.checkedPrinted : job.resolution === "reprint" ? copy.reprintRequested : job.state === "queued" ? copy.queued : copy.sent}</p>}
      {(job.error || actionable) && <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer py-1">{copy.details}</summary>
        <p className="mt-1 break-all">{job.topic}</p>
        {job.error && <p className="mt-1 break-words [overflow-wrap:anywhere]">{job.error}</p>}
      </details>}
      {actionable && <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        <Button className={actionClass} variant="outline" disabled={!canAct} onClick={() => openAction({ type: "printed", targetId: job.id })}>{copy.alreadyPrinted}</Button>
        <Button className={actionClass} variant="secondary" disabled={!canAct || !data?.printing.enabled} onClick={() => openAction({ type: "reprint", targetId: job.id })}><Printer aria-hidden className="mr-2 h-4 w-4 shrink-0" />{copy.reprint}</Button>
      </div>}
    </li>
  );

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-3 sm:px-6">
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-full" asChild><Link to="/manager" aria-label={copy.back}><ArrowLeft aria-hidden className="h-5 w-5" /></Link></Button>
          <h1 className="min-w-0 flex-1 break-words text-lg font-semibold tracking-tight sm:text-xl">{copy.title}</h1>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-5 px-3 py-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:space-y-6 sm:px-6 sm:py-6">
        {!LOCAL_ONLY || data?.localOnly === false ? <p className={cardClass}>{copy.unavailable}</p> : <>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="min-w-0 break-words text-xs text-muted-foreground" aria-live="polite">
              {data ? <>{copy.updated} <time dateTime={data.checkedAt}>{formatDate(data.checkedAt, false)}</time></> : status.isError ? copy.unknown : copy.loading}
            </p>
            <Button variant="outline" size="sm" className="min-h-11 shrink-0 rounded-full" onClick={() => void status.refetch()} disabled={status.isFetching} aria-label={status.isFetching ? copy.refreshing : copy.refresh}>
              <RefreshCw aria-hidden className={cn("mr-2 h-4 w-4", status.isFetching && "animate-spin motion-reduce:animate-none")} />{copy.refresh}
            </Button>
          </div>
          {(disconnected || stale) && <div role="alert" className="flex min-w-0 gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <WifiOff aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
            <div className="min-w-0 space-y-2 break-words"><p>{accessError ? copy.accessError : disconnected ? copy.loadError : copy.oldSnapshot}</p>
              {data && <p className="text-muted-foreground">{copy.stale}</p>}
              {accessError && <Button variant="outline" asChild><Link to="/login">{copy.signIn}</Link></Button>}
            </div>
          </div>}
          {success && <p role="status" className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"><CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{success === "test" ? copy.testSuccess : success === "printed" ? copy.printedSuccess : copy.reprintSuccess}</p>}
          {status.isPending && !status.isError && <div className="flex items-center gap-3 py-12 text-sm text-muted-foreground" role="status"><Loader2 aria-hidden className="h-5 w-5 animate-spin" />{copy.loading}</div>}
          {data && <>
            {!queueKnown && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{copy.queueUnavailable}</p>}
            {data.printing.pendingCount != null && data.printing.pendingCount > needsCheck.length + waiting.length && <p className="text-xs leading-relaxed text-muted-foreground">{copy.pendingLimit.replace("{shown}", String(needsCheck.length + waiting.length)).replace("{total}", String(data.printing.pendingCount))}</p>}
            {needsCheck.length > 0 && <section className={cn(cardClass, "border-amber-500/40")} aria-labelledby="tickets-needing-check">
              <div className="mb-4 space-y-2"><h2 id="tickets-needing-check" className="flex items-start gap-2 break-words font-semibold"><AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />{copy.needsCheck}<span className="ml-auto rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs tabular-nums">{needsCheck.length}</span></h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{copy.uncertainHint}</p></div>
              <ul className="divide-y divide-border/60">{needsCheck.map(job => renderJob(job, true))}</ul>
            </section>}
            <section aria-labelledby="local-printers-title" className="space-y-3">
              <h2 id="local-printers-title" className="text-base font-semibold">{copy.printers}</h2>
              {!data.printing.enabled && <p className="rounded-xl bg-muted p-3 text-sm">{copy.printingDisabled}</p>}
              {queueKnown && data.printing.printers.length === 0 && <p className={cn(cardClass, "text-sm text-muted-foreground")}>{copy.noPrinters}</p>}
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                {data.printing.printers.map((printer, index) => <article key={printer.id} className={cardClass} data-testid={`local-printer-${printer.id}`}>
                  <div className="mb-4 flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5"><Printer aria-hidden className="h-5 w-5 text-primary" /></div><div className="min-w-0 flex-1"><h3 className="break-words font-medium">{copy.printer} {index + 1}</h3>
                    <p className={cn("mt-1 flex items-start gap-1.5 text-xs", !printer.available && "text-amber-700 dark:text-amber-300")}><span aria-hidden className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", !data.printing.enabled || disconnected || stale ? "bg-muted-foreground" : printer.available ? "bg-primary" : "bg-amber-500")} />{printer.busy ? copy.printing : printer.available ? copy.deviceAvailable : copy.deviceMissing}</p></div></div>
                  <Button variant="outline" className={cn(actionClass, "w-full")} disabled={!canAct || !data.printing.enabled || !printer.available || printer.busy} onClick={() => openAction({ type: "test", targetId: printer.id })}>{printer.busy ? <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" /> : <Printer aria-hidden className="mr-2 h-4 w-4" />}{copy.test}</Button>
                  <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer py-1">{copy.details}</summary><p className="mt-1 break-all">{printer.device}</p>{printer.topics.map(topic => <p key={topic} className="mt-1 break-all">{topic}</p>)}{printer.lastError && <p className="mt-2 break-words [overflow-wrap:anywhere]">{printer.lastError}</p>}</details>
                </article>)}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{copy.printerHint}</p>
            </section>
            <section className={cardClass} aria-labelledby="waiting-tickets-title">
              <h2 id="waiting-tickets-title" className="mb-4 flex items-start gap-2 font-semibold"><Clock3 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 break-words">{copy.waiting}</span><span className="text-sm font-normal tabular-nums text-muted-foreground">{queueKnown ? waiting.length : "—"}</span></h2>
              {waiting.length ? <ul className="divide-y divide-border/60">{waiting.map(job => renderJob(job))}</ul> : <p className="text-sm text-muted-foreground">{queueKnown ? copy.noJobs : copy.unknown}</p>}
            </section>
            <section aria-labelledby="venue-system-title" className="space-y-3">
              <h2 id="venue-system-title" className="font-semibold">{copy.system}</h2>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className={cardClass}><h3 className="flex items-center gap-2 text-sm text-muted-foreground"><Database aria-hidden className="h-4 w-4 shrink-0" />{copy.database}</h3><p className={cn("mt-2 break-words font-medium", !data.system.database.ok && "text-destructive")}>{data.system.database.ok ? copy.databaseOk : copy.databaseError}</p><p className="mt-2 text-xs text-muted-foreground">{copy.uptime}: {uptime(data.system.uptimeSeconds)}</p></div>
                <div className={cardClass}><h3 className="flex items-center gap-2 text-sm text-muted-foreground"><HardDrive aria-hidden className="h-4 w-4 shrink-0" />{copy.storage}</h3><p className="mt-2 break-words font-medium">{data.system.storage.availableBytes == null ? copy.unknown : `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(data.system.storage.availableBytes / 1024 ** 3)} GB`}</p></div>
                <div className={cn(cardClass, "sm:col-span-2")}><h3 className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck aria-hidden className="h-4 w-4 shrink-0" />{copy.backup}</h3><p className="mt-2 break-words font-medium">{backupValid ? <time dateTime={data.backup.lastSuccessfulAt!}>{formatDate(data.backup.lastSuccessfulAt!)}</time> : copy.unknown}</p>
                  {(!backupValid || backupOld) && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{backupValid ? copy.backupOld : copy.backupMissing}</p>}
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{copy.backupHint}</p>
                  {data.backup.error && <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer py-1">{copy.details}</summary><p className="break-words [overflow-wrap:anywhere]">{data.backup.error}</p></details>}
                </div>
              </div>
            </section>
            {recent.length > 0 && <section className={cardClass}><details><summary className="cursor-pointer py-1 font-semibold">{copy.history} <span className="ml-1 text-sm font-normal text-muted-foreground">({recent.length})</span></summary><ul className="mt-4 divide-y divide-border/60">{recent.map(job => renderJob(job))}</ul></details></section>}
          </>}
        </>}
      </main>
      <AlertDialog open={Boolean(action)} onOpenChange={open => { if (!open && !actionLock.current) { setAction(null); setActionError(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{action?.type === "test" ? copy.testTitle : action?.type === "printed" ? copy.printedTitle : copy.reprintTitle}</AlertDialogTitle><AlertDialogDescription>{action?.type === "test" ? copy.testDescription : action?.type === "printed" ? copy.printedDescription : copy.reprintDescription}</AlertDialogDescription></AlertDialogHeader>
          {action && <p className="break-words rounded-xl bg-muted px-3 py-2 text-sm">{action.type === "test" ? `${copy.printer} ${Math.max(0, data?.printing.printers.findIndex(printer => printer.id === action.targetId) ?? 0) + 1}` : (() => { const job = jobs.find(job => job.id === action.targetId); return job ? `${jobTitle(job)}${job.tableLabel ? ` · ${copy.table} ${job.tableLabel}` : ""}` : copy.testTicket; })()}</p>}
          {actionError && <p role="alert" className="text-sm leading-relaxed text-destructive">{actionError === "conflict" ? copy.actionConflict : actionError === "rejected" ? copy.actionRejected : copy.actionError}</p>}
          <AlertDialogFooter><AlertDialogCancel disabled={working}>{copy.cancel}</AlertDialogCancel><Button className={actionClass} disabled={!canAct || working || actionError === "conflict"} onClick={() => void runAction()}>{working ? <><Loader2 aria-hidden className="mr-2 h-4 w-4 shrink-0 animate-spin" />{copy.working}</> : actionError === "unknown" ? copy.retry : action?.type === "test" ? copy.test : action?.type === "printed" ? copy.confirmPrinted : copy.confirmReprint}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
