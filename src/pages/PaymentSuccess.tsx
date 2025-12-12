import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function PaymentSuccess() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const orderId = searchParams.get("orderId");
  const tableId = searchParams.get("tableId");

  useEffect(() => {
    // Auto-redirect to the order thanks page after a short delay
    const timer = setTimeout(() => {
      if (orderId) {
        navigate(
          `/order/${orderId}/thanks?tableId=${encodeURIComponent(
            tableId || ""
          )}`
        );
      } else {
        navigate("/");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [orderId, tableId, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-lg w-full text-center p-8 bg-card border border-border rounded-2xl shadow">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold">
          {t("payment.success_title", "Payment Successful")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t(
            "payment.success_description",
            "Your payment was successful. You will be redirected shortly."
          )}
        </p>
        <div className="mt-6">
          <button
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
            onClick={() => {
              if (orderId)
                navigate(
                  `/order/${orderId}/thanks?tableId=${encodeURIComponent(
                    tableId || ""
                  )}`
                );
              else navigate("/");
            }}
          >
            {t("payment.go_to_order", "View order")}
          </button>
        </div>
      </div>
    </div>
  );
}
