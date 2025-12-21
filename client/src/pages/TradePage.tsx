import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth, getUser } from "@/lib/auth";
import {
  ArrowLeftRight,
  Shield,
  Star,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

interface Offer {
  id: string;
  vendorId: string;
  vendorUserId: string;
  type: string;
  tradeIntent: "sell_ad" | "buy_ad";
  currency: string;
  pricePerUnit: string;
  minLimit: string;
  maxLimit: string;
  availableAmount: string;
  paymentMethods: string[];
  terms: string | null;
}

export default function TradePage() {
  const { t } = useTranslation();
  const [, params] = useRoute("/trade/:id");
  const [, setLocation] = useLocation();
  const offerId = params?.id;
  const { toast } = useToast();

  const [amount, setAmount] = useState("");
  const [fiatAmount, setFiatAmount] = useState("");

  const { data: offer, isLoading } = useQuery<Offer>({
    queryKey: ["offer", offerId],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/offers`);
      const offers = await res.json();
      return offers.find((o: Offer) => o.id === offerId);
    },
    enabled: !!offerId,
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const orderData: any = {
        offerId,
        amount,
        fiatAmount,
        paymentMethod: offer?.paymentMethods[0] || "Platform Wallet",
      };

      if (offer?.tradeIntent === "buy_ad") {
        orderData.buyerId = offer.vendorUserId;
      }

      const res = await fetchWithAuth("/api/orders", {
        method: "POST",
        body: JSON.stringify(orderData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      return data;
    },
    onSuccess: (data) => {
      const isBuyAd = offer?.tradeIntent === "buy_ad";
      toast({ 
        title: "Order created!", 
        description: isBuyAd ? "Waiting for buyer to deposit funds" : "Proceed with the transaction" 
      });
      setLocation(`/order/${data.id}`);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to create order", description: error.message });
    },
  });

  const handleAmountChange = (value: string) => {
    // Only allow positive decimal numbers (e.g., 7, 8.0, 8.4)
    if (value === "") {
      setAmount("");
      setFiatAmount("");
      return;
    }
    if (!/^\d+(\.\d{0,8})?$/.test(value)) {
      return; // Reject invalid input silently
    }
    const numValue = parseFloat(value);
    setAmount(numValue > 0 ? value : "");
    if (offer && numValue > 0) {
      const fiat = numValue * parseFloat(offer.pricePerUnit);
      setFiatAmount(String(fiat.toFixed(2)));
    } else {
      setFiatAmount("");
    }
  };

  const handleFiatChange = (value: string) => {
    // Only allow positive decimal numbers
    if (value === "") {
      setFiatAmount("");
      setAmount("");
      return;
    }
    if (!/^\d+(\.\d{0,8})?$/.test(value)) {
      return; // Reject invalid input silently
    }
    setFiatAmount(value);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-64 bg-gray-800" />
          <Skeleton className="h-96 bg-gray-800" />
        </div>
      </Layout>
    );
  }

  if (!offer) {
    return (
      <Layout>
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-white text-xl">Offer not found</p>
        </div>
      </Layout>
    );
  }

  const currentUser = getUser();
  const isOwnAd = currentUser && offer.vendorUserId === currentUser.id;

  if (isOwnAd) {
    return (
      <Layout>
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
          <p className="text-white text-xl">This is your own ad</p>
          <p className="text-gray-400 mt-2">You cannot trade on your own advertisement</p>
          <Button 
            className="mt-4"
            onClick={() => setLocation("/")}
            data-testid="button-back-home"
          >
            Back to Marketplace
          </Button>
        </div>
      </Layout>
    );
  }

  const isValidAmount = amount && 
    parseFloat(fiatAmount) >= parseFloat(offer.minLimit) && 
    parseFloat(fiatAmount) <= parseFloat(offer.maxLimit) &&
    parseFloat(amount) <= parseFloat(offer.availableAmount);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6 px-2 sm:px-4">
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-white flex items-center gap-2 truncate min-w-0">
                <ArrowLeftRight className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                <span className="truncate">{offer.type === "buy" ? "Sell" : "Buy"} {offer.currency}</span>
              </CardTitle>
              <Badge className={offer.type === "buy" ? "bg-green-600" : "bg-red-600"}>
                {offer.type.toUpperCase()} Offer
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-gray-800 rounded-lg">
              <div className="h-12 w-12 rounded-full bg-purple-600 flex items-center justify-center">
                <Star className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-white font-medium">Verified Vendor</p>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <CheckCircle className="h-3 w-3 text-green-400" />
                  <span>KYC Verified</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-800 rounded-lg">
                <p className="text-gray-400 text-sm">Price per account</p>
                <p className="text-2xl font-bold text-white">
                  ${Math.floor(parseFloat(offer.pricePerUnit))}
                </p>
              </div>
              <div className="p-4 bg-gray-800 rounded-lg">
                <p className="text-gray-400 text-sm">Available</p>
                <p className="text-2xl font-bold text-white">
                  {Math.floor(parseFloat(offer.availableAmount))} accounts
                </p>
              </div>
            </div>

            <div className="p-4 bg-gray-800 rounded-lg">
              <p className="text-gray-400 text-sm mb-1">Limits</p>
              <p className="text-white">
                ${parseFloat(offer.minLimit).toFixed(0)} - ${parseFloat(offer.maxLimit).toFixed(0)}
              </p>
            </div>

            {offer.terms && (
              <div className="p-4 bg-gray-800 rounded-lg">
                <p className="text-gray-400 text-sm mb-1">Terms</p>
                <p className="text-gray-300 text-sm">{offer.terms}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Create Order</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Number of accounts</Label>
                <Input
                  type="number"
                  placeholder="1"
                  min="1"
                  step="1"
                  className="bg-gray-800 border-gray-700 text-white text-lg"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  data-testid="input-account-amount"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Total price (USD)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  className="bg-gray-800 border-gray-700 text-white text-lg"
                  value={fiatAmount}
                  onChange={(e) => handleFiatChange(e.target.value)}
                  data-testid="input-fiat-amount"
                  readOnly
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Account Type</Label>
              <div className="p-3 bg-gray-800 rounded-lg">
                <span className="text-white font-medium">
                  {offer.paymentMethods[0]?.replace(" UID", "").replace(" Address", "") || "Platform"} Account
                </span>
                <p className="text-gray-400 text-sm mt-1">Payment via Platform Wallet</p>
              </div>
            </div>

            <div className="p-4 bg-purple-900/30 border border-purple-700 rounded-lg flex items-start gap-3">
              <Shield className="h-5 w-5 text-purple-400 mt-0.5" />
              <div>
                <p className="text-purple-300 font-medium">Escrow Protection</p>
                <p className="text-purple-400 text-sm">
                  {offer.tradeIntent === "sell_ad" 
                    ? "Your funds will be held in escrow immediately. Seller delivers, then you confirm to release payment."
                    : "After seller accepts, you'll need to deposit funds. Once escrowed, seller delivers and you confirm."}
                </p>
              </div>
            </div>

            {offer.tradeIntent === "buy_ad" && (
              <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5" />
                <div>
                  <p className="text-yellow-300 font-medium">This is a Buy Request</p>
                  <p className="text-yellow-400 text-sm">
                    The buyer is looking for sellers. If you accept, you'll deliver the product after the buyer deposits funds.
                  </p>
                </div>
              </div>
            )}

            <Button
              className="w-full bg-purple-600 hover:bg-purple-700 h-12 text-lg"
              disabled={!isValidAmount || createOrderMutation.isPending}
              onClick={() => createOrderMutation.mutate()}
              data-testid="button-create-order"
            >
              {createOrderMutation.isPending ? "Creating Order..." : "Create Order"}
            </Button>

            {amount && !isValidAmount && (
              <p className="text-red-400 text-sm text-center">
                Amount must be within limits (${parseFloat(offer.minLimit).toFixed(0)} - ${parseFloat(offer.maxLimit).toFixed(0)})
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
