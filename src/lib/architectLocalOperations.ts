import { v4 as uuid } from "uuid";
import { ApiError, fetchApi } from "@/lib/api";
import type { LocalOperationsStatus } from "@/lib/localOperations";
import { useAuthStore } from "@/store/authStore";
import type { StoreInfo } from "@/types";

export interface LocalStoreSnapshot {
  source: "PI";
  checkedAt: string;
  store: StoreInfo;
  counts: { usersCount: number; tilesCount: number; ordersCount: number };
}

export interface LocalPrinterTestResult {
  jobId: string;
  replayed: boolean;
  state: "queued" | "uncertain" | "delivered";
}

const pendingTests = new Map<string, string>();
const storeEndpoint = (storeId: string) => `/admin/stores/${encodeURIComponent(storeId)}`;

// Architect credentials stay on its configured cloud API; the node relays only
// named operations. A reported LAN URL is never an authenticated API target.
export async function getLocalStoreSnapshot(storeId: string, signal?: AbortSignal) {
  const result = await fetchApi<LocalStoreSnapshot>(`${storeEndpoint(storeId)}/local-status`, { signal, timeoutMs: 40_000 });
  if (result?.source !== "PI" || !result.store || !result.counts) throw new ApiError(502, "Local venue status is unavailable.");
  return result;
}

export async function getArchitectPrinterStatus(storeId: string, signal?: AbortSignal) {
  const result = await fetchApi<LocalOperationsStatus>(`${storeEndpoint(storeId)}/nodes/main/printers/status`, { signal, timeoutMs: 40_000 });
  if (!result?.localOnly || !result.system?.database || !Array.isArray(result.printing?.printers)) throw new ApiError(502, "Local printer status is unavailable.");
  return result;
}

export async function testArchitectLocalPrinter(storeId: string, printerId: string) {
  const actorId = useAuthStore.getState().user?.id;
  const key = `architect-printer-test:${actorId}:${storeId}:${printerId}`;
  let requestId = pendingTests.get(key);
  try { requestId ||= sessionStorage.getItem(key) || undefined; } catch { /* Keep an in-memory retry key. */ }
  requestId ||= uuid();
  pendingTests.set(key, requestId);
  try { sessionStorage.setItem(key, requestId); } catch { /* Storage may be unavailable. */ }
  const result = await fetchApi<LocalPrinterTestResult>(`${storeEndpoint(storeId)}/nodes/main/printers/test`, {
    method: "POST", body: JSON.stringify({ printerId, requestId }), timeoutMs: 40_000,
  });
  if (!result?.jobId || !["queued", "uncertain", "delivered"].includes(result.state)) throw new ApiError(502, "The Pi did not confirm the test ticket.");
  // A timeout may follow a successful print. Reuse this venue/printer key until
  // an acknowledged result permits a deliberate new ticket, including reloads.
  if (result.state !== "uncertain") {
    pendingTests.delete(key);
    try { sessionStorage.removeItem(key); } catch { /* No persisted entry to clear. */ }
  }
  return result;
}
