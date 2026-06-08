import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { HomeLink } from "@/components/HomeLink";
import { AppBurger } from "@/components/AppBurger";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { setStoredStoreSlug } from "@/lib/storeSlug";

export default function OrderThanks() {
  const location = useLocation();
  const navigate = useNavigate();
  const { tableId, storeSlug } = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    return {
      tableId: qs.get("tableId") || undefined,
      storeSlug: qs.get("storeSlug") || undefined,
    };
  }, [location.search]);

  const menuPath = useMemo(() => {
    if (!tableId) return "/";
    const qs = new URLSearchParams();
    if (storeSlug) qs.set("storeSlug", storeSlug);
    const suffix = qs.toString();
    return `/${tableId}${suffix ? `?${suffix}` : ""}`;
  }, [storeSlug, tableId]);

  useEffect(() => {
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
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 flex items-center justify-center p-4">
      <div className="absolute top-4 left-4">
        <HomeLink />
      </div>
      <div className="absolute top-4 right-4">
        <AppBurger />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-sm w-full text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="relative mx-auto mb-8"
        >
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
            >
              <CheckCircle
                className="h-12 w-12 text-primary"
                strokeWidth={1.5}
              />
            </motion.div>
          </div>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.2, opacity: 0 }}
            transition={{ delay: 0.5, duration: 1, ease: "easeOut" }}
            className="absolute inset-0 w-24 h-24 mx-auto border-2 border-primary/30 rounded-full"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Order successful
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <Button
            onClick={() => navigate(menuPath)}
            className="mt-8 h-12 rounded-full px-6 font-semibold shadow-lg"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go back to menu
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
