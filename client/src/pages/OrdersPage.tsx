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

interface OrdersData {
  buyerOrders: Order[];
  vendorOrders: Order[];
}

export default function OrdersPage() {
  const { data, isLoading } = useQuery<OrdersData>({
    queryKey: ["orders"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/orders");
      return res.json();
    },
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
                <TabsList className="mb-6">
                  <TabsTrigger value="buying" data-testid="tab-buying">
                    Buying ({data?.buyerOrders?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="selling" data-testid="tab-selling">
                    Selling ({data?.vendorOrders?.length || 0})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="buying">
                  {renderOrderList(data?.buyerOrders || [], "buyer")}
                </TabsContent>

                <TabsContent value="selling">
                  {renderOrderList(data?.vendorOrders || [], "vendor")}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
