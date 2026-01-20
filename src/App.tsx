import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import BuyerWelcome from "./pages/BuyerWelcome";
import SelectionWizard from "./pages/SelectionWizard";
import DraftSaved from "./pages/DraftSaved";
import Auth from "./pages/Auth";
import BuyerAuth from "./pages/BuyerAuth";
import AdminSubmissions from "./pages/AdminSubmissions";
import AdminDashboard from "./pages/AdminDashboard";
import AdminHomes from "./pages/AdminHomes";
import AdminPipeline from "./pages/AdminPipeline";
import AdminSalesAnalytics from "./pages/AdminSalesAnalytics";
import AdminReports from "./pages/AdminReports";
import AdminPricingControl from "./pages/AdminPricingControl";
import AdminUsers from "./pages/AdminUsers";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<BuyerWelcome />} />
          <Route path="/buyer-auth" element={<BuyerAuth />} />
          <Route path="/select" element={<SelectionWizard />} />
          <Route path="/draft-saved" element={<DraftSaved />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/pipeline" element={<ProtectedRoute><AdminPipeline /></ProtectedRoute>} />
          <Route path="/admin/submissions" element={<ProtectedRoute><AdminSubmissions /></ProtectedRoute>} />
          <Route path="/admin/homes" element={<ProtectedRoute><AdminHomes /></ProtectedRoute>} />
          <Route path="/admin/sales-analytics" element={<ProtectedRoute><AdminSalesAnalytics /></ProtectedRoute>} />
          <Route path="/admin/reports" element={<ProtectedRoute><AdminReports /></ProtectedRoute>} />
          <Route path="/admin/pricing" element={<ProtectedRoute><AdminPricingControl /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
