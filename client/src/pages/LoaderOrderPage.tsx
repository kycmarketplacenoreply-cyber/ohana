import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth, getUser, isAuthenticated } from "@/lib/auth";
import Layout from "@/components/Layout";
import {
  ArrowLeft,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Shield,
  XCircle,
  Loader2,
  MessageCircle,
  Flag,
  AlertCircle,
  KeyRound,
  ThumbsUp,
  ThumbsDown,
  Star,
} from "lucide-react";

interface LoaderOrder {
  id: string;
  adId: string;
  loaderId: string;
  loaderUsername?: string;
  receiverId: string;
  receiverUsername?: string;
  dealAmount: string;
  loaderFrozenAmount: string;
  loaderFeeReserve?: string;
  receiverFrozenAmount: string;
  receiverFeeReserve?: string;
  status: string;
  countdownTime?: string;
  countdownExpiresAt?: string;
  countdownStopped?: boolean;
  loaderSentPaymentDetails?: boolean;
  receiverSentPaymentDetails?: boolean;
  loaderMarkedPaymentSent?: boolean;
  penaltyAmount?: string;
  penaltyPaidBy?: string;
  liabilityType?: string;
  receiverLiabilityConfirmed?: boolean;
  loaderLiabilityConfirmed?: boolean;
  liabilityLockedAt?: string;
  liabilityDeadline?: string;
  createdAt: string;
  ad?: {
    assetType: string;
    paymentMethods: string[];
    loadingTerms: string | null;
  };
}

interface Message {
  id: string;
  orderId: string;
  senderId: string | null;
  senderUsername?: string;
  isSystem: boolean;
  isAdminMessage?: boolean;
  content: string;
  createdAt: string;
}

interface Dispute {
  id: string;
  orderId: string;
  openedBy: string;
  reason: string;
  status: string;
  resolution?: string;
  createdAt: string;
}

interface FeedbackData {
  feedback: Array<{
    id: string;
    orderId: string;
    giverId: string;
    receiverId: string;
    feedbackType: "positive" | "negative";
    comment: string | null;
    giverUsername?: string;
    createdAt: string;
  }>;
  hasLeftFeedback: boolean;
  userFeedback: any | null;
}

export default function LoaderOrderPage() {
  const { t } = useTranslation();
  const [, params] = useRoute("/loader-order/:id");
  const [, setLocation] = useLocation();
  const orderId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentUser = getUser();

  const [newMessage, setNewMessage] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [selectedLiability, setSelectedLiability] = useState<string>("");
  const [liabilityConfirmChecked, setLiabilityConfirmChecked] = useState(false);
  const [show2FADialog, setShow2FADialog] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [showPostOrderDispute, setShowPostOrderDispute] = useState(false);
  const [postOrderDisputeReason, setPostOrderDisputeReason] = useState("");
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"positive" | "negative" | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");

  const { data: order, isLoading } = useQuery<LoaderOrder>({
    queryKey: ["loaderOrder", orderId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}`);
      if (!res.ok) throw new Error("Order not found");
      return res.json();
    },
    enabled: !!orderId && isAuthenticated(),
    refetchInterval: 5000,
  });

  const { data: messages, refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: ["loaderOrderMessages", orderId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/messages`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) {
        return [];
      }
      return data;
    },
    enabled: !!orderId && isAuthenticated(),
    refetchInterval: 5000,
  });

  const { data: dispute } = useQuery<Dispute>({
    queryKey: ["loaderDispute", orderId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/dispute`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!orderId && order?.status === "disputed",
  });

  const { data: userProfile } = useQuery<{ twoFactorEnabled: boolean }>({
    queryKey: ["userProfile"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/auth/me");
      return res.json();
    },
    enabled: isAuthenticated(),
  });

  const { data: feedbackData, refetch: refetchFeedback } = useQuery<FeedbackData>({
    queryKey: ["loaderOrderFeedback", orderId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/feedback`);
      if (!res.ok) return { feedback: [], hasLeftFeedback: false, userFeedback: null };
      return res.json();
    },
    enabled: !!orderId && order?.status === "completed",
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/feedback`, {
        method: "POST",
        body: JSON.stringify({ feedbackType, comment: feedbackComment }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Feedback Submitted", description: "Thank you for your feedback!" });
      setShowFeedbackForm(false);
      setFeedbackType(null);
      setFeedbackComment("");
      refetchFeedback();
      queryClient.invalidateQueries({ queryKey: ["loaderOrderFeedback", orderId] });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const terminalStatuses = ["completed", "closed_no_payment", "cancelled_auto", "cancelled_loader", "cancelled_receiver", "disputed", "resolved_loader_wins", "resolved_receiver_wins", "resolved_mutual"];
  const disputeableStatuses = ["completed", "cancelled_auto", "cancelled_loader", "cancelled_receiver"];

  useEffect(() => {
    // Stop countdown if order is cancelled or in terminal state
    if (!order?.countdownExpiresAt || order.countdownStopped || terminalStatuses.includes(order?.status || "")) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const expiresAt = new Date(order.countdownExpiresAt!).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [order?.countdownExpiresAt, order?.countdownStopped, order?.status]);

  const sendPaymentDetailsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/send-payment-details`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Payment details sent. Countdown stopped." });
      queryClient.invalidateQueries({ queryKey: ["loaderOrder", orderId] });
      refetchMessages();
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const markPaymentSentMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/mark-payment-sent`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Payment marked as sent." });
      queryClient.invalidateQueries({ queryKey: ["loaderOrder", orderId] });
      refetchMessages();
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (code?: string) => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/complete`, {
        method: "POST",
        body: JSON.stringify({ twoFactorCode: code }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Order completed! Fees deducted and funds released." });
      queryClient.invalidateQueries({ queryKey: ["loaderOrder", orderId] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      refetchMessages();
      setShow2FADialog(false);
      setTwoFactorCode("");
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const postOrderDisputeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/dispute`, {
        method: "POST",
        body: JSON.stringify({ reason: postOrderDisputeReason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Dispute Opened", description: "Admin will review and resolve your dispute." });
      queryClient.invalidateQueries({ queryKey: ["loaderOrder", orderId] });
      refetchMessages();
      setShowPostOrderDispute(false);
      setPostOrderDisputeReason("");
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const handleCompleteClick = () => {
    if (userProfile?.twoFactorEnabled) {
      setShow2FADialog(true);
    } else {
      completeMutation.mutate(undefined);
    }
  };

  const handle2FASubmit = () => {
    if (!twoFactorCode) {
      toast({ variant: "destructive", title: "Error", description: "Please enter your 2FA code" });
      return;
    }
    completeMutation.mutate(twoFactorCode);
  };

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Order Cancelled", description: "5% penalty has been deducted." });
      queryClient.invalidateQueries({ queryKey: ["loaderOrder", orderId] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      refetchMessages();
      setShowCancelConfirm(false);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const openDisputeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/dispute`, {
        method: "POST",
        body: JSON.stringify({ reason: disputeReason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Dispute Opened", description: "Admin will review and resolve." });
      queryClient.invalidateQueries({ queryKey: ["loaderOrder", orderId] });
      refetchMessages();
      setShowDisputeForm(false);
      setDisputeReason("");
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: newMessage }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      setNewMessage("");
      refetchMessages();
    },
  });

  const selectLiabilityMutation = useMutation({
    mutationFn: async (liabilityType: string) => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/select-liability`, {
        method: "POST",
        body: JSON.stringify({ liabilityType }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Liability Terms Selected", description: "Both parties must now confirm the agreement." });
      queryClient.invalidateQueries({ queryKey: ["loaderOrder", orderId] });
      refetchMessages();
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const confirmLiabilityMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/confirm-liability`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.locked) {
        toast({ title: "Agreement Locked!", description: "Order proceeding to payment phase." });
      } else {
        toast({ title: "Confirmed", description: "Waiting for other party to confirm." });
      }
      queryClient.invalidateQueries({ queryKey: ["loaderOrder", orderId] });
      refetchMessages();
      setLiabilityConfirmChecked(false);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const isReceiver = order?.receiverId === currentUser?.id;
  const isLoader = order?.loaderId === currentUser?.id;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      awaiting_liability_confirmation: { label: "Select Liability Terms", variant: "outline" },
      awaiting_payment_details: { label: "Awaiting Details", variant: "outline" },
      payment_details_sent: { label: "Details Sent", variant: "default" },
      payment_sent: { label: "Payment Sent", variant: "default" },
      asset_frozen_waiting: { label: "Asset Frozen - Waiting", variant: "secondary" },
      completed: { label: "Completed", variant: "default" },
      closed_no_payment: { label: "Closed - No Payment", variant: "secondary" },
      cancelled_auto: { label: "Auto-Cancelled", variant: "secondary" },
      cancelled_loader: { label: "Cancelled by Loader", variant: "destructive" },
      cancelled_receiver: { label: "Cancelled by Receiver", variant: "destructive" },
      disputed: { label: "Disputed", variant: "destructive" },
      resolved_loader_wins: { label: "Resolved - Loader Wins", variant: "default" },
      resolved_receiver_wins: { label: "Resolved - Receiver Wins", variant: "default" },
      resolved_mutual: { label: "Resolved - Mutual", variant: "secondary" },
    };
    const s = statusMap[status] || { label: status.replace(/_/g, " "), variant: "secondary" as const };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  const dealAmount = parseFloat(order?.dealAmount || "0");
  const penaltyAmount = dealAmount * 0.05;

  const canCancel = order && !terminalStatuses.includes(order.status) && !(isReceiver && order.loaderMarkedPaymentSent);
  const canDispute = order && ["payment_details_sent", "payment_sent"].includes(order.status);
  const isTerminalState = order && terminalStatuses.includes(order.status);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Order not found</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation("/")} data-testid="button-go-home">
            Go Home
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto pb-24">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-order-title">
              <Shield className="h-5 w-5 text-primary" />
              Loader Order
            </h1>
            <p className="text-sm text-muted-foreground">Order #{order.id.slice(0, 8)}</p>
          </div>
          {getStatusBadge(order.status)}
        </div>

        {timeRemaining !== null && timeRemaining > 0 && !order.countdownStopped && (
          <Card className={`mb-4 ${timeRemaining < 60 ? "border-destructive/50 bg-destructive/5" : "border-amber-500/50 bg-amber-500/5"}`}>
            <CardContent className="py-4 text-center">
              <Clock className={`h-8 w-8 mx-auto mb-2 ${timeRemaining < 60 ? "text-destructive" : "text-amber-600"}`} />
              <p className={`text-2xl font-bold ${timeRemaining < 60 ? "text-destructive" : "text-amber-600"}`}>
                {formatTime(timeRemaining)}
              </p>
              <p className="text-sm text-muted-foreground">
                Time remaining to send payment details
              </p>
            </CardContent>
          </Card>
        )}

        {order.countdownStopped && order.status === "payment_details_sent" && (
          <Card className="mb-4 border-green-500/50 bg-green-500/5">
            <CardContent className="py-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="font-semibold text-green-600">Payment Details Exchanged</p>
              <p className="text-sm text-muted-foreground">Countdown stopped. Proceed with the transaction.</p>
            </CardContent>
          </Card>
        )}

        {order.status === "awaiting_liability_confirmation" && (
          <Card className="mb-4 border-amber-500/50 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-600" />
                Liability Terms Selection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Receiver must select liability terms before funds are sent.
                </p>
              </div>

              {isReceiver && !order.liabilityLockedAt && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                      <input
                        type="radio"
                        name="liability"
                        value="full_payment"
                        checked={selectedLiability === "full_payment" || order.liabilityType === "full_payment"}
                        onChange={(e) => setSelectedLiability(e.target.value)}
                        className="mt-1"
                        disabled={!!order.liabilityType}
                        data-testid="radio-full-payment"
                      />
                      <div>
                        <p className="font-medium">Option 1 — Full Payment</p>
                        <p className="text-sm text-muted-foreground">
                          I will pay the full deal amount even if the assets are frozen, delayed, or unusable.
                        </p>
                      </div>
                    </label>

                    <div className="border rounded-lg p-3">
                      <p className="font-medium mb-2">Option 2 — Partial Payment</p>
                      <p className="text-sm text-muted-foreground mb-3">
                        If the assets are frozen or unusable, I agree to pay a percentage of the deal amount.
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {["partial_10", "partial_25", "partial_50"].map((val) => (
                          <label key={val} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted/50">
                            <input
                              type="radio"
                              name="liability"
                              value={val}
                              checked={selectedLiability === val || order.liabilityType === val}
                              onChange={(e) => setSelectedLiability(e.target.value)}
                              disabled={!!order.liabilityType}
                              data-testid={`radio-${val}`}
                            />
                            <span>{val.split("_")[1]}%</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="border rounded-lg p-3">
                      <p className="font-medium mb-2">Option 3 — Time-Bound Temporary Freeze</p>
                      <p className="text-sm text-muted-foreground mb-3">
                        If assets are temporarily frozen, I agree to wait. If assets are usable before the deadline, I will pay in full. If still frozen at deadline, the deal closes with no payment.
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {[
                          { val: "time_bound_24h", label: "24 hours" },
                          { val: "time_bound_48h", label: "48 hours" },
                          { val: "time_bound_72h", label: "72 hours" },
                          { val: "time_bound_1week", label: "1 week" },
                          { val: "time_bound_1month", label: "1 month" },
                        ].map(({ val, label }) => (
                          <label key={val} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted/50">
                            <input
                              type="radio"
                              name="liability"
                              value={val}
                              checked={selectedLiability === val || order.liabilityType === val}
                              onChange={(e) => setSelectedLiability(e.target.value)}
                              disabled={!!order.liabilityType}
                              data-testid={`radio-${val}`}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {!order.liabilityType && selectedLiability && (
                    <Button
                      className="w-full"
                      onClick={() => selectLiabilityMutation.mutate(selectedLiability)}
                      disabled={selectLiabilityMutation.isPending}
                      data-testid="button-select-liability"
                    >
                      {selectLiabilityMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Confirm Liability Selection
                    </Button>
                  )}
                </div>
              )}

              {order.liabilityType && (
                <div className="space-y-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium">Selected Liability Terms:</p>
                    <p className="text-sm text-muted-foreground">
                      {order.liabilityType === "full_payment" && "Full Payment - Pay full amount even if assets are frozen"}
                      {order.liabilityType?.startsWith("partial_") && `Partial Payment - ${order.liabilityType.split("_")[1]}% if assets are frozen`}
                      {order.liabilityType?.startsWith("time_bound_") && (() => {
                        const timeLabel = 
                          order.liabilityType === "time_bound_24h" ? "24 hours" :
                          order.liabilityType === "time_bound_48h" ? "48 hours" :
                          order.liabilityType === "time_bound_72h" ? "72 hours" :
                          order.liabilityType === "time_bound_1week" ? "1 week" :
                          order.liabilityType === "time_bound_1month" ? "1 month" : "unknown";
                        return `Time-Bound (${timeLabel}) - If assets are temporarily frozen, receiver agrees to wait ${timeLabel}. If assets are usable before the deadline, full payment applies. If still frozen at deadline, the deal closes with no payment.`;
                      })()}
                    </p>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle2 className={`h-5 w-5 ${order.receiverLiabilityConfirmed ? "text-green-600" : "text-muted-foreground"}`} />
                      <span className={order.receiverLiabilityConfirmed ? "text-green-600" : ""}>
                        Receiver {order.receiverLiabilityConfirmed ? "Confirmed" : "Pending"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle2 className={`h-5 w-5 ${order.loaderLiabilityConfirmed ? "text-green-600" : "text-muted-foreground"}`} />
                      <span className={order.loaderLiabilityConfirmed ? "text-green-600" : ""}>
                        Loader {order.loaderLiabilityConfirmed ? "Confirmed" : "Pending"}
                      </span>
                    </div>
                  </div>

                  {((isReceiver && !order.receiverLiabilityConfirmed) || (isLoader && !order.loaderLiabilityConfirmed)) && (
                    <div className="space-y-3">
                      <label className="flex items-start gap-3 p-3 border border-destructive/50 rounded-lg">
                        <input
                          type="checkbox"
                          checked={liabilityConfirmChecked}
                          onChange={(e) => setLiabilityConfirmChecked(e.target.checked)}
                          className="mt-1"
                          data-testid="checkbox-liability-confirm"
                        />
                        <div>
                          <p className="text-sm font-medium text-destructive">Mandatory Confirmation</p>
                          <p className="text-sm text-muted-foreground">
                            I understand this decision is final and cannot be changed later.
                          </p>
                        </div>
                      </label>

                      <Button
                        className="w-full"
                        onClick={() => confirmLiabilityMutation.mutate()}
                        disabled={!liabilityConfirmChecked || confirmLiabilityMutation.isPending}
                        data-testid="button-confirm-liability"
                      >
                        {confirmLiabilityMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                        )}
                        I Agree - Confirm Liability Terms
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {isLoader && !order.liabilityType && (
                <div className="space-y-4">
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">
                      Waiting for receiver to select liability terms...
                    </p>
                  </div>
                  
                  <div className="border rounded-lg p-4 bg-muted/30">
                    <p className="font-medium mb-3 text-sm">Liability Options Reference:</p>
                    <div className="space-y-3 text-sm">
                      <div className="border-b pb-2">
                        <p className="font-medium">Full Payment</p>
                        <p className="text-muted-foreground">Receiver pays full amount even if assets are frozen or unusable.</p>
                      </div>
                      <div className="border-b pb-2">
                        <p className="font-medium">Partial Payment (10%, 25%, or 50%)</p>
                        <p className="text-muted-foreground">Receiver pays a percentage of the deal if assets are frozen or unusable.</p>
                      </div>
                      <div>
                        <p className="font-medium">Time-Bound (24h, 48h, 72h, 1 week, 1 month)</p>
                        <p className="text-muted-foreground">If assets are temporarily frozen, receiver waits until deadline. If usable before deadline, full payment applies. If still frozen at deadline, deal closes with no payment owed.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Deal Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Asset Type</p>
                <p className="font-medium">{order.ad?.assetType || "N/A"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Deal Amount</p>
                <p className="font-medium">${dealAmount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Loader</p>
                <p className="font-medium">{order.loaderUsername}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Receiver</p>
                <p className="font-medium">{order.receiverUsername}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Loader Fee</p>
                <p className="font-medium">3% (${(dealAmount * 0.03).toFixed(2)})</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Receiver Fee</p>
                <p className="font-medium">2% (${(dealAmount * 0.02).toFixed(2)})</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {order.status === "awaiting_payment_details" && isReceiver && (
          <Card className="mb-4 border-primary/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Send Payment Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Send your payment details to the loader in the chat below. Once done, click the button to confirm.
              </p>
              <Button
                className="w-full"
                onClick={() => sendPaymentDetailsMutation.mutate()}
                disabled={sendPaymentDetailsMutation.isPending}
                data-testid="button-send-payment-details"
              >
                {sendPaymentDetailsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                I've Sent Payment Details in Chat
              </Button>
            </CardContent>
          </Card>
        )}

        {order.status === "awaiting_payment_details" && isLoader && (
          <Card className="mb-4 border-amber-500/50 bg-amber-500/5">
            <CardContent className="py-4 text-center">
              <Clock className="h-8 w-8 text-amber-600 mx-auto mb-2" />
              <p className="font-semibold text-amber-600">Waiting for Receiver</p>
              <p className="text-sm text-muted-foreground">
                The receiver needs to send their payment details before the countdown expires.
              </p>
            </CardContent>
          </Card>
        )}

        {order.status === "payment_details_sent" && isLoader && !order.loaderMarkedPaymentSent && (
          <Card className="mb-4 border-primary/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Mark Payment Sent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Once you've sent the payment to the receiver, click below to notify them.
              </p>
              <Button
                className="w-full"
                onClick={() => markPaymentSentMutation.mutate()}
                disabled={markPaymentSentMutation.isPending}
                data-testid="button-mark-payment-sent"
              >
                {markPaymentSentMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                I've Sent the Payment
              </Button>
            </CardContent>
          </Card>
        )}

        {(order.status === "payment_sent" || (order.status === "payment_details_sent" && order.loaderMarkedPaymentSent)) && isReceiver && (
          <Card className="mb-4 border-green-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                Confirm Payment Received
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Once you've received the payment and verified it, click below to complete the order.
                Your 2% fee (${(dealAmount * 0.02).toFixed(2)}) will be deducted.
              </p>
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={handleCompleteClick}
                disabled={completeMutation.isPending}
                data-testid="button-complete"
              >
                {completeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Confirm Payment Received - Complete Order
              </Button>
            </CardContent>
          </Card>
        )}

        {order.status === "completed" && (
          <Card className="mb-4 border-green-500/50 bg-green-500/5">
            <CardContent className="py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-2" />
              <p className="font-semibold text-green-600">Order Completed</p>
              <p className="text-sm text-muted-foreground">Fees deducted and funds released successfully.</p>
            </CardContent>
          </Card>
        )}

        {/* Feedback - only winner can leave feedback for disputed orders, or either party for normal completion */}
        {((order.status === "completed") || 
          (order.status === "resolved_loader_wins" && isLoader) || 
          (order.status === "resolved_receiver_wins" && isReceiver) ||
          (order.status === "resolved_mutual")
        ) && !feedbackData?.hasLeftFeedback && !showFeedbackForm && (
          <Card className="mb-4 border-primary/50">
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground mb-3">
                How was your experience with this order? Leave feedback to help other users.
              </p>
              <Button
                className="w-full"
                onClick={() => setShowFeedbackForm(true)}
                data-testid="button-leave-feedback"
              >
                <Star className="h-4 w-4 mr-2" />
                Leave Feedback
              </Button>
            </CardContent>
          </Card>
        )}

        {showFeedbackForm && (
          <Card className="mb-4 border-primary/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-5 w-5 text-primary" />
                Leave Feedback
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Rate your experience with {isLoader ? order.receiverUsername : order.loaderUsername}
              </p>
              <div className="flex gap-3">
                <Button
                  variant={feedbackType === "positive" ? "default" : "outline"}
                  className={`flex-1 ${feedbackType === "positive" ? "bg-green-600 hover:bg-green-700" : ""}`}
                  onClick={() => setFeedbackType("positive")}
                  data-testid="button-positive-feedback"
                >
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  Positive
                </Button>
                <Button
                  variant={feedbackType === "negative" ? "default" : "outline"}
                  className={`flex-1 ${feedbackType === "negative" ? "bg-destructive hover:bg-destructive/90" : ""}`}
                  onClick={() => setFeedbackType("negative")}
                  data-testid="button-negative-feedback"
                >
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  Negative
                </Button>
              </div>
              <Textarea
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                placeholder="Add a comment (optional)..."
                data-testid="input-feedback-comment"
              />
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={() => submitFeedbackMutation.mutate()}
                  disabled={!feedbackType || submitFeedbackMutation.isPending}
                  data-testid="button-submit-feedback"
                >
                  {submitFeedbackMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Submit Feedback
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowFeedbackForm(false); setFeedbackType(null); setFeedbackComment(""); }}
                  data-testid="button-cancel-feedback"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {feedbackData?.hasLeftFeedback && feedbackData.userFeedback && (
          <Card className="mb-4 border-green-500/50 bg-green-500/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-2">
                {feedbackData.userFeedback.feedbackType === "positive" ? (
                  <ThumbsUp className="h-5 w-5 text-green-600" />
                ) : (
                  <ThumbsDown className="h-5 w-5 text-destructive" />
                )}
                <p className="font-medium">
                  You left {feedbackData.userFeedback.feedbackType} feedback
                </p>
              </div>
              {feedbackData.userFeedback.comment && (
                <p className="text-sm text-muted-foreground">{feedbackData.userFeedback.comment}</p>
              )}
            </CardContent>
          </Card>
        )}

        {feedbackData?.feedback && feedbackData.feedback.length > 0 && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Feedback on this Order
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {feedbackData.feedback.map((fb) => (
                <div key={fb.id} className="p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    {fb.feedbackType === "positive" ? (
                      <ThumbsUp className="h-4 w-4 text-green-600" />
                    ) : (
                      <ThumbsDown className="h-4 w-4 text-destructive" />
                    )}
                    <span className="text-sm font-medium">{fb.giverUsername}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(fb.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {fb.comment && <p className="text-sm text-muted-foreground">{fb.comment}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {disputeableStatuses.includes(order.status) && !showPostOrderDispute && (
          <Card className="mb-4 border-amber-500/50">
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground mb-3">
                If you believe there was an issue with this order, you can raise a dispute within 72 hours.
              </p>
              <Button
                variant="outline"
                className="w-full border-amber-500 text-amber-600 hover:bg-amber-500/10"
                onClick={() => setShowPostOrderDispute(true)}
                data-testid="button-raise-dispute"
              >
                <Flag className="h-4 w-4 mr-2" />
                Raise Dispute
              </Button>
            </CardContent>
          </Card>
        )}

        {showPostOrderDispute && (
          <Card className="mb-4 border-amber-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-amber-600">
                <Flag className="h-5 w-5" />
                Raise Dispute
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Explain why you're disputing this order. Admin will review and the losing party may pay a penalty.
              </p>
              <Textarea
                value={postOrderDisputeReason}
                onChange={(e) => setPostOrderDisputeReason(e.target.value)}
                placeholder="Describe the issue..."
                data-testid="input-post-dispute-reason"
              />
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={() => postOrderDisputeMutation.mutate()}
                  disabled={!postOrderDisputeReason || postOrderDisputeMutation.isPending}
                  data-testid="button-submit-post-dispute"
                >
                  {postOrderDisputeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Flag className="h-4 w-4 mr-2" />
                  )}
                  Submit Dispute
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowPostOrderDispute(false); setPostOrderDisputeReason(""); }}
                  data-testid="button-cancel-post-dispute"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {order.status === "disputed" && (
          <Card className="mb-4 border-destructive/50 bg-destructive/5">
            <CardContent className="py-6 text-center">
              <Flag className="h-12 w-12 text-destructive mx-auto mb-2" />
              <p className="font-semibold text-destructive">Order Disputed</p>
              <p className="text-sm text-muted-foreground">Admin is reviewing. The losing party will pay a 5% penalty.</p>
              {dispute && (
                <div className="mt-4 text-left p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Reason:</p>
                  <p className="text-sm">{dispute.reason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {(order.status.startsWith("cancelled_") || order.status.startsWith("resolved_")) && (
          <Card className="mb-4 border-muted bg-muted/20">
            <CardContent className="py-6 text-center">
              <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <p className="font-semibold text-muted-foreground">{order.status.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase())}</p>
              {order.penaltyAmount && parseFloat(order.penaltyAmount) > 0 && (
                <p className="text-sm text-destructive mt-2">
                  5% penalty (${parseFloat(order.penaltyAmount).toFixed(2)}) was applied.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {canCancel && !showCancelConfirm && (
          <Card className="mb-4">
            <CardContent className="py-4 flex gap-3">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => setShowCancelConfirm(true)}
                data-testid="button-cancel-order"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel Order
              </Button>
              {canDispute && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowDisputeForm(true)}
                  data-testid="button-open-dispute"
                >
                  <Flag className="h-4 w-4 mr-2" />
                  Open Dispute
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {showCancelConfirm && (
          <Card className="mb-4 border-destructive/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Confirm Cancellation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-destructive/10 rounded-lg">
                <p className="text-sm text-destructive font-medium">
                  Warning: You will be charged a 5% penalty (${penaltyAmount.toFixed(2)}) for cancelling.
                </p>
                <p className="text-xs text-destructive mt-1">
                  The other party will receive a full refund.
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  data-testid="button-confirm-cancel"
                >
                  {cancelMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Yes, Cancel and Pay Penalty
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowCancelConfirm(false)}
                  data-testid="button-nevermind"
                >
                  Never Mind
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showDisputeForm && (
          <Card className="mb-4 border-amber-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-amber-600">
                <Flag className="h-5 w-5" />
                Open Dispute
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Explain why you're opening a dispute. Admin will review and the losing party will pay a 5% penalty.
              </p>
              <Textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Describe the issue..."
                data-testid="input-dispute-reason"
              />
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={() => openDisputeMutation.mutate()}
                  disabled={!disputeReason || openDisputeMutation.isPending}
                  data-testid="button-submit-dispute"
                >
                  {openDisputeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Flag className="h-4 w-4 mr-2" />
                  )}
                  Submit Dispute
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowDisputeForm(false); setDisputeReason(""); }}
                  data-testid="button-cancel-dispute"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-2">
          <CardHeader className="pb-3 border-b bg-muted/30">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              Order Chat
              <Badge variant="outline" className="ml-auto text-xs">
                {messages?.length || 0} messages
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-80 p-4">
              <div className="space-y-4">
                {messages?.map((msg) => {
                  const isOwnMessage = msg.senderId === currentUser?.id;
                  const isLoaderMessage = msg.senderId === order?.loaderId;
                  const isReceiverMessage = msg.senderId === order?.receiverId;
                  
                  if (msg.isSystem) {
                    return (
                      <div key={msg.id} className="flex justify-center my-3">
                        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium ${
                          msg.isAdminMessage 
                            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700" 
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {msg.isAdminMessage && <Shield className="h-3 w-3" />}
                          {msg.content}
                        </div>
                      </div>
                    );
                  }
                  
                  return (
                    <div
                      key={msg.id}
                      className={`flex items-end gap-2 ${isOwnMessage ? "flex-row-reverse" : "flex-row"}`}
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        isLoaderMessage 
                          ? "bg-blue-500 text-white" 
                          : isReceiverMessage 
                            ? "bg-green-500 text-white" 
                            : "bg-gray-500 text-white"
                      }`}>
                        {msg.senderUsername?.slice(0, 2).toUpperCase() || "??"}
                      </div>
                      <div className={`max-w-[75%] ${isOwnMessage ? "items-end" : "items-start"}`}>
                        <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? "flex-row-reverse" : "flex-row"}`}>
                          <span className={`text-xs font-semibold ${
                            isLoaderMessage ? "text-blue-600 dark:text-blue-400" : "text-green-600 dark:text-green-400"
                          }`}>
                            {msg.senderUsername}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {isLoaderMessage ? "Loader" : "Receiver"}
                          </Badge>
                        </div>
                        <div className={`px-4 py-2.5 rounded-2xl shadow-sm ${
                          isOwnMessage 
                            ? "bg-primary text-primary-foreground rounded-br-md" 
                            : "bg-muted border rounded-bl-md"
                        }`}>
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>
                        <p className={`text-[10px] text-muted-foreground mt-1 ${isOwnMessage ? "text-right" : "text-left"}`}>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {(!messages || messages.length === 0) && (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <MessageCircle className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No messages yet</p>
                    <p className="text-xs">Start the conversation below</p>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="p-4 border-t bg-muted/20">
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && newMessage && sendMessageMutation.mutate()}
                  data-testid="input-message"
                />
                <Button
                  onClick={() => sendMessageMutation.mutate()}
                  disabled={!newMessage || sendMessageMutation.isPending}
                  className="px-4"
                  data-testid="button-send"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={show2FADialog} onOpenChange={setShow2FADialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              2FA Verification Required
            </DialogTitle>
            <DialogDescription>
              Please enter your authenticator code to confirm payment and complete the order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Enter 6-digit code"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                className="text-center text-lg tracking-widest"
                data-testid="input-2fa-code"
              />
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handle2FASubmit}
                disabled={twoFactorCode.length !== 6 || completeMutation.isPending}
                data-testid="button-verify-2fa"
              >
                {completeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Verify & Complete
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShow2FADialog(false); setTwoFactorCode(""); }}
                data-testid="button-cancel-2fa"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
