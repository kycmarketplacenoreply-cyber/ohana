import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth, getUser, isAuthenticated } from "@/lib/auth";
import { Layout } from "@/components/Layout";
import {
  ArrowLeft,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Shield,
  Lock,
  Loader2,
  MessageCircle,
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
  receiverFrozenAmount: string;
  status: string;
  liabilityType: string | null;
  liabilityDeadline: string | null;
  receiverConfirmed: boolean;
  loaderConfirmed: boolean;
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
  content: string;
  createdAt: string;
}

const LIABILITY_OPTIONS = [
  {
    value: "full_payment",
    label: "Full Payment",
    description: "I will pay the full deal amount even if the assets are frozen, delayed, or unusable.",
  },
  {
    value: "partial_10",
    label: "Partial Payment - 10%",
    description: "If the assets are frozen or unusable, I agree to pay 10% of the deal amount.",
  },
  {
    value: "partial_25",
    label: "Partial Payment - 25%",
    description: "If the assets are frozen or unusable, I agree to pay 25% of the deal amount.",
  },
  {
    value: "partial_50",
    label: "Partial Payment - 50%",
    description: "If the assets are frozen or unusable, I agree to pay 50% of the deal amount.",
  },
];

const TIME_BOUND_OPTIONS = [
  { value: "time_bound_24h", label: "24 hours" },
  { value: "time_bound_48h", label: "48 hours" },
  { value: "time_bound_72h", label: "72 hours" },
  { value: "time_bound_1week", label: "1 week" },
  { value: "time_bound_1month", label: "1 month" },
];

export default function LoaderOrderPage() {
  const [, params] = useRoute("/loader-order/:id");
  const [, setLocation] = useLocation();
  const orderId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentUser = getUser();

  const [selectedLiability, setSelectedLiability] = useState("");
  const [selectedTimeBound, setSelectedTimeBound] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [newMessage, setNewMessage] = useState("");

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

  const selectLiabilityMutation = useMutation({
    mutationFn: async () => {
      const liabilityType = selectedTimeBound || selectedLiability;
      const res = await fetchWithAuth(`/api/loaders/orders/${orderId}/liability`, {
        method: "POST",
        body: JSON.stringify({ liabilityType, confirmed }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Liability terms selected" });
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
    onSuccess: () => {
      toast({ title: "Success", description: "Liability terms confirmed. You can now send funds." });
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
      toast({ title: "Success", description: "Order completed! Funds released." });
      queryClient.invalidateQueries({ queryKey: ["loaderOrder", orderId] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      refetchMessages();
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

  const isReceiver = order?.receiverId === currentUser?.id;
  const isLoader = order?.loaderId === currentUser?.id;

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
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

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
                <p className="font-medium">${parseFloat(order.dealAmount).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Loader</p>
                <p className="font-medium">{order.loaderUsername}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Receiver</p>
                <p className="font-medium">{order.receiverUsername}</p>
              </div>
            </div>
            {order.liabilityType && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">Liability Terms</p>
                <p className="font-medium">{order.liabilityType.replace(/_/g, " ")}</p>
                {order.liabilityDeadline && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Deadline: {new Date(order.liabilityDeadline).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {order.status === "awaiting_liability_confirmation" && isReceiver && !order.receiverConfirmed && (
          <Card className="mb-4 border-amber-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                Select Liability Terms
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You must select liability terms before the loader sends funds.
              </p>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Payment Options:</Label>
                <RadioGroup value={selectedLiability} onValueChange={(v) => { setSelectedLiability(v); setSelectedTimeBound(""); }}>
                  {LIABILITY_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-start space-x-3 p-3 border rounded-lg">
                      <RadioGroupItem value={option.value} id={option.value} data-testid={`radio-${option.value}`} />
                      <div className="flex-1">
                        <Label htmlFor={option.value} className="font-medium cursor-pointer">
                          {option.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Or Time-Bound Option:</Label>
                <p className="text-xs text-muted-foreground">
                  If assets are usable before deadline, pay in full. If still frozen at deadline, deal closes with no payment.
                </p>
                <RadioGroup value={selectedTimeBound} onValueChange={(v) => { setSelectedTimeBound(v); setSelectedLiability(""); }}>
                  <div className="flex flex-wrap gap-2">
                    {TIME_BOUND_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2 p-2 border rounded-lg">
                        <RadioGroupItem value={option.value} id={option.value} data-testid={`radio-${option.value}`} />
                        <Label htmlFor={option.value} className="text-sm cursor-pointer">{option.label}</Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              </div>

              <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                <div className="flex items-start space-x-2">
                  <Checkbox 
                    id="confirm" 
                    checked={confirmed} 
                    onCheckedChange={(c) => setConfirmed(c === true)}
                    data-testid="checkbox-confirm"
                  />
                  <Label htmlFor="confirm" className="text-sm text-destructive cursor-pointer">
                    I understand this decision is final and cannot be changed later.
                  </Label>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => selectLiabilityMutation.mutate()}
                disabled={(!selectedLiability && !selectedTimeBound) || !confirmed || selectLiabilityMutation.isPending}
                data-testid="button-submit-liability"
              >
                {selectLiabilityMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                I Agree - Submit Terms
              </Button>
            </CardContent>
          </Card>
        )}

        {order.status === "awaiting_liability_confirmation" && isLoader && order.receiverConfirmed && !order.loaderConfirmed && (
          <Card className="mb-4 border-primary/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                Confirm Liability Terms
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The receiver has selected: <strong>{order.liabilityType?.replace(/_/g, " ")}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Confirm to lock these terms and proceed with sending funds.
              </p>
              <Button
                className="w-full"
                onClick={() => confirmLiabilityMutation.mutate()}
                disabled={confirmLiabilityMutation.isPending}
                data-testid="button-confirm-liability"
              >
                {confirmLiabilityMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Confirm and Proceed
              </Button>
            </CardContent>
          </Card>
        )}

        {order.status === "funds_sent_by_loader" && isReceiver && (
          <Card className="mb-4 border-green-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                Confirm Receipt
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Once you confirm receipt and the assets are usable, click below to complete the order.
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
                Mark as Complete
              </Button>
            </CardContent>
          </Card>
        )}

        {order.status === "completed" && (
          <Card className="mb-4 border-green-500/50 bg-green-500/5">
            <CardContent className="py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-2" />
              <p className="font-semibold text-green-600">Order Completed</p>
              <p className="text-sm text-muted-foreground">Funds have been released successfully.</p>
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
                    <div className="inline-block px-3 py-2 bg-muted rounded-lg text-sm text-muted-foreground">
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
