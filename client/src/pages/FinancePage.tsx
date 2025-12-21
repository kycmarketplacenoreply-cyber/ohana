import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth, getUser } from "@/lib/auth";
import { useLocation } from "wouter";
import {
  DollarSign,
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  X,
  User,
  Search,
  Ban,
  Unlock,
  AlertTriangle,
  Clock,
  Wallet,
  TrendingUp,
  Eye,
  History,
  Banknote,
  Flag,
  CreditCard,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

interface WithdrawalRequest {
  id: string;
  userId: string;
  username?: string;
  amount: string;
  currency: string;
  status: string;
  walletAddress: string | null;
  network: string | null;
  createdAt: string;
  userFrozen?: boolean;
  inDispute?: boolean;
}

interface UserWithWallet {
  id: string;
  username: string;
  email: string;
  role: string;
  isFrozen: boolean;
  frozenReason: string | null;
  wallet: {
    availableBalance: string;
    escrowBalance: string;
  } | null;
  transactions: Transaction[];
}

interface Transaction {
  id: string;
  type: string;
  amount: string;
  currency: string;
  description: string | null;
  createdAt: string;
  walletId?: string;
  userId?: string;
  status?: string;
}

interface PlatformStats {
  totalUsers: number;
  totalBalance: string;
  pendingWithdrawals: string;
  todayWithdrawals: string;
}

export default function FinancePage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = getUser();
  const [, setLocation] = useLocation();
  const [searchUsername, setSearchUsername] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserWithWallet | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [flagReason, setFlagReason] = useState("");
  const [shouldFreezeOnFlag, setShouldFreezeOnFlag] = useState(false);

  if (user?.role !== "finance_manager" && user?.role !== "admin") {
    setLocation("/");
    return null;
  }

  const { data: pendingWithdrawals, isLoading: loadingWithdrawals } = useQuery({
    queryKey: ["finance-pending-withdrawals"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/finance/withdrawals/pending");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["finance-stats"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/finance/stats");
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: searchedUser, isLoading: searchingUser, refetch: searchUser } = useQuery({
    queryKey: ["finance-search-user", searchUsername],
    queryFn: async () => {
      if (!searchUsername.trim()) return null;
      const res = await fetchWithAuth(`/api/finance/user/search?username=${encodeURIComponent(searchUsername)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: false,
  });

  const { data: allTransactions, isLoading: loadingTransactions } = useQuery<Transaction[]>({
    queryKey: ["finance-all-transactions"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/finance/transactions");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const flagUserMutation = useMutation({
    mutationFn: async ({ userId, reason, shouldFreeze }: { userId: string; reason: string; shouldFreeze: boolean }) => {
      const res = await fetchWithAuth(`/api/finance/users/${userId}/flag`, {
        method: "POST",
        body: JSON.stringify({ reason, shouldFreeze }),
      });
      if (!res.ok) throw new Error("Failed to flag user");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["finance-search-user", searchUsername] });
      queryClient.invalidateQueries({ queryKey: ["finance-pending-withdrawals"] });
      toast({ 
        title: "User Flagged", 
        description: data.frozen ? "User has been flagged and account frozen" : "User has been flagged for review" 
      });
      setFlagReason("");
      setShouldFreezeOnFlag(false);
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to flag user" });
    },
  });

  const approveWithdrawalMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchWithAuth(`/api/finance/withdrawals/${id}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to approve withdrawal");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-pending-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["finance-stats"] });
      toast({ title: "Withdrawal Approved", description: "The withdrawal has been processed" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const rejectWithdrawalMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetchWithAuth(`/api/finance/withdrawals/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Failed to reject withdrawal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-pending-withdrawals"] });
      toast({ title: "Withdrawal Rejected", description: "The withdrawal has been rejected and funds returned" });
      setRejectReason("");
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to reject withdrawal" });
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
      queryClient.invalidateQueries({ queryKey: ["finance-search-user", searchUsername] });
      queryClient.invalidateQueries({ queryKey: ["finance-pending-withdrawals"] });
      toast({ title: "User Frozen", description: "Account has been frozen" });
      setFreezeReason("");
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
      queryClient.invalidateQueries({ queryKey: ["finance-search-user", searchUsername] });
      queryClient.invalidateQueries({ queryKey: ["finance-pending-withdrawals"] });
      toast({ title: "User Unfrozen", description: "Account has been unfrozen" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to unfreeze user" });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchUser();
  };

  return (
    <Layout>
      <div className="space-y-6" data-testid="finance-page">
        <div className="flex items-center gap-3">
          <Banknote className="h-8 w-8 text-emerald-500" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Finance Manager</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-emerald-900/40 to-emerald-800/30 border-emerald-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <DollarSign className="h-10 w-10 text-emerald-400" />
                <div>
                  <p className="text-emerald-300 text-sm">Total Platform Balance</p>
                  <p className="text-2xl font-bold text-white" data-testid="total-balance">${stats?.totalBalance || "0.00"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-900/40 to-orange-800/30 border-orange-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <ArrowUpCircle className="h-10 w-10 text-orange-400" />
                <div>
                  <p className="text-orange-300 text-sm">Pending Withdrawals</p>
                  <p className="text-2xl font-bold text-white" data-testid="pending-withdrawals">${stats?.pendingWithdrawals || "0.00"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/30 border-blue-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-10 w-10 text-blue-400" />
                <div>
                  <p className="text-blue-300 text-sm">Today's Withdrawals</p>
                  <p className="text-2xl font-bold text-white" data-testid="today-withdrawals">${stats?.todayWithdrawals || "0.00"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-900/40 to-purple-800/30 border-purple-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <User className="h-10 w-10 text-purple-400" />
                <div>
                  <p className="text-purple-300 text-sm">Total Users</p>
                  <p className="text-2xl font-bold text-white" data-testid="total-users">{stats?.totalUsers || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="withdrawals" className="space-y-4">
          <TabsList className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="withdrawals" data-testid="tab-withdrawals">
              <ArrowUpCircle className="h-4 w-4 mr-2" />
              Pending Withdrawals ({pendingWithdrawals?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="transactions" data-testid="tab-transactions">
              <CreditCard className="h-4 w-4 mr-2" />
              All Transactions
            </TabsTrigger>
            <TabsTrigger value="accounts" data-testid="tab-accounts">
              <Wallet className="h-4 w-4 mr-2" />
              Account Lookup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="withdrawals" className="space-y-4">
            {loadingWithdrawals ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 bg-gray-200 dark:bg-gray-800" />)}
              </div>
            ) : pendingWithdrawals?.length === 0 ? (
              <Card className="bg-gray-100 dark:bg-gray-900/50 border-gray-300 dark:border-gray-800">
                <CardContent className="py-12 text-center">
                  <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">No pending withdrawals</p>
                </CardContent>
              </Card>
            ) : (
              pendingWithdrawals?.map((withdrawal: WithdrawalRequest) => (
                <Card key={withdrawal.id} className={`border ${withdrawal.userFrozen || withdrawal.inDispute ? 'border-red-500 bg-red-900/10' : 'border-gray-300 dark:border-gray-800 bg-gray-100 dark:bg-gray-900/50'}`} data-testid={`withdrawal-card-${withdrawal.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                        <ArrowUpCircle className="h-5 w-5 text-orange-500" />
                        Withdrawal Request
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {withdrawal.userFrozen && (
                          <Badge variant="destructive" className="flex items-center gap-1">
                            <Ban className="h-3 w-3" />Account Frozen
                          </Badge>
                        )}
                        {withdrawal.inDispute && (
                          <Badge variant="destructive" className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />In Dispute
                          </Badge>
                        )}
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border-yellow-500">
                          {withdrawal.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Username</p>
                        <p className="text-gray-900 dark:text-white font-medium">{withdrawal.username || "Unknown"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Amount</p>
                        <p className="text-gray-900 dark:text-white font-bold text-lg">${parseFloat(withdrawal.amount).toFixed(2)} {withdrawal.currency}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Wallet Address</p>
                        <p className="text-gray-900 dark:text-white font-mono text-xs truncate">{withdrawal.walletAddress || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Network</p>
                        <p className="text-gray-900 dark:text-white">{withdrawal.network || "Not specified"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Requested</p>
                        <p className="text-gray-900 dark:text-white">{new Date(withdrawal.createdAt).toLocaleString()}</p>
                      </div>
                    </div>

                    {(withdrawal.userFrozen || withdrawal.inDispute) && (
                      <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded-lg">
                        <p className="text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          {withdrawal.userFrozen ? "This user's account is frozen. Review before approving." : "This user has an active dispute. Review before approving."}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-300 dark:border-gray-800">
                      <Button className="bg-green-600 hover:bg-green-700" onClick={() => approveWithdrawalMutation.mutate(withdrawal.id)} disabled={approveWithdrawalMutation.isPending} data-testid={`button-approve-withdrawal-${withdrawal.id}`}>
                        <Check className="h-4 w-4 mr-2" />Approve
                      </Button>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="destructive" data-testid={`button-reject-withdrawal-${withdrawal.id}`}>
                            <X className="h-4 w-4 mr-2" />Reject
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                          <DialogHeader>
                            <DialogTitle className="text-gray-900 dark:text-white">Reject Withdrawal</DialogTitle>
                            <DialogDescription className="text-gray-600 dark:text-gray-400">
                              The funds will be returned to the user's wallet.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection..." className="bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700" />
                          </div>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button variant="destructive" onClick={() => rejectWithdrawalMutation.mutate({ id: withdrawal.id, reason: rejectReason })} disabled={rejectWithdrawalMutation.isPending || !rejectReason.trim()}>
                              Confirm Rejection
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <Card className="bg-gray-100 dark:bg-gray-900/50 border-gray-300 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                  <History className="h-5 w-5" />
                  All Platform Transactions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingTransactions ? (
                  <Skeleton className="h-64 bg-gray-200 dark:bg-gray-800" />
                ) : allTransactions && allTransactions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-300 dark:border-gray-700">
                          <TableHead className="text-gray-600 dark:text-gray-400">Type</TableHead>
                          <TableHead className="text-gray-600 dark:text-gray-400">Amount</TableHead>
                          <TableHead className="text-gray-600 dark:text-gray-400">Status</TableHead>
                          <TableHead className="text-gray-600 dark:text-gray-400">Description</TableHead>
                          <TableHead className="text-gray-600 dark:text-gray-400">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allTransactions.slice(0, 100).map((tx: Transaction) => (
                          <TableRow key={tx.id} className="border-gray-200 dark:border-gray-700" data-testid={`transaction-row-${tx.id}`}>
                            <TableCell className="text-gray-900 dark:text-white">
                              <div className="flex items-center gap-2">
                                {tx.type === "deposit" ? (
                                  <ArrowDownCircle className="h-4 w-4 text-green-500" />
                                ) : tx.type === "withdraw" || tx.type === "withdrawal" ? (
                                  <ArrowUpCircle className="h-4 w-4 text-red-500" />
                                ) : (
                                  <DollarSign className="h-4 w-4 text-blue-500" />
                                )}
                                <span className="capitalize">{tx.type.replace("_", " ")}</span>
                              </div>
                            </TableCell>
                            <TableCell className={`font-bold ${tx.type === "deposit" || tx.type === "escrow_release" || tx.type === "refund" ? "text-green-500" : "text-red-500"}`}>
                              {tx.type === "deposit" || tx.type === "escrow_release" || tx.type === "refund" ? "+" : "-"}${parseFloat(tx.amount).toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={tx.status === "completed" ? "default" : tx.status === "pending" ? "secondary" : "outline"}>
                                {tx.status || "completed"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-gray-600 dark:text-gray-400 max-w-xs truncate">{tx.description || "-"}</TableCell>
                            <TableCell className="text-gray-600 dark:text-gray-400">{new Date(tx.createdAt).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {allTransactions.length > 100 && (
                      <p className="text-center text-gray-500 dark:text-gray-400 mt-4 text-sm">
                        Showing 100 of {allTransactions.length} transactions
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">No transactions found</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="accounts" className="space-y-4">
            <Card className="bg-gray-100 dark:bg-gray-900/50 border-gray-300 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Account Lookup
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleSearch} className="flex gap-2">
                  <Input value={searchUsername} onChange={(e) => setSearchUsername(e.target.value)} placeholder="Enter username to search..." className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700" data-testid="input-search-username" />
                  <Button type="submit" disabled={searchingUser} data-testid="button-search-user">
                    <Search className="h-4 w-4 mr-2" />Search
                  </Button>
                </form>

                {searchedUser && (
                  <Card className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                    <CardContent className="pt-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <User className="h-10 w-10 text-gray-500 dark:text-gray-400" />
                          <div>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">{searchedUser.username}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{searchedUser.email}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant={searchedUser.isFrozen ? "destructive" : "default"}>
                            {searchedUser.isFrozen ? "Frozen" : "Active"}
                          </Badge>
                          <Badge variant="outline">{searchedUser.role}</Badge>
                        </div>
                      </div>

                      {searchedUser.wallet && (
                        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                          <div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Available Balance</p>
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">${parseFloat(searchedUser.wallet.availableBalance).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">In Escrow</p>
                            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">${parseFloat(searchedUser.wallet.escrowBalance).toFixed(2)}</p>
                          </div>
                        </div>
                      )}

                      {searchedUser.isFrozen && searchedUser.frozenReason && (
                        <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded-lg">
                          <p className="text-red-700 dark:text-red-400 text-sm">
                            <strong>Frozen Reason:</strong> {searchedUser.frozenReason}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                        {searchedUser.isFrozen ? (
                          <Button className="bg-green-600 hover:bg-green-700" onClick={() => unfreezeUserMutation.mutate(searchedUser.id)} disabled={unfreezeUserMutation.isPending} data-testid="button-unfreeze-user">
                            <Unlock className="h-4 w-4 mr-2" />Unfreeze Account
                          </Button>
                        ) : (
                          <>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="destructive" data-testid="button-freeze-user">
                                  <Ban className="h-4 w-4 mr-2" />Freeze Account
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                                <DialogHeader>
                                  <DialogTitle className="text-gray-900 dark:text-white">Freeze Account</DialogTitle>
                                  <DialogDescription className="text-gray-600 dark:text-gray-400">
                                    This will prevent the user from making any transactions.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <Textarea value={freezeReason} onChange={(e) => setFreezeReason(e.target.value)} placeholder="Reason for freezing..." className="bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700" />
                                </div>
                                <DialogFooter>
                                  <DialogClose asChild>
                                    <Button variant="outline">Cancel</Button>
                                  </DialogClose>
                                  <Button variant="destructive" onClick={() => freezeUserMutation.mutate({ userId: searchedUser.id, reason: freezeReason })} disabled={freezeUserMutation.isPending || !freezeReason.trim()}>
                                    Confirm Freeze
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" className="border-yellow-500 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20" data-testid="button-flag-user">
                                  <Flag className="h-4 w-4 mr-2" />Flag Suspicious
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                                <DialogHeader>
                                  <DialogTitle className="text-gray-900 dark:text-white">Flag Suspicious Account</DialogTitle>
                                  <DialogDescription className="text-gray-600 dark:text-gray-400">
                                    Report this account for suspicious activity. Optionally freeze the account.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div className="space-y-2">
                                    <Label className="text-gray-700 dark:text-gray-300">Reason for flagging</Label>
                                    <Textarea value={flagReason} onChange={(e) => setFlagReason(e.target.value)} placeholder="Describe the suspicious activity..." className="bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700" />
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Checkbox id="freeze-on-flag" checked={shouldFreezeOnFlag} onCheckedChange={(checked) => setShouldFreezeOnFlag(checked === true)} />
                                    <label htmlFor="freeze-on-flag" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                      Also freeze this account
                                    </label>
                                  </div>
                                </div>
                                <DialogFooter>
                                  <DialogClose asChild>
                                    <Button variant="outline">Cancel</Button>
                                  </DialogClose>
                                  <Button className="bg-yellow-600 hover:bg-yellow-700" onClick={() => flagUserMutation.mutate({ userId: searchedUser.id, reason: flagReason, shouldFreeze: shouldFreezeOnFlag })} disabled={flagUserMutation.isPending || !flagReason.trim()}>
                                    Submit Flag
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </>
                        )}
                      </div>

                      {searchedUser.transactions && searchedUser.transactions.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <History className="h-5 w-5" />Transaction History
                          </h3>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {searchedUser.transactions.map((tx: Transaction) => (
                              <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                                <div className="flex items-center gap-3">
                                  {tx.type === "deposit" ? (
                                    <ArrowDownCircle className="h-5 w-5 text-green-500" />
                                  ) : tx.type === "withdraw" ? (
                                    <ArrowUpCircle className="h-5 w-5 text-red-500" />
                                  ) : (
                                    <DollarSign className="h-5 w-5 text-blue-500" />
                                  )}
                                  <div>
                                    <p className="text-gray-900 dark:text-white font-medium capitalize">{tx.type.replace("_", " ")}</p>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs">{tx.description}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className={`font-bold ${tx.type === "deposit" || tx.type === "escrow_release" || tx.type === "refund" ? "text-green-500" : "text-red-500"}`}>
                                    {tx.type === "deposit" || tx.type === "escrow_release" || tx.type === "refund" ? "+" : "-"}${parseFloat(tx.amount).toFixed(2)}
                                  </p>
                                  <p className="text-gray-500 dark:text-gray-400 text-xs">{new Date(tx.createdAt).toLocaleDateString()}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
