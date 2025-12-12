import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { useCartStore } from "@/store/cartStore";

type PendingOrder = {
  tableId: string;
  items: Array<{
    itemId: string;
    quantity: number;
    modifiers: string;
  }>;
  note: string;
  paymentSessionId: string;
  totalCents: number;
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
        const pendingOrderJson = window.sessionStorage.getItem("pending-order");
        if (!pendingOrderJson) {
          navigate(
            `/payment-failed?message=${encodeURIComponent(
              "Order data not found. Please start a new order."
            )}`
          );
          return;
        }

        const pendingOrder: PendingOrder = JSON.parse(pendingOrderJson);
        const tableId =
          searchParams.get("tableId") || pendingOrder.tableId || "";

        // Create the order now that payment succeeded
        const orderResponse = await api.createOrder(pendingOrder);
        const order = (orderResponse as any)?.order;
        if (!order?.id) {
          throw new Error("Order was not created");
        }

        clearCart();
        window.sessionStorage.removeItem("pending-order");

        navigate(
          `/order/${order.id}/thanks?tableId=${encodeURIComponent(tableId)}`
        );
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
