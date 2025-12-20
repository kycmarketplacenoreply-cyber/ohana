import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { fetchWithAuth, getUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle,
  Mail,
  MessageSquare,
  Shield,
  Star,
  TrendingUp,
  ChevronLeft,
  User,
  Store,
  Clock,
} from "lucide-react";

interface UserProfile {
  id: string;
  username: string;
  email?: string;
  profilePicture?: string;
  createdAt: string;
  role: string;
  isVerified?: boolean;
  tier?: string;
}

interface TradeStats {
  totalTrades: number;
  completionRate: number;
  avgReleaseTime?: number;
  avgPayTime?: number;
}

interface Feedback {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  createdBy: string;
}

interface ActiveAd {
  id: string;
  type: string;
  currency?: string;
  pricePerUnit: string;
  availableAmount: string;
  isActive: boolean;
}

interface VendorProfile {
  userId: string;
  businessName?: string;
  bio?: string;
  country?: string;
  isApproved: boolean;
  subscriptionPlan?: string;
}

export default function ProfilePage() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("id");
  const currentUser = getUser();
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  useEffect(() => {
    setIsOwnProfile(userId === currentUser?.id || !userId);
  }, [userId, currentUser?.id]);

  const { data: userProfile, isLoading: loadingProfile } = useQuery({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await fetchWithAuth(`/api/users/${userId}/profile`);
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: tradeStats, isLoading: loadingStats } = useQuery({
    queryKey: ["user-trades", userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await fetchWithAuth(`/api/users/${userId}/trades`);
      if (!res.ok) throw new Error("Failed to fetch trades");
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: feedbacks } = useQuery({
    queryKey: ["user-feedback", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetchWithAuth(`/api/users/${userId}/feedback`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: activeAds } = useQuery({
    queryKey: ["user-active-ads", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetchWithAuth(`/api/users/${userId}/active-ads`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: vendorProfile } = useQuery({
    queryKey: ["vendor-profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await fetchWithAuth(`/api/vendors/${userId}/profile`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!userId,
  });

  if (!userId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground">Profile not found</p>
        </div>
      </div>
    );
  }

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Skeleton className="h-32 bg-muted mb-4" />
        <Skeleton className="h-64 bg-muted" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => window.history.back()}
            className="p-1"
            data-testid="button-back"
          >
            <ChevronLeft className="h-6 w-6 text-foreground" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">User Profile</h1>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Profile Header Card */}
        {userProfile && (
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  {userProfile.profilePicture ? (
                    <img
                      src={userProfile.profilePicture}
                      alt={userProfile.username}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <User className="h-10 w-10 text-white" />
                  )}
                </div>

                {/* Profile Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <h2 className="text-2xl font-bold text-foreground truncate">
                      {userProfile.username}
                    </h2>
                    {userProfile.isVerified && (
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {userProfile.tier && (
                      <Badge variant="outline">{userProfile.tier}</Badge>
                    )}
                    {userProfile.role === "vendor" && (
                      <Badge className="bg-purple-600">Vendor</Badge>
                    )}
                    {userProfile.role === "customer" && (
                      <Badge className="bg-blue-600">Customer</Badge>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Chat ID: {userProfile.id?.slice(0, 6)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Joined {new Date(userProfile.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Verification Badges */}
                <div className="hidden sm:flex flex-col gap-2 items-end">
                  <div className="flex items-center gap-1 text-xs">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-muted-foreground">Email</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-muted-foreground">SMS</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-muted-foreground">KYC</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        {tradeStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <p className="text-3xl font-bold text-foreground">
                  {tradeStats.totalTrades}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Total Trades
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <p className="text-3xl font-bold text-foreground">
                  {tradeStats.completionRate}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Completion Rate
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <p className="text-3xl font-bold text-foreground">
                  {tradeStats.avgReleaseTime || "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Avg. Release Time
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4">
                <p className="text-3xl font-bold text-foreground">
                  {tradeStats.avgPayTime || "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Avg. Pay Time
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Vendor Info */}
        {vendorProfile && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Store className="h-5 w-5" />
                Vendor Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {vendorProfile.businessName && (
                <div>
                  <p className="text-xs text-muted-foreground">Business Name</p>
                  <p className="text-foreground font-medium">
                    {vendorProfile.businessName}
                  </p>
                </div>
              )}
              {vendorProfile.bio && (
                <div>
                  <p className="text-xs text-muted-foreground">Bio</p>
                  <p className="text-foreground text-sm">{vendorProfile.bio}</p>
                </div>
              )}
              {vendorProfile.country && (
                <div>
                  <p className="text-xs text-muted-foreground">Country</p>
                  <p className="text-foreground">{vendorProfile.country}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge
                  className={
                    vendorProfile.isApproved
                      ? "bg-green-600 text-white"
                      : "bg-yellow-600 text-white"
                  }
                >
                  {vendorProfile.isApproved ? "Approved" : "Pending"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="trades" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-muted">
            <TabsTrigger value="trades" data-testid="tab-trades">
              Active Ads
            </TabsTrigger>
            <TabsTrigger value="feedback" data-testid="tab-feedback">
              Feedback
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trades" className="space-y-4">
            {activeAds && activeAds.length > 0 ? (
              activeAds.map((ad: ActiveAd) => (
                <Card key={ad.id} className="bg-card border-border" data-testid={`ad-card-${ad.id}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <Badge className="mb-2">{ad.type}</Badge>
                        <p className="font-bold text-foreground text-lg">
                          ${ad.pricePerUnit}
                        </p>
                        {ad.currency && (
                          <p className="text-sm text-muted-foreground">
                            {ad.currency} account
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Available: {ad.availableAmount} account
                          {parseInt(ad.availableAmount) !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <Badge
                        className={
                          ad.isActive
                            ? "bg-green-600"
                            : "bg-gray-600"
                        }
                      >
                        {ad.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card className="bg-card border-border">
                <CardContent className="py-12 text-center">
                  <Store className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-muted-foreground">No active ads</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="feedback" className="space-y-4">
            {feedbacks && feedbacks.length > 0 ? (
              feedbacks.map((feedback: Feedback) => (
                <Card
                  key={feedback.id}
                  className="bg-card border-border"
                  data-testid={`feedback-card-${feedback.id}`}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                          {feedback.createdBy[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {feedback.createdBy}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(feedback.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${
                              i < feedback.rating
                                ? "text-yellow-400 fill-yellow-400"
                                : "text-gray-600"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-foreground">{feedback.comment}</p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card className="bg-card border-border">
                <CardContent className="py-12 text-center">
                  <MessageSquare className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-muted-foreground">No feedback yet</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
