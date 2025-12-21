import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
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
const LoaderOrderPage = lazy(() => import("@/pages/LoaderOrderPage"));
const SupportPage = lazy(() => import("@/pages/SupportPage"));
const FinancePage = lazy(() => import("@/pages/FinancePage"));
const MaintenancePage = lazy(() => import("@/pages/MaintenancePage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const NotFound = lazy(() => import("@/pages/not-found"));

interface MaintenanceStatus {
  mode: "none" | "full" | "financial" | "trading" | "readonly";
  loginEnabled: boolean;
}

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
  
  if (user?.role === "admin" && allowedRoles && !allowedRoles.includes("admin")) {
    return <Redirect to="/wallet" />;
  }
  
  if (user?.role === "support" && allowedRoles && !allowedRoles.includes("support")) {
    return <Redirect to="/support" />;
  }
  
  if (user?.role === "finance_manager" && allowedRoles && !allowedRoles.includes("finance_manager")) {
    return <Redirect to="/finance" />;
  }
  
  if (allowedRoles && user?.role && !allowedRoles.includes(user.role)) {
    return <Redirect to="/" />;
  }
  
  return <Component />;
});

function Router() {
  const { data: maintenanceStatus, isLoading } = useQuery<MaintenanceStatus>({
    queryKey: ["maintenance-status"],
    queryFn: async () => {
      const res = await fetch("/api/maintenance/status");
      if (!res.ok) throw new Error("Failed to fetch maintenance status");
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isStaff = ["admin", "support", "finance_manager", "dispute_admin"].includes(user?.role);

  const isFullMaintenance = maintenanceStatus?.mode === "full";

  if (!isLoading && isFullMaintenance && !isStaff) {
    return (
      <Suspense fallback={<PageLoader />}>
        <MaintenancePage />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={() => <ProtectedRoute component={HomePage} allowedRoles={["customer", "vendor"]} />} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/wallet" component={() => <ProtectedRoute component={WalletPage} allowedRoles={["customer", "vendor", "admin"]} />} />
        <Route path="/orders" component={() => <ProtectedRoute component={OrdersPage} allowedRoles={["customer", "vendor"]} />} />
        <Route path="/order/:id" component={() => <ProtectedRoute component={OrderDetailPage} allowedRoles={["customer", "vendor"]} />} />
        <Route path="/trade/:id" component={TradePage} />
        <Route path="/notifications" component={NotificationsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/profile" component={() => <ProtectedRoute component={ProfilePage} allowedRoles={["customer", "vendor"]} />} />
        <Route path="/vendor" component={() => <ProtectedRoute component={VendorPage} allowedRoles={["customer", "vendor"]} />} />
        <Route path="/admin" component={() => <ProtectedRoute component={AdminPage} allowedRoles={["admin"]} />} />
        <Route path="/disputes" component={() => <ProtectedRoute component={DisputeAdminPage} allowedRoles={["admin", "dispute_admin"]} />} />
        <Route path="/support" component={() => <ProtectedRoute component={SupportPage} />} />
        <Route path="/finance" component={() => <ProtectedRoute component={FinancePage} allowedRoles={["admin", "finance_manager"]} />} />
        <Route path="/loader-order/:id" component={() => <ProtectedRoute component={LoaderOrderPage} allowedRoles={["customer", "vendor"]} />} />
        <Route path="/maintenance" component={MaintenancePage} />
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
