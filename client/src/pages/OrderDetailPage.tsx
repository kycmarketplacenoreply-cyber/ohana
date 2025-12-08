import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth, getUser } from "@/lib/auth";
import {
  MessageCircle,
  Send,
  Clock,
  CheckCircle,
  AlertTriangle,
  Shield,
  DollarSign,
  ArrowRight,
  Lock,
  Unlock,
} from "lucide-react";

interface Order {
  id: string;
  offerId: string;
  buyerId: string;
  vendorId: string;
  tradeIntent: "sell_ad" | "buy_ad";
  amount: string;
  fiatAmount: string;
  pricePerUnit: string;
  currency: string;
  paymentMethod: string;
  status: string;
  escrowAmount: string | null;
  platformFee: string | null;
  sellerReceives: string | null;
  createdAt: string;
  autoReleaseAt: string | null;
}

interface ChatMessage {
  id: string;
  orderId: string;
  senderId: string;
  message: string;
  isSystemMessage: boolean;
  createdAt: string;
}

export default function OrderDetailPage() {
  const [, params] = useRoute("/order/:id");
  const orderId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = getUser();
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: order, isLoading: orderLoading } = useQuery<Order>({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/orders/${orderId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch order");
      }
      return res.json();
    },
    enabled: !!orderId,
    retry: 3,
    retryDelay: 1000,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ["messages", orderId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/orders/${orderId}/messages`);
      return res.json();
    },
    enabled: !!orderId,
    refetchInterval: 5000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetchWithAuth(`/api/orders/${orderId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", orderId] });
      setNewMessage("");
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/orders/${orderId}/paid`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to mark as paid");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      toast({ title: "Payment marked", description: "Waiting for vendor confirmation" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to mark payment" });
    },
  });

  const confirmOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/orders/${orderId}/confirm`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to confirm delivery");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      toast({ 
        title: "Delivery Confirmed!", 
        description: `Payment released to seller (${data.sellerAmount} USDT after 10% platform fee)` 
      });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to confirm delivery" });
    },
  });

  const deliverProductMutation = useMutation({
    mutationFn: async (deliveryDetails: string | undefined = undefined) => {
      const res = await fetchWithAuth(`/api/orders/${orderId}/deliver`, {
        method: "POST",
        body: JSON.stringify({ deliveryDetails }),
      });
      if (!res.ok) throw new Error("Failed to mark as delivered");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      toast({ title: "Product Delivered", description: "Waiting for buyer to confirm receipt" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to mark as delivered" });
    },
  });

  const openDisputeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/orders/${orderId}/dispute`, {
        method: "POST",
        body: JSON.stringify({ reason: "Issue with transaction" }),
      });
      if (!res.ok) throw new Error("Failed to open dispute");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      toast({ title: "Dispute opened", description: "An admin will review your case" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to open dispute" });
    },
  });

  const depositMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth(`/api/orders/${orderId}/deposit`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to deposit");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      toast({ title: "Funds Deposited!", description: "Funds are now in escrow. Waiting for seller to deliver." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed to deposit", description: error.message });
    },
  });

  const { data: accountDetails } = useQuery<{ accountDetails: Record<string, string> | null }>({
    queryKey: ["account-details", orderId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/orders/${orderId}/account-details`);
      if (!res.ok) return { accountDetails: null };
      return res.json();
    },
    enabled: !!orderId && order?.status === "completed" && order?.buyerId === user?.id,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      sendMessageMutation.mutate(newMessage);
    }
  };

  const isBuyer = order?.buyerId === user?.id;
  const isBuyAd = order?.tradeIntent === "buy_ad";

  const getStatusStep = (status: string) => {
    switch (status) {
      case "awaiting_deposit": return 0;
      case "escrowed": return 1;
      case "created": return 1;
      case "paid": return 2;
      case "confirmed": return 3;
      case "completed": return 4;
      default: return 0;
    }
  };

  const steps = isBuyAd ? [
    { label: "Deposit Required", icon: DollarSign },
    { label: "Funds in Escrow", icon: Lock },
    { label: "Product Delivered", icon: ArrowRight },
    { label: "Completed", icon: Unlock },
  ] : [
    { label: "Funds in Escrow", icon: Lock },
    { label: "Payment Sent", icon: DollarSign },
    { label: "Product Delivered", icon: ArrowRight },
    { label: "Completed", icon: Unlock },
  ];

  if (orderLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-64 bg-gray-800" />
          <Skeleton className="h-64 bg-gray-800" />
          <Skeleton className="h-96 bg-gray-800" />
        </div>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-white text-xl">Order not found</p>
        </div>
      </Layout>
    );
  }

  const currentStep = getStatusStep(order.status);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">
            Order #{order.id.slice(0, 8)}
          </h1>
          <Badge className={
            order.status === "completed" ? "bg-green-600" :
            order.status === "disputed" ? "bg-orange-600" :
            order.status === "cancelled" ? "bg-red-600" :
            order.status === "awaiting_deposit" ? "bg-yellow-600" :
            order.status === "escrowed" ? "bg-purple-600" :
            "bg-blue-600"
          }>
            {order.status === "awaiting_deposit" ? "Awaiting Deposit" :
             order.status === "escrowed" ? "Funds Escrowed" :
             order.status.charAt(0).toUpperCase() + order.status.slice(1)}
          </Badge>
        </div>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-400" />
              Order Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-8">
              {steps.map((step, index) => (
                <div key={index} className="flex flex-col items-center relative">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      index < currentStep
                        ? "bg-green-600"
                        : index === currentStep
                        ? "bg-purple-600"
                        : "bg-gray-700"
                    }`}
                  >
                    <step.icon className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-sm text-gray-400 mt-2 text-center">{step.label}</p>
                  {index < steps.length - 1 && (
                    <div
                      className={`absolute top-6 left-12 w-full h-0.5 ${
                        index < currentStep ? "bg-green-600" : "bg-gray-700"
                      }`}
                      style={{ width: "calc(100% + 2rem)" }}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-gray-800 rounded-lg">
                <p className="text-gray-400 text-sm">Accounts</p>
                <p className="text-white font-bold">
                  {Math.floor(parseFloat(order.amount))} account{Math.floor(parseFloat(order.amount)) !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="p-4 bg-gray-800 rounded-lg">
                <p className="text-gray-400 text-sm">Total Price</p>
                <p className="text-white font-bold">${Math.floor(parseFloat(order.fiatAmount))}</p>
              </div>
              <div className="p-4 bg-gray-800 rounded-lg">
                <p className="text-gray-400 text-sm">Payment Method</p>
                <p className="text-white font-bold">{order.paymentMethod}</p>
              </div>
              <div className="p-4 bg-gray-800 rounded-lg">
                <p className="text-gray-400 text-sm">Price/Account</p>
                <p className="text-white font-bold">${Math.floor(parseFloat(order.pricePerUnit))}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {isBuyer && isBuyAd && order.status === "awaiting_deposit" && (
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => depositMutation.mutate()}
                  disabled={depositMutation.isPending}
                  data-testid="button-deposit-funds"
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  Deposit ${parseFloat(order.fiatAmount).toFixed(2)} to Escrow
                </Button>
              )}

              {isBuyer && !isBuyAd && order.status === "escrowed" && (
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => markPaidMutation.mutate()}
                  disabled={markPaidMutation.isPending}
                  data-testid="button-mark-paid"
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  I've Sent Payment
                </Button>
              )}

              {isBuyer && order.status === "created" && (
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => markPaidMutation.mutate()}
                  disabled={markPaidMutation.isPending}
                  data-testid="button-mark-paid"
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  I've Sent Payment
                </Button>
              )}

              {!isBuyer && (order.status === "paid" || order.status === "escrowed") && (
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => deliverProductMutation.mutate(undefined)}
                  disabled={deliverProductMutation.isPending}
                  data-testid="button-deliver-product"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Deliver Product
                </Button>
              )}

              {isBuyer && order.status === "confirmed" && (
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => confirmOrderMutation.mutate()}
                  disabled={confirmOrderMutation.isPending}
                  data-testid="button-confirm-delivery"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirm Delivery (Release Payment)
                </Button>
              )}

              {(order.status === "created" || order.status === "escrowed" || order.status === "paid" || order.status === "confirmed") && (
                <Button
                  variant="outline"
                  className="border-orange-600 text-orange-400 hover:bg-orange-600/20"
                  onClick={() => openDisputeMutation.mutate()}
                  disabled={openDisputeMutation.isPending}
                  data-testid="button-open-dispute"
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Open Dispute
                </Button>
              )}
            </div>

            {order.status === "awaiting_deposit" && isBuyer && (
              <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <p className="text-yellow-300 text-sm">
                  Please deposit ${parseFloat(order.fiatAmount).toFixed(2)} USDT to proceed with this order.
                </p>
              </div>
            )}

            {order.autoReleaseAt && order.status === "paid" && (
              <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-400" />
                <p className="text-yellow-300 text-sm">
                  Auto-release at: {new Date(order.autoReleaseAt).toLocaleString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {order.status === "completed" && isBuyer && accountDetails?.accountDetails && (
          <Card className="bg-gray-900/50 border-gray-800 border-green-500/50" data-testid="card-account-details">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Unlock className="h-5 w-5 text-green-400" />
                Account Details (Revealed)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg">
                <p className="text-green-300 text-sm mb-3">
                  Your order is complete! Here are the account details from the vendor:
                </p>
                <div className="space-y-2">
                  {Object.entries(accountDetails.accountDetails).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center p-2 bg-gray-800 rounded">
                      <span className="text-gray-400 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                      <span className="text-white font-mono select-all" data-testid={`text-account-${key}`}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Chat
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 overflow-y-auto mb-4 space-y-3 p-4 bg-gray-800/50 rounded-lg">
              {messagesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 bg-gray-700" />
                  ))}
                </div>
              ) : messages && messages.length > 0 ? (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.senderId === user?.id ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] p-3 rounded-lg ${
                        msg.isSystemMessage
                          ? "bg-gray-700 text-gray-300 text-center w-full"
                          : msg.senderId === user?.id
                          ? "bg-purple-600 text-white"
                          : "bg-gray-700 text-white"
                      }`}
                    >
                      <p>{msg.message}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center">No messages yet</p>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="flex gap-2">
              <Input
                placeholder="Type a message..."
                className="flex-1 bg-gray-800 border-gray-700 text-white"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                data-testid="input-chat-message"
              />
              <Button
                type="submit"
                className="bg-purple-600 hover:bg-purple-700"
                disabled={!newMessage.trim() || sendMessageMutation.isPending}
                data-testid="button-send-message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
