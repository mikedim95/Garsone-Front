import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { billingGuest, type CustomerVisit } from "@/lib/billingGuest";
import { CustomerVisitStorageError, endCustomerVisit, notifyCustomerVisitChanged, readCustomerVisit, saveCustomerVisit, type StoredCustomerVisit } from "@/lib/customerVisitStorage";
import { clearSubmission, newSubmissionId, readSubmission } from "@/lib/orderSubmission";

function retireClosedSubmission(saved: StoredCustomerVisit) {
  for (const tableId of new Set([saved.tableId, saved.pendingTableId].filter(Boolean))) {
    const pending = readSubmission(saved.storeSlug, tableId!);
    if (pending?.payload.visit === saved.token) clearSubmission(pending);
  }
}

const joins = new Map<string, Promise<{ visit: CustomerVisit; visitToken: string }>>();
const joinOnce = (storeSlug: string, tableId: string) => {
  const key = `${storeSlug}:${tableId}`;
  let pending = joins.get(key);
  if (!pending) {
    pending = billingGuest.join(storeSlug, tableId).finally(() => joins.delete(key));
    joins.set(key, pending);
  }
  return pending;
};

export function useCustomerVisit({ storeSlug, tableId, enabled, recoveryVersion, onMoved }: {
  storeSlug: string;
  tableId: string | null;
  enabled: boolean;
  recoveryVersion: number;
  onMoved: (visit: CustomerVisit) => void;
}) {
  const [record, setRecord] = useState<StoredCustomerVisit | null>(null);
  const [visit, setVisit] = useState<CustomerVisit | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "ended" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"connection" | "storage" | "pending" | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const contextRef = useRef("");
  const onMovedRef = useRef(onMoved);
  const mutationRef = useRef(false);
  const recordRef = useRef(record);
  const visitRef = useRef(visit);
  contextRef.current = enabled && tableId ? `${storeSlug}:${tableId}` : "";
  onMovedRef.current = onMoved;
  recordRef.current = record;
  visitRef.current = visit;

  const applySnapshot = useCallback((saved: StoredCustomerVisit, next: CustomerVisit) => {
    if (next.id !== saved.visitId) throw new Error("Visit response mismatch");
    const stored = readCustomerVisit(saved.storeSlug, saved.tableId);
    if (stored && (stored.visitId !== saved.visitId || stored.token !== saved.token || stored.state === "ended")) return;
    if (visitRef.current?.id === next.id && visitRef.current.revision > next.revision) return;
    if (next.status === "CLOSED") {
      const ended = endCustomerVisit({ ...saved, endedReason: "closed" });
      retireClosedSubmission(ended);
      setRecord(ended); setVisit(null); setStatus("ended"); notifyCustomerVisitChanged();
      return;
    }
    const latest = stored || saved;
    setRecord(latest); setVisit(next); setStatus("ready"); setError(null);
    if (next.tableId !== saved.tableId) {
      // Retain the old QR's capability as an alias to this party's transferred visit.
      // The backend determines the destination; an unrelated party is never joined.
      const pendingTableId = readSubmission(saved.storeSlug, saved.tableId) ? saved.tableId : saved.pendingTableId;
      saveCustomerVisit({ ...latest, tableId: next.tableId, ...(pendingTableId ? { pendingTableId } : {}) });
      onMovedRef.current(next);
    }
    notifyCustomerVisitChanged();
  }, []);

  const markEnded = useCallback((saved: StoredCustomerVisit, closed = false) => {
    try { closed ||= readCustomerVisit(saved.storeSlug, saved.tableId)?.endedReason === "closed"; } catch { /* Preserve in-memory revocation even if storage fails. */ }
    const ended = { ...saved, state: "ended" as const, endedReason: closed ? "closed" as const : "revoked" as const };
    try { endCustomerVisit(ended); if (closed) retireClosedSubmission(ended); } catch { setError("storage"); }
    setRecord(ended); setVisit(null); setStatus("ended");
    notifyCustomerVisitChanged();
  }, []);

  useEffect(() => {
    if (!enabled || !tableId || !storeSlug) {
      setRecord(null); setVisit(null); setStatus("loading");
      return;
    }
    const context = `${storeSlug}:${tableId}`;
    let cancelled = false;
    const current = () => !cancelled && contextRef.current === context;
    void (async () => {
      let saved: StoredCustomerVisit | null;
      try { saved = readCustomerVisit(storeSlug, tableId); }
      catch { if (current()) { setStatus("error"); setError("storage"); } return; }
      if (saved?.state === "ended") {
        if (saved.endedReason === "closed") {
          try { retireClosedSubmission(saved); } catch { if (current()) setError("storage"); }
        }
        if (current()) { setRecord(saved); setVisit(null); setStatus("ended"); }
        return;
      }
      try {
        if (!saved) {
          const response = await joinOnce(storeSlug, tableId);
          saved = { version: 1, storeSlug, tableId, visitId: response.visit.id, token: response.visitToken, state: "active" };
          saveCustomerVisit(saved);
          if (current()) applySnapshot(saved, response.visit);
        } else {
          if (current()) setRecord(saved);
          const response = await billingGuest.get(storeSlug, saved.visitId, saved.token);
          if (current()) applySnapshot(saved, response.visit);
        }
      } catch (failure) {
        if (!current()) return;
        if (saved && failure instanceof ApiError && ["VISIT_CLOSED", "VISIT_ACCESS_REQUIRED"].includes(failure.code || "")) markEnded(saved, failure.code === "VISIT_CLOSED");
        else { setStatus("error"); setError(failure instanceof CustomerVisitStorageError ? "storage" : "connection"); }
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, storeSlug, tableId, recoveryVersion, refreshVersion, applySnapshot, markEnded]);

  useEffect(() => {
    const invalidated = (event: Event) => {
      const { token, code } = (event as CustomEvent<{ token?: string; code?: string }>).detail || {};
      const saved = recordRef.current;
      if (saved && token === saved.token) markEnded(saved, code === "VISIT_CLOSED");
    };
    window.addEventListener("customer-visit-invalid", invalidated);
    const changedElsewhere = (event: StorageEvent) => {
      if (event.key?.startsWith("garsone:customer-visit:")) setRefreshVersion(value => value + 1);
    };
    window.addEventListener("storage", changedElsewhere);
    return () => {
      window.removeEventListener("customer-visit-invalid", invalidated);
      window.removeEventListener("storage", changedElsewhere);
    };
  }, [markEnded]);

  const startNewVisit = async () => {
    if (mutationRef.current || !tableId || !enabled) return;
    const context = `${storeSlug}:${tableId}`;
    mutationRef.current = true; setBusy(true);
    try {
      // An unresolved order remains attached to its original visit, never to the next party.
      try {
        if (readSubmission(storeSlug, tableId) || (record?.pendingTableId && readSubmission(storeSlug, record.pendingTableId))) { setError("pending"); return; }
      } catch { setError("storage"); return; }
      const response = await joinOnce(storeSlug, tableId);
      const next: StoredCustomerVisit = { version: 1, storeSlug, tableId, visitId: response.visit.id, token: response.visitToken, state: "active" };
      saveCustomerVisit(next);
      if (contextRef.current === context) applySnapshot(next, response.visit);
    } catch (failure) { if (contextRef.current === context) setError(failure instanceof CustomerVisitStorageError ? "storage" : "connection"); }
    finally { mutationRef.current = false; setBusy(false); }
  };

  const requestBill = async () => {
    if (mutationRef.current || !record || status !== "ready") return;
    const context = contextRef.current;
    mutationRef.current = true; setBusy(true);
    try {
      const saved = readCustomerVisit(storeSlug, record.tableId);
      if (!saved || saved.state !== "active" || saved.token !== record.token) { setRefreshVersion(value => value + 1); return; }
      const pending = { ...saved, billRequestId: saved.billRequestId || newSubmissionId() };
      saveCustomerVisit(pending); setRecord(pending);
      const response = await billingGuest.requestBill(storeSlug, pending.visitId, pending.token, pending.billRequestId);
      if (contextRef.current === context) applySnapshot(pending, response.visit);
    } catch (failure) {
      if (contextRef.current !== context) return;
      if (failure instanceof ApiError && ["VISIT_CLOSED", "VISIT_ACCESS_REQUIRED"].includes(failure.code || "")) markEnded(record, failure.code === "VISIT_CLOSED");
      else setError(failure instanceof CustomerVisitStorageError ? "storage" : "connection");
    } finally { mutationRef.current = false; setBusy(false); }
  };
  return { record, visit, status, error, busy, refresh: () => setRefreshVersion(value => value + 1), startNewVisit, requestBill };
}
