import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth, getUser, isAuthenticated } from "@/lib/auth";
import { 
  Shield, 
  Lock, 
  Plus, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  DollarSign,
  User,
  Loader2,
  X
} from "lucide-react";

interface LoaderAd {
  id: string;
  loaderId: string;
  loaderUsername?: string;
  assetType: string;
  dealAmount: string;
  loadingTerms: string | null;
  upfrontPercentage: number | null;
  paymentMethods: string[];
  frozenCommitment: string;
  isActive: boolean;
  createdAt: string;
}

interface LoaderOrder {
  id: string;
  adId: string;
  loaderId: string;
  loaderUsername?: string;
  receiverId: string;
  receiverUsername?: string;
  dealAmount: string;
  status: string;
  liabilityType: string | null;
  role: string;
  createdAt: string;
}

interface Wallet {
  id: string;
  availableBalance: string;
  escrowBalance: string;
}

const PAYMENT_METHODS = [
  "PayPal",
  "Bank Transfer",
  "Cash",
  "Crypto",
  "Wise",
  "Zelle",
];

export default function LoadersZone() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("active");
  
  const [assetType, setAssetType] = useState("USD");
  const [dealAmount, setDealAmount] = useState("");
  const [loadingTerms, setLoadingTerms] = useState("");
  const [upfrontPercentage, setUpfrontPercentage] = useState("0");
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);

  const { data: wallet } = useQuery<Wallet>({
    queryKey: ["wallet"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/wallet");
      return res.json();
    },
    enabled: isAuthenticated(),
  });

  const { data: activeAds, isLoading: adsLoading } = useQuery<LoaderAd[]>({
    queryKey: ["loaderAds"],
    queryFn: async () => {
      const res = await fetch("/api/loaders/ads");
      return res.json();
    },
    enabled: activeTab === "active",
  });

  const { data: myAds } = useQuery<LoaderAd[]>({
    queryKey: ["myLoaderAds"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/loaders/my-ads");
      return res.json();
    },
    enabled: isAuthenticated() && activeTab === "post",
  });

  const { data: myOrders, isLoading: ordersLoading } = useQuery<LoaderOrder[]>({
    queryKey: ["myLoaderOrders"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/loaders/my-orders");
      return res.json();
    },
    enabled: isAuthenticated() && activeTab === "orders",
  });

  const postAdMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth("/api/loaders/ads", {
        method: "POST",
        body: JSON.stringify({
          assetType,
          dealAmount: parseFloat(dealAmount),
          loadingTerms,
          upfrontPercentage: parseInt(upfrontPercentage),
          paymentMethods: selectedPaymentMethods,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Loading ad posted successfully!" });
      queryClient.invalidateQueries({ queryKey: ["loaderAds"] });
      queryClient.invalidateQueries({ queryKey: ["myLoaderAds"] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      setAssetType("USD");
      setDealAmount("");
      setLoadingTerms("");
      setUpfrontPercentage("0");
      setSelectedPaymentMethods([]);
      setActiveTab("active");
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const acceptDealMutation = useMutation({
    mutationFn: async (adId: string) => {
      const res = await fetchWithAuth(`/api/loaders/ads/${adId}/accept`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Deal Accepted", description: "Redirecting to order..." });
      queryClient.invalidateQueries({ queryKey: ["loaderAds"] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      setLocation(`/loader-order/${data.id}`);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const cancelAdMutation = useMutation({
    mutationFn: async (adId: string) => {
      const res = await fetchWithAuth(`/api/loaders/ads/${adId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Ad cancelled and funds refunded" });
      queryClient.invalidateQueries({ queryKey: ["myLoaderAds"] });
      queryClient.invalidateQueries({ queryKey: ["loaderAds"] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const commitment = parseFloat(dealAmount || "0") * 0.1;
  const availableBalance = parseFloat(wallet?.availableBalance || "0");
  const canPost = dealAmount && parseFloat(dealAmount) > 0 && selectedPaymentMethods.length > 0 && availableBalance >= commitment;

  const togglePaymentMethod = (method: string) => {
    if (selectedPaymentMethods.includes(method)) {
      setSelectedPaymentMethods(prev => prev.filter(m => m !== method));
    } else {
      setSelectedPaymentMethods(prev => [...prev, method]);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      created: { label: "Created", variant: "secondary" },
      awaiting_liability_confirmation: { label: "Awaiting Terms", variant: "outline" },
      funds_sent_by_loader: { label: "Funds Sent", variant: "default" },
      asset_frozen_waiting: { label: "Asset Frozen", variant: "destructive" },
      completed: { label: "Completed", variant: "default" },
      closed_no_payment: { label: "Closed", variant: "secondary" },
      cancelled: { label: "Cancelled", variant: "secondary" },
    };
    const s = statusMap[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={s.variant} data-testid={`status-badge-${status}`}>{s.label}</Badge>;
  };

  if (!isAuthenticated()) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <Lock className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground text-lg text-center">Please sign in to access Loaders Zone</p>
        <Button className="mt-4" onClick={() => setLocation("/auth")} data-testid="button-login">
          Sign In
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2" data-testid="text-loaders-title">
          <Shield className="h-6 w-6 text-primary" />
          Loaders Zone
        </h1>
        <p className="text-muted-foreground text-sm">High-trust loading with escrow protection</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="active" data-testid="tab-active-ads">Active Ads</TabsTrigger>
          <TabsTrigger value="post" data-testid="tab-post-ad">Post Ad</TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-my-orders">My Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {adsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : activeAds && activeAds.length > 0 ? (
            activeAds.map((ad) => (
              <Card key={ad.id} className="overflow-hidden" data-testid={`card-ad-${ad.id}`}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                        {(ad.loaderUsername || "L")[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-foreground" data-testid={`text-loader-${ad.id}`}>
                          {ad.loaderUsername || "Loader"}
                        </p>
                        <p className="text-xs text-muted-foreground">Trust Score: N/A</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="flex items-center gap-1 text-green-600 border-green-600">
                      <Lock className="h-3 w-3" />
                      10% Locked
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Asset Type</p>
                      <p className="font-semibold text-foreground">{ad.assetType}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Deal Amount</p>
                      <p className="font-semibold text-foreground">${parseFloat(ad.dealAmount).toLocaleString()}</p>
                    </div>
                  </div>

                  {ad.loadingTerms && (
                    <div className="mb-3">
                      <p className="text-xs text-muted-foreground">Loading Terms</p>
                      <p className="text-sm text-foreground">{ad.loadingTerms}</p>
                    </div>
                  )}

                  {ad.upfrontPercentage && ad.upfrontPercentage > 0 && (
                    <div className="mb-3 p-2 bg-amber-500/10 rounded-lg">
                      <p className="text-xs text-amber-600">
                        Requires {ad.upfrontPercentage}% upfront (${(parseFloat(ad.dealAmount) * ad.upfrontPercentage / 100).toFixed(2)})
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1 mb-4">
                    {ad.paymentMethods.map((method, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">{method}</Badge>
                    ))}
                  </div>

                  <Button 
                    className="w-full" 
                    onClick={() => acceptDealMutation.mutate(ad.id)}
                    disabled={acceptDealMutation.isPending || ad.loaderId === getUser()?.id}
                    data-testid={`button-accept-${ad.id}`}
                  >
                    {acceptDealMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Accept Deal
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <DollarSign className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No active loading ads</p>
              <Button variant="outline" className="mt-4" onClick={() => setActiveTab("post")} data-testid="button-post-first">
                Post the first ad
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="post">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Post Loading Ad
              </CardTitle>
              <CardDescription>Create a new loading offer with escrow protection</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="assetType">Asset Type</Label>
                <Input 
                  id="assetType" 
                  value={assetType} 
                  onChange={(e) => setAssetType(e.target.value)}
                  placeholder="e.g. USD, EUR, BTC"
                  data-testid="input-asset-type"
                />
              </div>

              <div>
                <Label htmlFor="dealAmount">Deal Amount</Label>
                <Input 
                  id="dealAmount" 
                  type="number" 
                  value={dealAmount} 
                  onChange={(e) => setDealAmount(e.target.value)}
                  placeholder="Enter amount"
                  data-testid="input-deal-amount"
                />
                {dealAmount && parseFloat(dealAmount) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    10% commitment: ${commitment.toFixed(2)}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="loadingTerms">Loading Rate / Terms (max 200 chars)</Label>
                <Textarea 
                  id="loadingTerms" 
                  value={loadingTerms} 
                  onChange={(e) => setLoadingTerms(e.target.value.slice(0, 200))}
                  placeholder="Describe your loading terms..."
                  maxLength={200}
                  data-testid="input-loading-terms"
                />
                <p className="text-xs text-muted-foreground mt-1">{loadingTerms.length}/200</p>
              </div>

              <div>
                <Label htmlFor="upfront">Receiver Upfront Requirement (%)</Label>
                <Input 
                  id="upfront" 
                  type="number" 
                  min="0" 
                  max="100"
                  value={upfrontPercentage} 
                  onChange={(e) => setUpfrontPercentage(e.target.value)}
                  placeholder="0 for no upfront requirement"
                  data-testid="input-upfront"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Set 0 if no upfront is required from receiver
                </p>
              </div>

              <div>
                <Label>Receiver Payment Methods</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {PAYMENT_METHODS.map((method) => (
                    <Button
                      key={method}
                      type="button"
                      variant={selectedPaymentMethods.includes(method) ? "default" : "outline"}
                      size="sm"
                      onClick={() => togglePaymentMethod(method)}
                      data-testid={`button-payment-${method.toLowerCase().replace(" ", "-")}`}
                    >
                      {method}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Liability Rule:</strong> Receiver will choose liability terms when accepting the order.
                </p>
              </div>

              <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-700">10% Commitment Notice</p>
                    <p className="text-xs text-amber-600">
                      10% of this deal amount will be frozen from your balance when this ad is published. 
                      It will be refunded after the deal is completed or cancelled, and platform fees apply.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-foreground">
                  <strong>Your Balance:</strong> ${availableBalance.toFixed(2)}
                </p>
                {dealAmount && availableBalance < commitment && (
                  <p className="text-xs text-destructive mt-1">
                    Insufficient balance. You need ${commitment.toFixed(2)} for 10% commitment.
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <Button 
                  className="flex-1" 
                  onClick={() => postAdMutation.mutate()}
                  disabled={!canPost || postAdMutation.isPending}
                  data-testid="button-post-ad"
                >
                  {postAdMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Post Ad
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setActiveTab("active")}
                  data-testid="button-cancel-post"
                >
                  Cancel
                </Button>
              </div>

              {myAds && myAds.filter(a => a.isActive).length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-3">Your Active Ads</h3>
                  {myAds.filter(a => a.isActive).map((ad) => (
                    <Card key={ad.id} className="mb-2">
                      <CardContent className="p-3 flex justify-between items-center">
                        <div>
                          <p className="font-medium">{ad.assetType} - ${parseFloat(ad.dealAmount).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Commitment: ${parseFloat(ad.frozenCommitment).toFixed(2)}</p>
                        </div>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => cancelAdMutation.mutate(ad.id)}
                          disabled={cancelAdMutation.isPending}
                          data-testid={`button-cancel-ad-${ad.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          {ordersLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : myOrders && myOrders.length > 0 ? (
            myOrders.map((order) => (
              <Card 
                key={order.id} 
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setLocation(`/loader-order/${order.id}`)}
                data-testid={`card-order-${order.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-foreground">
                        {order.role === "loader" ? "Loading to" : "Receiving from"}{" "}
                        {order.role === "loader" ? order.receiverUsername : order.loaderUsername}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Deal: ${parseFloat(order.dealAmount).toLocaleString()}
                      </p>
                    </div>
                    {getStatusBadge(order.status)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(order.createdAt).toLocaleDateString()}
                    <Badge variant="outline" className="ml-auto">
                      {order.role === "loader" ? "Loader" : "Receiver"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <User className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No orders yet</p>
              <Button variant="outline" className="mt-4" onClick={() => setActiveTab("active")} data-testid="button-browse-ads">
                Browse Active Ads
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
