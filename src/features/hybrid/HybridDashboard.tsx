import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import clsx from "clsx";
import { motion } from "framer-motion";
import { ChefHat, Utensils } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import CookDashboard from "@/features/cook/CookDashboard";
import WaiterDashboard from "@/features/waiter/WaiterDashboard";

type HybridView = "kitchen" | "service";

const STORAGE_KEY = "HYBRID_VIEW";

const readInitial = (): HybridView => {
  if (typeof window === "undefined") return "kitchen";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "service" ? "service" : "kitchen";
  } catch {
    return "kitchen";
  }
};

export default function HybridDashboard() {
  const { user, isAuthenticated } = useAuthStore();
  const [view, setView] = useState<HybridView>(readInitial);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, view);
    } catch {
      // ignore
    }
  }, [view]);

  if (!isAuthenticated() || user?.role !== "hybrid") {
    return <Navigate to="/login" replace />;
  }

  const options: { key: HybridView; label: string; icon: typeof ChefHat }[] = [
    { key: "kitchen", label: "Kitchen", icon: ChefHat },
    { key: "service", label: "Service", icon: Utensils },
  ];

  return (
    <div className="relative">
      {/* Floating role switcher — visible on both desktop and mobile */}
      <div className="pointer-events-none fixed inset-x-0 top-[76px] z-[60] flex justify-center px-3 sm:top-[88px]">
        <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/95 p-1 shadow-2xl backdrop-blur-sm">
          {options.map(({ key, label, icon: Icon }) => {
            const isActive = view === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-label={label}
                aria-pressed={isActive}
                className={clsx(
                  "relative inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors",
                  isActive
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="hybrid-view-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-primary shadow-md"
                    transition={{ type: "spring", stiffness: 360, damping: 32 }}
                  />
                )}
                <Icon className="h-4 w-4 relative z-10" />
                <span className="relative z-10">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Keep both mounted so realtime subscriptions and state survive view toggling */}
      <div className={view === "kitchen" ? "block" : "hidden"} aria-hidden={view !== "kitchen"}>
        <CookDashboard />
      </div>
      <div className={view === "service" ? "block" : "hidden"} aria-hidden={view !== "service"}>
        <WaiterDashboard />
      </div>
    </div>
  );
}