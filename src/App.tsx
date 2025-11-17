import { useEffect } from "react";
import clsx from "clsx";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { dashboardThemeClassNames, useDashboardTheme } from "@/hooks/useDashboardDark";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import TableMenu from "./pages/TableMenu";
import WaiterDashboard from "./pages/WaiterDashboard";
import ManagerDashboard from "./pages/ManagerDashboard";
import OrderThanks from "./pages/OrderThanks";
import CookDashboard from "./pages/CookDashboard";
import './i18n/config';

const queryClient = new QueryClient();

const AppShell = () => {
  const { themeClass, dashboardDark } = useDashboardTheme();

  useEffect(() => {
    if (typeof document === 'undefined') return;
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
    <div className={clsx(themeClass, { dark: dashboardDark })}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/table/:tableId" element={<TableMenu />} />
              <Route path="/order/:orderId/thanks" element={<OrderThanks />} />
              <Route path="/waiter" element={<WaiterDashboard />} />
              <Route path="/manager" element={<ManagerDashboard />} />
              <Route path="/cook" element={<CookDashboard />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
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
