import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export default function LoaderOrderPage() {
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
      return res.json();
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

  const terminalStatuses = ["completed", "closed_no_payment", "cancelled_auto", "cancelled_loader", "cancelled_receiver", "disputed", "resolved_loader_wins", "resolved_receiver_wins", "resolved_mutual"];

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
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/complete`, {
        method: "POST",
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
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

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
                      {order.liabilityType?.startsWith("time_bound_") && `Time-Bound - Wait ${order.liabilityType.replace("time_bound_", "").replace("h", " hours").replace("week", " week").replace("month", " month")}`}
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
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">
                    Waiting for receiver to select liability terms...
                  </p>
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
                onClick={() => completeMutation.mutate()}
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Order Chat
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64 mb-4 border rounded-lg p-3">
              {messages?.map((msg) => (
                <div
                  key={msg.id}
                  className={`mb-3 ${msg.isSystem ? "text-center" : msg.senderId === currentUser?.id ? "text-right" : ""}`}
                >
                  {msg.isSystem ? (
                    <div className={`inline-block px-3 py-2 rounded-lg text-sm ${msg.isAdminMessage ? "bg-amber-500/20 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                      {msg.isAdminMessage && <AlertCircle className="h-3 w-3 inline mr-1" />}
                      {msg.content}
                    </div>
                  ) : (
                    <div className={`inline-block px-3 py-2 rounded-lg ${msg.senderId === currentUser?.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      <p className="text-xs font-medium mb-1">{msg.senderUsername}</p>
                      <p className="text-sm">{msg.content}</p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              ))}
              {(!messages || messages.length === 0) && (
                <p className="text-center text-muted-foreground text-sm py-8">No messages yet</p>
              )}
            </ScrollArea>

            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                onKeyDown={(e) => e.key === "Enter" && newMessage && sendMessageMutation.mutate()}
                data-testid="input-message"
              />
              <Button
                size="icon"
                onClick={() => sendMessageMutation.mutate()}
                disabled={!newMessage || sendMessageMutation.isPending}
                data-testid="button-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
