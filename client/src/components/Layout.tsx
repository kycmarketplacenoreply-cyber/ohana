import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getUser, logout, fetchWithAuth, isAuthenticated } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/marketplace/ThemeToggle";
import { LanguageSelector } from "@/components/marketplace/LanguageSelector";
import {
  Home,
  Wallet,
  ShoppingCart,
  Settings,
  LogOut,
  User,
  Bell,
  Shield,
  Menu,
  X,
  Store,
  Gavel,
  AlertTriangle,
  Clock,
  Lock,
  Headphones,
} from "lucide-react";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const user = getUser();
  const authenticated = isAuthenticated();

  const { data: unreadCount } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/notifications/unread/count");
      const data = await res.json();
      return data.count || 0;
    },
    enabled: authenticated,
    refetchInterval: 30000,
  });

  const { data: wallet } = useQuery({
    queryKey: ["wallet"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/wallet");
      return res.json();
    },
    enabled: authenticated,
  });

  const { data: userStatus } = useQuery({
    queryKey: ["userStatus"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/auth/me");
      return res.json();
    },
    enabled: authenticated,
    refetchInterval: 30000,
  });

  const { data: pendingOrdersCount } = useQuery({
    queryKey: ["orders", "pending", "count"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/orders/pending/count");
      const data = await res.json();
      return data.count || 0;
    },
    enabled: authenticated,
    refetchInterval: 30000,
  });

  const handleLogout = () => {
    logout();
    setLocation("/auth");
  };

  const isDisputeAdmin = user?.role === "dispute_admin";
  const isAdmin = user?.role === "admin";
  
  // Admin only sees Wallet, Admin, and Disputes - no marketplace/feeds/loaders
  const navItems = isDisputeAdmin
    ? [{ href: "/disputes", icon: Gavel, label: "Disputes" }]
    : isAdmin
    ? [
        { href: "/wallet", icon: Wallet, label: "Wallet" },
        { href: "/admin", icon: Shield, label: "Admin" },
        { href: "/disputes", icon: Gavel, label: "Disputes" },
      ]
    : [
        { href: "/", icon: Home, label: "Marketplace" },
        { href: "/orders", icon: ShoppingCart, label: "Orders" },
        { href: "/wallet", icon: Wallet, label: "Wallet" },
      ];

  if (!isDisputeAdmin && !isAdmin && user?.role === "vendor") {
    navItems.push({ href: "/vendor", icon: Store, label: "Vendor" });
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href={isDisputeAdmin ? "/disputes" : isAdmin ? "/wallet" : "/"} className="flex items-center gap-2">
                <div className="p-2 bg-primary rounded-lg">
                  <Shield className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="font-bold text-foreground text-lg hidden sm:block">KYC Marketplace</span>
              </Link>

              {authenticated && (
                <div className="hidden md:flex items-center gap-1">
                  {navItems.map((item) => (
                    <Link key={item.href} href={item.href}>
                      <Button
                        variant={location === item.href ? "secondary" : "ghost"}
                        size="sm"
                        className="gap-2 relative"
                        data-testid={`nav-${item.label.toLowerCase()}`}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                        {item.label === "Orders" && pendingOrdersCount > 0 && (
                          <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-red-500 text-[10px]">
                            {pendingOrdersCount > 9 ? "9+" : pendingOrdersCount}
                          </Badge>
                        )}
                      </Button>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              {authenticated && user?.role !== "admin" && user?.role !== "support" && user?.role !== "dispute_admin" && user?.role !== "finance_manager" && <LanguageSelector />}
              <ThemeToggle />
              {authenticated ? (
                <>
                  {wallet && !isDisputeAdmin && (
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-card rounded-lg border border-border">
                      <Wallet className="h-4 w-4 text-green-500" />
                      <span className="text-foreground font-medium">
                        {parseFloat(wallet.availableBalance || "0").toFixed(2)} USDT
                      </span>
                    </div>
                  )}

                  <Link href="/notifications">
                    <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
                      <Bell className="h-5 w-5" />
                      {unreadCount > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-red-500">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </Badge>
                      )}
                    </Button>
                  </Link>

                  <Link href="/support">
                    <Button variant="ghost" size="icon" className="relative" data-testid="button-support-chat">
                      <Headphones className="h-5 w-5" />
                    </Button>
                  </Link>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="gap-2" data-testid="button-user-menu">
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                          <User className="h-4 w-4 text-primary-foreground" />
                        </div>
                        <span className="hidden sm:block text-foreground">{user?.username}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setLocation("/settings")} data-testid="menu-settings">
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  >
                    {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                  </Button>
                </>
              ) : (
                <Link href="/auth">
                  <Button className="bg-primary hover:bg-primary/90" data-testid="button-signin">
                    Sign In
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {mobileMenuOpen && authenticated && (
            <div className="md:hidden py-4 border-t border-border">
              <div className="flex flex-col gap-2">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={location === item.href ? "secondary" : "ghost"}
                      className="w-full justify-start gap-2 relative"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                      {item.label === "Orders" && pendingOrdersCount > 0 && (
                        <Badge className="ml-auto h-5 min-w-5 px-1.5 flex items-center justify-center bg-red-500 text-[10px]">
                          {pendingOrdersCount > 9 ? "9+" : pendingOrdersCount}
                        </Badge>
                      )}
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>

      {userStatus?.isFrozen && (
        <div className="bg-destructive/10 border-b border-destructive/20">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Account Frozen</p>
                <p className="text-sm text-destructive/90">
                  {userStatus.frozenReason || "Your account has been frozen. You cannot make transactions or post ads."} Please contact support for assistance.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
