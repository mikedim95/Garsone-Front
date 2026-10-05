import { useLayoutEffect, Suspense, lazy } from "react";
import clsx from "clsx";
import { MotionConfig } from "framer-motion";
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
} from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import {
  dashboardThemeClassNames,
  useDashboardTheme,
} from "@/hooks/useDashboardDark";

import "./i18n/config";

const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Login = lazy(() => import("./pages/Login"));
const TableMenu = lazy(() => import("./pages/TableMenu"));
const WaiterDashboard = lazy(() => import("./pages/WaiterDashboard"));
const ManagerDashboard = lazy(() => import("./pages/ManagerDashboard"));
const LocalOperations = lazy(() => import("./pages/LocalOperations"));
const StaffBills = lazy(() => import("./pages/StaffBills"));
const OrderThanks = lazy(() => import("./pages/OrderThanks"));
const CookDashboard = lazy(() => import("./pages/CookDashboard"));
const HybridDashboard = lazy(() => import("./pages/HybridDashboard"));
const ArchitectQrTiles = lazy(() => import("./pages/ArchitectQrTiles"));
const ProfileDashboard = lazy(() => import("./pages/ProfileDashboard"));
const PublicCodeRedirect = lazy(() => import("./features/qr/PublicCodeRedirect"));

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
    "staff",
    "cook",
    "hybrid",
    "profile",
    "garsoneadmin",
    "architect",
  ]);
  const isLanding = location.pathname === "/";
  const isCustomerMenu =
    (firstSegment === "q" || firstSegment === "table") ||
    (segments.length === 1 && firstSegment && !reservedTopLevels.has(firstSegment));

  const label = "Garsone";
  let roleLabel: string | null = null;
  if (!isLanding && typeof window !== "undefined") {
    if (!isCustomerMenu) {
      try {
        const storedRole = window.localStorage.getItem("USER_ROLE");
        if (storedRole) roleLabel = storedRole;
      } catch { /* Loading still works when browser storage is unavailable. */ }
    }
  }

  const subtitle = isLanding ? "Loading experience" : "Loading store";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="relative flex flex-col items-center gap-4" role="status" aria-live="polite">
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

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    // One root palette also reaches the body and dialogs rendered through portals.
    const { classList } = document.documentElement;
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
      className={clsx(themeClass, { dark: dashboardDark })}
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
                <Route path="/q/:publicCode/*" element={<PublicCodeRedirect />} />
                <Route path="/waiter" element={<WaiterDashboard />} />
                <Route path="/manager" element={<ManagerDashboard />} />
                <Route path="/manager/operations" element={<LocalOperations />} />
                <Route path="/staff/bills" element={<StaffBills />} />
                <Route path="/cook" element={<CookDashboard />} />
                <Route path="/hybrid" element={<HybridDashboard />} />
                <Route path="/profile" element={<ProfileDashboard />} />
                <Route path="/GarsoneAdmin" element={import.meta.env.VITE_LOCAL_ONLY === "true" ? <Navigate to="/login" replace /> : <ArchitectQrTiles />} />
                <Route
                  path="/architect"
                  element={<Navigate to={import.meta.env.VITE_LOCAL_ONLY === "true" ? "/login" : "/GarsoneAdmin"} replace />}
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
  <MotionConfig reducedMotion="user">
    <ThemeProvider defaultTheme="dark">
      <AppShell />
    </ThemeProvider>
  </MotionConfig>
);

export default App;
