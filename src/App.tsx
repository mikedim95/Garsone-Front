import { useEffect, Suspense, lazy } from "react";
import clsx from "clsx";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  Navigate,
  useParams,
} from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { useTheme } from "@/components/theme-provider-context";
import {
  dashboardThemeClassNames,
  useDashboardTheme,
} from "@/hooks/useDashboardDark";
import { API_BASE } from "@/lib/api";
import { setStoredStoreSlug } from "@/lib/storeSlug";

import "./i18n/config";

const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Login = lazy(() => import("./pages/Login"));
const TableMenu = lazy(() => import("./pages/TableMenu"));
const WaiterDashboard = lazy(() => import("./pages/WaiterDashboard"));
const ManagerDashboard = lazy(() => import("./pages/ManagerDashboard"));
const OrderThanks = lazy(() => import("./pages/OrderThanks"));
const PaymentComplete = lazy(
  () => import("./features/payment/PaymentCompleteRedirect")
);
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentFailed = lazy(() => import("./pages/PaymentFailed"));
const CookDashboard = lazy(() => import("./pages/CookDashboard"));
const ArchitectQrTiles = lazy(() => import("./pages/ArchitectQrTiles"));
const ProfileDashboard = lazy(() => import("./pages/ProfileDashboard"));
const PublicCodeRedirect = () => {
  const location = useLocation();
  const params = useParams<{ publicCode?: string }>();
  useEffect(() => {
    let aborted = false;
    const run = async () => {
      const code = (params.publicCode || "").trim().toUpperCase();
      if (!code) {
        window.location.replace("/");
        return;
      }
      try {
        const res = await fetch(
          `${API_BASE.replace(/\/$/, "")}/q/${encodeURIComponent(code)}`,
          { headers: { Accept: "application/json" } }
        );
        if (!res.ok) throw new Error("Failed to resolve");
        const data = await res.json();
        if (!aborted && data?.tableId) {
          if (data.storeSlug) {
            try {
              setStoredStoreSlug(data.storeSlug);
            } catch {}
          }
          const qs = data.storeSlug
            ? `?storeSlug=${encodeURIComponent(data.storeSlug)}`
            : "";
          window.location.replace(`/${data.tableId}${qs}`);
          return;
        }
      } catch {
        // Fall back to server-side redirect (might include visit token)
      }
      if (!aborted) {
        const dest = `${API_BASE.replace(
          /\/$/,
          ""
        )}/q/${encodeURIComponent(code)}${location.search}${location.hash}`;
        try {
          const detail = {
            code,
            apiBase: API_BASE,
            destination: dest,
            sourcePath: `${location.pathname}${location.search}${location.hash}`,
            ts: new Date().toISOString(),
          };
          console.warn("[qr] Client resolve fallback", detail);
          window.dispatchEvent(
            new CustomEvent("qr-client-resolve-fallback", { detail })
          );
        } catch {}
        window.location.replace(dest);
      }
    };
    run();
    return () => {
      aborted = true;
    };
  }, [location, params.publicCode]);
  return null;
};

const queryClient = new QueryClient();

const BrandedLoadingScreen = () => {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  const firstSegment = (segments[0] || "").toLowerCase();
  const reservedTopLevels = new Set([
    "login",
    "order",
    "payment-complete",
    "payment-success",
    "payment-failed",
    "waiter",
    "manager",
    "cook",
    "profile",
    "garsoneadmin",
    "architect",
  ]);
  const isLanding = location.pathname === "/";
  const isCustomerMenu =
    segments.length === 1 && firstSegment && !reservedTopLevels.has(firstSegment);

  const label = "Garsone";
  let roleLabel: string | null = null;
  if (!isLanding && typeof window !== "undefined") {
    if (!isCustomerMenu) {
      const storedRole = window.localStorage.getItem("USER_ROLE");
      if (storedRole) roleLabel = storedRole;
    }
  }

  const subtitle = isLanding ? "Loading experience" : "Loading store";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="relative flex flex-col items-center gap-4">
        <div
          className="pointer-events-none absolute -inset-10 rounded-full bg-gradient-primary opacity-30 blur-3xl animate-pulse"
          aria-hidden="true"
        />
        <div className="relative px-10 py-5 rounded-3xl bg-card/90 border border-border shadow-xl flex flex-col items-center gap-2">
          <span className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground">
            {subtitle}
          </span>
          <span className="text-3xl sm:text-4xl font-black bg-gradient-primary bg-clip-text text-transparent animate-gradient">
            {label}
          </span>
          {roleLabel && (
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide">
              {roleLabel}
            </span>
          )}
        </div>
        <div className="h-0.5 w-24 rounded-full bg-gradient-primary animate-slide-in" />
      </div>
    </div>
  );
};

const AppShell = () => {
  const { themeClass, dashboardDark } = useDashboardTheme();
  const { theme } = useTheme();

  const isDarkFromTheme =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const { classList } = document.body;
    dashboardThemeClassNames.forEach((cls) => classList.remove(cls));
    if (themeClass) {
      classList.add(themeClass);
    }
    return () => {
      dashboardThemeClassNames.forEach((cls) => classList.remove(cls));
    };
  }, [themeClass]);

  return (
    <div
      className={clsx(themeClass, { dark: dashboardDark || isDarkFromTheme })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<BrandedLoadingScreen />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/table/:tableId" element={<TableMenu />} />
                <Route path="/:tableId" element={<TableMenu />} />
                <Route
                  path="/order/:orderId/thanks"
                  element={<OrderThanks />}
                />
                <Route path="/payment-complete" element={<PaymentComplete />} />
                <Route path="/payment-success" element={<PaymentSuccess />} />
                <Route path="/payment-failed" element={<PaymentFailed />} />
                <Route path="/q/:publicCode/*" element={<PublicCodeRedirect />} />
                <Route path="/waiter" element={<WaiterDashboard />} />
                <Route path="/manager" element={<ManagerDashboard />} />
                <Route path="/cook" element={<CookDashboard />} />
                <Route path="/profile" element={<ProfileDashboard />} />
                <Route path="/GarsoneAdmin" element={<ArchitectQrTiles />} />
                <Route
                  path="/architect"
                  element={<Navigate to="/GarsoneAdmin" replace />}
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </div>
  );
};

const App = () => (
  <ThemeProvider defaultTheme="light">
    <AppShell />
  </ThemeProvider>
);

export default App;
