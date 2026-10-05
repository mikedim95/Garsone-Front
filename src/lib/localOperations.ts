import { v4 as uuid } from "uuid";
import { fetchApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

export interface LocalPrintJob {
  id: string;
  topic: string;
  state: "queued" | "uncertain" | "delivered";
  createdAt: string;
  busy?: boolean;
  startedAt?: string | null;
  orderId?: string | null;
  ticketNumber?: number | string;
  tableLabel?: string;
  error?: string | null;
  reprintOfId?: string | null;
  resolvedAt?: string | null;
  resolution?: string | null;
}

export interface LocalOperationsStatus {
  localOnly: boolean;
  checkedAt: string;
  system: {
    uptimeSeconds: number;
    database: { ok: boolean };
    storage: { availableBytes: number | null };
  };
  backup: {
    lastSuccessfulAt: string | null;
    source: "deployment" | "unknown";
    error?: string;
  };
  printing: {
    enabled: boolean;
    lastError: string | null;
    pendingCount?: number | null;
    printers: Array<{
      id: string;
      topics: string[];
      device: string;
      available: boolean;
      busy: boolean;
      lastError: string | null;
    }>;
    jobs: LocalPrintJob[];
  };
}

export type LocalOperationAction =
  | { type: "test"; targetId: string }
  | { type: "printed" | "reprint"; targetId: string };

const pendingRequests = new Map<string, string>();

function requestStorageKey(action: LocalOperationAction) {
  const user = useAuthStore.getState().user;
  return `local-operation:${user?.storeSlug}:${user?.id}:${action.type}:${action.targetId}`;
}

export function getLocalOperations(signal?: AbortSignal) {
  return fetchApi<LocalOperationsStatus>("/manager/local-operations", { signal });
}

export async function performLocalOperation(action: LocalOperationAction) {
  const key = requestStorageKey(action);
  let requestId = pendingRequests.get(key);
  try { requestId ||= sessionStorage.getItem(key) || undefined; } catch { /* In-memory retry remains safe. */ }
  requestId ||= uuid(); // getRandomValues also works on the Pi's HTTP LAN origin.
  pendingRequests.set(key, requestId);
  try { sessionStorage.setItem(key, requestId); } catch { /* Storage may be unavailable. */ }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const endpoint = action.type === "test"
      ? "/manager/local-operations/printers/test"
      : `/manager/local-operations/jobs/${encodeURIComponent(action.targetId)}/resolve`;
    const body = action.type === "test"
      ? { printerId: action.targetId, requestId }
      : { action: action.type, requestId };
    await fetchApi(endpoint, { method: "POST", body: JSON.stringify(body), signal: controller.signal });
    // Only an acknowledged response starts a new action. A lost response must
    // reuse the same key, even after navigating away or reloading the page.
    pendingRequests.delete(key);
    try { sessionStorage.removeItem(key); } catch { /* No stored value to remove. */ }
  } finally {
    window.clearTimeout(timeout);
  }
}
