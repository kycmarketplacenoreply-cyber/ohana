import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth, getUser } from "@/lib/auth";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Shield,
  MessageCircle,
  Send,
  User,
  Ban,
  CheckCircle,
  XCircle,
  Clock,
  Gavel,
  Eye,
  DollarSign,
  BadgeCheck,
  Loader2,
} from "lucide-react";

interface DisputeStats {
  openCount: number;
  totalCount: number;
  resolvedCount: number;
  inReviewCount: number;
}

interface Dispute {
  id: string;
  orderId: string;
  openedBy: string;
  reason: string;
  status: string;
  createdAt: string;
}

interface ResolvedDispute extends Dispute {
  resolution: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolverName: string | null;
}

interface LoaderDispute {
  id: string;
  orderId: string;
  openedBy: string;
  reason: string;
  status: string;
  createdAt: string;
  order?: {
    id: string;
    loaderId: string;
    receiverId: string;
    dealAmount: string;
    status: string;
  };
  openerUsername?: string;
  loaderUsername?: string;
  receiverUsername?: string;
}

interface DisputeDetails {
  dispute: Dispute;
  order: {
    id: string;
    buyerId: string;
    vendorId: string;
    fiatAmount: string;
    escrowAmount: string;
    currency: string;
    status: string;
  };
  chatMessages: Array<{
    id: string;
    senderId: string;
    senderName?: string;
    senderRole?: string;
    message: string;
    createdAt: string;
  }>;
  buyer: { id: string; username: string; isFrozen: boolean; frozenReason: string | null } | null;
  seller: { id: string; username: string; isFrozen: boolean; frozenReason: string | null } | null;
  buyerWallet: { availableBalance: string; escrowBalance: string } | null;
  sellerWallet: { availableBalance: string; escrowBalance: string } | null;
}

export default function DisputeAdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = getUser();
  const [, setLocation] = useLocation();
  const [selectedDispute, setSelectedDispute] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [resolution, setResolution] = useState("");
  const [freezeReason, setFreezeReason] = useState("");
  const [freezeUserId, setFreezeUserId] = useState<string | null>(null);
  const [showFreezeDialog, setShowFreezeDialog] = useState(false);
  const [showResolvedDisputes, setShowResolvedDisputes] = useState(false);
  const [show2FADialog, setShow2FADialog] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [pendingResolveStatus, setPendingResolveStatus] = useState<string | null>(null);
  const [releaseAmount, setReleaseAmount] = useState("");
  const [disputeTab, setDisputeTab] = useState<"marketplace" | "loaders">("marketplace");
  const [selectedLoaderDispute, setSelectedLoaderDispute] = useState<string | null>(null);
  const [loaderResolution, setLoaderResolution] = useState("");

  if (user?.role !== "dispute_admin" && user?.role !== "admin") {
    setLocation("/");
    return null;
  }

  const { data: stats, isLoading: statsLoading } = useQuery<DisputeStats>({
    queryKey: ["disputeStats"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/disputes/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: disputes, isLoading: disputesLoading } = useQuery<Dispute[]>({
    queryKey: ["openDisputes"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/disputes");
      if (!res.ok) throw new Error("Failed to fetch disputes");
      return res.json();
    },
  });

  const { data: resolvedDisputes, isLoading: resolvedLoading } = useQuery<ResolvedDispute[]>({
    queryKey: ["resolvedDisputes"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/disputes/resolved");
      if (!res.ok) throw new Error("Failed to fetch resolved disputes");
      return res.json();
    },
    enabled: showResolvedDisputes,
  });

  const { data: disputeDetails, isLoading: detailsLoading } = useQuery<DisputeDetails>({
    queryKey: ["disputeDetails", selectedDispute],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/admin/disputes/${selectedDispute}/details`);
      if (!res.ok) throw new Error("Failed to fetch dispute details");
      return res.json();
    },
    enabled: !!selectedDispute,
    refetchInterval: selectedDispute ? 5000 : false,
  });

  const { data: loaderDisputes, isLoading: loaderDisputesLoading } = useQuery<LoaderDispute[]>({
    queryKey: ["loaderDisputes"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/loader-disputes");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: disputeTab === "loaders",
  });

  const resolveLoaderDisputeMutation = useMutation({
    mutationFn: async ({ disputeId, winner, resolution }: { disputeId: string; winner: string; resolution: string }) => {
      const res = await fetchWithAuth(`/api/admin/loader-disputes/${disputeId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ winner, resolution }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to resolve dispute");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loaderDisputes"] });
      setSelectedLoaderDispute(null);
      setLoaderResolution("");
      toast({ title: "Dispute Resolved", description: "Loader zone dispute has been resolved" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Failed to resolve dispute", description: error.message });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetchWithAuth(`/api/admin/disputes/${selectedDispute}/message`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["disputeDetails", selectedDispute] });
      setNewMessage("");
      toast({ title: "Message sent" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to send message" });
    },
  });

  const resolveDisputeMutation = useMutation({
    mutationFn: async ({ status, resolution, twoFactorToken, amount }: { status: string; resolution: string; twoFactorToken: string; amount?: string }) => {
      const res = await fetchWithAuth(`/api/admin/disputes/${selectedDispute}/resolve`, {
        method: "POST",
        body: JSON.stringify({ status, resolution, adminNotes: resolution, twoFactorToken, amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requires2FA) {
          throw { requires2FA: true, message: data.message };
        }
        if (data.requires2FASetup) {
          throw { requires2FASetup: true, message: data.message };
        }
        throw new Error(data.message || "Failed to resolve dispute");
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["openDisputes"] });
      queryClient.invalidateQueries({ queryKey: ["disputeStats"] });
      queryClient.invalidateQueries({ queryKey: ["resolvedDisputes"] });
      queryClient.invalidateQueries({ queryKey: ["disputeDetails", selectedDispute] });
      setSelectedDispute(null);
      setResolution("");
      setShow2FADialog(false);
      setTwoFactorToken("");
      setPendingResolveStatus(null);
      setReleaseAmount("");
      const action = variables.status === "resolved_refund" ? "refunded to buyer" : "released to seller";
      const amountInfo = data.releasedAmount ? ` ($${data.releasedAmount})` : "";
      toast({ title: "Dispute Resolved", description: `Funds have been ${action}${amountInfo}` });
    },
    onError: (error: any) => {
      if (error.requires2FA) {
        setShow2FADialog(true);
        return;
      }
      if (error.requires2FASetup) {
        toast({ variant: "destructive", title: "2FA Required", description: error.message });
        return;
      }
      toast({ variant: "destructive", title: "Failed to resolve dispute", description: error.message });
    },
  });

  const handleResolveClick = (status: string) => {
    setPendingResolveStatus(status);
    setShow2FADialog(true);
  };

  const handleConfirmResolve = () => {
    if (pendingResolveStatus && resolution.trim() && twoFactorToken.trim()) {
      resolveDisputeMutation.mutate({ 
        status: pendingResolveStatus, 
        resolution, 
        twoFactorToken,
        amount: releaseAmount || undefined
      });
    }
  };

  const freezeUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const res = await fetchWithAuth(`/api/admin/users/${userId}/freeze`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Failed to freeze user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["disputeDetails", selectedDispute] });
      setShowFreezeDialog(false);
      setFreezeReason("");
      setFreezeUserId(null);
      toast({ title: "User Frozen", description: "Account has been frozen for investigation" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to freeze user" });
    },
  });

  const unfreezeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetchWithAuth(`/api/admin/users/${userId}/unfreeze`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to unfreeze user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["disputeDetails", selectedDispute] });
      toast({ title: "User Unfrozen" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to unfreeze user" });
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      sendMessageMutation.mutate(newMessage);
    }
  };

  const openFreezeDialog = (userId: string) => {
    setFreezeUserId(userId);
    setShowFreezeDialog(true);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Gavel className="h-8 w-8 text-orange-500" />
          <h1 className="text-3xl font-bold text-white">Dispute Resolution Center</h1>
        </div>

        <Tabs value={disputeTab} onValueChange={(v) => setDisputeTab(v as "marketplace" | "loaders")} className="w-full">
          <TabsList className="bg-gray-800 border border-gray-700">
            <TabsTrigger value="marketplace" className="data-[state=active]:bg-orange-600" data-testid="tab-marketplace-disputes">
              Marketplace Disputes
            </TabsTrigger>
            <TabsTrigger value="loaders" className="data-[state=active]:bg-purple-600" data-testid="tab-loader-disputes">
              <Loader2 className="h-4 w-4 mr-1" />
              Loaders Zone ({loaderDisputes?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="loaders" className="mt-4">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Shield className="h-5 w-5 text-purple-400" />
                  Loaders Zone Disputes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loaderDisputesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 bg-gray-800" />)}
                  </div>
                ) : loaderDisputes && loaderDisputes.length > 0 ? (
                  <div className="space-y-4">
                    {loaderDisputes.map((dispute) => (
                      <div key={dispute.id} className="p-4 bg-gray-800 rounded-lg border border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white font-medium">Order #{dispute.orderId.slice(0, 8)}</span>
                          <Badge className="bg-orange-600">{dispute.status}</Badge>
                        </div>
                        <p className="text-gray-400 text-sm mb-2">{dispute.reason}</p>
                        <div className="text-sm text-gray-500 mb-3">
                          <p>Loader: {dispute.loaderUsername || "Unknown"}</p>
                          <p>Receiver: {dispute.receiverUsername || "Unknown"}</p>
                          <p>Amount: ${dispute.order?.dealAmount || "0"}</p>
                        </div>
                        {selectedLoaderDispute === dispute.id ? (
                          <div className="space-y-3 pt-3 border-t border-gray-700">
                            <Textarea
                              placeholder="Resolution notes..."
                              value={loaderResolution}
                              onChange={(e) => setLoaderResolution(e.target.value)}
                              className="bg-gray-900 border-gray-700"
                              data-testid="input-loader-resolution"
                            />
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => resolveLoaderDisputeMutation.mutate({ disputeId: dispute.id, winner: "loader", resolution: loaderResolution })}
                                disabled={!loaderResolution.trim() || resolveLoaderDisputeMutation.isPending}
                                data-testid="button-resolve-loader-wins"
                              >
                                Loader Wins
                              </Button>
                              <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700"
                                onClick={() => resolveLoaderDisputeMutation.mutate({ disputeId: dispute.id, winner: "receiver", resolution: loaderResolution })}
                                disabled={!loaderResolution.trim() || resolveLoaderDisputeMutation.isPending}
                                data-testid="button-resolve-receiver-wins"
                              >
                                Receiver Wins
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-gray-600"
                                onClick={() => resolveLoaderDisputeMutation.mutate({ disputeId: dispute.id, winner: "mutual", resolution: loaderResolution })}
                                disabled={!loaderResolution.trim() || resolveLoaderDisputeMutation.isPending}
                                data-testid="button-resolve-mutual"
                              >
                                Mutual Resolution
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setSelectedLoaderDispute(null); setLoaderResolution(""); }}
                                data-testid="button-cancel-resolve"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700"
                            onClick={() => setSelectedLoaderDispute(dispute.id)}
                            data-testid={`button-resolve-loader-dispute-${dispute.id}`}
                          >
                            <Gavel className="h-4 w-4 mr-1" />
                            Resolve Dispute
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
                    <p className="text-gray-400">No open loader disputes</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="marketplace" className="mt-4">
        {statsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 bg-gray-800" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-orange-900/30 border-orange-700">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-orange-400" />
                <div>
                  <p className="text-orange-300 text-sm">Open Cases</p>
                  <p className="text-2xl font-bold text-white">{stats?.openCount || 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-yellow-900/30 border-yellow-700">
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="h-8 w-8 text-yellow-400" />
                <div>
                  <p className="text-yellow-300 text-sm">In Review</p>
                  <p className="text-2xl font-bold text-white">{stats?.inReviewCount || 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-green-900/30 border-green-700">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-green-400" />
                <div>
                  <p className="text-green-300 text-sm">Resolved</p>
                  <p className="text-2xl font-bold text-white">{stats?.resolvedCount || 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-4 flex items-center gap-3">
                <Shield className="h-8 w-8 text-gray-400" />
                <div>
                  <p className="text-gray-400 text-sm">Total Cases</p>
                  <p className="text-2xl font-bold text-white">{stats?.totalCount || 0}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="bg-gray-900/50 border-gray-800 lg:col-span-1">
            <CardHeader>
              <div className="flex gap-2 mb-2">
                <Button
                  size="sm"
                  variant={!showResolvedDisputes ? "default" : "outline"}
                  className={!showResolvedDisputes ? "bg-orange-600 hover:bg-orange-700" : "border-gray-700"}
                  onClick={() => setShowResolvedDisputes(false)}
                  data-testid="button-show-open-disputes"
                >
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Open ({disputes?.length || 0})
                </Button>
                <Button
                  size="sm"
                  variant={showResolvedDisputes ? "default" : "outline"}
                  className={showResolvedDisputes ? "bg-green-600 hover:bg-green-700" : "border-gray-700"}
                  onClick={() => setShowResolvedDisputes(true)}
                  data-testid="button-show-resolved-disputes"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Resolved
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!showResolvedDisputes ? (
                disputesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 bg-gray-800" />
                    ))}
                  </div>
                ) : disputes && disputes.length > 0 ? (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {disputes.map((dispute) => (
                      <div
                        key={dispute.id}
                        className={`p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedDispute === dispute.id
                            ? "bg-orange-900/50 border border-orange-600"
                            : "bg-gray-800 hover:bg-gray-700"
                        }`}
                        onClick={() => setSelectedDispute(dispute.id)}
                        data-testid={`dispute-item-${dispute.id}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white font-medium text-sm">
                            Order #{dispute.orderId.slice(0, 8)}
                          </span>
                          <Badge className="bg-orange-600 text-xs">
                            {dispute.status === "open" ? "Open" : "In Review"}
                          </Badge>
                        </div>
                        <p className="text-gray-400 text-sm line-clamp-2">{dispute.reason}</p>
                        <p className="text-gray-500 text-xs mt-1">
                          {new Date(dispute.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
                    <p className="text-gray-400">No open disputes</p>
                  </div>
                )
              ) : (
                resolvedLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 bg-gray-800" />
                    ))}
                  </div>
                ) : resolvedDisputes && resolvedDisputes.length > 0 ? (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {resolvedDisputes.map((dispute) => (
                      <div
                        key={dispute.id}
                        className={`p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedDispute === dispute.id
                            ? "bg-green-900/50 border border-green-600"
                            : "bg-gray-800 hover:bg-gray-700"
                        }`}
                        onClick={() => setSelectedDispute(dispute.id)}
                        data-testid={`resolved-dispute-item-${dispute.id}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white font-medium text-sm">
                            Order #{dispute.orderId.slice(0, 8)}
                          </span>
                          <Badge className={dispute.status === "resolved_refund" ? "bg-blue-600 text-xs" : "bg-green-600 text-xs"}>
                            {dispute.status === "resolved_refund" ? "Refunded" : "Released"}
                          </Badge>
                        </div>
                        <p className="text-gray-400 text-sm line-clamp-2">{dispute.resolution || dispute.reason}</p>
                        <div className="flex justify-between items-center mt-1">
                          <p className="text-gray-500 text-xs">
                            {dispute.resolvedAt ? new Date(dispute.resolvedAt).toLocaleDateString() : ""}
                          </p>
                          {dispute.resolverName && (
                            <p className="text-green-400 text-xs flex items-center gap-1">
                              <Gavel className="h-3 w-3" />
                              {dispute.resolverName}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">No resolved disputes</p>
                  </div>
                )
              )}
            </CardContent>
          </Card>

          <Card className="bg-gray-900/50 border-gray-800 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Eye className="h-5 w-5 text-purple-400" />
                Dispute Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedDispute ? (
                <div className="text-center py-12">
                  <Gavel className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Select a dispute to view details</p>
                </div>
              ) : detailsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-32 bg-gray-800" />
                  <Skeleton className="h-64 bg-gray-800" />
                </div>
              ) : disputeDetails ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-gray-400 text-sm flex items-center gap-1">
                          <User className="h-4 w-4" /> Buyer
                        </p>
                        {disputeDetails.buyer?.isFrozen ? (
                          <Badge className="bg-red-600 text-xs">Frozen</Badge>
                        ) : null}
                      </div>
                      <p className="text-white font-bold">{disputeDetails.buyer?.username || "Unknown"}</p>
                      {disputeDetails.buyerWallet && (
                        <p className="text-gray-400 text-sm mt-1">
                          Balance: ${parseFloat(disputeDetails.buyerWallet.availableBalance).toFixed(2)} | 
                          Escrow: ${parseFloat(disputeDetails.buyerWallet.escrowBalance).toFixed(2)}
                        </p>
                      )}
                      <div className="flex gap-2 mt-2">
                        {disputeDetails.buyer && !disputeDetails.buyer.isFrozen && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => openFreezeDialog(disputeDetails.buyer!.id)}
                            data-testid="button-freeze-buyer"
                          >
                            <Ban className="h-3 w-3 mr-1" /> Freeze
                          </Button>
                        )}
                        {disputeDetails.buyer?.isFrozen && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => unfreezeUserMutation.mutate(disputeDetails.buyer!.id)}
                            data-testid="button-unfreeze-buyer"
                          >
                            Unfreeze
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="p-4 bg-gray-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-gray-400 text-sm flex items-center gap-1">
                          <User className="h-4 w-4" /> Seller
                        </p>
                        {disputeDetails.seller?.isFrozen ? (
                          <Badge className="bg-red-600 text-xs">Frozen</Badge>
                        ) : null}
                      </div>
                      <p className="text-white font-bold">{disputeDetails.seller?.username || "Unknown"}</p>
                      {disputeDetails.sellerWallet && (
                        <p className="text-gray-400 text-sm mt-1">
                          Balance: ${parseFloat(disputeDetails.sellerWallet.availableBalance).toFixed(2)} | 
                          Escrow: ${parseFloat(disputeDetails.sellerWallet.escrowBalance).toFixed(2)}
                        </p>
                      )}
                      <div className="flex gap-2 mt-2">
                        {disputeDetails.seller && !disputeDetails.seller.isFrozen && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => openFreezeDialog(disputeDetails.seller!.id)}
                            data-testid="button-freeze-seller"
                          >
                            <Ban className="h-3 w-3 mr-1" /> Freeze
                          </Button>
                        )}
                        {disputeDetails.seller?.isFrozen && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => unfreezeUserMutation.mutate(disputeDetails.seller!.id)}
                            data-testid="button-unfreeze-seller"
                          >
                            Unfreeze
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-orange-900/30 border border-orange-700 rounded-lg">
                    <p className="text-orange-300 text-sm font-medium mb-1">Dispute Reason</p>
                    <p className="text-white">{disputeDetails.dispute.reason}</p>
                    <p className="text-gray-400 text-sm mt-2">
                      Amount in dispute: <span className="text-white font-bold">${parseFloat(disputeDetails.order.fiatAmount).toFixed(2)}</span>
                    </p>
                  </div>

                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <p className="text-white font-medium mb-3 flex items-center gap-2">
                      <MessageCircle className="h-4 w-4" /> Order Chat History
                    </p>
                    <div className="h-48 overflow-y-auto space-y-2 mb-4 p-2 bg-gray-900 rounded">
                      {disputeDetails.chatMessages.length > 0 ? (
                        disputeDetails.chatMessages.map((msg) => {
                          const isAdmin = msg.senderRole === "admin" || msg.senderRole === "dispute_admin";
                          const isBuyer = msg.senderId === disputeDetails.order.buyerId;
                          const senderLabel = msg.senderName || (isBuyer ? disputeDetails.buyer?.username : disputeDetails.seller?.username) || "Unknown";
                          
                          return (
                            <div key={msg.id} className="text-sm p-2 bg-gray-800/50 rounded">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`font-medium ${isAdmin ? "text-orange-400" : isBuyer ? "text-blue-400" : "text-green-400"}`}>
                                  {senderLabel}
                                </span>
                                {isAdmin && (
                                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-600/20 rounded text-xs text-orange-300">
                                    <BadgeCheck className="h-3 w-3" />
                                    Verified Admin
                                  </span>
                                )}
                                {!isAdmin && (
                                  <span className={`px-1.5 py-0.5 rounded text-xs ${isBuyer ? "bg-blue-600/20 text-blue-300" : "bg-green-600/20 text-green-300"}`}>
                                    {isBuyer ? "Buyer" : "Seller"}
                                  </span>
                                )}
                                <span className="text-gray-500 text-xs ml-auto">
                                  {new Date(msg.createdAt).toLocaleTimeString()}
                                </span>
                              </div>
                              <p className="text-white">{msg.message}</p>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-gray-500 text-center py-4">No messages</p>
                      )}
                    </div>
                    <form onSubmit={handleSendMessage} className="flex gap-2">
                      <Input
                        placeholder="Send a message to both parties..."
                        className="flex-1 bg-gray-800 border-gray-700 text-white"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        data-testid="input-admin-message"
                      />
                      <Button
                        type="submit"
                        className="bg-orange-600 hover:bg-orange-700"
                        disabled={!newMessage.trim() || sendMessageMutation.isPending}
                        data-testid="button-send-admin-message"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>

                  <div className="space-y-3">
                    <Textarea
                      placeholder="Resolution notes (required)..."
                      className="bg-gray-800 border-gray-700 text-white"
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      data-testid="input-resolution"
                    />
                    
                    <div className="p-3 bg-gray-800 rounded-lg space-y-2">
                      <label className="text-gray-300 text-sm">
                        Release Amount (optional - leave empty for full amount)
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">$</span>
                        <Input
                          type="number"
                          placeholder={`Max: ${parseFloat(disputeDetails.order.escrowAmount || disputeDetails.order.fiatAmount).toFixed(2)}`}
                          className="bg-gray-700 border-gray-600 text-white"
                          value={releaseAmount}
                          onChange={(e) => {
                            const max = parseFloat(disputeDetails.order.escrowAmount || disputeDetails.order.fiatAmount);
                            const val = parseFloat(e.target.value);
                            if (!e.target.value) {
                              setReleaseAmount("");
                            } else if (val > max) {
                              setReleaseAmount(max.toString());
                            } else if (val < 0) {
                              setReleaseAmount("0");
                            } else {
                              setReleaseAmount(e.target.value);
                            }
                          }}
                          data-testid="input-release-amount"
                        />
                        <span className="text-gray-400 text-sm">
                          / {parseFloat(disputeDetails.order.escrowAmount || disputeDetails.order.fiatAmount).toFixed(2)} USDT
                        </span>
                      </div>
                      <p className="text-gray-500 text-xs">
                        Partial release: Specify an amount to release a portion of funds. Full amount releases all escrowed funds.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        onClick={() => handleResolveClick("resolved_release")}
                        disabled={!resolution.trim() || resolveDisputeMutation.isPending}
                        data-testid="button-release-to-seller"
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        Release to Seller
                      </Button>
                      <Button
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                        onClick={() => handleResolveClick("resolved_refund")}
                        disabled={!resolution.trim() || resolveDisputeMutation.isPending}
                        data-testid="button-refund-buyer"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Refund to Buyer
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
          </TabsContent>
        </Tabs>

        <Dialog open={showFreezeDialog} onOpenChange={setShowFreezeDialog}>
          <DialogContent className="bg-gray-900 border-gray-800">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Ban className="h-5 w-5 text-red-400" />
                Freeze Account
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                Freezing this account will prevent the user from making any transactions. This action can be reversed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Textarea
                placeholder="Reason for freezing account (e.g., Suspected scam activity, Under investigation...)"
                className="bg-gray-800 border-gray-700 text-white"
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
                data-testid="input-freeze-reason"
              />
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-gray-700"
                  onClick={() => {
                    setShowFreezeDialog(false);
                    setFreezeReason("");
                    setFreezeUserId(null);
                  }}
                  data-testid="button-cancel-freeze"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  onClick={() => {
                    if (freezeUserId && freezeReason.trim()) {
                      freezeUserMutation.mutate({ userId: freezeUserId, reason: freezeReason });
                    }
                  }}
                  disabled={!freezeReason.trim() || freezeUserMutation.isPending}
                  data-testid="button-confirm-freeze"
                >
                  {freezeUserMutation.isPending ? "Freezing..." : "Freeze Account"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={show2FADialog} onOpenChange={(open) => {
          setShow2FADialog(open);
          if (!open) {
            setTwoFactorToken("");
            setPendingResolveStatus(null);
          }
        }}>
          <DialogContent className="bg-gray-900 border-gray-800">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-400" />
                Confirm with 2FA
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                Enter your authenticator code to confirm this dispute resolution.
                {pendingResolveStatus === "resolved_release" 
                  ? " Funds will be released to the seller."
                  : " Funds will be refunded to the buyer."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Input
                placeholder="Enter 6-digit code"
                className="bg-gray-800 border-gray-700 text-white text-center text-lg tracking-widest"
                value={twoFactorToken}
                onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                data-testid="input-2fa-resolve"
              />
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-gray-700"
                  onClick={() => {
                    setShow2FADialog(false);
                    setTwoFactorToken("");
                    setPendingResolveStatus(null);
                  }}
                  data-testid="button-cancel-2fa"
                >
                  Cancel
                </Button>
                <Button
                  className={`flex-1 ${pendingResolveStatus === "resolved_release" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}`}
                  onClick={handleConfirmResolve}
                  disabled={twoFactorToken.length !== 6 || resolveDisputeMutation.isPending}
                  data-testid="button-confirm-2fa-resolve"
                >
                  {resolveDisputeMutation.isPending ? "Processing..." : "Confirm Resolution"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
