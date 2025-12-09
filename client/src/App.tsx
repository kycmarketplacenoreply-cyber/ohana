import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { isAuthenticated } from "@/lib/auth";
import HomePage from "@/pages/HomePage";
import AuthPage from "@/pages/AuthPage";
import WalletPage from "@/pages/WalletPage";
import OrdersPage from "@/pages/OrdersPage";
import OrderDetailPage from "@/pages/OrderDetailPage";
import TradePage from "@/pages/TradePage";
import NotificationsPage from "@/pages/NotificationsPage";
import SettingsPage from "@/pages/SettingsPage";
import AdminPage from "@/pages/AdminPage";
import VendorPage from "@/pages/VendorPage";
import DisputeAdminPage from "@/pages/DisputeAdminPage";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  if (!isAuthenticated()) {
    return <Redirect to="/auth" />;
  }
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <ProtectedRoute component={HomePage} />} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/wallet" component={WalletPage} />
      <Route path="/orders" component={OrdersPage} />
      <Route path="/order/:id" component={OrderDetailPage} />
      <Route path="/trade/:id" component={TradePage} />
      <Route path="/notifications" component={NotificationsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/vendor" component={() => <ProtectedRoute component={VendorPage} />} />
      <Route path="/admin" component={() => <ProtectedRoute component={AdminPage} />} />
      <Route path="/disputes" component={() => <ProtectedRoute component={DisputeAdminPage} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="p2p-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
