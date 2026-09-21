import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import {
  Copy,
  Download,
  Loader2,
  Plus,
  Printer,
  RefreshCcw,
  Trash2,
  Upload,
  Search,
  Undo2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { API_BASE, ApiError, api } from "@/lib/api";
import {
  eventQrUrl,
  qrEventsApi,
  type QrEvent,
  type QrEventAssignment,
  type QrEventConfig,
} from "@/lib/qrEventsApi";
import type { ManagerTableSummary, QRTile } from "@/types";
import {
  assignmentStatus,
  eventAssignmentCounts,
  eventDeploymentStatus,
  normalizedEventDraft,
  suggestedEventApiUrl,
  validateEventDraft,
  type AssignmentStatus,
  type EventField,
} from "@/lib/qrEventEditor";

const LOCAL_ONLY = import.meta.env.VITE_LOCAL_ONLY === "true";
const MAX_CODES = 500;
const CODE_PATTERN = /^GT-[0-9A-HJKMNPQRSTVWXYZ]{4}-[0-9A-HJKMNPQRSTVWXYZ]{4}$/;
const NONE = "__venue__";

const configOf = (event: QrEvent): QrEventConfig => ({
  name: event.name,
  publicAppUrl: event.publicAppUrl,
  publicApiUrl: event.publicApiUrl,
  isActive: event.isActive,
  assignments: event.assignments.map((assignment) => ({ ...assignment })),
});

function newConfig(): QrEventConfig {
  const origin = LOCAL_ONLY ? window.location.origin : "";
  return {
    name: "",
    publicAppUrl: origin,
    publicApiUrl: origin ? `${origin}/api` : "",
    isActive: true,
    assignments: [],
  };
}

type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
};
type Notice = { kind: "error" | "conflict" | "info"; message: string };
const fieldIds: Record<EventField, string> = {
  name: "qr-event-name",
  publicAppUrl: "qr-event-app",
  publicApiUrl: "qr-event-api",
};

function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function generateCode(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const values = crypto.getRandomValues(new Uint8Array(8));
  const text = Array.from(values, (value) => alphabet[value & 31]).join("");
  return `GT-${text.slice(0, 4)}-${text.slice(4)}`;
}

export default function ArchitectQrEvents({
  store,
  tiles,
  onDirtyChange,
  onBusyChange,
}: {
  store: { id: string; name: string; slug?: string };
  tiles: QRTile[];
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { toast } = useToast();
  const [events, setEvents] = useState<QrEvent[]>([]);
  const [saved, setSaved] = useState<QrEvent | null>(null);
  const [draft, setDraft] = useState<QrEventConfig | null>(null);
  const [tables, setTables] = useState<ManagerTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [touched, setTouched] = useState<Partial<Record<EventField, boolean>>>(
    {},
  );
  const [apiCustomized, setApiCustomized] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AssignmentStatus | "all">(
    "all",
  );
  const [removed, setRemoved] = useState<{
    assignment: QrEventAssignment;
    index: number;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationResolver = useRef<((accepted: boolean) => void) | null>(
    null,
  );
  const noticeRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const running = useRef(false);
  const [pairingStored, setPairingStored] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [generateCount, setGenerateCount] = useState(1);
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<QrEventAssignment | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = Boolean(
    draft &&
      (!saved || JSON.stringify(draft) !== JSON.stringify(configOf(saved))),
  );
  const readOnly = Boolean(saved?.isImported);
  const errors = useMemo(
    () => (draft ? validateEventDraft(draft) : {}),
    [draft],
  );
  const tableMap = useMemo(
    () => new Map(tables.map((table) => [table.id, table])),
    [tables],
  );
  const counts = useMemo(
    () => eventAssignmentCounts(draft?.assignments ?? [], tableMap),
    [draft?.assignments, tableMap],
  );
  const visibleAssignments = useMemo(
    () =>
      (draft?.assignments ?? [])
        .map((assignment, index) => ({ assignment, index }))
        .filter(({ assignment }) => {
          const text =
            `${assignment.publicCode} ${assignment.label ?? ""} ${tableMap.get(assignment.tableId ?? "")?.label ?? ""}`.toLocaleLowerCase();
          return (
            (!search.trim() ||
              text.includes(search.trim().toLocaleLowerCase())) &&
            (statusFilter === "all" ||
              assignmentStatus(assignment, tableMap) === statusFilter)
          );
        }),
    [draft?.assignments, search, statusFilter, tableMap],
  );
  const deployment = saved ? eventDeploymentStatus(saved, LOCAL_ONLY) : null;
  const apiChanged = Boolean(
    saved &&
      draft &&
      draft.publicApiUrl.trim().replace(/\/+$/, "") !== saved.publicApiUrl,
  );
  const remaining = MAX_CODES - (draft?.assignments.length ?? 0);
  const printable = useMemo(
    () =>
      saved?.isActive
        ? saved.assignments.filter(
            (assignment) =>
              assignment.isActive &&
              tables.some(
                (table) => table.id === assignment.tableId && table.isActive,
              ),
          )
        : [],
    [saved, tables],
  );

  const reportError = useCallback((error: unknown, saving = false) => {
    if (!mounted.current) return;
    const conflict =
      saving &&
      error instanceof ApiError &&
      error.status === 409 &&
      (!error.code || error.code === "QR_EVENT_REVISION_CONFLICT");
    setNotice({
      kind: conflict ? "conflict" : "error",
      message: conflict
        ? "This event changed elsewhere. Your edits are still here. Download your draft, then reload the latest saved event before editing again."
        : error instanceof Error
          ? error.message
          : "The request could not be completed. Please try again.",
    });
  }, []);

  const selectEvent = useCallback((event: QrEvent | null) => {
    setSaved(event);
    setDraft(event ? configOf(event) : null);
    setPairingToken(null);
    setPreview(null);
    setManualCode("");
    setNotice(null);
    setTouched({});
    setRemoved(null);
    setSearch("");
    setStatusFilter("all");
    setPairingStored(false);
    setApiCustomized(
      Boolean(
        event &&
          event.publicApiUrl !== suggestedEventApiUrl(event.publicAppUrl),
      ),
    );
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      confirmationResolver.current?.(false);
      confirmationResolver.current = null;
    };
  }, []);
  useEffect(() => {
    onBusyChange?.(busy || Boolean(pairingToken));
    return () => onBusyChange?.(false);
  }, [busy, pairingToken, onBusyChange]);
  useEffect(() => {
    if (notice?.kind === "error" || notice?.kind === "conflict")
      noticeRef.current?.focus();
  }, [notice]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      qrEventsApi.list(store.id),
      api.adminListStoreTables(store.id),
    ])
      .then(([eventResult, tableResult]) => {
        if (cancelled) return;
        setEvents(eventResult.events);
        setTables(tableResult.tables);
        selectEvent(eventResult.events[0] ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not load event data.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [store.id, selectEvent]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty && !busy && !pairingToken) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, busy, pairingToken]);

  const ask = (options: Confirmation) =>
    new Promise<boolean>((resolve) => {
      confirmationResolver.current?.(false);
      confirmationResolver.current = resolve;
      setConfirmation(options);
    });
  const answerConfirmation = (accepted: boolean) => {
    const resolve = confirmationResolver.current;
    confirmationResolver.current = null;
    setConfirmation(null);
    resolve?.(accepted);
  };
  const mayDiscard = async () =>
    !dirty ||
    (await ask({
      title: "Discard unsaved changes?",
      description:
        "Your saved event will stay unchanged. Download a draft copy first if you want to keep these edits.",
      confirmLabel: "Discard changes",
    }));
  const begin = () => {
    if (running.current || !mounted.current) return false;
    running.current = true;
    setBusy(true);
    setNotice(null);
    return true;
  };
  const finish = () => {
    running.current = false;
    if (mounted.current) setBusy(false);
  };
  const downloadDraft = () => {
    if (draft)
      downloadJson(`qr-event-draft-${saved?.id ?? "new"}.json`, {
        draft: true,
        eventId: saved?.id ?? null,
        baseRevision: saved?.revision ?? null,
        storeId: store.id,
        ...draft,
      });
  };
  const remember = (event: QrEvent) => {
    setEvents((current) => [
      event,
      ...current.filter((item) => item.id !== event.id),
    ]);
    selectEvent(event);
  };

  const refresh = async () => {
    if (running.current || !(await mayDiscard()) || !begin()) return;
    try {
      const [result, tableResult] = await Promise.all([
        qrEventsApi.list(store.id),
        api.adminListStoreTables(store.id),
      ]);
      if (!mounted.current) return;
      setEvents(result.events);
      setTables(tableResult.tables);
      selectEvent(
        result.events.find((event) => event.id === saved?.id) ??
          result.events[0] ??
          null,
      );
      setLoadError("");
    } catch (error) {
      reportError(error);
    } finally {
      finish();
    }
  };

  const update = (patch: Partial<QrEventConfig>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));
  const updateAssignment = (index: number, patch: Partial<QrEventAssignment>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            assignments: current.assignments.map((item, itemIndex) =>
              itemIndex === index ? { ...item, ...patch } : item,
            ),
          }
        : current,
    );

  const save = async () => {
    if (!draft || readOnly || running.current || !dirty) return;
    setTouched({ name: true, publicAppUrl: true, publicApiUrl: true });
    const firstInvalid = (
      ["name", "publicAppUrl", "publicApiUrl"] as const
    ).find((field) => errors[field]);
    if (firstInvalid) {
      document.getElementById(fieldIds[firstInvalid])?.focus();
      return;
    }
    if (errors.assignments) {
      setNotice({ kind: "error", message: errors.assignments });
      return;
    }
    if (!begin()) return;
    try {
      const config = normalizedEventDraft(draft);
      const result = saved
        ? await qrEventsApi.update(saved.id, saved.revision, config)
        : await qrEventsApi.create(store.id, config);
      if (!mounted.current) return;
      remember(result.event);
    } catch (error) {
      reportError(error, true);
    } finally {
      finish();
    }
  };

  const addVenueCodes = () => {
    if (!draft) return;
    const known = new Set(
      draft.assignments.map((assignment) => assignment.publicCode),
    );
    const additions = tiles.filter(
      (tile) => tile.storeId === store.id && !known.has(tile.publicCode),
    );
    if (draft.assignments.length + additions.length > MAX_CODES) {
      reportError(
        new Error(`An event can contain up to ${MAX_CODES} QR codes.`),
      );
      return;
    }
    update({
      assignments: [
        ...draft.assignments,
        ...additions.map((tile) => ({
          publicCode: tile.publicCode,
          tableId: tile.tableId ?? null,
          label: tile.label ?? null,
          isActive: tile.isActive,
        })),
      ],
    });
  };

  const addCodes = (manual = false) => {
    if (!draft) return;
    const count = manual ? 1 : generateCount;
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      draft.assignments.length + count > MAX_CODES
    ) {
      reportError(
        new Error(
          `Choose a count from 1 to ${MAX_CODES - draft.assignments.length}.`,
        ),
      );
      return;
    }
    const codes = new Set(
      draft.assignments.map((assignment) => assignment.publicCode),
    );
    if (manual && (!CODE_PATTERN.test(manualCode) || codes.has(manualCode))) {
      reportError(new Error("Enter a unique QR code in GT-XXXX-XXXX format."));
      return;
    }
    const additions: QrEventAssignment[] = [];
    for (let index = 0; index < count; index += 1) {
      let publicCode = manual ? manualCode : generateCode();
      while (codes.has(publicCode)) publicCode = generateCode();
      codes.add(publicCode);
      additions.push({
        publicCode,
        tableId: null,
        label: null,
        isActive: true,
      });
    }
    update({ assignments: [...draft.assignments, ...additions] });
    setManualCode("");
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copied" });
    } catch {
      reportError(
        new Error(
          "Clipboard access is unavailable. Select and copy the displayed text.",
        ),
      );
    }
  };

  const exportEvent = async () => {
    if (!saved || dirty || !begin()) return;
    try {
      const result = await qrEventsApi.export(saved.id);
      if (!mounted.current) return;
      downloadJson(
        `qr-event-${result.bundle.event.id}-r${result.bundle.event.revision}.json`,
        result.bundle,
      );
      if (result.bundle.event.revision !== saved.revision) {
        const latest = await qrEventsApi.get(saved.id);
        if (!mounted.current) return;
        remember(latest.event);
        setNotice({
          kind: "info",
          message: `Downloaded revision ${result.bundle.event.revision}. This event changed elsewhere, so the editor has been refreshed. Review it before printing.`,
        });
      }
    } catch (error) {
      reportError(error);
    } finally {
      finish();
    }
  };

  const importEvent = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!file || running.current || !(await mayDiscard()) || !begin()) return;
    try {
      if (file.size > 1024 * 1024)
        throw new Error("Event bundles must be smaller than 1 MB.");
      let bundle;
      try {
        bundle = JSON.parse(await file.text());
      } catch {
        throw new Error(
          "Choose a valid JSON event bundle exported from the cloud architect dashboard.",
        );
      }
      if (bundle?.schemaVersion !== 1 || bundle?.event?.storeId !== store.id)
        throw new Error(
          "Select the venue this event bundle belongs to before importing.",
        );
      const result = await qrEventsApi.import(bundle);
      if (!mounted.current) return;
      remember(result.event);
      toast({
        title: result.unchanged
          ? "Event is already up to date"
          : "Event imported on this Pi",
      });
    } catch (error) {
      reportError(error);
    } finally {
      finish();
    }
  };

  const changePairing = async (revoke: boolean) => {
    if (!saved || dirty || readOnly || running.current) return;
    if (
      (saved.paired || revoke) &&
      !(await ask({
        title: revoke
          ? "Revoke this Pi connection?"
          : "Replace the pairing token?",
        description: revoke
          ? "Future cloud updates stop. The configuration already saved on the Pi continues to work."
          : "The previous token will stop syncing. Install the new pairing file on the Pi to reconnect.",
        confirmLabel: revoke ? "Revoke connection" : "Replace token",
      }))
    )
      return;
    if (!begin()) return;
    try {
      if (revoke) {
        await qrEventsApi.revoke(saved.id);
        setPairingToken(null);
      } else {
        const result = await qrEventsApi.pair(saved.id);
        if (!mounted.current) return;
        setPairingToken(result.token);
        setPairingStored(false);
      }
      if (!mounted.current) return;
      const updated = {
        ...saved,
        paired: !revoke,
        ...(!revoke ? { lastAppliedRevision: 0, lastAppliedAt: null } : {}),
      };
      setSaved(updated);
      setEvents((current) =>
        current.map((event) => (event.id === saved.id ? updated : event)),
      );
    } catch (error) {
      reportError(error);
    } finally {
      finish();
    }
  };

  const print = async () => {
    if (!saved || dirty || !printable.length || running.current) return;
    const popup = window.open("", "_blank", "width=960,height=800");
    if (!popup) {
      reportError(
        new Error("Allow the print window in your browser and try again."),
      );
      return;
    }
    popup.opener = null;
    popup.document.body.textContent = "Checking the latest saved event…";
    if (!begin()) {
      popup.close();
      return;
    }
    try {
      const [{ event: latest }, tableResult] = await Promise.all([
        qrEventsApi.get(saved.id),
        api.adminListStoreTables(store.id),
      ]);
      if (!mounted.current) {
        popup.close();
        return;
      }
      setTables(tableResult.tables);
      if (latest.revision !== saved.revision) {
        popup.close();
        remember(latest);
        setNotice({
          kind: "info",
          message:
            "This event changed elsewhere. Review the latest saved revision now shown, then print again.",
        });
        return;
      }
      const currentTables = new Map(
        tableResult.tables.map((table) => [table.id, table]),
      );
      const ready = latest.isActive
        ? latest.assignments.filter(
            (assignment) =>
              assignmentStatus(assignment, currentTables) === "ready",
          )
        : [];
      if (!ready.length) {
        popup.close();
        setNotice({
          kind: "info",
          message:
            "No saved codes are ready to print. Enable the event and assign enabled codes to active tables.",
        });
        return;
      }
      // React escapes every event, venue and assignment label before HTML output.
      const markup = renderToStaticMarkup(
        <html>
          <head>
            <title>{saved.name} QR codes</title>
            <style>{`
      body{font-family:Arial,sans-serif;margin:24px;color:#111}h1{font-size:22px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
      article{text-align:center;border:1px solid #ddd;padding:16px;break-inside:avoid}h2{font-size:16px}p{font-size:12px;overflow-wrap:anywhere}
      .code{font-family:monospace}@media print{body{margin:0}article{border:1px solid #aaa}@page{margin:12mm}}
    `}</style>
          </head>
          <body>
            <h1>
              {store.name} — {saved.name}
            </h1>
            <main>
              {ready.map((assignment) => (
                <article key={assignment.publicCode}>
                  <h2>
                    {assignment.label ||
                      tableResult.tables.find(
                        (table) => table.id === assignment.tableId,
                      )?.label ||
                      store.name}
                  </h2>
                  <QRCodeSVG
                    value={eventQrUrl(saved, assignment.publicCode)}
                    size={180}
                    includeMargin
                    level="M"
                  />
                  <p className="code">{assignment.publicCode}</p>
                  <p>{eventQrUrl(saved, assignment.publicCode)}</p>
                </article>
              ))}
            </main>
          </body>
        </html>,
      );
      if (popup.closed) return;
      popup.document.open();
      popup.document.write(`<!doctype html>${markup}`);
      popup.document.close();
      popup.focus();
      popup.setTimeout(() => {
        if (!popup.closed) popup.print();
      }, 250);
    } catch (error) {
      popup.close();
      reportError(error);
    } finally {
      finish();
    }
  };

  const closePairing = async () => {
    if (
      !pairingStored &&
      !(await ask({
        title: "Close without saving the token?",
        description:
          "This token is shown only once. Download the pairing file or copy the token before closing.",
        confirmLabel: "Close without saving",
      }))
    )
      return;
    setPairingToken(null);
  };
  const removeAssignment = async (
    assignment: QrEventAssignment,
    index: number,
  ) => {
    if (!draft || running.current || readOnly) return;
    if (
      !(await ask({
        title: `Remove ${assignment.publicCode}?`,
        description:
          "The code is removed when you save. Printed copies stop working after the Pi receives the change. You can undo the removal before saving.",
        confirmLabel: "Remove code",
      }))
    )
      return;
    setRemoved({ assignment, index });
    update({
      assignments: draft.assignments.filter(
        (row) => row.publicCode !== assignment.publicCode,
      ),
    });
  };
  const undoRemove = () => {
    if (
      !draft ||
      !removed ||
      remaining < 1 ||
      draft.assignments.some(
        (row) => row.publicCode === removed.assignment.publicCode,
      )
    )
      return;
    const assignments = [...draft.assignments];
    assignments.splice(
      Math.min(removed.index, assignments.length),
      0,
      removed.assignment,
    );
    update({ assignments });
    setRemoved(null);
  };

  return (
    <div className="space-y-5" aria-busy={loading || busy}>
      <Card>
        <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-4">
          <CardTitle className="text-xl sm:text-2xl">Event QR codes</CardTitle>
          <CardDescription>
            Manage local QR destinations and table assignments for each event.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={saved?.id ?? ""}
              disabled={loading || busy}
              onValueChange={(id) =>
                void (async () => {
                  if (await mayDiscard())
                    selectEvent(
                      events.find((event) => event.id === id) ?? null,
                    );
                })()
              }
            >
              <SelectTrigger
                className="w-full sm:w-72"
                aria-label="Select QR event"
              >
                <SelectValue
                  placeholder={
                    draft ? "New event (unsaved)" : "Select an event"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                    {event.isActive ? "" : " (disabled)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={busy || loading || Boolean(loadError)}
              onClick={() =>
                void (async () => {
                  if (await mayDiscard()) {
                    selectEvent(null);
                    setDraft(newConfig());
                    window.setTimeout(
                      () => document.getElementById(fieldIds.name)?.focus(),
                      0,
                    );
                  }
                })()
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              New event
            </Button>
            <Button
              variant="outline"
              disabled={busy || loading}
              onClick={() => void refresh()}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Reload
            </Button>
            {LOCAL_ONLY && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  aria-label="Event bundle file"
                  onChange={(event) =>
                    void importEvent(event.target.files?.[0])
                  }
                />
                <Button
                  variant="outline"
                  disabled={busy || loading}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Import event bundle
                </Button>
              </>
            )}
          </div>
          <details className="group text-sm text-muted-foreground">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium text-foreground"><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />How to set up an event</summary>
            <p className="pb-2 leading-relaxed">
              Set the local customer app and Core API addresses, assign tables, then save and{" "}
              {LOCAL_ONLY ? "test on the event Wi-Fi" : "export the event to the Pi or pair it for updates"}.
              {" "}Customers scan directly into the Pi. Test a scan on the event Wi-Fi before giving printed codes to guests.
            </p>
          </details>
          {loading && (
            <p className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading events and tables…
            </p>
          )}
          {loadError && (
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
          )}
          {!loading && !loadError && !draft && (
            <p className="text-sm text-muted-foreground">
              Create an event to issue its local QR codes
              {LOCAL_ONLY
                ? ", or import the bundle prepared by the cloud architect"
                : ""}
              .
            </p>
          )}
        </CardContent>
      </Card>

      {notice && (
        <div
          ref={noticeRef}
          tabIndex={-1}
          role={notice.kind === "info" ? "status" : "alert"}
          className={`rounded-lg border p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring ${notice.kind === "info" ? "border-primary/20 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm">{notice.message}</p>
          </div>
          {notice.kind === "conflict" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={downloadDraft}>
                Download draft copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void refresh()}
              >
                Reload saved event
              </Button>
            </div>
          )}
        </div>
      )}

      {draft && (
        <>
          <div
            className="sticky top-[calc(var(--dashboard-header-height,5rem)+0.5rem)] z-20 flex min-w-0 flex-col gap-2 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-4"
            aria-label="Event save and print actions"
          >
            <div aria-live="polite">
              <p className="text-sm font-medium">
                {busy
                  ? "Working..."
                  : dirty
                    ? "Unsaved changes"
                    : readOnly
                      ? "Managed from cloud"
                      : "All changes saved"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {dirty
                  ? "Save before exporting or printing."
                  : !saved?.isActive
                    ? "Enable this event to print its codes."
                    : `${printable.length} saved code${printable.length === 1 ? "" : "s"} ready to print.`}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              <Button
                aria-label="Save event"
                className="min-w-0 px-2 sm:px-4"
                disabled={!dirty || busy || readOnly}
                onClick={() => void save()}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <span className="sm:hidden">Save</span><span className="hidden sm:inline">Save event</span>
              </Button>
              <Button
                aria-label="Export for Pi"
                className="min-w-0 px-2 sm:px-4"
                variant="outline"
                disabled={!saved || dirty || busy}
                onClick={() => void exportEvent()}
              >
                <Download className="mr-2 h-4 w-4" />
                <span className="sm:hidden">Export</span><span className="hidden sm:inline">Export for Pi</span>
              </Button>
              <Button
                aria-label="Print enabled QR codes"
                className="min-w-0 px-2 sm:px-4"
                variant="outline"
                disabled={!saved || dirty || !printable.length || busy}
                onClick={print}
              >
                <Printer className="mr-2 h-4 w-4" />
                <span className="sm:hidden">Print</span><span className="hidden sm:inline">Print enabled QR codes</span>
              </Button>
            </div>
          </div>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="min-w-0 max-w-full [overflow-wrap:anywhere]">{saved ? saved.name : "New event"}</CardTitle>
                <div className="flex flex-wrap gap-2">
                  {saved && (
                    <>
                      <Badge variant="outline">
                        Saved revision {saved.revision}
                      </Badge>
                      {deployment && (
                        <Badge
                          variant={deployment.applied ? "success" : "warning"}
                        >
                          {deployment.label}
                        </Badge>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {readOnly && (
                <p className="text-sm text-muted-foreground">
                  Managed from cloud. Edit this event in the cloud architect
                  dashboard, then sync or import the newer revision here.
                </p>
              )}
              <fieldset disabled={busy || readOnly} className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="qr-event-name">Event name</Label>
                    <Input
                      id="qr-event-name"
                      value={draft.name}
                      maxLength={120}
                      aria-invalid={Boolean(touched.name && errors.name)}
                      aria-describedby={
                        touched.name && errors.name
                          ? "qr-event-name-error"
                          : undefined
                      }
                      onBlur={() =>
                        setTouched((current) => ({ ...current, name: true }))
                      }
                      onChange={(event) => update({ name: event.target.value })}
                      placeholder="Noor — September dinner"
                    />
                    {touched.name && errors.name && (
                      <p
                        id="qr-event-name-error"
                        className="text-xs text-destructive"
                      >
                        {errors.name}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 md:pt-7">
                    <Switch
                      id="qr-event-enabled"
                      checked={draft.isActive}
                      onCheckedChange={(isActive) => update({ isActive })}
                    />
                    <Label htmlFor="qr-event-enabled">Event enabled</Label>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="qr-event-app">Local customer app URL</Label>
                    <Input
                      id="qr-event-app"
                      maxLength={2000}
                      value={draft.publicAppUrl}
                      onChange={(event) =>
                        update({
                          publicAppUrl: event.target.value,
                          ...(!apiCustomized
                            ? {
                                publicApiUrl: suggestedEventApiUrl(
                                  event.target.value,
                                ),
                              }
                            : {}),
                        })
                      }
                      onBlur={() =>
                        setTouched((current) => ({
                          ...current,
                          publicAppUrl: true,
                        }))
                      }
                      aria-invalid={Boolean(
                        touched.publicAppUrl && errors.publicAppUrl,
                      )}
                      aria-describedby={
                        touched.publicAppUrl && errors.publicAppUrl
                          ? "qr-event-app-error"
                          : undefined
                      }
                      placeholder="http://noor-node.local:8080"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {touched.publicAppUrl && errors.publicAppUrl && (
                      <p
                        id="qr-event-app-error"
                        className="text-xs text-destructive"
                      >
                        {errors.publicAppUrl}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      The address customers open on the event network.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="qr-event-api">
                      Local Core API / QR resolver URL
                    </Label>
                    <Input
                      id="qr-event-api"
                      maxLength={2000}
                      value={draft.publicApiUrl}
                      onChange={(event) => {
                        setApiCustomized(true);
                        update({ publicApiUrl: event.target.value });
                      }}
                      onBlur={() =>
                        setTouched((current) => ({
                          ...current,
                          publicApiUrl: true,
                        }))
                      }
                      aria-invalid={Boolean(
                        touched.publicApiUrl && errors.publicApiUrl,
                      )}
                      aria-describedby={
                        touched.publicApiUrl && errors.publicApiUrl
                          ? "qr-event-api-error"
                          : undefined
                      }
                      placeholder="http://noor-node.local:8080/api"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {touched.publicApiUrl && errors.publicApiUrl && (
                      <p
                        id="qr-event-api-error"
                        className="text-xs text-destructive"
                      >
                        {errors.publicApiUrl}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {apiCustomized
                        ? "Custom API address; it stays fixed when the app address changes."
                        : "Automatically follows the app address, with /api added."}
                    </p>
                    {apiCustomized && (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        disabled={!suggestedEventApiUrl(draft.publicAppUrl)}
                        onClick={() => {
                          setApiCustomized(false);
                          update({
                            publicApiUrl: suggestedEventApiUrl(
                              draft.publicAppUrl,
                            ),
                          });
                        }}
                      >
                        Use app URL + /api
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  These fields control QR destinations. The customer app uses
                  the Core API configured on that Pi. The cloud dashboard keeps
                  its own login and API connection.
                </p>
              </fieldset>
              {apiChanged && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  The printed QR destination is changing. Reprint the event
                  codes after saving and applying the new address; existing
                  copies contain the old address.
                </div>
              )}
              {!draft.isActive && (
                <p className="text-sm text-muted-foreground">
                  This event is disabled. Its QR codes stop working{" "}
                  {LOCAL_ONLY
                    ? "when you save"
                    : "after the Pi receives the saved change"}
                  .
                </p>
              )}
              {deployment && (
                <p className="text-xs text-muted-foreground">
                  {deployment.detail}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                QR assignments{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {draft.assignments.length} / {MAX_CODES}
                </span>
              </CardTitle>
              <CardDescription>
                Reuse existing venue codes or issue new codes for this event. An
                unassigned QR must be linked to an active table before it can be
                used or printed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                aria-label="QR assignment readiness"
              >
                <div className="rounded-lg border bg-emerald-500/5 p-3">
                  <p className="text-2xl font-semibold">{counts.ready}</p>
                  <p className="text-xs text-muted-foreground">
                    {draft.isActive
                      ? "Ready to print"
                      : "Assigned; event disabled"}
                  </p>
                </div>
                <div className="rounded-lg border bg-amber-500/5 p-3">
                  <p className="text-2xl font-semibold">{counts.unassigned}</p>
                  <p className="text-xs text-muted-foreground">Need a table</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-semibold">
                    {counts["inactive-table"]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Table unavailable
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-2xl font-semibold">{counts.disabled}</p>
                  <p className="text-xs text-muted-foreground">
                    Codes disabled
                  </p>
                </div>
              </div>
              <fieldset disabled={busy || readOnly} className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={addVenueCodes}
                    disabled={
                      !remaining ||
                      !tiles.some(
                        (tile) =>
                          tile.storeId === store.id &&
                          !draft.assignments.some(
                            (row) => row.publicCode === tile.publicCode,
                          ),
                      )
                    }
                  >
                    Add venue QR codes
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={Math.max(1, remaining)}
                    disabled={!remaining}
                    value={generateCount}
                    onChange={(event) =>
                      setGenerateCount(Number(event.target.value))
                    }
                    className="w-24"
                    aria-label="Number of new QR codes"
                  />
                  <Button
                    variant="outline"
                    disabled={!remaining}
                    onClick={() => addCodes()}
                  >
                    Generate codes
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={manualCode}
                    onChange={(event) =>
                      setManualCode(event.target.value.trim().toUpperCase())
                    }
                    placeholder="GT-ABCD-1234"
                    className="w-52 font-mono"
                    maxLength={12}
                    aria-label="Existing QR code"
                  />
                  <Button
                    variant="outline"
                    onClick={() => addCodes(true)}
                    disabled={!manualCode || !remaining}
                  >
                    Add exact code
                  </Button>
                </div>
              </fieldset>
              {removed && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <p>
                    <code>{removed.assignment.publicCode}</code> removed from
                    the draft.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy || !remaining}
                    onClick={undoRemove}
                  >
                    <Undo2 className="mr-2 h-4 w-4" />
                    Undo removal
                  </Button>
                </div>
              )}
              {draft.assignments.length > 0 && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search codes, labels or tables"
                      aria-label="Search event QR codes"
                      className="pl-9"
                    />
                  </div>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) =>
                      setStatusFilter(value as AssignmentStatus | "all")
                    }
                  >
                    <SelectTrigger
                      className="w-full sm:w-48"
                      aria-label="Filter QR readiness"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All codes</SelectItem>
                      <SelectItem value="ready">Ready</SelectItem>
                      <SelectItem value="unassigned">Needs table</SelectItem>
                      <SelectItem value="inactive-table">
                        Table unavailable
                      </SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="rounded-lg border md:max-h-[38rem] md:overflow-auto">
                <table role="table" className="block w-full text-sm md:table">
                  <thead className="hidden md:table-header-group sticky top-0 z-10 bg-muted">
                    <tr className="border-b text-left">
                      <th className="p-2">QR code</th>
                      <th className="p-2">Printed label</th>
                      <th className="p-2">Table</th>
                      <th className="p-2">Enabled</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="block md:table-row-group">
                    {visibleAssignments.map(({ assignment, index }) => (
                      <tr key={assignment.publicCode} className="grid grid-cols-2 items-end gap-3 border-b p-3 last:border-b-0 md:table-row md:p-0">
                        <td className="col-span-2 flex items-center justify-between gap-2 whitespace-nowrap md:table-cell md:p-2">
                          <code>{assignment.publicCode}</code>
                          <Badge
                            variant={
                              assignmentStatus(assignment, tableMap) === "ready"
                                ? "success"
                                : assignmentStatus(assignment, tableMap) ===
                                    "disabled"
                                  ? "outline"
                                  : "warning"
                            }
                            className="mt-1 block w-fit text-[10px]"
                          >
                            {
                              {
                                ready: "Ready",
                                unassigned: "Needs table",
                                "inactive-table": "Table unavailable",
                                disabled: "Disabled",
                              }[assignmentStatus(assignment, tableMap)]
                            }
                          </Badge>
                        </td>
                        <td className="col-span-2 block min-w-0 md:table-cell md:p-2">
                          <span className="mb-1.5 block text-xs font-medium text-muted-foreground md:hidden">Printed label</span>
                          <Input
                            value={assignment.label ?? ""}
                            maxLength={100}
                            className="w-full min-w-0 md:min-w-36"
                            aria-label={`Label for ${assignment.publicCode}`}
                            disabled={busy || readOnly}
                            onChange={(event) =>
                              updateAssignment(index, {
                                label: event.target.value || null,
                              })
                            }
                          />
                        </td>
                        <td className="col-span-2 block min-w-0 md:table-cell md:p-2">
                          <span className="mb-1.5 block text-xs font-medium text-muted-foreground md:hidden">Table</span>
                          <Select
                            value={assignment.tableId ?? NONE}
                            disabled={busy || readOnly}
                            onValueChange={(tableId) =>
                              updateAssignment(index, {
                                tableId: tableId === NONE ? null : tableId,
                              })
                            }
                          >
                            <SelectTrigger
                              className="w-full min-w-0 md:min-w-40"
                              aria-label={`Table for ${assignment.publicCode}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>Unassigned</SelectItem>
                              {assignment.tableId &&
                                !tableMap.has(assignment.tableId) && (
                                  <SelectItem
                                    value={assignment.tableId}
                                    disabled
                                  >
                                    Table no longer available
                                  </SelectItem>
                                )}
                              {tables.map((table) => (
                                <SelectItem
                                  key={table.id}
                                  value={table.id}
                                  disabled={!table.isActive}
                                >
                                  {table.label}
                                  {table.isActive ? "" : " (inactive)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="flex min-h-11 items-center gap-2 md:table-cell md:p-2">
                          <span className="text-xs text-muted-foreground md:hidden">Enabled</span>
                          <Switch
                            checked={assignment.isActive}
                            disabled={busy || readOnly}
                            aria-label={`Enable ${assignment.publicCode}`}
                            onCheckedChange={(isActive) =>
                              updateAssignment(index, { isActive })
                            }
                          />
                        </td>
                        <td className="block md:table-cell md:p-2">
                          <div className="flex items-center justify-end gap-1 md:justify-start">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!saved || dirty || busy}
                              onClick={() => setPreview(assignment)}
                            >
                              QR
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={!saved || dirty || busy}
                              aria-label={`Copy URL for ${assignment.publicCode}`}
                              onClick={() =>
                                saved &&
                                void copy(
                                  eventQrUrl(saved, assignment.publicCode),
                                )
                              }
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={busy || readOnly}
                              aria-label={`Remove ${assignment.publicCode}`}
                              onClick={() =>
                                void removeAssignment(assignment, index)
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {draft.assignments.length > 0 && !visibleAssignments.length && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No codes match your search or filter.
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => {
                        setSearch("");
                        setStatusFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </div>
              {!draft.assignments.length && (
                <p className="text-sm text-muted-foreground">
                  No QR codes in this event yet.
                </p>
              )}
            </CardContent>
          </Card>

          {!LOCAL_ONLY && saved && !readOnly && (
            <Card>
              <CardHeader>
                <CardTitle>Pi connection</CardTitle>
                <CardDescription>
                  {saved.paired
                    ? "A pairing token has been issued for this event."
                    : "Pair the Pi to receive future event changes whenever it is online, or transfer an exported bundle."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  The Pi contacts the cloud to fetch this event. Customer scans,
                  login and ordering continue locally when the internet is
                  unavailable. Cloud edits take effect after the Pi receives
                  them.
                </p>
                <p className="text-xs text-muted-foreground">
                  Event ID: <code>{saved.id}</code>
                  {saved.lastAppliedAt
                    ? ` · Last applied: ${new Date(saved.lastAppliedAt).toLocaleString()}`
                    : " · No Pi acknowledgement yet"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy || dirty}
                    onClick={() => void changePairing(false)}
                  >
                    {saved.paired
                      ? "Replace pairing token"
                      : "Create pairing token"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || dirty || !saved.paired}
                    onClick={() => void changePairing(true)}
                  >
                    Revoke pairing
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog
        open={Boolean(pairingToken)}
        onOpenChange={(open) => {
          if (!open) void closePairing();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save the Pi pairing token</DialogTitle>
            <DialogDescription>
              This token can read this event and acknowledge applied revisions.
              It is shown once. Download the pairing file to data/qr-sync.json
              on the Pi and enable its optional QR sync. Keep the file private;
              the cloud API must use HTTPS.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={pairingToken ?? ""}
            readOnly
            autoComplete="off"
            aria-label="Pi pairing token"
            className="font-mono"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                void (async () => {
                  if (pairingToken) {
                    try {
                      await navigator.clipboard.writeText(pairingToken);
                      setPairingStored(true);
                      toast({ title: "Copied" });
                    } catch {
                      reportError(
                        new Error(
                          "Clipboard access is unavailable. Download the pairing file instead.",
                        ),
                      );
                    }
                  }
                })()
              }
            >
              Copy token
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (pairingToken && saved) {
                  downloadJson("qr-sync.json", {
                    eventId: saved.id,
                    cloudApiUrl: API_BASE,
                    token: pairingToken,
                  });
                  setPairingStored(true);
                }
              }}
            >
              Download pairing file
            </Button>
            <Button onClick={() => void closePairing()}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{preview?.label || preview?.publicCode}</DialogTitle>
            <DialogDescription className="break-all">
              {preview && saved ? eventQrUrl(saved, preview.publicCode) : ""}
            </DialogDescription>
          </DialogHeader>
          {preview && saved && (
            <div className="flex justify-center rounded bg-white p-4">
              <QRCodeSVG
                value={eventQrUrl(saved, preview.publicCode)}
                size={240}
                includeMargin
              />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setPreview(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) answerConfirmation(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => answerConfirmation(false)}>
              Keep working
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => answerConfirmation(true)}
            >
              {confirmation?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
