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

  const handleLogout = () => {
    logout();
    setLocation("/auth");
  };

  const isDisputeAdmin = user?.role === "dispute_admin";
  
  const navItems = isDisputeAdmin
    ? [{ href: "/disputes", icon: Gavel, label: "Disputes" }]
    : [
        { href: "/", icon: Home, label: "Marketplace" },
        { href: "/orders", icon: ShoppingCart, label: "Orders" },
        { href: "/wallet", icon: Wallet, label: "Wallet" },
      ];

  if (!isDisputeAdmin && (user?.role === "vendor" || user?.role === "admin")) {
    navItems.push({ href: "/vendor", icon: Store, label: "Vendor" });
  }

  if (user?.role === "admin") {
    navItems.push({ href: "/admin", icon: Shield, label: "Admin" });
    navItems.push({ href: "/disputes", icon: Gavel, label: "Disputes" });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <nav className="sticky top-0 z-50 border-b border-gray-800 bg-gray-900/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2">
                <div className="p-2 bg-purple-600 rounded-lg">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <span className="font-bold text-white text-lg hidden sm:block">KYC Marketplace</span>
              </Link>

              {authenticated && (
                <div className="hidden md:flex items-center gap-1">
                  {navItems.map((item) => (
                    <Link key={item.href} href={item.href}>
                      <Button
                        variant={location === item.href ? "secondary" : "ghost"}
                        size="sm"
                        className="gap-2 text-gray-300 hover:text-white"
                        data-testid={`nav-${item.label.toLowerCase()}`}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Button>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              <ThemeToggle />
              {authenticated ? (
                <>
                  {wallet && !isDisputeAdmin && (
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg">
                      <Wallet className="h-4 w-4 text-green-400" />
                      <span className="text-white font-medium">
                        {parseFloat(wallet.availableBalance || "0").toFixed(2)} USDT
                      </span>
                    </div>
                  )}

                  <Link href="/notifications">
                    <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
                      <Bell className="h-5 w-5 text-gray-300" />
                      {unreadCount > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-red-500">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </Badge>
                      )}
                    </Button>
                  </Link>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="gap-2" data-testid="button-user-menu">
                        <div className="h-8 w-8 rounded-full bg-purple-600 flex items-center justify-center">
                          <User className="h-4 w-4 text-white" />
                        </div>
                        <span className="hidden sm:block text-white">{user?.username}</span>
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
                  <Button className="bg-purple-600 hover:bg-purple-700" data-testid="button-signin">
                    Sign In
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {mobileMenuOpen && authenticated && (
            <div className="md:hidden py-4 border-t border-gray-800">
              <div className="flex flex-col gap-2">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={location === item.href ? "secondary" : "ghost"}
                      className="w-full justify-start gap-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
