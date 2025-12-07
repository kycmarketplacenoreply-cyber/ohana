import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isAuthenticated, getUser, fetchWithAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/marketplace/ThemeToggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  Home,
  ShoppingCart,
  Megaphone,
  MessageCircle,
  User,
  ThumbsUp,
  Clock,
  Filter,
  ChevronLeft,
  Bell,
  Search,
} from "lucide-react";

interface Offer {
  id: string;
  vendorId: string;
  vendorName?: string;
  vendorTrades?: number;
  vendorCompletionRate?: number;
  vendorRating?: number;
  vendorVerified?: boolean;
  type: string;
  currency: string;
  pricePerUnit: string;
  minLimit: string;
  maxLimit: string;
  availableAmount: string;
  paymentMethods: string[];
  terms: string | null;
  isActive: boolean;
  isPriority: boolean;
  responseTime?: number;
}

interface Exchange {
  id: string;
  name: string;
  symbol: string;
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
  sortOrder: number;
}

export default function HomePage() {
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: offers, isLoading } = useQuery<Offer[]>({
    queryKey: ["offers", activeTab === "buy" ? "sell" : "buy", selectedAccount, selectedPaymentMethod, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("type", activeTab === "buy" ? "sell" : "buy");
      if (selectedAccount && selectedAccount !== "all") {
        params.append("accountType", selectedAccount);
      }
      if (selectedPaymentMethod && selectedPaymentMethod !== "all") {
        params.append("paymentMethod", selectedPaymentMethod);
      }
      if (searchQuery) {
        params.append("search", searchQuery);
      }
      const res = await fetch(`/api/marketplace/offers?${params}`);
      return res.json();
    },
  });

  const { data: unreadCount } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/notifications/unread/count");
      const data = await res.json();
      return data.count || 0;
    },
    enabled: isAuthenticated(),
  });

  const handleTradeClick = (offer: Offer) => {
    if (!isAuthenticated()) {
      setLocation("/auth");
      return;
    }
    setLocation(`/trade/${offer.id}`);
  };

  const formatPaymentMethod = (method: string) => {
    const methodMap: Record<string, string> = {
      "mpesa": "M-PESA Kenya",
      "bank_transfer": "Bank Transfer",
      "equity_bank": "Equity Bank",
      "paybill": "M-pesa Paybill",
    };
    return methodMap[method.toLowerCase()] || method;
  };

  const getAccountType = (paymentMethods: string[]) => {
    if (!paymentMethods || paymentMethods.length === 0) return "Account";
    const method = paymentMethods[0];
    if (method.includes("Binance")) return "Binance";
    if (method.includes("OKX")) return "OKX";
    if (method.includes("Bybit")) return "Bybit";
    if (method.includes("MEXC")) return "MEXC";
    if (method.includes("KuCoin")) return "KuCoin";
    return method.replace(" UID", "").replace(" Address", "");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <button className="p-1" data-testid="button-back">
              <ChevronLeft className="h-6 w-6 text-foreground" />
            </button>
            <div className="flex items-center gap-6">
              <span className="text-foreground font-semibold border-b-2 border-foreground pb-1">P2P</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/notifications">
              <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
                <Bell className="h-5 w-5 text-muted-foreground" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
            </Link>
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search accounts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-muted rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="search-accounts"
            />
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="inline-flex bg-muted rounded-lg p-1">
            <button
              onClick={() => setActiveTab("buy")}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "buy"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="tab-buy"
            >
              Buy
            </button>
            <button
              onClick={() => setActiveTab("sell")}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "sell"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="tab-sell"
            >
              Sell
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-4">
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-auto border-0 shadow-none p-0 h-auto bg-transparent" data-testid="filter-account">
                <div className="flex items-center gap-1 text-foreground font-medium text-sm">
                  <SelectValue placeholder="All Accounts" />
                  <ChevronDown className="h-4 w-4" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                <SelectItem value="Binance UID">Binance</SelectItem>
                <SelectItem value="OKX UID">OKX</SelectItem>
                <SelectItem value="MEXC UID">MEXC</SelectItem>
                <SelectItem value="Bybit UID">Bybit</SelectItem>
                <SelectItem value="Bitget UID">Bitget</SelectItem>
                <SelectItem value="Wallet Address">Wallet</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
              <SelectTrigger className="w-auto border-0 shadow-none p-0 h-auto bg-transparent" data-testid="filter-payment">
                <div className="flex items-center gap-1 text-foreground font-medium text-sm">
                  <SelectValue placeholder="All Payments" />
                  <ChevronDown className="h-4 w-4" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="Binance UID">Binance UID</SelectItem>
                <SelectItem value="OKX UID">OKX UID</SelectItem>
                <SelectItem value="MEXC UID">MEXC UID</SelectItem>
                <SelectItem value="Bybit UID">Bybit UID</SelectItem>
                <SelectItem value="Bitget UID">Bitget UID</SelectItem>
                <SelectItem value="Wallet Address">Wallet Address</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <button className="p-2" data-testid="button-filter">
            <Filter className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-40 bg-muted" />
            ))}
          </div>
        ) : offers && offers.length > 0 ? (
          <div className="divide-y divide-border">
            {offers.map((offer) => (
              <div
                key={offer.id}
                className={`p-4 ${offer.isPriority ? "bg-amber-500/10 border-l-4 border-amber-400" : "bg-background"}`}
                data-testid={`offer-card-${offer.id}`}
              >
                {offer.isPriority && (
                  <div className="flex justify-end mb-2">
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Promoted Ad</span>
                  </div>
                )}

                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {(offer.vendorName || "V")[0].toUpperCase()}
                      </div>
                      <span className="font-medium text-foreground">{offer.vendorName || `Vendor_${offer.vendorId.slice(0, 6)}`}</span>
                      {offer.vendorVerified && (
                        <div className="w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                          <span className="text-primary-foreground text-xs">✓</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                      <span>{offer.vendorTrades ?? 0} Trades</span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" />
                        {offer.vendorRating ?? "99.00"}%
                      </span>
                    </div>

                    <div className="mb-2">
                      <span className="text-2xl font-bold text-foreground">{parseFloat(offer.pricePerUnit).toFixed(2)}</span>
                      <span className="text-muted-foreground text-xs"> USDT/{selectedAccount !== "all" ? selectedAccount.replace(" UID", "").replace(" Address", "") : getAccountType(offer.paymentMethods)}</span>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>Limit <span className="text-foreground">{parseFloat(offer.minLimit).toLocaleString()} - {parseFloat(offer.maxLimit).toLocaleString()} USDT</span></p>
                      <p>Available <span className="text-foreground">{parseFloat(offer.availableAmount).toFixed(2)} accounts</span></p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="text-right space-y-1">
                      {offer.paymentMethods.slice(0, 4).map((method, idx) => (
                        <div key={idx} className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{formatPaymentMethod(method)}</span>
                          <div className="w-1.5 h-3 bg-primary rounded-sm" />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                      <Clock className="h-3 w-3" />
                      <span>{offer.responseTime || 15} min</span>
                    </div>
                    <Button
                      className={`${activeTab === "buy" ? "bg-primary hover:bg-primary/90" : "bg-red-500 hover:bg-red-600"} text-primary-foreground px-8 py-2 rounded-md font-medium mt-2`}
                      onClick={() => handleTradeClick(offer)}
                      data-testid={`button-trade-${offer.id}`}
                    >
                      {activeTab === "buy" ? "Buy" : "Sell"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <Filter className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-lg">No accounts found</p>
            <p className="text-muted-foreground/70 text-sm">Try a different search or filter</p>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50">
        <div className="flex items-center justify-around py-2">
          <Link href="/">
            <button className="flex flex-col items-center gap-1 px-4 py-2" data-testid="nav-home">
              <Home className={`h-6 w-6 ${location === "/" ? "text-foreground" : "text-muted-foreground"}`} />
              <span className={`text-xs ${location === "/" ? "text-foreground" : "text-muted-foreground"}`}>Home</span>
            </button>
          </Link>
          <Link href="/orders">
            <button className="flex flex-col items-center gap-1 px-4 py-2" data-testid="nav-orders">
              <ShoppingCart className={`h-6 w-6 ${location === "/orders" ? "text-foreground" : "text-muted-foreground"}`} />
              <span className={`text-xs ${location === "/orders" ? "text-foreground" : "text-muted-foreground"}`}>Orders</span>
            </button>
          </Link>
          <Link href="/vendor">
            <button className="flex flex-col items-center gap-1 px-4 py-2" data-testid="nav-ads">
              <Megaphone className={`h-6 w-6 ${location === "/vendor" ? "text-foreground" : "text-muted-foreground"}`} />
              <span className={`text-xs ${location === "/vendor" ? "text-foreground" : "text-muted-foreground"}`}>Ads</span>
            </button>
          </Link>
          <Link href="/notifications">
            <button className="flex flex-col items-center gap-1 px-4 py-2 relative" data-testid="nav-chat">
              <MessageCircle className={`h-6 w-6 ${location === "/notifications" ? "text-foreground" : "text-muted-foreground"}`} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-2 h-4 w-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
              <span className={`text-xs ${location === "/notifications" ? "text-foreground" : "text-muted-foreground"}`}>Chat</span>
            </button>
          </Link>
          <Link href="/settings">
            <button className="flex flex-col items-center gap-1 px-4 py-2" data-testid="nav-profile">
              <User className={`h-6 w-6 ${location === "/settings" ? "text-foreground" : "text-muted-foreground"}`} />
              <span className={`text-xs ${location === "/settings" ? "text-foreground" : "text-muted-foreground"}`}>Profile</span>
            </button>
          </Link>
        </div>
      </nav>
    </div>
  );
}
