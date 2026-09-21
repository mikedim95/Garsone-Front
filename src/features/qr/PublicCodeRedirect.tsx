import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, QrCode, RefreshCcw, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";
import { setStoredStoreSlug } from "@/lib/storeSlug";

type ScanState = "loading" | "unavailable" | "unassigned" | "connection";
const CODE_PATTERN = /^GT-[0-9A-HJKMNPQRSTVWXYZ]{4}-[0-9A-HJKMNPQRSTVWXYZ]{4}$/;

export default function PublicCodeRedirect() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const { publicCode = "" } = useParams<{ publicCode: string }>();
  const navigate = useNavigate();
  const code = publicCode.trim().toUpperCase();
  const [state, setState] = useState<ScanState>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!CODE_PATTERN.test(code)) {
      setState("unavailable");
      return;
    }
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    setState("loading");
    const resolve = async () => {
      try {
        const params = new URLSearchParams(search);
        // Even an empty event parameter must be resolved as an event, never as
        // a global code that could belong to a different assignment.
        const query = params.has("event")
          ? `?${new URLSearchParams({ event: params.get("event") ?? "" })}`
          : "";
        // Public resolution carries no staff token. The server selects the
        // destination; QR query parameters cannot override this installation's API.
        const response = await fetch(
          `${API_BASE.replace(/\/$/, "")}/q/${encodeURIComponent(code)}${query}`,
          { headers: { Accept: "application/json" }, signal: controller.signal, cache: "no-store" },
        );
        if (!active) return;
        if (response.status === 404 || response.status === 400) {
          setState("unavailable");
          return;
        }
        if (!response.ok) throw new Error("QR service unavailable");
        const result = await response.json();
        if (!active) return;
        if (result.status === "UNASSIGNED_TILE") {
          setState("unassigned");
          return;
        }
        if (result.status !== "OK" || typeof result.tableId !== "string" || !result.tableId) {
          throw new Error("Invalid QR response");
        }
        const slug = typeof result.storeSlug === "string" ? result.storeSlug : "";
        if (slug) {
          try { setStoredStoreSlug(slug); } catch { /* URL retains venue context when storage is blocked. */ }
        }
        const tableQuery = slug ? `?${new URLSearchParams({ storeSlug: slug })}` : "";
        const destination = new URL(
          typeof result.redirectUrl === "string" ? result.redirectUrl
            : `/table/${encodeURIComponent(result.tableId)}${tableQuery}`,
          window.location.origin,
        );
        if (!["http:", "https:"].includes(destination.protocol) || destination.username || destination.password) {
          throw new Error("Invalid QR destination");
        }
        if (destination.origin === window.location.origin) {
          navigate(`${destination.pathname}${destination.search}`, { replace: true });
        } else {
          window.location.replace(destination.href);
        }
      } catch {
        if (active) setState("connection");
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void resolve();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [code, search, attempt, navigate]);

  const loading = state === "loading";
  const heading = t(`qr_scan.${state}_title`);
  const description = t(`qr_scan.${state}_description`);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 px-5 py-10 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-sm sm:p-10" aria-labelledby="qr-scan-heading">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
          {loading ? <Loader2 className="h-7 w-7 animate-spin motion-reduce:animate-none" />
            : state === "connection" ? <Wifi className="h-7 w-7" /> : <QrCode className="h-7 w-7" />}
        </div>
        <div role="status" aria-live="polite" aria-atomic="true">
          <h1 id="qr-scan-heading" className="text-2xl font-semibold tracking-tight">{heading}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {!loading && CODE_PATTERN.test(code) && (
          <Button className="mt-6 min-h-11 w-full" onClick={() => setAttempt(value => value + 1)}>
            <RefreshCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            {t(state === "connection" ? "qr_scan.retry" : "qr_scan.check_again")}
          </Button>
        )}
        {CODE_PATTERN.test(code) && <p className="mt-6 font-mono text-xs text-muted-foreground">{code}</p>}
      </section>
    </main>
  );
}
