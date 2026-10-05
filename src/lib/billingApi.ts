import { v4 as uuid } from "uuid";
import { fetchApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { BillListResponse, BillPayment, BillPaymentRequest, BillVisit, PendingBillPayment } from "@/types/billing";

function scope() {
  const user = useAuthStore.getState().user;
  if (!user?.id || !user.storeSlug) throw new Error("BILLING_SESSION_REQUIRED");
  return `${user.storeSlug}:${user.id}`;
}

function pendingKey(visitId: string) { return `billing-payment:${scope()}:${visitId}`; }

export function readPendingBillPayment(visitId: string): PendingBillPayment | null {
  const raw = localStorage.getItem(pendingKey(visitId));
  if (!raw) return null;
  const pending = JSON.parse(raw) as PendingBillPayment;
  if (pending?.version !== 1 || pending.visitId !== visitId || !pending.request?.requestId || !Number.isInteger(pending.request.expectedRevision)) {
    throw new Error("BILLING_RECOVERY_UNREADABLE");
  }
  return pending;
}

export function prepareBillPayment(visitId: string, request: Omit<BillPaymentRequest, "requestId">): PendingBillPayment {
  if (readPendingBillPayment(visitId)) throw new Error("BILLING_PAYMENT_PENDING");
  const pending: PendingBillPayment = { version: 1, visitId, createdAt: new Date().toISOString(), request: { ...request, requestId: uuid() } };
  const key = pendingKey(visitId);
  const raw = JSON.stringify(pending);
  // Payment recovery must survive a lost response, reload, and closed tab.
  // Refuse to submit when the browser cannot retain the exact pending request.
  localStorage.setItem(key, raw);
  if (localStorage.getItem(key) !== raw) throw new Error("BILLING_RECOVERY_UNAVAILABLE");
  window.dispatchEvent(new Event("billing-pending-changed"));
  return pending;
}

export function clearPendingBillPayment(pending: PendingBillPayment) {
  const key = pendingKey(pending.visitId);
  if (readPendingBillPayment(pending.visitId)?.request.requestId === pending.request.requestId) localStorage.removeItem(key);
  window.dispatchEvent(new Event("billing-pending-changed"));
}

async function mutation<T>(endpoint: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 20_000);
  try { return await fetchApi<T>(endpoint, { method: "POST", body: JSON.stringify(body), signal: controller.signal }); }
  finally { window.clearTimeout(timer); }
}

const rememberedActions = new Map<string, string>();
async function rememberedMutation<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const key = `billing-action:${scope()}:${endpoint}:${JSON.stringify(body)}`;
  let requestId = rememberedActions.get(key) || localStorage.getItem(key);
  requestId ||= uuid();
  rememberedActions.set(key, requestId);
  localStorage.setItem(key, requestId);
  const result = await mutation<T>(endpoint, { ...body, requestId });
  localStorage.removeItem(key);
  rememberedActions.delete(key);
  return result;
}

export const billingApi = {
  list: (closed = false, signal?: AbortSignal) => fetchApi<BillListResponse>(`/billing/visits${closed ? "?status=closed" : ""}`, { signal }),
  visit: (id: string, signal?: AbortSignal) => fetchApi<{ visit: BillVisit }>(`/billing/visits/${encodeURIComponent(id)}`, { signal }),
  payment: (requestId: string, signal?: AbortSignal) => fetchApi<{ payment: BillPayment; visit: BillVisit }>(`/billing/payments/${encodeURIComponent(requestId)}`, { signal }),
  recordPayment: (pending: PendingBillPayment) => mutation<{ visit: BillVisit; payment: BillPayment; replayed: boolean }>(`/billing/visits/${encodeURIComponent(pending.visitId)}/payments`, pending.request),
  open: (tableId: string) => rememberedMutation<{ visit: BillVisit }>("/billing/visits", { tableId }),
  close: (visit: BillVisit) => rememberedMutation<{ visit: BillVisit }>(`/billing/visits/${encodeURIComponent(visit.id)}/close`, { expectedRevision: visit.revision }),
  transfer: (visit: BillVisit, tableId: string) => rememberedMutation<{ visit: BillVisit }>(`/billing/visits/${encodeURIComponent(visit.id)}/transfer`, { expectedRevision: visit.revision, tableId }),
  adopt: (visit: BillVisit, orderIds: string[]) => rememberedMutation<{ visit: BillVisit }>(`/billing/visits/${encodeURIComponent(visit.id)}/adopt`, { expectedRevision: visit.revision, orderIds: [...orderIds].sort() }),
};
