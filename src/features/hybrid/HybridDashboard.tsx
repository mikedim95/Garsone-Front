import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import clsx from "clsx";
import { motion } from "framer-motion";
import { ChefHat, LayoutGrid, UtensilsCrossed } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import CookDashboard from "@/features/cook/CookDashboard";
import WaiterDashboard from "@/features/waiter/WaiterDashboard";
import { api } from "@/lib/api";
import type { OrderingMode } from "@/types";

type HybridView = "orders" | "menu" | "tables";

const STORAGE_KEY = "HYBRID_VIEW";

const normalizeOrderingMode = (mode?: string | null): OrderingMode =>
  mode === "waiter" || mode === "hybrid" ? mode : "qr";

const readInitial = (): HybridView => {
  if (typeof window === "undefined") return "orders";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "orders" || stored === "menu" || stored === "tables") {
      return stored;
    }
    if (stored === "service") return "tables";
    return "orders";
  } catch {
    return "orders";
  }
};

export default function HybridDashboard() {
  const { user, isAuthenticated } = useAuthStore();
  const [view, setView] = useState<HybridView>(readInitial);
  const [orderingMode, setOrderingMode] = useState<OrderingMode | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, view);
    } catch {
      // ignore
    }
  }, [view]);

  useEffect(() => {
    if (!isAuthenticated() || user?.role !== "hybrid") return;
    let cancelled = false;

    api
      .getStore()
      .then((res) => {
        if (!cancelled) {
          setOrderingMode(normalizeOrderingMode(res?.store?.orderingMode));
        }
      })
      .catch(() => {
        if (!cancelled) setOrderingMode("qr");
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.role]);

  const waiterMenuEnabled =
    orderingMode === "waiter" || orderingMode === "hybrid";

  useEffect(() => {
    if (orderingMode && !waiterMenuEnabled && view === "menu") {
      setView("orders");
    }
  }, [orderingMode, waiterMenuEnabled, view]);

  const options = useMemo(
    () => [
      { key: "orders" as const, label: "Orders", icon: ChefHat },
      ...(waiterMenuEnabled
        ? [{ key: "menu" as const, label: "Menu", icon: UtensilsCrossed }]
        : []),
      { key: "tables" as const, label: "Tables", icon: LayoutGrid },
    ],
    [waiterMenuEnabled]
  );

  if (!isAuthenticated() || user?.role !== "hybrid") {
    return <Navigate to="/login" replace />;
  }

  const selectedView =
    view === "menu" && !waiterMenuEnabled ? "orders" : view;

  const renderSelectorItem = (
    { key, label, icon: Icon }: (typeof options)[number],
    compact = false
  ) => {
    const isActive = selectedView === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setView(key)}
        aria-label={label}
        aria-pressed={isActive}
        className={clsx(
          "relative isolate flex items-center justify-center overflow-hidden rounded-xl font-semibold transition-colors",
          compact
            ? "flex-1 flex-col gap-1 px-1 py-2 text-[10px]"
            : "gap-2 px-4 py-2 text-sm",
          isActive
            ? "text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
        )}
      >
        {isActive && (
          <motion.span
            layoutId={compact ? "hybrid-bottom-pill" : "hybrid-top-pill"}
            className="absolute inset-0 rounded-xl bg-primary shadow-md"
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          />
        )}
        <Icon
          className={clsx(
            "relative z-10",
            compact ? "h-5 w-5" : "h-4 w-4"
          )}
        />
        <span className="relative z-10 truncate">{label}</span>
      </button>
    );
  };

  return (
    <div className="relative">
      <div className="pointer-events-none fixed inset-x-0 top-[76px] z-[60] hidden justify-center px-3 sm:flex sm:top-[88px]">
        <div className="pointer-events-auto inline-flex items-center gap-1 rounded-2xl border border-border/60 bg-card/95 p-1.5 shadow-2xl backdrop-blur-sm">
          {options.map((option) => renderSelectorItem(option))}
        </div>
      </div>

      <nav className="sm:hidden fixed bottom-3 left-3 right-3 z-[60] rounded-2xl bg-card/95 border border-border/60 shadow-2xl backdrop-blur-sm">
        <div className="flex w-full gap-1 p-1.5">
          {options.map((option) => renderSelectorItem(option, true))}
        </div>
      </nav>

      <div
        className={selectedView === "orders" ? "block" : "hidden"}
        aria-hidden={selectedView !== "orders"}
      >
        <CookDashboard />
      </div>
      <div
        className={selectedView !== "orders" ? "block" : "hidden"}
        aria-hidden={selectedView === "orders"}
      >
        <WaiterDashboard
          embeddedHybrid
          embeddedHybridView={selectedView === "menu" ? "menu" : "tables"}
          hideEmbeddedNavigation
        />
      </div>
    </div>
  );
}
