import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import CustomersList from "./pages/CustomersList";
import OrdersList from "./pages/OrdersList";
import SalesReturnsList from "./pages/SalesReturnsList";
import PurchasesList from "./pages/PurchasesList";
import PurchaseReturnsList from "./pages/PurchaseReturnsList";
import ExpensesList from "./pages/ExpensesList";
import StockMovementLog from "./pages/StockMovementLog";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";

const queryClient = new QueryClient();

const RootRedirect = () => {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  const storedToken =
    typeof window !== "undefined"
      ? localStorage.getItem("ims_token")
      : null;

  if (token || storedToken) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/login" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/customers" element={<CustomersList />} />
              <Route path="/orders" element={<OrdersList />} />
              <Route path="/sales-returns" element={<SalesReturnsList />} />
              <Route path="/purchases" element={<PurchasesList />} />
              <Route path="/purchase-returns" element={<PurchaseReturnsList />} />
              <Route path="/expenses" element={<ExpensesList />} />
              <Route path="/stock-log" element={<StockMovementLog />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
