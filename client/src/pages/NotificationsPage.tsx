import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchWithAuth } from "@/lib/auth";
import { Link } from "wouter";
import {
  Bell,
  ShoppingCart,
  Wallet,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  Check,
} from "lucide-react";

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/notifications");
      return res.json();
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchWithAuth(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread"] });
    },
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "order":
        return <ShoppingCart className="h-5 w-5 text-blue-400" />;
      case "payment":
      case "wallet":
        return <Wallet className="h-5 w-5 text-green-400" />;
      case "escrow":
        return <Shield className="h-5 w-5 text-purple-400" />;
      case "dispute":
        return <AlertTriangle className="h-5 w-5 text-orange-400" />;
      case "kyc":
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      default:
        return <Bell className="h-5 w-5 text-gray-400" />;
    }
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 px-2 sm:px-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground truncate">Notifications</h1>
          {notifications && notifications.some((n) => !n.isRead) && (
            <Badge className="bg-primary">
              {notifications.filter((n) => !n.isRead).length} unread
            </Badge>
          )}
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Bell className="h-5 w-5" />
              All Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 bg-muted" />
                ))}
              </div>
            ) : notifications && notifications.length > 0 ? (
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      notification.isRead
                        ? "bg-muted/50 border-border"
                        : "bg-muted/80 border-primary/50"
                    }`}
                    data-testid={`notification-${notification.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-muted">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-foreground font-medium">{notification.title}</p>
                            {!notification.isRead && (
                              <div className="w-2 h-2 rounded-full bg-primary" />
                            )}
                          </div>
                          <p className="text-muted-foreground text-sm mt-1">{notification.message}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {new Date(notification.createdAt).toLocaleDateString()} at{" "}
                              {new Date(notification.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {notification.link && (
                          <Link href={notification.link}>
                            <Button variant="outline" size="sm">
                              View
                            </Button>
                          </Link>
                        )}
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markReadMutation.mutate(notification.id)}
                            data-testid={`button-mark-read-${notification.id}`}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-foreground">No notifications yet</p>
                <p className="text-muted-foreground text-sm">You'll see updates about your orders here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
