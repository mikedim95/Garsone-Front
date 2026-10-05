export type BillStatus = "OPEN" | "BILL_REQUESTED" | "CLOSED";
export type BillPaymentMethod = "CASH" | "CARD";

export interface BillVisitSummary {
  id: string;
  tableId: string;
  tableLabel: string;
  status: BillStatus;
  revision: number;
  currencyCode: string;
  openedAt: string;
  closedAt: string | null;
  billRequestedAt: string | null;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  orderCount: number;
}

export interface BillItem {
  orderItemId: string;
  orderId: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  remainingQuantity: number;
}

export interface BillPayment {
  id: string;
  requestId: string;
  amountCents: number;
  method: BillPaymentMethod;
  recordedAt: string;
  recordedBy?: string;
  allocations: Array<{ orderItemId: string; amountCents: number }>;
}

export interface BillVisit extends BillVisitSummary {
  orders: Array<{ id: string; status: string; createdAt?: string; ticketNumber?: number }>;
  items: BillItem[];
  payments: BillPayment[];
}

export interface LegacyBillOrder {
  id: string;
  tableId: string;
  tableLabel: string;
  status: string;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  paymentStatus: string;
}

export interface BillPaymentRequest {
  requestId: string;
  expectedRevision: number;
  method: BillPaymentMethod;
  amountCents?: number;
  items?: Array<{ orderItemId: string; quantity: number }>;
}

export interface PendingBillPayment {
  version: 1;
  visitId: string;
  createdAt: string;
  request: BillPaymentRequest;
}

export interface BillListResponse {
  currencyCode: string;
  visits: BillVisitSummary[];
  legacyOrders: LegacyBillOrder[];
}
