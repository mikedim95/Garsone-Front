import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  getDeviceContext,
  isNfcSupported,
  setStoredLocalityApproval,
  type LocalityApproval,
} from "@/lib/locality";

type LocalityStage = "idle" | "waiting" | "scanned" | "verifying" | "approved" | "error";

type LocalityApprovalModalProps = {
  open: boolean;
  tableId: string;
  storeSlug?: string | null;
  sessionId: string;
  purpose: "ORDER_SUBMIT";
  onCancel: () => void;
  onApproved: (approval: LocalityApproval) => void;
};

const SCAN_TIMEOUT_MS = 10_000;
const SCAN_SECONDS = Math.floor(SCAN_TIMEOUT_MS / 1000);

const extractPublicCode = (value: string): string | null => {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  const direct = /^[a-z0-9]{4,32}$/i.test(trimmed);
  if (direct) return trimmed.toUpperCase();
  const normalizeSegment = (segment: string) => segment.trim().toUpperCase();
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex(
      (part) => part.toLowerCase() === "q"
    );
    if (idx >= 0 && parts[idx + 1]) {
      return normalizeSegment(parts[idx + 1]);
    }
    if (parts.length > 0) return normalizeSegment(parts[parts.length - 1]);
  } catch {
    const parts = trimmed.split("/").filter(Boolean);
    const idx = parts.findIndex(
      (part) => part.toLowerCase() === "q"
    );
    if (idx >= 0 && parts[idx + 1]) {
      return normalizeSegment(parts[idx + 1]);
    }
    if (parts.length > 0) return normalizeSegment(parts[parts.length - 1]);
  }
  return null;
};

const decodeRecordData = (record: any): string | null => {
  const data = record?.data;
  if (!data) return null;
  if (typeof data === "string") return data;
  try {
    if (data instanceof ArrayBuffer) {
      return new TextDecoder().decode(data);
    }
    if (data.buffer instanceof ArrayBuffer) {
      return new TextDecoder().decode(data.buffer);
    }
  } catch {}
  return null;
};

export const LocalityApprovalModal = ({
  open,
  tableId,
  storeSlug,
  sessionId,
  purpose,
  onCancel,
  onApproved,
}: LocalityApprovalModalProps) => {
  const [stage, setStage] = useState<LocalityStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(SCAN_SECONDS);
  const [qrInput, setQrInput] = useState("");
  const [method, setMethod] = useState<"nfc" | "qr" | "link">("nfc");
  const { platform, deviceType } = getDeviceContext();
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const stopScan = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    clearTimers();
  };

  const trackEvent = async (
    event: Parameters<typeof api.trackPublicEvent>[0]["event"],
    meta?: Record<string, unknown>,
    methodOverride?: "nfc" | "qr" | "link"
  ) => {
    try {
      await api.trackPublicEvent({
        event,
        storeSlug: storeSlug || undefined,
        tableId,
        sessionId,
        deviceType,
        platform,
        method: methodOverride || method,
        ts: new Date().toISOString(),
        meta,
      });
    } catch {}
  };

  const startCountdown = () => {
    setSecondsLeft(SCAN_SECONDS);
    clearTimers();
    timeoutRef.current = window.setTimeout(() => {
      stopScan();
      setStage("error");
      setError("Scan timed out. Try again.");
      trackEvent("locality_scan_failed", { reason: "timeout" }, method);
    }, SCAN_TIMEOUT_MS);
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
  };

  const approveWithCode = async (code: string, nextMethod: "nfc" | "qr" | "link") => {
    setMethod(nextMethod);
    setStage("verifying");
    setError(null);
    try {
      const response = await api.createLocalityApproval({
        publicCode: code,
        tableId,
        purpose,
        sessionId,
        method: nextMethod,
      });
      const expiresAt = Date.parse(response.expiresAt);
      const approval: LocalityApproval = {
        token: response.approvalToken,
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 30_000,
        tableId,
        storeSlug: storeSlug || null,
        purpose,
        method: nextMethod,
        sessionId,
      };
      setStoredLocalityApproval(approval);
      setStage("approved");
      await trackEvent("locality_approved", undefined, nextMethod);
      window.setTimeout(() => onApproved(approval), 350);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Approval failed";
      const friendly =
        message === "WRONG_LOCATION"
          ? "Wrong location. Use the tag for this table."
          : message === "QR_TILE_UNASSIGNED"
          ? "Tag not assigned to a table."
          : message === "QR_TILE_NOT_FOUND_OR_INACTIVE"
          ? "Tag not active."
          : "Approval failed. Try again.";
      setStage("error");
      setError(friendly);
      await trackEvent("locality_scan_failed", { reason: message || "error" }, nextMethod);
    }
  };

  const handleNfcScan = async () => {
    stopScan();
    setMethod("nfc");
    setError(null);
    if (!isNfcSupported()) {
      setStage("error");
      setError("NFC is not supported on this device. Use QR instead.");
      await trackEvent("locality_scan_failed", { reason: "nfc_unsupported" }, "nfc");
      return;
    }
    setStage("waiting");
    await trackEvent("locality_scan_started", undefined, "nfc");
    startCountdown();

    try {
      const reader = new (window as any).NDEFReader();
      const controller = new AbortController();
      abortRef.current = controller;

      const handleReading = async (event: any) => {
        stopScan();
        setStage("scanned");
        const record =
          event?.message?.records?.find((r: any) =>
            ["url", "absolute-url", "text"].includes(r.recordType)
          ) ?? event?.message?.records?.[0];
        const decoded = decodeRecordData(record);
        const code = decoded ? extractPublicCode(decoded) : null;
        if (!code) {
          setStage("error");
          setError("Tag data not recognized. Try another tag.");
          await trackEvent("locality_scan_failed", { reason: "invalid_tag" }, "nfc");
          return;
        }
        await trackEvent("locality_scan_succeeded", undefined, "nfc");
        await approveWithCode(code, "nfc");
      };

      const handleReadingError = async () => {
        stopScan();
        setStage("error");
        setError("Scan failed. Try again.");
        await trackEvent("locality_scan_failed", { reason: "read_error" }, "nfc");
      };

      reader.addEventListener("reading", handleReading);
      reader.addEventListener("readingerror", handleReadingError);
      await reader.scan({ signal: controller.signal });
    } catch (err) {
      stopScan();
      setStage("error");
      setError("Unable to start NFC scanning.");
      await trackEvent("locality_scan_failed", { reason: "scan_start_failed" }, "nfc");
    }
  };

  const handleQrVerify = async () => {
    stopScan();
    setMethod("qr");
    const code = extractPublicCode(qrInput);
    if (!code) {
      setStage("error");
      setError("Enter a valid QR link or code.");
      await trackEvent("locality_scan_failed", { reason: "invalid_qr" }, "qr");
      return;
    }
    setStage("scanned");
    await trackEvent("locality_scan_started", undefined, "qr");
    await trackEvent("locality_scan_succeeded", undefined, "qr");
    await approveWithCode(code, "qr");
  };

  useEffect(() => {
    if (!open) {
      stopScan();
      return;
    }
    const initialMethod: "nfc" | "qr" | "link" = isNfcSupported() ? "nfc" : "qr";
    setMethod(initialMethod);
    setStage("idle");
    setError(null);
    setQrInput("");
    setSecondsLeft(SCAN_SECONDS);
    trackEvent("locality_gate_opened", undefined, initialMethod);
    return () => stopScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const progress = [
    { key: "waiting", label: "Waiting" },
    { key: "scanned", label: "Scanned" },
    { key: "verifying", label: "Verifying" },
    { key: "approved", label: "Approved" },
  ];
  const stageIndex = progress.findIndex((step) => step.key === stage);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm you&#39;re at the venue</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-card/80 px-4 py-3 text-sm text-muted-foreground">
            {isNfcSupported()
              ? "Hold your phone near the NFC tag on your table to approve this order."
              : "NFC is not available here. Use the table QR code instead."}
          </div>

          <div className="space-y-2">
            {progress.map((step, idx) => {
              const isDone = stageIndex >= idx && stage !== "error";
              const isActive = stageIndex === idx || (stage === "waiting" && idx === 0);
              return (
                <div
                  key={step.key}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border border-muted-foreground/40" />
                  )}
                  <span className={isDone || isActive ? "text-foreground" : ""}>
                    {step.label}
                  </span>
                  {step.key === "waiting" && stage === "waiting" && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {secondsLeft}s
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <XCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Button
              type="button"
              className="w-full"
              onClick={handleNfcScan}
              disabled={stage === "waiting" || stage === "verifying"}
            >
              {stage === "waiting" ? "Scanning NFC..." : "Scan NFC tag"}
            </Button>

            <div className="rounded-md border border-border/60 bg-card/60 p-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                QR fallback
              </p>
              <p className="text-xs text-muted-foreground">
                Scan the table QR and paste the link or code here.
              </p>
              <Input
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="Paste QR link or code"
              />
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={handleQrVerify}
                disabled={stage === "waiting" || stage === "verifying"}
              >
                Verify QR code
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              stopScan();
              trackEvent("locality_scan_failed", { reason: "cancel" }, method);
              onCancel();
            }}
            disabled={stage === "verifying"}
            className="w-full"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
