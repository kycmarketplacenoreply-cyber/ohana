import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth, getUser } from "@/lib/auth";
import {
  Shield,
  Star,
  Check,
  X,
  User,
  FileText,
  Image,
  Store,
  AlertTriangle,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  Users,
  BarChart3,
  CreditCard,
  Wallet,
  Trash2,
  Ban,
  RefreshCcw,
  DollarSign,
  Settings,
  Power,
  Lock,
  Unlock,
  Clock,
  MessageSquare,
  ArrowDownLeft,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface KycApplication {
  id: string;
  userId: string;
  tier: string;
  status: string;
  idType: string | null;
  idNumber: string | null;
  idDocumentUrl: string | null;
  idFrontUrl: string | null;
  idBackUrl: string | null;
  selfieUrl: string | null;
  faceMatchScore: string | null;
  adminNotes: string | null;
  rejectionReason: string | null;
  submittedAt: string;
  isStarVerified: boolean;
}

interface VendorProfile {
  id: string;
  userId: string;
  businessName: string | null;
  bio: string | null;
  country: string;
  isApproved: boolean;
  createdAt: string;
}

interface DocumentImage {
  url: string;
  label: string;
}

interface PlatformStats {
  totalUsers: number;
  todayUsers: number;
  weekUsers: number;
  monthUsers: number;
  totalBalance: string;
}

interface UserData {
  id: string;
  username: string;
  email: string;
  role: string;
  isFrozen: boolean;
  frozenReason: string | null;
  emailVerified: boolean;
  createdAt: string;
}

interface TransactionData {
  id: string;
  walletId: string;
  userId: string;
  type: string;
  amount: string;
  description: string | null;
  status: string;
  createdAt: string;
}

interface WalletData {
  id: string;
  userId: string;
  currency: string;
  availableBalance: string;
  escrowBalance: string;
}

interface MaintenanceSettings {
  id: string;
  mode: "none" | "full" | "financial" | "trading" | "readonly";
  message: string | null;
  customReason: string | null;
  expectedDowntime: string | null;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
  tradingEnabled: boolean;
  loginEnabled: boolean;
  updatedAt: string;
}

interface WithdrawalRequest {
  id: string;
  userId: string;
  username?: string;
  amount: string;
  currency: string;
  walletAddress: string;
  status: string;
  createdAt: string;
}

interface WalletDashboard {
  masterWalletAddress: string;
  masterWalletUsdtBalance: string;
  masterWalletBnbBalance: string;
  isWalletUnlocked: boolean;
}

function WalletControlsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: walletDashboard, isLoading } = useQuery<WalletDashboard>({
    queryKey: ["admin-wallet-dashboard"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/blockchain/dashboard");
      if (!res.ok) throw new Error("Failed to fetch wallet dashboard");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const unlockWalletMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth("/api/admin/blockchain/unlock-wallet", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to unlock wallet");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Master wallet unlocked", description: "Withdrawals can now be processed" });
      queryClient.invalidateQueries({ queryKey: ["admin-wallet-dashboard"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to unlock wallet", description: error.message, variant: "destructive" });
    },
  });

  const lockWalletMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth("/api/admin/blockchain/lock-wallet", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to lock wallet");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Master wallet locked", description: "Withdrawals are now disabled" });
      queryClient.invalidateQueries({ queryKey: ["admin-wallet-dashboard"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to lock wallet", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <Skeleton className="h-32" />;
  }

  return (
    <div className="space-y-4">
      <div className={`p-4 rounded-lg border ${
        walletDashboard?.isWalletUnlocked 
          ? "bg-green-950/30 border-green-700" 
          : "bg-destructive/10 border-destructive"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {walletDashboard?.isWalletUnlocked ? (
              <Unlock className="h-6 w-6 text-green-600" />
            ) : (
              <Lock className="h-6 w-6 text-destructive" />
            )}
            <div>
              <p className={`font-bold ${walletDashboard?.isWalletUnlocked ? "text-green-600" : "text-destructive"}`}>
                {walletDashboard?.isWalletUnlocked ? "Wallet UNLOCKED" : "Wallet LOCKED"}
              </p>
              <p className="text-muted-foreground text-sm">
                {walletDashboard?.isWalletUnlocked 
                  ? "Withdrawals can be processed" 
                  : "Withdrawals are disabled until wallet is unlocked"}
              </p>
            </div>
          </div>
          {walletDashboard?.isWalletUnlocked ? (
            <Button
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => lockWalletMutation.mutate()}
              disabled={lockWalletMutation.isPending}
              data-testid="button-lock-wallet"
            >
              <Lock className="h-4 w-4 mr-2" />
              Lock Wallet
            </Button>
          ) : (
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => unlockWalletMutation.mutate()}
              disabled={unlockWalletMutation.isPending}
              data-testid="button-unlock-wallet"
            >
              <Unlock className="h-4 w-4 mr-2" />
              Unlock Wallet
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card rounded-lg border border-border">
          <p className="text-muted-foreground text-sm">Master Wallet Address</p>
          <p className="text-foreground font-mono text-xs break-all">{walletDashboard?.masterWalletAddress || "Not configured"}</p>
        </div>
        <div className="p-4 bg-card rounded-lg border border-border">
          <p className="text-muted-foreground text-sm">USDT Balance</p>
          <p className="text-foreground font-bold">{walletDashboard?.masterWalletUsdtBalance || "0.00"} USDT</p>
        </div>
        <div className="p-4 bg-card rounded-lg border border-border">
          <p className="text-muted-foreground text-sm">BNB Balance (Gas)</p>
          <p className="text-foreground font-bold">{walletDashboard?.masterWalletBnbBalance || "0.00"} BNB</p>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = getUser();
  const [selectedKyc, setSelectedKyc] = useState<KycApplication | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedTier, setSelectedTier] = useState("tier1");
  const [viewingDocuments, setViewingDocuments] = useState<KycApplication | null>(null);
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [selectedRole, setSelectedRole] = useState("");
  const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
  const [userToFreeze, setUserToFreeze] = useState<UserData | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [pendingMaintenanceMode, setPendingMaintenanceMode] = useState<string | null>(null);
  const [maintenanceCustomReason, setMaintenanceCustomReason] = useState("");
  const [maintenanceDowntime, setMaintenanceDowntime] = useState("");
  const [hasMaintenanceChanges, setHasMaintenanceChanges] = useState(false);

  const getDocuments = (kyc: KycApplication): DocumentImage[] => {
    const docs: DocumentImage[] = [];
    if (kyc.idDocumentUrl) docs.push({ url: kyc.idDocumentUrl, label: "ID Document" });
    if (kyc.idFrontUrl) docs.push({ url: kyc.idFrontUrl, label: "ID Front" });
    if (kyc.idBackUrl) docs.push({ url: kyc.idBackUrl, label: "ID Back" });
    if (kyc.selfieUrl) docs.push({ url: kyc.selfieUrl, label: "Selfie" });
    return docs;
  };

  const openDocumentViewer = (kyc: KycApplication, startIndex: number = 0) => {
    setViewingDocuments(kyc);
    setCurrentDocIndex(startIndex);
  };

  const closeDocumentViewer = () => {
    setViewingDocuments(null);
    setCurrentDocIndex(0);
  };

  const nextDocument = () => {
    if (viewingDocuments) {
      const docs = getDocuments(viewingDocuments);
      if (docs.length > 0) {
        setCurrentDocIndex((prev) => (prev + 1) % docs.length);
      }
    }
  };

  const prevDocument = () => {
    if (viewingDocuments) {
      const docs = getDocuments(viewingDocuments);
      if (docs.length > 0) {
        setCurrentDocIndex((prev) => (prev - 1 + docs.length) % docs.length);
      }
    }
  };

  if (user?.role !== "admin") {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to access this page.</p>
          </div>
        </div>
      </Layout>
    );
  }

  const { data: pendingKyc, isLoading: loadingKyc } = useQuery({
    queryKey: ["admin-pending-kyc"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/kyc/pending");
      if (!res.ok) throw new Error("Failed to fetch pending KYC");
      return res.json();
    },
  });

  const { data: pendingVendors, isLoading: loadingVendors } = useQuery({
    queryKey: ["admin-pending-vendors"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/vendors/pending");
      if (!res.ok) throw new Error("Failed to fetch pending vendors");
      return res.json();
    },
  });

  const { data: platformStats, isLoading: loadingStats } = useQuery<PlatformStats>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: allUsers, isLoading: loadingUsers } = useQuery<UserData[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const { data: allTransactions, isLoading: loadingTransactions } = useQuery<TransactionData[]>({
    queryKey: ["admin-transactions"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/transactions");
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
  });

  const { data: allWallets, isLoading: loadingWallets } = useQuery<WalletData[]>({
    queryKey: ["admin-wallets"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/wallets");
      if (!res.ok) throw new Error("Failed to fetch wallets");
      const data = await res.json();
      return data.wallets || [];
    },
  });

  const { data: maintenanceSettings, isLoading: loadingMaintenance } = useQuery<MaintenanceSettings>({
    queryKey: ["admin-maintenance"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/maintenance");
      if (!res.ok) throw new Error("Failed to fetch maintenance settings");
      return res.json();
    },
  });

  const { data: pendingWithdrawals, isLoading: loadingWithdrawals } = useQuery<WithdrawalRequest[]>({
    queryKey: ["admin-pending-withdrawals"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/withdrawals");
      if (!res.ok) throw new Error("Failed to fetch withdrawals");
      return res.json();
    },
  });

  const updateMaintenanceMutation = useMutation({
    mutationFn: async (settings: Partial<MaintenanceSettings>) => {
      const res = await fetchWithAuth("/api/admin/maintenance", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to update maintenance settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-maintenance"] });
      toast({ title: "Settings Updated", description: "Maintenance settings have been saved" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to update maintenance settings" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await fetchWithAuth(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error("Failed to change role");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "Role Updated", description: "User role has been changed" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to change user role" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetchWithAuth(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setUserToDelete(null);
      toast({ title: "User Deleted", description: "User has been removed from the platform" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete user" });
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
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setUserToFreeze(null);
      setFreezeReason("");
      toast({ title: "User Frozen", description: "User account has been frozen" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to freeze user" });
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
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "User Unfrozen", description: "User account has been unfrozen" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to unfreeze user" });
    },
  });

  const approveKycMutation = useMutation({
    mutationFn: async ({ id, status, tier, adminNotes, rejectionReason }: { id: string; status: string; tier: string; adminNotes?: string; rejectionReason?: string }) => {
      const res = await fetchWithAuth(`/api/admin/kyc/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ status, tier, adminNotes, rejectionReason }),
      });
      if (!res.ok) throw new Error("Failed to review KYC");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pending-kyc"] });
      setSelectedKyc(null);
      setReviewNotes("");
      setRejectionReason("");
      toast({ title: "KYC Reviewed", description: "The KYC application has been processed" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to process KYC review" });
    },
  });

  const starVerifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchWithAuth(`/api/admin/kyc/${id}/star-verify`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to toggle star verification");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-pending-kyc"] });
      toast({ 
        title: data.isStarVerified ? "Star Verified" : "Star Removed", 
        description: data.isStarVerified ? "User is now star verified" : "Star verification has been removed" 
      });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to toggle star verification" });
    },
  });

  const approveVendorMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchWithAuth(`/api/admin/vendors/${id}/approve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to approve vendor");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pending-vendors"] });
      toast({ title: "Vendor Approved", description: "The vendor has been approved" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to approve vendor" });
    },
  });

  const canApproveKyc = (kyc: KycApplication) => {
    // Accept either: (idFrontUrl + idBackUrl + selfieUrl) OR (idDocumentUrl + selfieUrl)
    const hasAllThree = kyc.idFrontUrl && kyc.idBackUrl && kyc.selfieUrl;
    const hasDocAndSelfie = kyc.idDocumentUrl && kyc.selfieUrl;
    return hasAllThree || hasDocAndSelfie;
  };

  const handleApprove = (kyc: KycApplication) => {
    if (!canApproveKyc(kyc)) {
      toast({ 
        variant: "destructive", 
        title: "Cannot Approve", 
        description: "User must upload required documents (ID document + selfie) before approval" 
      });
      return;
    }
    approveKycMutation.mutate({
      id: kyc.id,
      status: "approved",
      tier: selectedTier,
      adminNotes: reviewNotes,
    });
  };

  const handleReject = (kyc: KycApplication) => {
    if (!rejectionReason.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Please provide a rejection reason" });
      return;
    }
    approveKycMutation.mutate({
      id: kyc.id,
      status: "rejected",
      tier: kyc.tier,
      adminNotes: reviewNotes,
      rejectionReason,
    });
  };

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6 px-2 sm:px-4" data-testid="admin-page">
        <div className="flex items-center gap-2 sm:gap-3">
          <Shield className="h-6 sm:h-8 w-6 sm:w-8 text-primary flex-shrink-0" />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground truncate">Admin Dashboard</h1>
        </div>

        <Tabs defaultValue="stats" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="stats" data-testid="tab-stats">
              <BarChart3 className="h-4 w-4 mr-2" />
              Platform Stats
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="h-4 w-4 mr-2" />
              Users ({allUsers?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="transactions" data-testid="tab-transactions">
              <CreditCard className="h-4 w-4 mr-2" />
              Transactions
            </TabsTrigger>
            <TabsTrigger value="wallets" data-testid="tab-wallets">
              <Wallet className="h-4 w-4 mr-2" />
              Wallets
            </TabsTrigger>
            <TabsTrigger value="kyc" data-testid="tab-kyc">
              <FileText className="h-4 w-4 mr-2" />
              KYC ({pendingKyc?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="vendors" data-testid="tab-vendors">
              <Store className="h-4 w-4 mr-2" />
              Vendors ({pendingVendors?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="withdrawals" data-testid="tab-withdrawals">
              <ArrowDownLeft className="h-4 w-4 mr-2" />
              Withdrawals ({pendingWithdrawals?.filter((w: WithdrawalRequest) => w.status === "pending").length || 0})
            </TabsTrigger>
            <TabsTrigger value="maintenance" data-testid="tab-maintenance">
              <Settings className="h-4 w-4 mr-2" />
              Maintenance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="space-y-4">
            {loadingStats ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <Users className="h-10 w-10 text-primary" />
                      <div>
                        <p className="text-muted-foreground text-sm">Total Users</p>
                        <p className="text-3xl font-bold text-foreground" data-testid="stat-total-users">{platformStats?.totalUsers || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-green-50/10 border-green-200/20 dark:bg-green-950/30 dark:border-green-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <User className="h-10 w-10 text-green-600 dark:text-green-400" />
                      <div>
                        <p className="text-muted-foreground text-sm">Today</p>
                        <p className="text-3xl font-bold text-foreground" data-testid="stat-today-users">{platformStats?.todayUsers || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50/10 border-purple-200/20 dark:bg-purple-950/30 dark:border-purple-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <User className="h-10 w-10 text-purple-600 dark:text-purple-400" />
                      <div>
                        <p className="text-muted-foreground text-sm">This Week</p>
                        <p className="text-3xl font-bold text-foreground" data-testid="stat-week-users">{platformStats?.weekUsers || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-orange-50/10 border-orange-200/20 dark:bg-orange-950/30 dark:border-orange-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <User className="h-10 w-10 text-orange-600 dark:text-orange-400" />
                      <div>
                        <p className="text-muted-foreground text-sm">This Month</p>
                        <p className="text-3xl font-bold text-foreground" data-testid="stat-month-users">{platformStats?.monthUsers || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-cyan-50/10 border-cyan-200/20 dark:bg-cyan-950/30 dark:border-cyan-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <DollarSign className="h-10 w-10 text-cyan-600 dark:text-cyan-400" />
                      <div>
                        <p className="text-muted-foreground text-sm">Total Balance</p>
                        <p className="text-2xl font-bold text-foreground" data-testid="stat-total-balance">${platformStats?.totalBalance || "0.00"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  User Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingUsers ? (
                  <Skeleton className="h-64" />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-muted-foreground">Username</TableHead>
                          <TableHead className="text-muted-foreground">Email</TableHead>
                          <TableHead className="text-muted-foreground">Role</TableHead>
                          <TableHead className="text-muted-foreground">Status</TableHead>
                          <TableHead className="text-muted-foreground">Joined</TableHead>
                          <TableHead className="text-muted-foreground">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allUsers?.map((userData: UserData) => (
                          <TableRow key={userData.id} data-testid={`user-row-${userData.id}`}>
                            <TableCell className="text-foreground font-medium">{userData.username}</TableCell>
                            <TableCell className="text-muted-foreground">{userData.email}</TableCell>
                            <TableCell>
                              <Select
                                value={userData.role}
                                onValueChange={(role) => {
                                  // Prevent demoting admins
                                  if (userData.role === "admin") {
                                    toast({ variant: "destructive", title: "Error", description: "Admin accounts cannot be demoted or changed" });
                                    return;
                                  }
                                  changeRoleMutation.mutate({ userId: userData.id, role });
                                }}
                                disabled={userData.role === "admin"}
                              >
                                <SelectTrigger className={`w-32 ${userData.role === "admin" ? "bg-muted border-border cursor-not-allowed opacity-70" : "bg-card border-border"}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {userData.role === "customer" && (
                                    <>
                                      <SelectItem value="customer">Customer</SelectItem>
                                      <SelectItem value="vendor">Vendor</SelectItem>
                                    </>
                                  )}
                                  {userData.role === "vendor" && (
                                    <>
                                      <SelectItem value="customer">Customer</SelectItem>
                                      <SelectItem value="vendor">Vendor</SelectItem>
                                    </>
                                  )}
                                  {userData.role !== "customer" && userData.role !== "vendor" && userData.role !== "admin" && (
                                    <>
                                      <SelectItem value="customer">Customer</SelectItem>
                                      <SelectItem value="vendor">Vendor</SelectItem>
                                      <SelectItem value="support">Support</SelectItem>
                                      <SelectItem value="finance_manager">Finance</SelectItem>
                                      <SelectItem value="dispute_admin">Dispute Admin</SelectItem>
                                    </>
                                  )}
                                  {userData.role === "admin" && (
                                    <SelectItem value="admin" disabled>Admin (Cannot Change)</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              {userData.isFrozen ? (
                                <Badge variant="destructive">Frozen</Badge>
                              ) : (
                                <Badge className="bg-green-600">Active</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(userData.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                {userData.isFrozen ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-green-600 text-green-400 hover:bg-green-600/20"
                                    onClick={() => unfreezeUserMutation.mutate(userData.id)}
                                    data-testid={`button-unfreeze-${userData.id}`}
                                  >
                                    <RefreshCcw className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-yellow-600 text-yellow-400 hover:bg-yellow-600/20"
                                        onClick={() => setUserToFreeze(userData)}
                                        data-testid={`button-freeze-${userData.id}`}
                                      >
                                        <Ban className="h-4 w-4" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle className="text-foreground">Freeze User: {userData.username}</DialogTitle>
                                        <DialogDescription className="text-muted-foreground">
                                          This will prevent the user from logging in or performing any actions.
                                        </DialogDescription>
                                      </DialogHeader>
                                      <div className="space-y-4">
                                        <div className="space-y-2">
                                          <Label className="text-muted-foreground">Reason for freezing</Label>
                                          <Textarea
                                            value={freezeReason}
                                            onChange={(e) => setFreezeReason(e.target.value)}
                                            placeholder="Enter reason..."
                                          />
                                        </div>
                                      </div>
                                      <DialogFooter>
                                        <DialogClose asChild>
                                          <Button variant="outline">Cancel</Button>
                                        </DialogClose>
                                        <Button
                                          variant="destructive"
                                          onClick={() => freezeUserMutation.mutate({ userId: userData.id, reason: freezeReason })}
                                          disabled={!freezeReason.trim()}
                                        >
                                          Freeze User
                                        </Button>
                                      </DialogFooter>
                                    </DialogContent>
                                  </Dialog>
                                )}
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => setUserToDelete(userData)}
                                      data-testid={`button-delete-${userData.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle className="text-foreground">Delete User: {userData.username}</DialogTitle>
                                      <DialogDescription className="text-muted-foreground">
                                        This action cannot be undone. The user and all associated data will be permanently deleted.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter>
                                      <DialogClose asChild>
                                        <Button variant="outline">Cancel</Button>
                                      </DialogClose>
                                      <Button
                                        variant="destructive"
                                        onClick={() => deleteUserMutation.mutate(userData.id)}
                                      >
                                        Delete User
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  All Transactions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingTransactions ? (
                  <Skeleton className="h-64" />
                ) : allTransactions?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No transactions found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-muted-foreground">ID</TableHead>
                          <TableHead className="text-muted-foreground">Type</TableHead>
                          <TableHead className="text-muted-foreground">Amount</TableHead>
                          <TableHead className="text-muted-foreground">Status</TableHead>
                          <TableHead className="text-muted-foreground">Description</TableHead>
                          <TableHead className="text-muted-foreground">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allTransactions?.slice(0, 50).map((tx: TransactionData) => (
                          <TableRow key={tx.id} data-testid={`tx-row-${tx.id}`}>
                            <TableCell className="text-muted-foreground font-mono text-xs">{tx.id.slice(0, 8)}...</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                tx.type === "deposit" ? "bg-green-500/10 text-green-400 border-green-500" :
                                tx.type === "withdrawal" ? "bg-red-500/10 text-red-400 border-red-500" :
                                "bg-blue-500/10 text-blue-400 border-blue-500"
                              }>
                                {tx.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-foreground font-medium">${tx.amount}</TableCell>
                            <TableCell>
                              <Badge className={
                                tx.status === "completed" ? "bg-green-600" :
                                tx.status === "pending" ? "bg-yellow-600" :
                                "bg-red-600"
                              }>
                                {tx.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground max-w-xs truncate">{tx.description || "-"}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(tx.createdAt).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wallets" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  All Wallets
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingWallets ? (
                  <Skeleton className="h-64" />
                ) : allWallets?.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No wallets found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-muted-foreground">Wallet ID</TableHead>
                          <TableHead className="text-muted-foreground">Currency</TableHead>
                          <TableHead className="text-muted-foreground">Available</TableHead>
                          <TableHead className="text-muted-foreground">In Escrow</TableHead>
                          <TableHead className="text-muted-foreground">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allWallets?.map((wallet: WalletData) => (
                          <TableRow key={wallet.id} data-testid={`wallet-row-${wallet.id}`}>
                            <TableCell className="text-muted-foreground font-mono text-xs">{wallet.id.slice(0, 8)}...</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500">
                                {wallet.currency}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-green-400 font-medium">${wallet.availableBalance}</TableCell>
                            <TableCell className="text-yellow-400 font-medium">${wallet.escrowBalance}</TableCell>
                            <TableCell className="text-foreground font-bold">
                              ${(parseFloat(wallet.availableBalance) + parseFloat(wallet.escrowBalance)).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="kyc" className="space-y-4">
            {loadingKyc ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            ) : pendingKyc?.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">No pending KYC applications</p>
                </CardContent>
              </Card>
            ) : (
              pendingKyc?.map((kyc: KycApplication) => (
                <Card key={kyc.id} data-testid={`kyc-card-${kyc.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-foreground flex items-center gap-2">
                        <User className="h-5 w-5" />
                        KYC Application
                        {kyc.isStarVerified && (
                          <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500">
                          {kyc.status}
                        </Badge>
                        <Badge variant="outline">{kyc.tier}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">ID Type</p>
                        <p className="text-foreground">{kyc.idType || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">ID Number</p>
                        <p className="text-foreground">{kyc.idNumber || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Face Match Score</p>
                        <p className="text-foreground">{kyc.faceMatchScore ? `${kyc.faceMatchScore}%` : "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Submitted</p>
                        <p className="text-foreground">{new Date(kyc.submittedAt).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {kyc.idDocumentUrl && (
                        <div className="space-y-2">
                          <p className="text-muted-foreground text-sm flex items-center gap-1">
                            <Image className="h-4 w-4" />
                            ID Document
                          </p>
                          <div 
                            className="relative group cursor-pointer"
                            onClick={() => openDocumentViewer(kyc, 0)}
                          >
                            <img 
                              src={kyc.idDocumentUrl} 
                              alt="ID Document" 
                              className="w-full h-40 object-cover rounded-lg border border-border transition-all group-hover:opacity-80"
                              data-testid={`kyc-id-document-${kyc.id}`}
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="bg-black/60 rounded-full p-3">
                                <ZoomIn className="h-6 w-6 text-white" />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        <p className="text-muted-foreground text-sm flex items-center gap-1">
                          <Image className="h-4 w-4" />
                          ID Front
                        </p>
                        {kyc.idFrontUrl ? (
                          <div 
                            className="relative group cursor-pointer"
                            onClick={() => openDocumentViewer(kyc, kyc.idDocumentUrl ? 1 : 0)}
                          >
                            <img 
                              src={kyc.idFrontUrl} 
                              alt="ID Front" 
                              className="w-full h-40 object-cover rounded-lg border border-border transition-all group-hover:opacity-80"
                              data-testid={`kyc-id-front-${kyc.id}`}
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="bg-black/60 rounded-full p-3">
                                <ZoomIn className="h-6 w-6 text-white" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-40 bg-muted rounded-lg flex items-center justify-center border border-border">
                            <p className="text-muted-foreground text-sm">Not uploaded</p>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <p className="text-muted-foreground text-sm flex items-center gap-1">
                          <Image className="h-4 w-4" />
                          ID Back
                        </p>
                        {kyc.idBackUrl ? (
                          <div 
                            className="relative group cursor-pointer"
                            onClick={() => {
                              let idx = 0;
                              if (kyc.idDocumentUrl) idx++;
                              if (kyc.idFrontUrl) idx++;
                              openDocumentViewer(kyc, idx);
                            }}
                          >
                            <img 
                              src={kyc.idBackUrl} 
                              alt="ID Back" 
                              className="w-full h-40 object-cover rounded-lg border border-border transition-all group-hover:opacity-80"
                              data-testid={`kyc-id-back-${kyc.id}`}
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="bg-black/60 rounded-full p-3">
                                <ZoomIn className="h-6 w-6 text-white" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-40 bg-muted rounded-lg flex items-center justify-center border border-border">
                            <p className="text-muted-foreground text-sm">Not uploaded</p>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <p className="text-muted-foreground text-sm flex items-center gap-1">
                          <User className="h-4 w-4" />
                          Selfie
                        </p>
                        {kyc.selfieUrl ? (
                          <div 
                            className="relative group cursor-pointer"
                            onClick={() => {
                              let idx = 0;
                              if (kyc.idDocumentUrl) idx++;
                              if (kyc.idFrontUrl) idx++;
                              if (kyc.idBackUrl) idx++;
                              openDocumentViewer(kyc, idx);
                            }}
                          >
                            <img 
                              src={kyc.selfieUrl} 
                              alt="Selfie" 
                              className="w-full h-40 object-cover rounded-lg border border-border transition-all group-hover:opacity-80"
                              data-testid={`kyc-selfie-${kyc.id}`}
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="bg-black/60 rounded-full p-3">
                                <ZoomIn className="h-6 w-6 text-white" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-40 bg-muted rounded-lg flex items-center justify-center border border-border">
                            <p className="text-muted-foreground text-sm">Not uploaded</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button 
                      variant="outline" 
                      className="w-full border-gray-700 mt-2"
                      onClick={() => openDocumentViewer(kyc)}
                      disabled={!canApproveKyc(kyc)}
                      data-testid={`button-view-documents-${kyc.id}`}
                    >
                      <ZoomIn className="h-4 w-4 mr-2" />
                      View All Documents
                    </Button>

                    {!canApproveKyc(kyc) && (
                      <div className="p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg mb-4">
                        <p className="text-yellow-400 text-sm flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Cannot approve: User must upload required documents (ID document + selfie)
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-800">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            className={canApproveKyc(kyc) ? "bg-green-600 hover:bg-green-700" : "bg-gray-600 cursor-not-allowed"} 
                            onClick={() => setSelectedKyc(kyc)}
                            disabled={!canApproveKyc(kyc)}
                            data-testid={`button-approve-kyc-${kyc.id}`}
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Approve
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-gray-900 border-gray-800">
                          <DialogHeader>
                            <DialogTitle className="text-white">Approve KYC</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-gray-400">Verification Tier</Label>
                              <Select value={selectedTier} onValueChange={setSelectedTier}>
                                <SelectTrigger className="bg-gray-800 border-gray-700">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-800 border-gray-700">
                                  <SelectItem value="tier1">Tier 1</SelectItem>
                                  <SelectItem value="tier2">Tier 2</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-gray-400">Admin Notes (optional)</Label>
                              <Textarea 
                                value={reviewNotes}
                                onChange={(e) => setReviewNotes(e.target.value)}
                                placeholder="Add any notes..."
                                className="bg-gray-800 border-gray-700"
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline" className="border-gray-700">Cancel</Button>
                            </DialogClose>
                            <Button 
                              className={canApproveKyc(kyc) ? "bg-green-600 hover:bg-green-700" : "bg-gray-600 cursor-not-allowed"}
                              onClick={() => handleApprove(kyc)}
                              disabled={approveKycMutation.isPending || !canApproveKyc(kyc)}
                              data-testid="button-confirm-approve"
                            >
                              Confirm Approval
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="destructive"
                            onClick={() => setSelectedKyc(kyc)}
                            data-testid={`button-reject-kyc-${kyc.id}`}
                          >
                            <X className="h-4 w-4 mr-2" />
                            Reject
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-gray-900 border-gray-800">
                          <DialogHeader>
                            <DialogTitle className="text-white">Reject KYC</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-gray-400">Rejection Reason (required)</Label>
                              <Textarea 
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Explain why this KYC is being rejected..."
                                className="bg-gray-800 border-gray-700"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-gray-400">Admin Notes (optional)</Label>
                              <Textarea 
                                value={reviewNotes}
                                onChange={(e) => setReviewNotes(e.target.value)}
                                placeholder="Internal notes..."
                                className="bg-gray-800 border-gray-700"
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline" className="border-gray-700">Cancel</Button>
                            </DialogClose>
                            <Button 
                              variant="destructive"
                              onClick={() => handleReject(kyc)}
                              disabled={approveKycMutation.isPending}
                              data-testid="button-confirm-reject"
                            >
                              Confirm Rejection
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Button 
                        variant="outline" 
                        className={`border-gray-700 ${kyc.isStarVerified ? 'text-yellow-500' : ''}`}
                        onClick={() => starVerifyMutation.mutate(kyc.id)}
                        disabled={starVerifyMutation.isPending}
                        data-testid={`button-star-verify-${kyc.id}`}
                      >
                        <Star className={`h-4 w-4 mr-2 ${kyc.isStarVerified ? 'fill-yellow-500' : ''}`} />
                        {kyc.isStarVerified ? 'Remove Star' : 'Star Verify'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="vendors" className="space-y-4">
            {loadingVendors ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : pendingVendors?.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">No pending vendor applications</p>
                </CardContent>
              </Card>
            ) : (
              pendingVendors?.map((vendor: VendorProfile) => (
                <Card key={vendor.id} data-testid={`vendor-card-${vendor.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-foreground flex items-center gap-2">
                        <Store className="h-5 w-5" />
                        {vendor.businessName || "Unnamed Vendor"}
                      </CardTitle>
                      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500">
                        Pending Approval
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Country</p>
                        <p className="text-foreground">{vendor.country}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Applied</p>
                        <p className="text-foreground">{new Date(vendor.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="md:col-span-1 col-span-2">
                        <p className="text-muted-foreground">Bio</p>
                        <p className="text-foreground">{vendor.bio || "No bio provided"}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-border">
                      <Button 
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => approveVendorMutation.mutate(vendor.id)}
                        disabled={approveVendorMutation.isPending}
                        data-testid={`button-approve-vendor-${vendor.id}`}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Approve Vendor
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="withdrawals" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <ArrowDownLeft className="h-5 w-5" />
                  Pending Withdrawals
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingWithdrawals ? (
                  <Skeleton className="h-64" />
                ) : !pendingWithdrawals || pendingWithdrawals.length === 0 ? (
                  <div className="text-center py-12">
                    <ArrowDownLeft className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                    <p className="text-muted-foreground">No withdrawal requests</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-muted-foreground">Username</TableHead>
                          <TableHead className="text-muted-foreground">Amount</TableHead>
                          <TableHead className="text-muted-foreground">Currency</TableHead>
                          <TableHead className="text-muted-foreground">Wallet Address</TableHead>
                          <TableHead className="text-muted-foreground">Status</TableHead>
                          <TableHead className="text-muted-foreground">Requested</TableHead>
                          <TableHead className="text-muted-foreground">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingWithdrawals.map((withdrawal: WithdrawalRequest) => (
                          <TableRow key={withdrawal.id} data-testid={`withdrawal-row-${withdrawal.id}`}>
                            <TableCell className="text-foreground font-medium">{withdrawal.username || withdrawal.userId}</TableCell>
                            <TableCell className="text-foreground font-bold">{withdrawal.amount}</TableCell>
                            <TableCell className="text-muted-foreground">{withdrawal.currency}</TableCell>
                            <TableCell className="text-muted-foreground font-mono text-xs break-all max-w-xs">{withdrawal.walletAddress}</TableCell>
                            <TableCell>
                              <Badge className={
                                withdrawal.status === "pending" ? "bg-yellow-600" :
                                withdrawal.status === "approved" ? "bg-green-600" :
                                "bg-red-600"
                              }>
                                {withdrawal.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {new Date(withdrawal.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              {withdrawal.status === "pending" && (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-xs"
                                    data-testid={`button-approve-withdrawal-${withdrawal.id}`}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="text-xs"
                                    data-testid={`button-reject-withdrawal-${withdrawal.id}`}
                                  >
                                    Reject
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="maintenance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Platform Maintenance Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {loadingMaintenance ? (
                  <Skeleton className="h-64" />
                ) : (
                  <>
                    {/* Current Status Banner */}
                    <div className={`p-4 rounded-lg border ${
                      maintenanceSettings?.mode === "none" 
                        ? "bg-green-950/30 border-green-700" 
                        : "bg-destructive/10 border-destructive"
                    }`}>
                      <div className="flex items-center gap-3">
                        {maintenanceSettings?.mode === "none" ? (
                          <Unlock className="h-6 w-6 text-green-600" />
                        ) : (
                          <Lock className="h-6 w-6 text-destructive" />
                        )}
                        <div>
                          <p className={`font-bold ${maintenanceSettings?.mode === "none" ? "text-green-600" : "text-destructive"}`}>
                            {maintenanceSettings?.mode === "none" ? "Platform is ONLINE" : "Platform is in MAINTENANCE MODE"}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {maintenanceSettings?.mode === "none" 
                              ? "All features are operational" 
                              : `Mode: ${maintenanceSettings?.mode?.toUpperCase()} - ${maintenanceSettings?.customReason || "No reason specified"}`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Maintenance Mode Selection with Confirmation */}
                    <div className="space-y-3">
                      <Label className="text-foreground text-lg font-semibold">Maintenance Mode</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                        {[
                          { value: "none", label: "None (Online)", desc: "Everything works normally", color: "green" },
                          { value: "trading", label: "Trading/Order Maintenance", desc: "Orders disabled, wallet & login work", color: "yellow" },
                          { value: "financial", label: "Financial Maintenance", desc: "Deposits & withdrawals disabled only", color: "orange" },
                          { value: "readonly", label: "Read-Only Mode", desc: "Emergency: view only, no actions", color: "blue" },
                          { value: "full", label: "Full Maintenance", desc: "Login disabled, super-admin only", color: "red" },
                        ].map((mode) => (
                          <button
                            key={mode.value}
                            onClick={() => {
                              if (mode.value !== "none" && maintenanceSettings?.mode === "none") {
                                setPendingMaintenanceMode(mode.value);
                              } else {
                                updateMaintenanceMutation.mutate({ mode: mode.value as any });
                              }
                            }}
                            disabled={updateMaintenanceMutation.isPending}
                            className={`p-4 rounded-lg border-2 text-left transition-all ${
                              maintenanceSettings?.mode === mode.value
                                ? mode.value === "none" ? "border-green-500 bg-green-950/30" : "border-red-500 bg-destructive/10"
                                : "border-border bg-card/50 hover:border-primary"
                            }`}
                            data-testid={`maintenance-mode-${mode.value}`}
                          >
                            <p className={`font-bold ${maintenanceSettings?.mode === mode.value ? (mode.value === "none" ? "text-green-600" : "text-destructive") : "text-foreground"}`}>
                              {mode.label}
                            </p>
                            <p className="text-muted-foreground text-xs mt-1">{mode.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Message */}
                    <div className="space-y-3">
                      <Label className="text-foreground">Custom Reason / Message for Users</Label>
                      <Textarea
                        placeholder="We are upgrading our systems to improve security and performance..."
                        value={maintenanceCustomReason || maintenanceSettings?.customReason || ""}
                        onChange={(e) => {
                          setMaintenanceCustomReason(e.target.value);
                          setHasMaintenanceChanges(true);
                        }}
                        data-testid="maintenance-custom-reason"
                      />
                    </div>

                    {/* Expected Downtime */}
                    <div className="space-y-3">
                      <Label className="text-foreground">Expected Downtime</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="e.g., 2 hours, 30 minutes"
                          className="max-w-xs"
                          value={maintenanceDowntime || maintenanceSettings?.expectedDowntime || ""}
                          onChange={(e) => {
                            setMaintenanceDowntime(e.target.value);
                            setHasMaintenanceChanges(true);
                          }}
                          data-testid="maintenance-expected-downtime"
                        />
                        <Clock className="h-10 w-10 text-muted-foreground" />
                      </div>
                    </div>

                    {/* Save Button for Custom Message and Downtime */}
                    <div className="flex gap-3">
                      <Button
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                          updateMaintenanceMutation.mutate({
                            customReason: maintenanceCustomReason || maintenanceSettings?.customReason || "",
                            expectedDowntime: maintenanceDowntime || maintenanceSettings?.expectedDowntime || "",
                          });
                          setHasMaintenanceChanges(false);
                        }}
                        disabled={updateMaintenanceMutation.isPending || !hasMaintenanceChanges}
                        data-testid="button-save-maintenance-settings"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Save Message & Downtime
                      </Button>
                      {hasMaintenanceChanges && (
                        <p className="text-yellow-400 text-sm flex items-center">
                          <MessageSquare className="h-4 w-4 mr-1" />
                          You have unsaved changes
                        </p>
                      )}
                    </div>

                    {/* Feature Toggles */}
                    <div className="space-y-4">
                      <Label className="text-foreground text-lg font-semibold">Feature Controls</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { key: "loginEnabled", label: "Login Enabled", desc: "Allow users to log in" },
                          { key: "depositsEnabled", label: "Deposits Enabled", desc: "Allow deposits to wallets" },
                          { key: "withdrawalsEnabled", label: "Withdrawals Enabled", desc: "Allow withdrawals from wallets" },
                          { key: "tradingEnabled", label: "Trading Enabled", desc: "Allow creating new orders" },
                          { key: "autoWithdrawalEnabled", label: "Automatic Withdrawals", desc: "Enable instant withdrawals without admin approval" },
                          { key: "kycRequired", label: "KYC Requirement", desc: "Require KYC verification to post ads" },
                        ].map((feature) => (
                          <div key={feature.key} className="flex items-center justify-between p-4 bg-muted rounded-lg border border-border">
                            <div>
                              <p className="text-foreground font-medium">{feature.label}</p>
                              <p className="text-muted-foreground text-sm">{feature.desc}</p>
                            </div>
                            <Switch
                              checked={(maintenanceSettings as any)?.[feature.key] ?? (feature.key === "loginEnabled" || feature.key === "depositsEnabled" || feature.key === "withdrawalsEnabled" || feature.key === "tradingEnabled")}
                              onCheckedChange={(checked) => updateMaintenanceMutation.mutate({ [feature.key]: checked })}
                              data-testid={`toggle-${feature.key}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Preview Message */}
                    {maintenanceSettings?.mode !== "none" && (
                      <div className="space-y-3">
                        <Label className="text-foreground text-lg font-semibold">User Preview</Label>
                        <div className="p-6 bg-card rounded-lg border border-border">
                          <div className="text-center space-y-4">
                            <div className="text-5xl">🚧</div>
                            <h3 className="text-2xl font-bold text-foreground">Platform Under Maintenance</h3>
                            <p className="text-muted-foreground">{maintenanceCustomReason || maintenanceSettings?.customReason || "We are upgrading our systems to improve security and performance."}</p>
                            {(maintenanceDowntime || maintenanceSettings?.expectedDowntime) && (
                              <div className="flex items-center justify-center gap-2 text-yellow-400">
                                <Clock className="h-5 w-5" />
                                <span>Estimated time: {maintenanceDowntime || maintenanceSettings?.expectedDowntime}</span>
                              </div>
                            )}
                            <div className="flex flex-wrap justify-center gap-2 pt-4">
                              {!maintenanceSettings?.depositsEnabled && (
                                <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500">Deposits Disabled</Badge>
                              )}
                              {!maintenanceSettings?.withdrawalsEnabled && (
                                <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500">Withdrawals Disabled</Badge>
                              )}
                              {!maintenanceSettings?.tradingEnabled && (
                                <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500">Trading Disabled</Badge>
                              )}
                              {!maintenanceSettings?.loginEnabled && (
                                <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500">Login Disabled</Badge>
                              )}
                            </div>
                            <p className="text-gray-500 text-sm">Thank you for your patience.</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Last Updated */}
                    {maintenanceSettings?.updatedAt && (
                      <p className="text-gray-500 text-sm">
                        Last updated: {new Date(maintenanceSettings.updatedAt).toLocaleString()}
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Master Wallet Controls */}
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Master Wallet Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <WalletControlsSection />
              </CardContent>
            </Card>

            {/* Confirmation Dialog for Enabling Maintenance */}
            <Dialog open={!!pendingMaintenanceMode} onOpenChange={() => setPendingMaintenanceMode(null)}>
              <DialogContent className="bg-gray-900 border-gray-800">
                <DialogHeader>
                  <DialogTitle className="text-white flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    Enable Maintenance Mode?
                  </DialogTitle>
                  <DialogDescription className="text-gray-400">
                    This will affect all users on the platform. Make sure you have notified your team before proceeding.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg">
                    <p className="text-yellow-400 text-sm">
                      <strong>Warning:</strong> Enabling {pendingMaintenanceMode === "full" ? "Full Maintenance" : 
                        pendingMaintenanceMode === "financial" ? "Financial Maintenance" :
                        pendingMaintenanceMode === "trading" ? "Trading Maintenance" : "Read-Only Mode"} 
                      {" "}will restrict user access to the platform.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-400">Reason for maintenance (optional):</Label>
                    <Textarea
                      placeholder="Scheduled system upgrade..."
                      className="bg-gray-800 border-gray-700 text-white"
                      value={maintenanceCustomReason}
                      onChange={(e) => setMaintenanceCustomReason(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline" className="border-gray-700">Cancel</Button>
                  </DialogClose>
                  <Button 
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => {
                      updateMaintenanceMutation.mutate({ 
                        mode: pendingMaintenanceMode as any,
                        customReason: maintenanceCustomReason || undefined
                      });
                      setPendingMaintenanceMode(null);
                    }}
                    disabled={updateMaintenanceMutation.isPending}
                    data-testid="button-confirm-maintenance"
                  >
                    <Power className="h-4 w-4 mr-2" />
                    Enable Maintenance
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>

        <Dialog open={!!viewingDocuments} onOpenChange={() => closeDocumentViewer()}>
          <DialogContent className="bg-gray-900 border-gray-800 max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <FileText className="h-5 w-5" />
                KYC Documents Review
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                Review all uploaded verification documents
              </DialogDescription>
            </DialogHeader>
            {viewingDocuments && (
              <div className="space-y-4">
                <div className="relative">
                  {(() => {
                    const docs = getDocuments(viewingDocuments);
                    const currentDoc = docs[currentDocIndex];
                    return (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <Badge className="bg-blue-600">
                            {currentDoc?.label} ({currentDocIndex + 1}/{docs.length})
                          </Badge>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-gray-700"
                              onClick={prevDocument}
                              disabled={docs.length <= 1}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-gray-700"
                              onClick={nextDocument}
                              disabled={docs.length <= 1}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {currentDoc && (
                          <div className="flex justify-center bg-gray-800 rounded-lg p-4">
                            <img
                              src={currentDoc.url}
                              alt={currentDoc.label}
                              className="max-h-[60vh] max-w-full object-contain rounded-lg"
                              data-testid="document-viewer-image"
                            />
                          </div>
                        )}
                        <div className="flex gap-2 mt-4 justify-center">
                          {docs.map((doc, idx) => (
                            <button
                              key={idx}
                              onClick={() => setCurrentDocIndex(idx)}
                              className={`w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                                idx === currentDocIndex 
                                  ? 'border-blue-500' 
                                  : 'border-gray-700 opacity-60 hover:opacity-100'
                              }`}
                            >
                              <img
                                src={doc.url}
                                alt={doc.label}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm p-4 bg-gray-800/50 rounded-lg">
                  <div>
                    <p className="text-gray-400">ID Type</p>
                    <p className="text-white">{viewingDocuments.idType || "Not provided"}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">ID Number</p>
                    <p className="text-white">{viewingDocuments.idNumber || "Not provided"}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Face Match</p>
                    <p className="text-white">{viewingDocuments.faceMatchScore ? `${viewingDocuments.faceMatchScore}%` : "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Status</p>
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500">
                      {viewingDocuments.status}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" className="border-gray-700" onClick={closeDocumentViewer}>
                Close
              </Button>
              {viewingDocuments && canApproveKyc(viewingDocuments) && (
                <Button 
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    handleApprove(viewingDocuments);
                    closeDocumentViewer();
                  }}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Approve KYC
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
