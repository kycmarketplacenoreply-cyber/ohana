import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchWithAuth, isAuthenticated } from "@/lib/auth";
import { RatingStars, PaymentMethodChips } from "@/components/marketplace/VendorCard";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Star,
  Package,
  Percent,
  Edit,
  Trash2,
  BarChart3,
  Shield,
} from "lucide-react";

interface VendorProfile {
  id: string;
  userId: string;
  tier: string;
  rating: string;
  totalTrades: number;
  successfulTrades: number;
  totalVolume: string;
  isApproved: boolean;
}

interface Offer {
  id: string;
  vendorId: string;
  type: string;
  currency: string;
  pricePerUnit: string;
  minLimit: string;
  maxLimit: string;
  availableAmount: string;
  paymentMethods: string[];
  terms: string | null;
  accountDetails: {
    exchangeName: string;
    accountName: string;
    email: string;
    password: string;
    emailPassword: string;
  } | null;
  isActive: boolean;
  isPriority: boolean;
}

interface KycStatus {
  status: string;
  tier: string;
}

const paymentOptions = ["Bank Transfer", "PayPal", "Venmo", "Cash App", "Zelle", "Wise", "Revolut"];

export default function VendorPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newOffer, setNewOffer] = useState({
    type: "sell",
    currency: "USDT",
    pricePerUnit: "",
    minLimit: "",
    maxLimit: "",
    availableAmount: "",
    paymentMethods: [] as string[],
    terms: "",
    accountDetails: {
      exchangeName: "",
      accountName: "",
      email: "",
      password: "",
      confirmPassword: "",
      emailPassword: "",
    },
  });

  if (!isAuthenticated()) {
    setLocation("/auth");
    return null;
  }

  const { data: kycStatus } = useQuery<KycStatus>({
    queryKey: ["kycStatus"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/kyc/status");
      return res.json();
    },
  });

  const isKycVerified = kycStatus?.status === "approved";

  const { data: vendor, isLoading: vendorLoading } = useQuery<VendorProfile>({
    queryKey: ["vendorProfile"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/vendor/profile");
      return res.json();
    },
  });

  const { data: offers, isLoading: offersLoading } = useQuery<Offer[]>({
    queryKey: ["vendorOffers"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/vendor/offers");
      return res.json();
    },
    enabled: !!vendor,
  });

  const createOfferMutation = useMutation({
    mutationFn: async (offer: typeof newOffer) => {
      const payload: any = {
        type: offer.type,
        currency: offer.currency,
        pricePerUnit: offer.pricePerUnit,
        minLimit: offer.minLimit,
        maxLimit: offer.maxLimit,
        availableAmount: offer.availableAmount,
        paymentMethods: offer.paymentMethods,
        terms: offer.terms,
      };
      if (isKycVerified && offer.accountDetails.email) {
        payload.accountDetails = {
          exchangeName: offer.accountDetails.exchangeName,
          accountName: offer.accountDetails.accountName,
          email: offer.accountDetails.email,
          password: offer.accountDetails.password,
          emailPassword: offer.accountDetails.emailPassword,
        };
      }
      const res = await fetchWithAuth("/api/vendor/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to create offer");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendorOffers"] });
      setCreateDialogOpen(false);
      toast({ title: "Offer Created", description: "Your offer is now live on the marketplace" });
      setNewOffer({
        type: "sell",
        currency: "USDT",
        pricePerUnit: "",
        minLimit: "",
        maxLimit: "",
        availableAmount: "",
        paymentMethods: [],
        terms: "",
        accountDetails: {
          exchangeName: "",
          accountName: "",
          email: "",
          password: "",
          confirmPassword: "",
          emailPassword: "",
        },
      });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to Create Offer", description: error.message });
    },
  });

  const deleteOfferMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const res = await fetchWithAuth(`/api/vendor/offers/${offerId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete offer");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendorOffers"] });
    },
  });

  const completionRate = vendor
    ? vendor.totalTrades > 0
      ? Math.round((vendor.successfulTrades / vendor.totalTrades) * 100)
      : 100
    : 0;

  const tierColors: Record<string, string> = {
    free: "bg-gray-600",
    basic: "bg-blue-600",
    pro: "bg-purple-600",
    featured: "bg-yellow-600",
  };

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Vendor Dashboard</h1>
          {vendor?.isApproved && (
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-purple-600 hover:bg-purple-700" data-testid="button-create-offer">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Offer
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-800 max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-white">Create New Offer</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={newOffer.type}
                        onValueChange={(v) => setNewOffer({ ...newOffer, type: v })}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-700" data-testid="select-offer-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="buy">Buy</SelectItem>
                          <SelectItem value="sell">Sell</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <Select
                        value={newOffer.currency}
                        onValueChange={(v) => setNewOffer({ ...newOffer, currency: v })}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-700" data-testid="select-offer-currency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USDT">USDT</SelectItem>
                          <SelectItem value="BTC">BTC</SelectItem>
                          <SelectItem value="ETH">ETH</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Price per Unit (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newOffer.pricePerUnit}
                      onChange={(e) => setNewOffer({ ...newOffer, pricePerUnit: e.target.value })}
                      className="bg-gray-800 border-gray-700"
                      data-testid="input-price"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Min Limit (USD)</Label>
                      <Input
                        type="number"
                        value={newOffer.minLimit}
                        onChange={(e) => setNewOffer({ ...newOffer, minLimit: e.target.value })}
                        className="bg-gray-800 border-gray-700"
                        data-testid="input-min-limit"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Limit (USD)</Label>
                      <Input
                        type="number"
                        value={newOffer.maxLimit}
                        onChange={(e) => setNewOffer({ ...newOffer, maxLimit: e.target.value })}
                        className="bg-gray-800 border-gray-700"
                        data-testid="input-max-limit"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Available Amount</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={newOffer.availableAmount}
                      onChange={(e) => setNewOffer({ ...newOffer, availableAmount: e.target.value })}
                      className="bg-gray-800 border-gray-700"
                      data-testid="input-available"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Methods</Label>
                    <PaymentMethodChips
                      methods={paymentOptions}
                      selected={newOffer.paymentMethods}
                      onChange={(methods) => setNewOffer({ ...newOffer, paymentMethods: methods })}
                      selectable
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Terms (Optional)</Label>
                    <Textarea
                      value={newOffer.terms}
                      onChange={(e) => setNewOffer({ ...newOffer, terms: e.target.value })}
                      className="bg-gray-800 border-gray-700"
                      placeholder="Trade terms and conditions..."
                      data-testid="input-terms"
                    />
                  </div>

                  {isKycVerified && (
                    <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                      <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-green-400" />
                        <Label className="text-green-400 font-medium">Account Details (KYC Verified)</Label>
                      </div>
                      <p className="text-gray-400 text-sm">These details will only be revealed to the buyer after the transaction is completed by admin.</p>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Exchange Name</Label>
                          <Input
                            value={newOffer.accountDetails.exchangeName}
                            onChange={(e) => setNewOffer({
                              ...newOffer,
                              accountDetails: { ...newOffer.accountDetails, exchangeName: e.target.value }
                            })}
                            className="bg-gray-800 border-gray-700"
                            placeholder="e.g. Binance"
                            data-testid="input-exchange-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Account Name</Label>
                          <Input
                            value={newOffer.accountDetails.accountName}
                            onChange={(e) => setNewOffer({
                              ...newOffer,
                              accountDetails: { ...newOffer.accountDetails, accountName: e.target.value }
                            })}
                            className="bg-gray-800 border-gray-700"
                            placeholder="Account username/name"
                            data-testid="input-account-name"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Account Email</Label>
                        <Input
                          type="email"
                          value={newOffer.accountDetails.email}
                          onChange={(e) => setNewOffer({
                            ...newOffer,
                            accountDetails: { ...newOffer.accountDetails, email: e.target.value }
                          })}
                          className="bg-gray-800 border-gray-700"
                          placeholder="email@example.com"
                          data-testid="input-account-email"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Account Password</Label>
                          <Input
                            type="password"
                            value={newOffer.accountDetails.password}
                            onChange={(e) => setNewOffer({
                              ...newOffer,
                              accountDetails: { ...newOffer.accountDetails, password: e.target.value }
                            })}
                            className="bg-gray-800 border-gray-700"
                            placeholder="Account password"
                            data-testid="input-account-password"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Confirm Password</Label>
                          <Input
                            type="password"
                            value={newOffer.accountDetails.confirmPassword}
                            onChange={(e) => setNewOffer({
                              ...newOffer,
                              accountDetails: { ...newOffer.accountDetails, confirmPassword: e.target.value }
                            })}
                            className="bg-gray-800 border-gray-700"
                            placeholder="Confirm password"
                            data-testid="input-confirm-password"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Email Account Password</Label>
                        <Input
                          type="password"
                          value={newOffer.accountDetails.emailPassword}
                          onChange={(e) => setNewOffer({
                            ...newOffer,
                            accountDetails: { ...newOffer.accountDetails, emailPassword: e.target.value }
                          })}
                          className="bg-gray-800 border-gray-700"
                          placeholder="Password for the email account"
                          data-testid="input-email-password"
                        />
                      </div>
                    </div>
                  )}

                  {!isKycVerified && (
                    <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                      <p className="text-yellow-400 text-sm">Complete KYC verification to add account details to your offers.</p>
                    </div>
                  )}

                  <Button
                    className="w-full bg-purple-600 hover:bg-purple-700"
                    onClick={() => createOfferMutation.mutate(newOffer)}
                    disabled={createOfferMutation.isPending}
                    data-testid="button-submit-offer"
                  >
                    {createOfferMutation.isPending ? "Creating..." : "Create Offer"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {vendorLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 bg-gray-800" />
            ))}
          </div>
        ) : vendor ? (
          <>
            {!vendor.isApproved && (
              <Card className="bg-yellow-900/30 border-yellow-700">
                <CardContent className="p-4">
                  <p className="text-yellow-400">
                    Your vendor account is pending approval. You'll be able to create offers once approved.
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-green-900 rounded-xl">
                      <Package className="h-6 w-6 text-green-400" />
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm">Total Trades</p>
                      <p className="text-white text-2xl font-bold" data-testid="text-total-trades">
                        {vendor.totalTrades}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-900 rounded-xl">
                      <DollarSign className="h-6 w-6 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm">Total Volume</p>
                      <p className="text-white text-2xl font-bold" data-testid="text-total-volume">
                        ${parseFloat(vendor.totalVolume || "0").toFixed(0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-yellow-900 rounded-xl">
                      <Star className="h-6 w-6 text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm">Rating</p>
                      <div className="flex items-center gap-2">
                        <p className="text-white text-2xl font-bold" data-testid="text-rating">
                          {parseFloat(vendor.rating || "0").toFixed(1)}
                        </p>
                        <RatingStars rating={Math.round(parseFloat(vendor.rating || "0"))} size="sm" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-900 rounded-xl">
                      <Percent className="h-6 w-6 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-gray-400 text-sm">Completion Rate</p>
                      <div className="flex items-center gap-2">
                        <p className="text-white text-2xl font-bold" data-testid="text-completion-rate">
                          {completionRate}%
                        </p>
                        <Badge className={tierColors[vendor.tier] || "bg-gray-600"}>
                          {vendor.tier}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  My Offers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {offersLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 bg-gray-800" />
                    ))}
                  </div>
                ) : offers && offers.length > 0 ? (
                  <div className="space-y-4">
                    {offers.map((offer) => (
                      <div
                        key={offer.id}
                        className="p-4 rounded-xl bg-gray-800/50 border border-gray-700"
                        data-testid={`vendor-offer-${offer.id}`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg ${offer.type === "buy" ? "bg-green-900" : "bg-red-900"}`}>
                              {offer.type === "buy" ? (
                                <TrendingUp className="h-5 w-5 text-green-400" />
                              ) : (
                                <TrendingDown className="h-5 w-5 text-red-400" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium">
                                  {offer.type.toUpperCase()} {offer.currency}
                                </span>
                                <Badge variant={offer.isActive ? "default" : "secondary"}>
                                  {offer.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-400">
                                ${parseFloat(offer.pricePerUnit).toFixed(2)} per unit
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right text-sm">
                              <p className="text-gray-400">
                                Limit: ${parseFloat(offer.minLimit).toFixed(0)} - ${parseFloat(offer.maxLimit).toFixed(0)}
                              </p>
                              <p className="text-gray-400">
                                Available: {parseFloat(offer.availableAmount).toFixed(4)} {offer.currency}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-gray-400 hover:text-white"
                                data-testid={`button-edit-${offer.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-400 hover:text-red-300"
                                onClick={() => deleteOfferMutation.mutate(offer.id)}
                                data-testid={`button-delete-${offer.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3">
                          <PaymentMethodChips methods={offer.paymentMethods} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Package className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400 text-lg">No offers yet</p>
                    <p className="text-gray-500">Create your first offer to start trading</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="bg-gray-900/50 border-gray-800">
            <CardContent className="p-8 text-center">
              <p className="text-gray-400 text-lg mb-4">You don't have a vendor account yet</p>
              <Button className="bg-purple-600 hover:bg-purple-700" data-testid="button-become-vendor">
                Apply to Become a Vendor
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
