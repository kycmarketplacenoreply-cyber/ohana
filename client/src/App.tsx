import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { isAuthenticated } from "@/lib/auth";
import { lazy, Suspense, memo } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const HomePage = lazy(() => import("@/pages/HomePage"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const WalletPage = lazy(() => import("@/pages/WalletPage"));
const OrdersPage = lazy(() => import("@/pages/OrdersPage"));
const OrderDetailPage = lazy(() => import("@/pages/OrderDetailPage"));
const TradePage = lazy(() => import("@/pages/TradePage"));
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const VendorPage = lazy(() => import("@/pages/VendorPage"));
const DisputeAdminPage = lazy(() => import("@/pages/DisputeAdminPage"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="space-y-4 w-full max-w-md p-4">
        <Skeleton className="h-12 w-3/4 mx-auto" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-8 w-1/2" />
      </div>
    </div>
  );
}

const ProtectedRoute = memo(function ProtectedRoute({ 
  component: Component, 
  allowedRoles 
}: { 
  component: React.ComponentType; 
  allowedRoles?: string[] 
}) {
  if (!isAuthenticated()) {
    return <Redirect to="/auth" />;
  }
  
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  
  if (user?.role === "dispute_admin" && allowedRoles && !allowedRoles.includes("dispute_admin")) {
    return <Redirect to="/disputes" />;
  }
  
  if (allowedRoles && user?.role && !allowedRoles.includes(user.role)) {
    return <Redirect to="/" />;
  }
  
  return <Component />;
});

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={() => <ProtectedRoute component={HomePage} allowedRoles={["customer", "vendor", "admin"]} />} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/wallet" component={() => <ProtectedRoute component={WalletPage} allowedRoles={["customer", "vendor", "admin"]} />} />
        <Route path="/orders" component={() => <ProtectedRoute component={OrdersPage} allowedRoles={["customer", "vendor", "admin"]} />} />
        <Route path="/order/:id" component={() => <ProtectedRoute component={OrderDetailPage} allowedRoles={["customer", "vendor", "admin"]} />} />
        <Route path="/trade/:id" component={TradePage} />
        <Route path="/notifications" component={NotificationsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/vendor" component={() => <ProtectedRoute component={VendorPage} allowedRoles={["customer", "vendor", "admin"]} />} />
        <Route path="/admin" component={() => <ProtectedRoute component={AdminPage} allowedRoles={["admin"]} />} />
        <Route path="/disputes" component={() => <ProtectedRoute component={DisputeAdminPage} allowedRoles={["admin", "dispute_admin"]} />} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
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
