import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { api } from "@/lib/api";
import {
  FRONTEND_OFFLINE_MENU_STORE_SLUG,
  FRONTEND_OFFLINE_MENU_TABLE_ID,
} from "@/lib/frontendOfflineMenu";
import { setStoredStoreSlug } from "@/lib/storeSlug";

export default function OrderThanks() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const { tableId, storeSlug, updated } = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    return {
      tableId: qs.get("tableId") || undefined,
      storeSlug: qs.get("storeSlug") || undefined,
      updated: qs.get("updated") === "1",
    };
  }, [location.search]);

  const menuPath = useMemo(() => {
    if (!tableId) return "/";
    const qs = new URLSearchParams();
    if (storeSlug) qs.set("storeSlug", storeSlug);
    qs.set("highlightLastOrder", "1");
    const suffix = qs.toString();
    return `/${tableId}${suffix ? `?${suffix}` : ""}`;
  }, [storeSlug, tableId]);

  useEffect(() => {
    if (
      tableId === FRONTEND_OFFLINE_MENU_TABLE_ID ||
      storeSlug === FRONTEND_OFFLINE_MENU_STORE_SLUG
    ) {
      try {
        localStorage.setItem("STORE_NAME", "Garsone Demo Menu");
        setStoredStoreSlug(FRONTEND_OFFLINE_MENU_STORE_SLUG);
      } catch (error) {
        console.warn("Failed to persist offline demo store info", error);
      }
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const store = await api.getStore();
        if (!mounted) return;
        if (store?.store?.name) {
          try {
            localStorage.setItem("STORE_NAME", store.store.name);
          } catch (error) {
            console.warn("Failed to persist STORE_NAME", error);
          }
        }
        if (store?.store?.slug) {
          try {
            setStoredStoreSlug(store.store.slug);
            window.dispatchEvent(
              new CustomEvent("store-slug-changed", {
                detail: { slug: store.store.slug },
              })
            );
          } catch (error) {
            console.warn("Failed to persist STORE_SLUG", error);
          }
        }
      } catch (error) {
        console.error("Failed to load store info", error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [storeSlug, tableId]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-background via-background to-muted/30 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6" data-testid="order-confirmation">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.25, ease: "easeOut" }}
        className="w-full max-w-md rounded-3xl border border-border/70 bg-card p-6 text-center shadow-sm sm:p-9"
      >
        <motion.div
          initial={reduceMotion ? false : { scale: 0.92 }}
          animate={{ scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"
          aria-hidden="true"
        >
          <CheckCircle className="h-11 w-11 text-primary" strokeWidth={1.6} />
        </motion.div>

        <div role="status" aria-live="polite" aria-atomic="true">
          <h1 className="mb-3 break-words text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
            {updated
              ? t("order.updated_success_title", {
                  defaultValue: "Order changed successfully",
                })
              : t("order.success_title", {
                  defaultValue: "Order successful",
                })}
          </h1>
          <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">
            {updated
              ? t("order.updated_description", { defaultValue: "Your changes are saved. Return to the menu to follow your order." })
              : t("order.received_description", { defaultValue: "Your order is saved. Return to the menu to see its status." })}
          </p>
        </div>
        <Button
          onClick={() => navigate(menuPath)}
          className="mt-7 h-auto min-h-12 w-full whitespace-normal rounded-xl px-5 py-3 text-base font-semibold leading-snug shadow-sm"
        >
          <ArrowLeft className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("order.go_back_to_menu", { defaultValue: "Go back to menu" })}
        </Button>
      </motion.div>
    </main>
  );
}
