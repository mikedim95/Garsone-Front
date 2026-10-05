export type StoredCustomerVisit = {
  version: 1;
  storeSlug: string;
  tableId: string;
  visitId: string;
  token: string;
  state: "active" | "ended";
  billRequestId?: string;
  pendingTableId?: string;
  endedReason?: "closed" | "revoked";
};

export class CustomerVisitStorageError extends Error {
  constructor(message = "Visit storage is unavailable") { super(message); this.name = "CustomerVisitStorageError"; }
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;
export const customerVisitKey = (storeSlug: string, tableId: string) =>
  `garsone:customer-visit:${encodeURIComponent(storeSlug)}:${tableId}`;

export function readCustomerVisit(storeSlug: string, tableId: string, storage: StorageLike = localStorage): StoredCustomerVisit | null {
  try {
  const raw = storage.getItem(customerVisitKey(storeSlug, tableId));
  if (!raw) return null;
  const value = JSON.parse(raw) as StoredCustomerVisit;
  if (value?.version !== 1 || value.storeSlug !== storeSlug || value.tableId !== tableId ||
      typeof value.visitId !== "string" || typeof value.token !== "string" || !/^[a-f0-9]{64}$/i.test(value.token) ||
      !["active", "ended"].includes(value.state)) throw new CustomerVisitStorageError("Visit storage is invalid");
  return value;
  } catch (error) { throw error instanceof CustomerVisitStorageError ? error : new CustomerVisitStorageError("Visit storage is invalid or unavailable"); }
}

export function saveCustomerVisit(value: StoredCustomerVisit, storage: StorageLike = localStorage): void {
  try {
  const serialized = JSON.stringify(value);
  const key = customerVisitKey(value.storeSlug, value.tableId);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new CustomerVisitStorageError();
  } catch (error) { throw error instanceof CustomerVisitStorageError ? error : new CustomerVisitStorageError(); }
}

// Keep the ended record: deleting it would silently grant this browser access to
// the next party at the same printed table QR on a background refresh.
export function endCustomerVisit(value: StoredCustomerVisit, storage: StorageLike = localStorage): StoredCustomerVisit {
  const ended = { ...value, state: "ended" as const };
  saveCustomerVisit(ended, storage);
  return ended;
}

export function storedCustomerVisitToken(storeSlug?: string | null, tableId?: string | null): string | undefined {
  if (!storeSlug || !tableId || typeof window === "undefined") return undefined;
  try {
    const value = readCustomerVisit(storeSlug, tableId);
    return value?.state === "active" ? value.token : undefined;
  } catch { return undefined; }
}

export function notifyCustomerVisitChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("customer-visit-changed"));
}
