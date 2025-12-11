import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { api, ApiError } from "@/lib/api";
import { useCartStore } from "@/store/cartStore";

interface PendingOrder {
  tableId: string;
  items: Array<{
    itemId: string;
    quantity: number;
    modifiers: string;
  }>;
  note: string;
  paymentSessionId: string;
  totalCents: number;
}

export default function PaymentCompletePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { clearCart } = useCartStore();
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const completePaymentFlow = async () => {
      try {
        // Get the session ID and table ID from URL params (for our tracking)
        const sessionId = searchParams.get("sessionId");
        const tableId = searchParams.get("tableId");

        // Get Viva payment confirmation params (t=transactionId, s=orderCode, eventId, eci, lang)
        const vivaTransactionId = searchParams.get("t");
        const vivaOrderCode = searchParams.get("s");

        if (!sessionId || !tableId) {
          setError("Invalid payment session");
          setIsProcessing(false);
          return;
        }

        // Retrieve pending order from sessionStorage
        const pendingOrderJson = window.sessionStorage.getItem("pending-order");
        if (!pendingOrderJson) {
          setError("Order data not found. Session may have expired.");
          setIsProcessing(false);
          return;
        }

        const pendingOrder: PendingOrder = JSON.parse(pendingOrderJson);

        // Verify the payment is for the correct table
        if (pendingOrder.tableId !== tableId) {
          setError("Table mismatch. Please start a new order.");
          setIsProcessing(false);
          return;
        }

        // Log Viva payment confirmation
        console.log("Payment completed with Viva transaction:", {
          transactionId: vivaTransactionId,
          orderCode: vivaOrderCode,
          sessionId: sessionId,
        });

        // Step 1: Create the order with the stored data
        try {
          const orderResponse = await api.createOrder(pendingOrder);
          const order = orderResponse?.order;

          if (!order) {
            setError("Failed to create order after payment");
            setIsProcessing(false);
            return;
          }

          // Step 2: Clear the cart and session storage
          clearCart();
          window.sessionStorage.removeItem("pending-order");

          // Step 3: Show success message
          toast({
            title: t("payment.success_title", {
              defaultValue: "Payment Successful",
            }),
            description: t("payment.success_description", {
              defaultValue: "Your order has been placed!",
            }),
          });

          // Step 4: Redirect to order thanks page
          setTimeout(() => {
            const params = new URLSearchParams({ tableId });
            navigate(`/order/${order.id}/thanks?${params.toString()}`);
          }, 1500);
        } catch (orderErr) {
          if (orderErr instanceof ApiError) {
            setError(`Order creation failed: ${orderErr.message}`);
          } else {
            setError("Failed to create order. Please try again.");
          }
          setIsProcessing(false);
        }
      } catch (err) {
        console.error("Payment completion error:", err);
        const message =
          err instanceof Error
            ? err.message
            : "An error occurred during payment";
        setError(message);
        setIsProcessing(false);
      }
    };

    completePaymentFlow();
  }, [searchParams, navigate, clearCart, toast, t]);

  if (isProcessing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <h1 className="text-2xl font-bold">
            {t("payment.processing", { defaultValue: "Processing Payment..." })}
          </h1>
          <p className="text-muted-foreground">
            {t("payment.please_wait", {
              defaultValue: "Please wait while we confirm your payment.",
            })}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-5xl">❌</div>
          <h1 className="text-2xl font-bold text-destructive">
            {t("payment.error_title", { defaultValue: "Payment Failed" })}
          </h1>
          <p className="text-muted-foreground">{error}</p>
          <div className="space-y-2">
            <button
              onClick={() => navigate(-1)}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              {t("payment.retry", { defaultValue: "Go Back" })}
            </button>
            <button
              onClick={() => navigate("/")}
              className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90"
            >
              {t("payment.home", { defaultValue: "Return Home" })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
