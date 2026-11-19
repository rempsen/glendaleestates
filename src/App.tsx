import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import BuyerWelcome from "./pages/BuyerWelcome";
import SelectionWizard from "./pages/SelectionWizard";
import DraftSaved from "./pages/DraftSaved";
import Auth from "./pages/Auth";
import BuyerAuth from "./pages/BuyerAuth";
import AdminQuotes from "./pages/AdminQuotes";
import QuoteConsole from "./pages/QuoteConsole";
import AdminPricingQueue from "./pages/AdminPricingQueue";
import AdminSubmissions from "./pages/AdminSubmissions";
import AdminDashboard from "./pages/AdminDashboard";
import AdminHomes from "./pages/AdminHomes";
import AdminPipeline from "./pages/AdminPipeline";
import AdminSalesAnalytics from "./pages/AdminSalesAnalytics";
import AdminReports from "./pages/AdminReports";
import AdminExport from "./pages/AdminExport";
import AdminPricingControl from "./pages/AdminPricingControl";
import AdminUsers from "./pages/AdminUsers";
import AdminEmailPreview from "./pages/AdminEmailPreview";
import AdminProjectManagement from "./pages/AdminProjectManagement";
import AdminQuickBooksSettings from "./pages/AdminQuickBooksSettings";
import AdminNotificationSettings from "./pages/AdminNotificationSettings";
import NotFound from "./pages/NotFound";
import MyQuote from "./pages/MyQuote";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { BuyerRoute } from "./components/BuyerRoute";

const queryClient = new QueryClient();

const ConsoleRedirect = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/admin/quotes/${id}`} replace />;
};

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
          <Route path="/my-quote" element={<BuyerRoute><MyQuote /></BuyerRoute>} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/pipeline" element={<ProtectedRoute><AdminPipeline /></ProtectedRoute>} />
          <Route path="/admin/quotes" element={<ProtectedRoute><AdminQuotes /></ProtectedRoute>} />
          <Route path="/admin/quotes/:id" element={<ProtectedRoute><QuoteConsole /></ProtectedRoute>} />
          <Route path="/admin/pricing-queue" element={<ProtectedRoute><AdminPricingQueue /></ProtectedRoute>} />
          <Route path="/admin/submissions/:id/console" element={<ProtectedRoute><ConsoleRedirect /></ProtectedRoute>} />
          <Route path="/admin/submissions" element={<ProtectedRoute><AdminSubmissions /></ProtectedRoute>} />
          <Route path="/admin/homes" element={<ProtectedRoute><AdminHomes /></ProtectedRoute>} />
          <Route path="/admin/sales-analytics" element={<ProtectedRoute><AdminSalesAnalytics /></ProtectedRoute>} />
          <Route path="/admin/reports" element={<ProtectedRoute><AdminReports /></ProtectedRoute>} />
          <Route path="/admin/export" element={<ProtectedRoute><AdminExport /></ProtectedRoute>} />
          <Route path="/admin/pricing" element={<ProtectedRoute><AdminPricingControl /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
          <Route path="/admin/email-preview" element={<ProtectedRoute><AdminEmailPreview /></ProtectedRoute>} />
          <Route path="/admin/project-management" element={<ProtectedRoute><AdminProjectManagement /></ProtectedRoute>} />
          <Route path="/admin/settings/quickbooks" element={<ProtectedRoute><AdminQuickBooksSettings /></ProtectedRoute>} />
          <Route path="/admin/settings/notifications" element={<ProtectedRoute><AdminNotificationSettings /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
