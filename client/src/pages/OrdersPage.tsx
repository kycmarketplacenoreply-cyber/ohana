import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchWithAuth } from "@/lib/auth";
import {
  ShoppingCart,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Package,
  Loader2,
  Shield,
} from "lucide-react";

interface Order {
  id: string;
  offerId: string;
  buyerId: string;
  vendorId: string;
  amount: string;
  fiatAmount: string;
  pricePerUnit: string;
  currency: string;
  paymentMethod: string;
  status: string;
  createdAt: string;
}

interface LoaderOrder {
  id: string;
  loaderId: string;
  loaderUsername?: string;
  receiverId: string;
  receiverUsername?: string;
  dealAmount: string;
  status: string;
  role: string;
  createdAt: string;
}

interface OrdersData {
  buyerOrders: Order[];
  vendorOrders: Order[];
  pendingOrders: Order[];
  cancelledOrders: Order[];
  disputedOrders: Order[];
  loaderOrders: LoaderOrder[];
}

export default function OrdersPage() {
  const { data, isLoading } = useQuery<OrdersData>({
    queryKey: ["orders"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/orders");
      if (!res.ok) {
        throw new Error("Failed to fetch orders");
      }
      return res.json();
    },
    retry: 3,
    retryDelay: 1000,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "awaiting_deposit":
        return <Badge className="bg-yellow-600">Awaiting Deposit</Badge>;
      case "escrowed":
        return <Badge className="bg-purple-600">Funds Escrowed</Badge>;
      case "created":
        return <Badge className="bg-blue-600">Pending Payment</Badge>;
      case "paid":
        return <Badge className="bg-yellow-600">Awaiting Confirmation</Badge>;
      case "confirmed":
        return <Badge className="bg-purple-600">Confirmed</Badge>;
      case "completed":
        return <Badge className="bg-green-600">Completed</Badge>;
      case "cancelled":
        return <Badge className="bg-red-600">Cancelled</Badge>;
      case "disputed":
        return <Badge className="bg-orange-600">Disputed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "awaiting_deposit":
        return <Clock className="h-5 w-5 text-yellow-400" />;
      case "escrowed":
        return <Clock className="h-5 w-5 text-purple-400" />;
      case "created":
        return <Clock className="h-5 w-5 text-blue-400" />;
      case "paid":
        return <Clock className="h-5 w-5 text-yellow-400" />;
      case "confirmed":
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      case "cancelled":
        return <XCircle className="h-5 w-5 text-red-400" />;
      case "disputed":
        return <AlertTriangle className="h-5 w-5 text-orange-400" />;
      default:
        return <Package className="h-5 w-5 text-gray-400" />;
    }
  };

  const getLoaderStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      awaiting_liability_confirmation: { label: "Select Terms", className: "bg-yellow-600" },
      awaiting_payment_details: { label: "Awaiting Details", className: "bg-yellow-600" },
      payment_details_sent: { label: "Details Sent", className: "bg-blue-600" },
      payment_sent: { label: "Payment Sent", className: "bg-purple-600" },
      completed: { label: "Completed", className: "bg-green-600" },
      cancelled_auto: { label: "Auto-Cancelled", className: "bg-gray-600" },
      cancelled_loader: { label: "Cancelled", className: "bg-red-600" },
      cancelled_receiver: { label: "Cancelled", className: "bg-red-600" },
      disputed: { label: "Disputed", className: "bg-orange-600" },
      resolved_loader_wins: { label: "Resolved", className: "bg-green-600" },
      resolved_receiver_wins: { label: "Resolved", className: "bg-green-600" },
      resolved_mutual: { label: "Resolved", className: "bg-gray-600" },
    };
    const s = statusMap[status] || { label: status.replace(/_/g, " "), className: "bg-gray-600" };
    return <Badge className={s.className}>{s.label}</Badge>;
  };

  const renderOrderList = (orders: Order[], role: "buyer" | "vendor") => {
    if (!orders || orders.length === 0) {
      return (
        <div className="text-center py-12">
          <ShoppingCart className="h-12 w-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No orders yet</p>
          <p className="text-gray-500 text-sm">
            {role === "buyer" ? "Start trading to see your orders here" : "Your customer orders will appear here"}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {orders.map((order) => (
          <div
            key={order.id}
            className="p-4 rounded-xl bg-gray-800/50 border border-gray-700 hover:border-purple-600 transition-colors"
            data-testid={`order-card-${order.id}`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-gray-700">
                  {getStatusIcon(order.status)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">
                      Order #{order.id.slice(0, 8)}
                    </span>
                    {getStatusBadge(order.status)}
                  </div>
                  <p className="text-sm text-gray-400">
                    {new Date(order.createdAt).toLocaleDateString()} at{" "}
                    {new Date(order.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="text-right">
                  <p className="text-xl font-bold text-white">
                    {Math.floor(parseFloat(order.amount))} account{Math.floor(parseFloat(order.amount)) !== 1 ? 's' : ''}
                  </p>
                  <p className="text-sm text-gray-400">
                    ${Math.floor(parseFloat(order.fiatAmount))} • {order.paymentMethod}
                  </p>
                </div>
                <Link href={`/order/${order.id}`}>
                  <Button variant="outline" size="sm" className="gap-2" data-testid={`button-view-order-${order.id}`}>
                    View Details
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderLoaderOrderList = (orders: LoaderOrder[]) => {
    if (!orders || orders.length === 0) {
      return (
        <div className="text-center py-12">
          <Shield className="h-12 w-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No loader orders yet</p>
          <p className="text-gray-500 text-sm">
            Your Loaders Zone orders will appear here
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {orders.map((order) => (
          <div
            key={order.id}
            className="p-4 rounded-xl bg-gray-800/50 border border-gray-700 hover:border-purple-600 transition-colors"
            data-testid={`loader-order-card-${order.id}`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-purple-700">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">
                      {order.role === "loader" ? "Loading to" : "Receiving from"}{" "}
                      {order.role === "loader" ? order.receiverUsername : order.loaderUsername}
                    </span>
                    {getLoaderStatusBadge(order.status)}
                    <Badge variant="outline" className="text-purple-400 border-purple-400">
                      Loaders Zone
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-400">
                    {new Date(order.createdAt).toLocaleDateString()} at{" "}
                    {new Date(order.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="text-right">
                  <p className="text-xl font-bold text-white">
                    ${parseFloat(order.dealAmount).toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-400">
                    {order.role === "loader" ? "Loader" : "Receiver"}
                  </p>
                </div>
                <Link href={`/loader-order/${order.id}`}>
                  <Button variant="outline" size="sm" className="gap-2" data-testid={`button-view-loader-order-${order.id}`}>
                    View Details
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Layout>
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-white">My Orders</h1>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Order History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 bg-gray-800" />
                ))}
              </div>
            ) : (
              <Tabs defaultValue="buying">
                <TabsList className="mb-6 flex-wrap">
                  <TabsTrigger value="buying" data-testid="tab-buying">
                    Buying ({data?.buyerOrders?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="selling" data-testid="tab-selling">
                    Selling ({data?.vendorOrders?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="loaders" data-testid="tab-loaders">
                    <Shield className="h-4 w-4 mr-1" />
                    Loaders Zone ({data?.loaderOrders?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="pending" data-testid="tab-pending">
                    Pending ({data?.pendingOrders?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="cancelled" data-testid="tab-cancelled">
                    Cancelled ({data?.cancelledOrders?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="disputed" data-testid="tab-disputed">
                    Disputed ({data?.disputedOrders?.length || 0})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="buying">
                  {renderOrderList(data?.buyerOrders || [], "buyer")}
                </TabsContent>

                <TabsContent value="selling">
                  {renderOrderList(data?.vendorOrders || [], "vendor")}
                </TabsContent>

                <TabsContent value="loaders">
                  {renderLoaderOrderList(data?.loaderOrders || [])}
                </TabsContent>

                <TabsContent value="pending">
                  {renderOrderList(data?.pendingOrders || [], "buyer")}
                </TabsContent>

                <TabsContent value="cancelled">
                  {renderOrderList(data?.cancelledOrders || [], "buyer")}
                </TabsContent>

                <TabsContent value="disputed">
                  {renderOrderList(data?.disputedOrders || [], "buyer")}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
