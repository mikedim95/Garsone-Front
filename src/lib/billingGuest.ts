import { fetchApi } from "./api";
import type { Order } from "@/types";

export type CustomerVisit = {
  id: string;
  tableId: string;
  tableLabel: string;
  status: "OPEN" | "BILL_REQUESTED" | "CLOSED";
  revision: number;
  currencyCode: string;
  openedAt: string;
  closedAt: string | null;
  billRequestedAt: string | null;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  orderCount: number;
  orders: Order[];
  items: Array<{
    orderItemId: string;
    orderId: string;
    title: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    paidCents: number;
    outstandingCents: number;
    remainingQuantity: number;
  }>;
};

const headers = (storeSlug: string, token?: string) => ({
  "x-store-slug": storeSlug,
  ...(token ? { "x-table-visit": token } : {}),
});

export const billingGuest = {
  join: (storeSlug: string, tableId: string) => fetchApi<{ visit: CustomerVisit; visitToken: string }>(
    `/public/table/${encodeURIComponent(tableId)}/visit`,
    { method: "POST", headers: headers(storeSlug), body: "{}", timeoutMs: 20_000, cache: "no-store" },
  ),
  get: (storeSlug: string, visitId: string, token: string) => fetchApi<{ visit: CustomerVisit }>(
    `/public/visits/${encodeURIComponent(visitId)}`, { headers: headers(storeSlug, token), cache: "no-store" },
  ),
  requestBill: (storeSlug: string, visitId: string, token: string, requestId: string) => fetchApi<{ visit: CustomerVisit }>(
    `/public/visits/${encodeURIComponent(visitId)}/bill-request`,
    { method: "POST", headers: headers(storeSlug, token), body: JSON.stringify({ requestId }), timeoutMs: 20_000, cache: "no-store" },
  ),
};
