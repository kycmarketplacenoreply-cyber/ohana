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

export default function VendorPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [newOffer, setNewOffer] = useState({
    type: "sell",
    currency: "USD",
    pricePerUnit: "",
    minLimit: "",
    maxLimit: "",
    availableAmount: "",
    accountType: "",
    terms: "",
  });
  const [editOffer, setEditOffer] = useState({
    pricePerUnit: "",
    minLimit: "",
    maxLimit: "",
    availableAmount: "",
    terms: "",
    isActive: true,
  });

  const calculateMaxAmount = (price: string, available: string) => {
    const priceNum = parseFloat(price) || 0;
    const availableNum = parseFloat(available) || 0;
    if (priceNum > 0 && availableNum > 0) {
      return String(Math.floor(priceNum * availableNum));
    }
    return "";
  };

  const handlePriceChange = (value: string) => {
    // Only allow positive decimal numbers
    if (value === "") {
      setNewOffer({ ...newOffer, pricePerUnit: "", maxLimit: "" });
      return;
    }
    if (!/^\d+(\.\d{0,8})?$/.test(value)) {
      return; // Reject invalid input silently
    }
    const numValue = parseFloat(value);
    if (numValue > 0) {
      const maxLimit = calculateMaxAmount(value, newOffer.availableAmount);
      setNewOffer({ ...newOffer, pricePerUnit: value, maxLimit });
    }
  };

  const handleAvailableChange = (value: string) => {
    const numValue = parseFloat(value);
    if (numValue < 0) return;
    const maxLimit = calculateMaxAmount(newOffer.pricePerUnit, value);
    setNewOffer({ ...newOffer, availableAmount: value, maxLimit });
  };

  const handleMinLimitChange = (value: string) => {
    // Only allow positive decimal numbers (e.g., 0.5, 1, 10.25)
    if (value === "") {
      setNewOffer({ ...newOffer, minLimit: "" });
      return;
    }
    if (!/^\d+(\.\d{0,8})?$/.test(value)) {
      return; // Reject invalid input silently
    }
    const numValue = parseFloat(value);
    // Minimum KYC marketplace price is 0.5 USDT
    if (numValue >= 0.5) {
      setNewOffer({ ...newOffer, minLimit: value });
    }
  };

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
      if (parseFloat(offer.pricePerUnit) <= 0 || parseFloat(offer.availableAmount) <= 0 || parseFloat(offer.minLimit) < 0) {
        throw new Error("Price, accounts, and min limit must be positive values");
      }
      if (!offer.accountType.trim()) {
        throw new Error("Account type is required");
      }
      const payload: any = {
        type: offer.type,
        currency: "USD",
        pricePerUnit: offer.pricePerUnit,
        minLimit: offer.minLimit,
        maxLimit: offer.maxLimit,
        availableAmount: offer.availableAmount,
        paymentMethods: [offer.accountType.trim()],
        terms: offer.terms,
      };
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
        accountType: "",
        terms: "",
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
      toast({ title: "Offer Deleted", description: "Your ad has been removed" });
    },
  });

  const updateOfferMutation = useMutation({
    mutationFn: async ({ offerId, updates }: { offerId: string; updates: typeof editOffer }) => {
      const res = await fetchWithAuth(`/api/vendor/offers/${offerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update offer");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendorOffers"] });
      setEditDialogOpen(false);
      setEditingOffer(null);
      toast({ title: "Offer Updated", description: "Your ad has been updated successfully" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to Update", description: error.message });
    },
  });

  const handleEditClick = (offer: Offer) => {
    setEditingOffer(offer);
    setEditOffer({
      pricePerUnit: offer.pricePerUnit,
      minLimit: offer.minLimit,
      maxLimit: offer.maxLimit,
      availableAmount: offer.availableAmount,
      terms: offer.terms || "",
      isActive: offer.isActive,
    });
    setEditDialogOpen(true);
  };

  const handleEditPriceChange = (value: string) => {
    const numValue = parseFloat(value);
    if (numValue < 0) return;
    const maxLimit = calculateMaxAmount(value, editOffer.availableAmount);
    setEditOffer({ ...editOffer, pricePerUnit: value, maxLimit });
  };

  const handleEditAvailableChange = (value: string) => {
    const numValue = parseFloat(value);
    if (numValue < 0) return;
    const maxLimit = calculateMaxAmount(editOffer.pricePerUnit, value);
    setEditOffer({ ...editOffer, availableAmount: value, maxLimit });
  };

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
                      <Input
                        type="text"
                        value="USD"
                        className="bg-gray-800 border-gray-700 opacity-60"
                        data-testid="input-offer-currency"
                        readOnly
                        disabled
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Price per Account (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newOffer.pricePerUnit}
                      onChange={(e) => handlePriceChange(e.target.value)}
                      className="bg-gray-800 border-gray-700"
                      placeholder="e.g. 100"
                      data-testid="input-price"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Available Accounts</Label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      value={newOffer.availableAmount}
                      onChange={(e) => handleAvailableChange(e.target.value)}
                      className="bg-gray-800 border-gray-700"
                      placeholder="Number of accounts for sale"
                      data-testid="input-available"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Min Limit (USD)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={newOffer.minLimit}
                        onChange={(e) => handleMinLimitChange(e.target.value)}
                        className="bg-gray-800 border-gray-700"
                        data-testid="input-min-limit"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Limit (USD)</Label>
                      <Input
                        type="number"
                        value={newOffer.maxLimit}
                        className="bg-gray-800 border-gray-700 opacity-60"
                        data-testid="input-max-limit"
                        readOnly
                        disabled
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Account Type</Label>
                    <Input
                      type="text"
                      value={newOffer.accountType}
                      onChange={(e) => setNewOffer({ ...newOffer, accountType: e.target.value })}
                      className="bg-gray-800 border-gray-700"
                      placeholder="e.g. Binance, OKX, MEXC, Bybit, Custom..."
                      data-testid="input-account-type"
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
                              onClick={() => handleEditClick(offer)}
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
                        <Badge variant="outline" className="text-primary border-primary">
                          {offer.paymentMethods[0]?.replace(" UID", "").replace(" Address", "") || "Unknown"} Account
                        </Badge>
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

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="bg-gray-900 border-gray-800 max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white">Edit Offer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Price per Account (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editOffer.pricePerUnit}
                  onChange={(e) => handleEditPriceChange(e.target.value)}
                  className="bg-gray-800 border-gray-700"
                  data-testid="edit-input-price"
                />
              </div>
              <div className="space-y-2">
                <Label>Available Accounts</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={editOffer.availableAmount}
                  onChange={(e) => handleEditAvailableChange(e.target.value)}
                  className="bg-gray-800 border-gray-700"
                  data-testid="edit-input-available"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Min Limit (USD)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editOffer.minLimit}
                    onChange={(e) => setEditOffer({ ...editOffer, minLimit: e.target.value })}
                    className="bg-gray-800 border-gray-700"
                    data-testid="edit-input-min-limit"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Limit (USD)</Label>
                  <Input
                    type="number"
                    value={editOffer.maxLimit}
                    className="bg-gray-800 border-gray-700 opacity-60"
                    data-testid="edit-input-max-limit"
                    readOnly
                    disabled
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Terms (Optional)</Label>
                <Textarea
                  value={editOffer.terms}
                  onChange={(e) => setEditOffer({ ...editOffer, terms: e.target.value })}
                  className="bg-gray-800 border-gray-700"
                  placeholder="Trade terms and conditions..."
                  data-testid="edit-input-terms"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editOffer.isActive}
                  onChange={(e) => setEditOffer({ ...editOffer, isActive: e.target.checked })}
                  className="rounded"
                  data-testid="edit-checkbox-active"
                />
                <Label>Active (visible in marketplace)</Label>
              </div>
              <Button
                className="w-full bg-purple-600 hover:bg-purple-700"
                onClick={() => editingOffer && updateOfferMutation.mutate({ offerId: editingOffer.id, updates: editOffer })}
                disabled={updateOfferMutation.isPending}
                data-testid="button-update-offer"
              >
                {updateOfferMutation.isPending ? "Updating..." : "Update Offer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
