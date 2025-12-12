import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function PaymentFailed() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const message = searchParams.get("message");

  useEffect(() => {
    // Nothing automatic; allow user to retry or go home
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-lg w-full text-center p-8 bg-card border border-border rounded-2xl shadow">
        <div className="text-6xl mb-4">❌</div>
        <h1 className="text-2xl font-bold text-destructive">
          {t("payment.error_title", "Payment Failed")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {message ||
            t(
              "payment.error_generic",
              "There was a problem processing your payment."
            )}
        </p>
        <div className="mt-6 space-x-2">
          <button
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
            onClick={() => navigate(-1)}
          >
            {t("payment.retry", "Retry")}
          </button>
          <button
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg"
            onClick={() => navigate("/")}
          >
            {t("payment.home", "Return Home")}
          </button>
        </div>
      </div>
    </div>
  );
}
