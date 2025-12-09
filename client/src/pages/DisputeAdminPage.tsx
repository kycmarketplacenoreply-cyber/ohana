import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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

interface DisputeDetails {
  dispute: Dispute;
  order: {
    id: string;
    buyerId: string;
    vendorId: string;
    fiatAmount: string;
    currency: string;
    status: string;
  };
  chatMessages: Array<{
    id: string;
    senderId: string;
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
    mutationFn: async ({ status, resolution }: { status: string; resolution: string }) => {
      const res = await fetchWithAuth(`/api/admin/disputes/${selectedDispute}/resolve`, {
        method: "POST",
        body: JSON.stringify({ status, resolution, adminNotes: resolution }),
      });
      if (!res.ok) throw new Error("Failed to resolve dispute");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["openDisputes"] });
      queryClient.invalidateQueries({ queryKey: ["disputeStats"] });
      queryClient.invalidateQueries({ queryKey: ["disputeDetails", selectedDispute] });
      setSelectedDispute(null);
      setResolution("");
      const action = variables.status === "resolved_refund" ? "refunded to buyer" : "released to seller";
      toast({ title: "Dispute Resolved", description: `Funds have been ${action}` });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to resolve dispute" });
    },
  });

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
              <CardTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-400" />
                Open Disputes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {disputesLoading ? (
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
                        disputeDetails.chatMessages.map((msg) => (
                          <div key={msg.id} className="text-sm">
                            <span className="text-gray-400">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                            <span className={`ml-2 ${msg.message.startsWith("[Dispute Admin]") ? "text-orange-400" : "text-white"}`}>
                              {msg.message}
                            </span>
                          </div>
                        ))
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
                    <div className="flex gap-3">
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        onClick={() => resolveDisputeMutation.mutate({ status: "resolved_release", resolution })}
                        disabled={!resolution.trim() || resolveDisputeMutation.isPending}
                        data-testid="button-release-to-seller"
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        Release to Seller
                      </Button>
                      <Button
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                        onClick={() => resolveDisputeMutation.mutate({ status: "resolved_refund", resolution })}
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
      </div>
    </Layout>
  );
}
