import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { isAuthenticated, getUser, fetchWithAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/marketplace/ThemeToggle";
import { LanguageSelector } from "@/components/marketplace/LanguageSelector";
import SocialFeed from "@/components/social/SocialFeed";
import LoadersZone from "@/components/loaders/LoadersZone";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Home,
  ShoppingCart,
  Megaphone,
  MessageCircle,
  User,
  ThumbsUp,
  Clock,
  ChevronLeft,
  Bell,
  Search,
  Rss,
  Store,
  Loader2,
  Shield,
  Filter,
  Headphones,
} from "lucide-react";

interface Offer {
  id: string;
  vendorId: string;
  vendorUserId: string;
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

type MainSection = "feed" | "p2p" | "loaders";

export default function HomePage() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const [mainSection, setMainSection] = useState<MainSection>("feed");
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [selectedAccount] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdsModal, setShowAdsModal] = useState(false);

  const { data: offers, isLoading } = useQuery<Offer[]>({
    queryKey: ["offers", activeTab === "buy" ? "sell" : "buy", selectedAccount, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("type", activeTab === "buy" ? "sell" : "buy");
      if (selectedAccount && selectedAccount !== "all") {
        params.append("paymentMethod", selectedAccount);
      }
      if (searchQuery) {
        params.append("search", searchQuery);
      }
      const res = await fetch(`/api/marketplace/offers?${params}`);
      return res.json();
    },
    enabled: mainSection === "p2p",
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

  const getSectionTitle = () => {
    switch (mainSection) {
      case "feed":
        return t('feed.title');
      case "p2p":
        return t('marketplace.title');
      case "loaders":
        return t('loaders.title');
      default:
        return t('nav.marketplace');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="flex items-center justify-between px-2 sm:px-4 py-3 gap-1 sm:gap-2">
          <button className="p-1 flex-shrink-0" data-testid="button-back">
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-foreground" />
          </button>
          <span className="text-xs sm:text-sm md:text-base text-foreground font-semibold border-b-2 border-foreground pb-1 truncate min-w-0">
            {getSectionTitle()}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <ThemeToggle />
            <Link href="/notifications">
              <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
                <Bell className="h-4 sm:h-5 w-4 sm:w-5 text-muted-foreground" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
            </Link>
          </div>
        </div>

        <div className="px-2 sm:px-4 pb-3">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setMainSection("feed")}
              className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                mainSection === "feed"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              data-testid="section-feed"
            >
              <Rss className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
              {t('feed.title')}
            </button>
            <button
              onClick={() => setMainSection("p2p")}
              className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                mainSection === "p2p"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              data-testid="section-p2p"
            >
              <Store className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
              <span className="hidden sm:inline">{t('marketplace.title')}</span>
              <span className="sm:hidden">KYC</span>
            </button>
            <button
              onClick={() => setMainSection("loaders")}
              className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                mainSection === "loaders"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              data-testid="section-loaders"
            >
              <Loader2 className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
              <span className="hidden sm:inline">{t('loaders.title')}</span>
              <span className="sm:hidden">{t('loaders.shortTitle')}</span>
            </button>
          </div>
        </div>

        {mainSection === "p2p" && (
          <>
            <div className="px-4 pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t('common.search')}
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
                  {t('marketplace.buy')}
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
                  {t('marketplace.sell')}
                </button>
              </div>
            </div>

          </>
        )}
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {mainSection === "feed" && (
          <div className="p-4">
            <SocialFeed />
          </div>
        )}

        {mainSection === "p2p" && (
          <>
            {isLoading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-40 bg-muted" />
                ))}
              </div>
            ) : offers && offers.length > 0 ? (() => {
              const currentUser = getUser();
              const currentUserId = currentUser?.id;
              return (
              <div className="divide-y divide-border">
                {offers.map((offer) => {
                  const isOwnAd = currentUserId && offer.vendorUserId === currentUserId;
                  return (
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
                          <button
                            onClick={() => setLocation(`/profile?id=${offer.vendorUserId}`)}
                            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                            data-testid={`profile-link-vendor-${offer.vendorUserId}`}
                          >
                            <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                              {(offer.vendorName || "V")[0].toUpperCase()}
                            </div>
                            <span className="font-medium text-foreground">{offer.vendorName || `Vendor_${offer.vendorId.slice(0, 6)}`}</span>
                          </button>
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
                          <span className="text-2xl font-bold text-foreground">${Math.floor(parseFloat(offer.pricePerUnit))}</span>
                          <span className="text-muted-foreground text-xs"> /{selectedAccount !== "all" ? selectedAccount.replace(" UID", "").replace(" Address", "") : getAccountType(offer.paymentMethods)} account</span>
                        </div>

                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>Limit <span className="text-foreground">${Math.floor(parseFloat(offer.minLimit)).toLocaleString()} - ${Math.floor(parseFloat(offer.maxLimit)).toLocaleString()}</span></p>
                          <p>Available <span className="text-foreground">{Math.floor(parseFloat(offer.availableAmount))} accounts</span></p>
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
                        {isOwnAd ? (
                          <Badge className="bg-muted text-muted-foreground px-4 py-2 mt-2">
                            Your Ad
                          </Badge>
                        ) : (
                          <Button
                            className={`${activeTab === "buy" ? "bg-primary hover:bg-primary/90" : "bg-red-500 hover:bg-red-600"} text-primary-foreground px-8 py-2 rounded-md font-medium mt-2`}
                            onClick={() => handleTradeClick(offer)}
                            data-testid={`button-trade-${offer.id}`}
                          >
                            {activeTab === "buy" ? "Buy" : "Sell"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
              );
            })() : (
              <div className="flex flex-col items-center justify-center py-20">
                <Filter className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-lg">No accounts found</p>
                <p className="text-muted-foreground/70 text-sm">Try a different search or filter</p>
              </div>
            )}
          </>
        )}

        {mainSection === "loaders" && (
          <LoadersZone />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50">
        <div className="flex items-center justify-around py-2">
          <Link href="/">
            <button className="flex flex-col items-center gap-1 px-4 py-2" data-testid="nav-home">
              <Home className={`h-6 w-6 ${location === "/" ? "text-foreground" : "text-muted-foreground"}`} />
              <span className={`text-xs ${location === "/" ? "text-foreground" : "text-muted-foreground"}`}>{t('navigation.home')}</span>
            </button>
          </Link>
          <Link href="/orders">
            <button className="flex flex-col items-center gap-1 px-4 py-2" data-testid="nav-orders">
              <ShoppingCart className={`h-6 w-6 ${location === "/orders" ? "text-foreground" : "text-muted-foreground"}`} />
              <span className={`text-xs ${location === "/orders" ? "text-foreground" : "text-muted-foreground"}`}>{t('navigation.orders')}</span>
            </button>
          </Link>
          <button 
            className="flex flex-col items-center gap-1 px-4 py-2" 
            data-testid="nav-ads"
            onClick={() => setShowAdsModal(true)}
          >
            <Megaphone className="h-6 w-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('navigation.ads')}</span>
          </button>
          <Link href="/notifications">
            <button className="flex flex-col items-center gap-1 px-4 py-2 relative" data-testid="nav-chat">
              <MessageCircle className={`h-6 w-6 ${location === "/notifications" ? "text-foreground" : "text-muted-foreground"}`} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-2 h-4 w-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
              <span className={`text-xs ${location === "/notifications" ? "text-foreground" : "text-muted-foreground"}`}>{t('navigation.chat')}</span>
            </button>
          </Link>
          <Link href="/settings">
            <button className="flex flex-col items-center gap-1 px-4 py-2" data-testid="nav-profile">
              <User className={`h-6 w-6 ${location === "/settings" ? "text-foreground" : "text-muted-foreground"}`} />
              <span className={`text-xs ${location === "/settings" ? "text-foreground" : "text-muted-foreground"}`}>{t('navigation.profile')}</span>
            </button>
          </Link>
        </div>
      </nav>

      <Dialog open={showAdsModal} onOpenChange={setShowAdsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('vendor.chooseAdType')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <button
              onClick={() => {
                setShowAdsModal(false);
                setLocation("/vendor");
              }}
              className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted transition-colors"
              data-testid="btn-kyc-ad"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Store className="h-6 w-6 text-primary" />
              </div>
              <div className="text-left">
                <h3 className="font-medium text-foreground">{t('vendor.kycMarketplaceAd')}</h3>
                <p className="text-sm text-muted-foreground">{t('vendor.postAdBuyOrSell')}</p>
              </div>
            </button>
            <button
              onClick={() => {
                setShowAdsModal(false);
                setMainSection("loaders");
              }}
              className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted transition-colors"
              data-testid="btn-loader-ad"
            >
              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Shield className="h-6 w-6 text-amber-500" />
              </div>
              <div className="text-left">
                <h3 className="font-medium text-foreground">{t('vendor.loadersZoneAd')}</h3>
                <p className="text-sm text-muted-foreground">{t('vendor.postAdLoadingServices')}</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating Support Button */}
      <Link href="/support">
        <button
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary hover:bg-primary/90 shadow-lg flex items-center justify-center text-white z-40 transition-all hover:scale-110"
          data-testid="button-floating-support"
          title="Report Issue or Contact Support"
        >
          <Headphones className="h-6 w-6" />
        </button>
      </Link>
    </div>
  );
}
