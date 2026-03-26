import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AppLayout from "./components/AppLayout";
import PinGate from "./components/PinGate";
import Dashboard from "./pages/Dashboard";
import PickingPage from "./pages/PickingPage";
import ShippingPage from "./pages/ShippingPage";
import ShipBundlePage from "./pages/ShipBundlePage";
import LabelsPage from "./pages/LabelsPage";
import InventoryPage from "./pages/InventoryPage";
import ReceivePage from "./pages/ReceivePage";
import ReturnsPage from "./pages/ReturnsPage";
import MembersPage from "./pages/MembersPage";
import DonationIntakePage from "./pages/DonationIntakePage";
import DonationLogPage from "./pages/DonationLogPage";
import SignupPage from "./pages/SignupPage";
import WelcomePage from "./pages/WelcomePage";
import QCQueuePage from "./pages/QCQueuePage";
import StockQueuePage from "./pages/StockQueuePage";
import NotFound from "./pages/NotFound";

// Routes that render INSIDE the ops dashboard (with sidebar)
function DashboardRouter() {
  return (
    <PinGate>
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/picking" component={PickingPage} />
        <Route path="/shipping" component={ShippingPage} />
        <Route path="/ship/:id" component={ShipBundlePage} />
        <Route path="/labels" component={LabelsPage} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/receive" component={ReceivePage} />
        <Route path="/returns" component={ReturnsPage} />
        <Route path="/qc" component={QCQueuePage} />
        <Route path="/stock" component={StockQueuePage} />
        <Route path="/members" component={MembersPage} />
        <Route path="/donations/intake" component={DonationIntakePage} />
        <Route path="/donations/log" component={DonationLogPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
    </PinGate>
  );
}
// Top-level router — /signup is OUTSIDE AppLayout (no sidebar, no nav)
function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      {/* Public-facing sign-up form — completely isolated */}
      <Route path="/signup" component={SignupPage} />
      {/* Public welcome form for new members — no PIN gate */}
      <Route path="/welcome" component={WelcomePage} />
      {/* Everything else goes through the ops dashboard layout */}
      <Route component={DashboardRouter} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="bottom-right" richColors />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
