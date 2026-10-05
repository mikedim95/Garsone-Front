import type { CartItem, CreateOrderPayload } from "../types/index";

export type PendingSubmission = {
  version: 1;
  storeSlug: string;
  createdAt: string;
  payload: CreateOrderPayload & { submissionId: string };
  cart: CartItem[];
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const prefix = "garsone:order-submission:";
const keyFor = (storeSlug: string, tableId: string) => `${prefix}${encodeURIComponent(storeSlug)}:${tableId}`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// getRandomValues is available on the Pi's HTTP LAN origin too; randomUUID is not.
export function newSubmissionId(cryptoSource: Pick<Crypto, "getRandomValues"> = globalThis.crypto): string {
  const bytes = cryptoSource.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function readSubmission(storeSlug: string, tableId: string, storage: StorageLike = localStorage): PendingSubmission | null {
  const raw = storage.getItem(keyFor(storeSlug, tableId));
  if (!raw) return null;
  const value = JSON.parse(raw) as PendingSubmission;
  if (value?.version !== 1 || value.storeSlug !== storeSlug || value.payload?.tableId !== tableId ||
      !uuidPattern.test(value.payload?.submissionId ?? "") || !Array.isArray(value.payload.items) ||
      !Array.isArray(value.cart)) throw new Error("Saved order could not be read");
  return value;
}

export function saveSubmission(storeSlug: string, payload: CreateOrderPayload, cart: CartItem[], storage: StorageLike = localStorage): PendingSubmission {
  const existing = readSubmission(storeSlug, payload.tableId, storage);
  if (existing) return existing;
  const pending: PendingSubmission = JSON.parse(JSON.stringify({
    version: 1, storeSlug, createdAt: new Date().toISOString(),
    payload: { ...payload, submissionId: newSubmissionId() }, cart,
  }));
  const key = keyFor(storeSlug, payload.tableId);
  const serialized = JSON.stringify(pending);
  // Never send a new order unless its recovery key survives a reload.
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new Error("Order recovery storage is unavailable");
  return pending;
}

export function clearSubmission(pending: PendingSubmission, storage: StorageLike = localStorage): void {
  const key = keyFor(pending.storeSlug, pending.payload.tableId);
  if (readSubmission(pending.storeSlug, pending.payload.tableId, storage)?.payload.submissionId === pending.payload.submissionId) storage.removeItem(key);
}

function selectionKey(item: CartItem): string {
  const modifiers = Object.entries(item.selectedModifiers || {}).sort(([a], [b]) => a.localeCompare(b))
    .map(([id, values]) => [id, (Array.isArray(values) ? [...values] : [values]).sort()]);
  return JSON.stringify([item.item.id, modifiers, item.note?.trim() || ""]);
}

// Keep anything added while the connection was down. Only the confirmed quantities leave the cart.
export function cartAfterConfirmation(current: CartItem[], submitted: CartItem[]): CartItem[] {
  const remaining = new Map<string, number>();
  for (const item of submitted) remaining.set(selectionKey(item), (remaining.get(selectionKey(item)) || 0) + item.quantity);
  return current.flatMap(item => {
    const key = selectionKey(item);
    const consumed = Math.min(item.quantity, remaining.get(key) || 0);
    remaining.set(key, (remaining.get(key) || 0) - consumed);
    return item.quantity > consumed ? [{ ...item, quantity: item.quantity - consumed }] : [];
  });
}

export function submissionDefinitelyRejected(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  // Timeouts, server errors and conflicts remain recoverable until resolved.
  return typeof status === "number" && [400, 404, 422].includes(status);
}
