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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchWithAuth, isAuthenticated } from "@/lib/auth";
import { PaymentMethodChips } from "@/components/marketplace/VendorCard";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Package,
  Edit,
  Trash2,
  BarChart3,
  Shield,
} from "lucide-react";

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

const exchangeOptions = ["OKX", "Binance", "Bybit", "KuCoin", "Huobi", "Gate.io", "MEXC", "Bitget", "Coinbase", "Kraken"];
const paymentOptions = ["Binance UID", "OKX UID", "MEXC UID", "Bybit UID", "Bitget UID", "Wallet Address", "Bank Transfer", "PayPal"];

export default function VendorPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newOffer, setNewOffer] = useState({
    type: "sell",
    currency: "USD",
    pricePerUnit: "100",
    minLimit: "500",
    maxLimit: "50000",
    availableAmount: "100",
    paymentMethods: ["Binance UID"] as string[],
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

  const { data: kycStatus, isLoading: kycLoading } = useQuery<KycStatus>({
    queryKey: ["kycStatus"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/kyc/status");
      return res.json();
    },
  });

  const isKycVerified = kycStatus?.status === "approved";

  const { data: offers, isLoading: offersLoading } = useQuery<Offer[]>({
    queryKey: ["vendorOffers"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/vendor/offers");
      return res.json();
    },
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
        currency: "USD",
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

  return (
    <Layout>
      <div className="space-y-6 pb-20">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Post Ad</h1>
          {isKycVerified && (
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90" data-testid="button-create-offer">
                  <Plus className="h-4 w-4 mr-2" />
                  New Ad
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
                      <Label>Payment Currency</Label>
                      <Select
                        value={newOffer.currency}
                        onValueChange={(v) => setNewOffer({ ...newOffer, currency: v })}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-700" data-testid="select-offer-currency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="USDT">USDT</SelectItem>
                          <SelectItem value="KES">KES</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Price per Account (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newOffer.pricePerUnit}
                      onChange={(e) => setNewOffer({ ...newOffer, pricePerUnit: e.target.value })}
                      className="bg-gray-800 border-gray-700"
                      placeholder="e.g. 100"
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
                    <Label>Available Accounts</Label>
                    <Input
                      type="number"
                      step="1"
                      value={newOffer.availableAmount}
                      onChange={(e) => setNewOffer({ ...newOffer, availableAmount: e.target.value })}
                      className="bg-gray-800 border-gray-700"
                      placeholder="Number of accounts for sale"
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
                      <p className="text-gray-400 text-sm">These details will only be revealed to the buyer after you confirm payment received.</p>
                      
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

        {kycLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 bg-muted" />
            <Skeleton className="h-24 bg-muted" />
          </div>
        ) : !isKycVerified ? (
          <Card className="bg-card border-border">
            <CardContent className="p-8 text-center">
              <Shield className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">KYC Verification Required</h2>
              <p className="text-muted-foreground mb-6">
                You need to complete KYC verification before you can post ads. This helps us ensure a safe trading environment.
              </p>
              <Button 
                className="bg-primary hover:bg-primary/90"
                onClick={() => setLocation("/settings")}
                data-testid="button-verify-kyc"
              >
                Complete KYC Verification
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                My Ads
              </CardTitle>
            </CardHeader>
            <CardContent>
              {offersLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 bg-muted" />
                  ))}
                </div>
              ) : offers && offers.length > 0 ? (
                <div className="space-y-4">
                  {offers.map((offer) => (
                    <div
                      key={offer.id}
                      className="p-4 rounded-xl bg-muted/50 border border-border"
                      data-testid={`vendor-offer-${offer.id}`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${offer.type === "buy" ? "bg-green-900/50" : "bg-red-900/50"}`}>
                            {offer.type === "buy" ? (
                              <TrendingUp className="h-5 w-5 text-green-400" />
                            ) : (
                              <TrendingDown className="h-5 w-5 text-red-400" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-foreground font-medium">
                                {offer.type.toUpperCase()} {offer.currency}
                              </span>
                              <Badge variant={offer.isActive ? "default" : "secondary"}>
                                {offer.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              ${parseFloat(offer.pricePerUnit).toFixed(2)} per unit
                            </p>
                            {offer.accountDetails?.exchangeName && (
                              <p className="text-xs text-primary">
                                {offer.accountDetails.exchangeName} Account
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right text-sm">
                            <p className="text-muted-foreground">
                              Limit: ${parseFloat(offer.minLimit).toFixed(0)} - ${parseFloat(offer.maxLimit).toFixed(0)}
                            </p>
                            <p className="text-muted-foreground">
                              Available: {parseFloat(offer.availableAmount).toFixed(4)} {offer.currency}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-foreground"
                              data-testid={`button-edit-${offer.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive/80"
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
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-foreground text-lg">No ads yet</p>
                  <p className="text-muted-foreground mb-4">Create your first ad to start trading</p>
                  <Button 
                    className="bg-primary hover:bg-primary/90"
                    onClick={() => setCreateDialogOpen(true)}
                    data-testid="button-create-first-ad"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Post Your First Ad
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
