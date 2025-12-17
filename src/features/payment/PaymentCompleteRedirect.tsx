import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { useCartStore } from "@/store/cartStore";
import { setStoredStoreSlug } from "@/lib/storeSlug";

type PendingOrder = {
  tableId: string;
  storeSlug?: string | null;
  expiresAt?: number;
  items: Array<{
    itemId: string;
    quantity: number;
    modifiers: string;
  }>;
  note: string;
  paymentSessionId: string;
  totalCents: number;
  editingOrderId?: string | null;
};

/**
 * Handles the Viva success redirect and jumps straight to the thank-you page.
 * Creates the order using the pending order stored before redirecting to Viva.
 */
export default function PaymentCompleteRedirect() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { clearCart } = useCartStore();

  useEffect(() => {
    const complete = async () => {
      try {
        const now = Date.now();
        const pendingOrderJson =
          window.sessionStorage.getItem("pending-order") ||
          window.localStorage.getItem("pending-order");

        const pendingOrder: PendingOrder | null = pendingOrderJson
          ? (() => {
              try {
                return JSON.parse(pendingOrderJson);
              } catch (e) {
                console.warn("Failed to parse pending order JSON", e);
                return null;
              }
            })()
          : null;

        if (
          !pendingOrder ||
          !pendingOrder.tableId ||
          (pendingOrder.expiresAt && pendingOrder.expiresAt < now)
        ) {
          try {
            window.sessionStorage.removeItem("pending-order");
            window.localStorage.removeItem("pending-order");
          } catch {}
          navigate(
            `/payment-failed?message=${encodeURIComponent(
              "Order data not found. Please start a new order."
            )}`
          );
          return;
        }

        const tableId =
          searchParams.get("tableId") || pendingOrder.tableId || "";

        // Restore store context if available (helps API headers)
        if (pendingOrder.storeSlug) {
          try {
            setStoredStoreSlug(pendingOrder.storeSlug);
          } catch (error) {
            console.warn("Failed to restore store slug", error);
          }
        }

        // Create or edit the order now that payment succeeded
        const orderResponse = pendingOrder.editingOrderId
          ? await api.editOrder(pendingOrder.editingOrderId, pendingOrder)
          : await api.createOrder(pendingOrder);
        const order = (orderResponse as any)?.order;
        if (!order?.id) {
          throw new Error("Order was not created");
        }

        try {
          const summary = {
            id: order.id,
            tableId: order.tableId,
            tableLabel: order.tableLabel ?? order.table?.label,
            createdAt: order.placedAt ?? order.createdAt,
            updatedAt: order.updatedAt,
            total: order.total ?? order.totalCents / 100,
            totalCents: order.totalCents,
            status: order.status,
            note: order.note,
            ticketNumber: order.ticketNumber,
            items: (order.items ?? []).map((item: any) => ({
              itemId: item.itemId ?? item.item?.id,
              title: item.title ?? item.titleSnapshot ?? item.name,
              quantity: item.quantity ?? item.qty,
              modifiers: item.modifiers ?? item.orderItemOptions ?? [],
            })),
          };
          window.localStorage.setItem(
            "table:last-order",
            JSON.stringify(summary)
          );
        } catch (error) {
          console.warn("Failed to persist last order summary", error);
        }

        clearCart();
        window.sessionStorage.removeItem("pending-order");
        try {
          window.localStorage.removeItem("pending-order");
        } catch {}

        const qs = new URLSearchParams();
        if (tableId) qs.set("tableId", tableId);
        qs.set("paid", "1");
        navigate(`/order/${order.id}/thanks?${qs.toString()}`);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
            ? err.message
            : "Payment completed, but order could not be created.";
        navigate(
          `/payment-failed?message=${encodeURIComponent(message)}`
        );
      }
    };

    complete();
  }, [navigate, searchParams, clearCart]);

  // No UI needed; we immediately redirect.
  return null;
}
