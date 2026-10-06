import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Loader2, Printer, RefreshCcw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { getArchitectPrinterStatus, testArchitectLocalPrinter, type LocalPrinterTestResult } from "@/lib/architectLocalOperations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function ArchitectLocalPrinters({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LocalPrinterTestResult | null>(null);
  const [now, setNow] = useState(Date.now);
  const lock = useRef(false);
  const status = useQuery({
    queryKey: ["architect-printers", storeId],
    queryFn: ({ signal }) => getArchitectPrinterStatus(storeId, signal),
    retry: false, refetchInterval: 20_000, refetchOnWindowFocus: "always",
  });
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  const data = status.data;
  const checkedAt = data ? Date.parse(data.checkedAt) : NaN;
  const stale = !Number.isFinite(checkedAt) || now - checkedAt > 45_000 || checkedAt - now > 30_000;
  const ready = Boolean(data?.localOnly && data.system.database.ok && data.printing.pendingCount != null && !status.isError && !stale);
  const printer = data?.printing.printers.find(item => item.id === selectedPrinter);
  const canTest = ready && data?.printing.enabled && printer?.available && !printer.busy;
  // Only a fresh Pi queue report can advance a queued response to delivery.
  const observedResult = result && ready ? data?.printing.jobs.find(job => job.id === result.jobId) : undefined;
  const resultState = observedResult?.state ?? result?.state;
  const runTest = async () => {
    if (!selectedPrinter || !canTest || lock.current) return;
    lock.current = true;
    setWorking(true);
    setError(null);
    try {
      const response = await testArchitectLocalPrinter(storeId, selectedPrinter);
      setResult(response);
      setSelectedPrinter(null);
      void status.refetch();
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status >= 400 && failure.status < 500
        ? failure.message
        : "No confirmation received from the Pi. Check the printer before retrying; retry uses the same request.");
      void status.refetch();
    } finally { lock.current = false; setWorking(false); }
  };
  return <Card data-testid="architect-local-printers">
    <CardHeader>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base"><Printer className="h-4 w-4 shrink-0" />Local Pi printers</CardTitle>
          <CardDescription className="mt-1">Test the printers connected to {storeName}'s Pi and check their status.</CardDescription>
        </div>
        <Button aria-label="Refresh Pi printers" className="shrink-0" variant="outline" size="icon" disabled={status.isFetching} onClick={() => void status.refetch()}><RefreshCcw className={status.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></Button>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      {status.isPending && <p role="status">Contacting the Pi...</p>}
      {status.isError && <p role="alert" className="text-sm text-destructive">{status.error instanceof ApiError ? status.error.message : "Cannot reach the Pi."} Printer actions are unavailable until it responds.</p>}
      {data && <>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2"><Database className="h-4 w-4" />Local database: {data.system.database.ok ? "responding" : "not responding"}</span>
          <span>Pending tickets: {data.printing.pendingCount ?? "unknown"}</span>
          <span>Checked: <time dateTime={data.checkedAt}>{Number.isFinite(checkedAt) ? new Date(checkedAt).toLocaleString() : "not reported"}</time></span>
        </div>
        {stale && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">This Pi status is out of date. Refresh before sending a test.</p>}
        {!data.printing.enabled && <p className="text-sm">Local printing is disabled.</p>}
        {data.printing.pendingCount == null && <p role="alert" className="text-sm">The Pi print queue is unavailable.</p>}
        {data.printing.pendingCount != null && data.printing.printers.length === 0 && <p className="text-sm">No local printers are configured on this Pi.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {data.printing.printers.map(item => <div key={item.id} className="min-w-0 space-y-3 rounded-xl border border-border/60 p-4" data-testid={`architect-printer-${item.id}`}>
            <p className="font-medium">{item.id}</p>
            <p className="break-all text-sm text-muted-foreground">{item.device}</p>
            <p className="text-sm">{item.busy ? "Sending a ticket" : item.available ? "Device available" : "Device unavailable"}</p>
            <Button variant="outline" disabled={!ready || !data.printing.enabled || !item.available || item.busy || working} onClick={() => { setSelectedPrinter(item.id); setError(null); setResult(null); }}>Test print</Button>
          </div>)}
        </div>
      </>}
      {result && <p role="status" className="text-sm">{resultState === "delivered" ? "Ticket sent to the printer. Check that it printed clearly." : resultState === "uncertain" ? "The Pi could not confirm delivery. Check the printer before requesting another ticket." : "Test queued on the Pi. Check the paper at the printer."}</p>}
      <AlertDialog open={selectedPrinter !== null} onOpenChange={open => { if (!open && !working) setSelectedPrinter(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Test local printer?</AlertDialogTitle><AlertDialogDescription>Send one test ticket to {selectedPrinter} at {storeName}. Confirm the paper output at the venue.</AlertDialogDescription></AlertDialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter><AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel><Button disabled={!canTest || working} onClick={() => void runTest()}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Test print</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CardContent>
  </Card>;
}
