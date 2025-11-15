import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
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

const App = () => (
  <ThemeProvider defaultTheme="light">
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
  </ThemeProvider>
);

export default App;
