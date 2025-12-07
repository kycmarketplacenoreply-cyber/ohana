import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Shield, CheckCircle, TrendingUp } from "lucide-react";

interface VendorCardProps {
  vendor: {
    id: string;
    username: string;
    rating: number;
    totalTrades: number;
    completionRate: number;
    isVerified: boolean;
    tier: string;
  };
  onClick?: () => void;
}

export function VendorCard({ vendor, onClick }: VendorCardProps) {
  const tierColors: Record<string, string> = {
    free: "bg-gray-600",
    basic: "bg-blue-600",
    pro: "bg-purple-600",
    featured: "bg-yellow-600",
  };

  return (
    <Card
      className="bg-gray-800/50 border-gray-700 hover:border-purple-600 transition-colors cursor-pointer"
      onClick={onClick}
      data-testid={`vendor-card-${vendor.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <span className="text-white font-bold text-lg">
              {vendor.username.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-white font-medium">{vendor.username}</span>
              {vendor.isVerified && (
                <CheckCircle className="h-4 w-4 text-green-400" />
              )}
              <Badge className={tierColors[vendor.tier] || "bg-gray-600"}>
                {vendor.tier}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
              <div className="flex items-center gap-1">
                <Star className="h-3 w-3 text-yellow-400" />
                <span>{vendor.rating.toFixed(1)}</span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                <span>{vendor.totalTrades} trades</span>
              </div>
              <div className="flex items-center gap-1">
                <Shield className="h-3 w-3" />
                <span>{vendor.completionRate}%</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function RatingStars({
  rating,
  maxStars = 5,
  size = "sm",
  interactive = false,
  onChange,
}: {
  rating: number;
  maxStars?: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onChange?: (rating: number) => void;
}) {
  const sizeClass = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <div className="flex items-center gap-0.5" data-testid="rating-stars">
      {Array.from({ length: maxStars }).map((_, i) => (
        <Star
          key={i}
          className={`${sizeClass[size]} ${
            i < rating ? "text-yellow-400 fill-yellow-400" : "text-gray-600"
          } ${interactive ? "cursor-pointer hover:text-yellow-300" : ""}`}
          onClick={() => interactive && onChange?.(i + 1)}
          data-testid={`star-${i + 1}`}
        />
      ))}
    </div>
  );
}

interface ExchangeOption {
  symbol: string;
  name?: string;
}

export function CurrencySelector({
  value,
  onChange,
  exchanges = [],
  currencies = [],
}: {
  value: string;
  onChange: (currency: string) => void;
  exchanges?: ExchangeOption[];
  currencies?: string[];
}) {
  const currencyIcons: Record<string, string> = {
    USDT: "₮",
    BTC: "₿",
    ETH: "Ξ",
    BNB: "B",
    SOL: "◎",
  };

  const options = exchanges.length > 0 
    ? exchanges.map(e => e.symbol) 
    : currencies.length > 0 
      ? currencies 
      : ["USDT", "BTC", "ETH", "BNB", "SOL"];

  return (
    <div className="flex flex-wrap gap-2" data-testid="currency-selector">
      {options.map((currency) => (
        <button
          key={currency}
          onClick={() => onChange(currency)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            value === currency
              ? "bg-purple-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
          data-testid={`currency-${currency}`}
        >
          <span className="mr-1">{currencyIcons[currency] || currency.charAt(0)}</span>
          {currency}
        </button>
      ))}
    </div>
  );
}

export function PaymentMethodChips({
  methods,
  selected = [],
  onChange,
  selectable = false,
}: {
  methods: string[];
  selected?: string[];
  onChange?: (methods: string[]) => void;
  selectable?: boolean;
}) {
  const toggleMethod = (method: string) => {
    if (!selectable || !onChange) return;
    if (selected.includes(method)) {
      onChange(selected.filter((m) => m !== method));
    } else {
      onChange([...selected, method]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2" data-testid="payment-method-chips">
      {methods.map((method) => (
        <Badge
          key={method}
          variant={selected.includes(method) ? "default" : "outline"}
          className={`${
            selectable ? "cursor-pointer" : ""
          } ${
            selected.includes(method)
              ? "bg-purple-600 border-purple-600"
              : "text-gray-400 border-gray-600"
          }`}
          onClick={() => toggleMethod(method)}
          data-testid={`payment-method-${method}`}
        >
          {method}
        </Badge>
      ))}
    </div>
  );
}

export function EscrowStatusStepper({
  currentStatus,
}: {
  currentStatus: string;
}) {
  const steps = [
    { id: "pending", label: "Pending" },
    { id: "funded", label: "Funded" },
    { id: "paid", label: "Paid" },
    { id: "released", label: "Released" },
  ];

  const currentIndex = steps.findIndex((s) => s.id === currentStatus);
  const isDisputed = currentStatus === "disputed";
  const isCancelled = currentStatus === "cancelled";

  if (isDisputed || isCancelled) {
    return (
      <div className="flex items-center justify-center p-4" data-testid="escrow-status-stepper">
        <Badge className={isDisputed ? "bg-red-600" : "bg-gray-600"}>
          {isDisputed ? "Disputed" : "Cancelled"}
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between" data-testid="escrow-status-stepper">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                index <= currentIndex
                  ? "bg-green-600 text-white"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              {index < currentIndex ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                index + 1
              )}
            </div>
            <span
              className={`text-xs mt-1 ${
                index <= currentIndex ? "text-green-400" : "text-gray-500"
              }`}
            >
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div
              className={`w-12 h-0.5 mx-2 ${
                index < currentIndex ? "bg-green-600" : "bg-gray-700"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
