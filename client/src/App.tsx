import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AppLayout from "./components/AppLayout";
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
import NotFound from "./pages/NotFound";

function Router() {
  return (
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
        <Route path="/members" component={MembersPage} />
        <Route path="/donations/intake" component={DonationIntakePage} />
        <Route path="/donations/log" component={DonationLogPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
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
