import type { BillItem } from "@/types/billing";

/** Parse user-entered money without floating-point multiplication/rounding. */
export function parseMoneyCents(value: string): number | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function selectedItemCents(item: BillItem, quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > item.remainingQuantity) return 0;
  // A previous amount payment can have partially paid the last selected unit.
  return Math.min(quantity * item.unitPriceCents, item.outstandingCents);
}

export function formatBillMoney(cents: number, currencyCode: string, language: string): string {
  return new Intl.NumberFormat(language === "el" ? "el-GR" : "en-GB", {
    style: "currency", currency: currencyCode,
  }).format(cents / 100);
}
