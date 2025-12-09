import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth } from "@/lib/auth";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Lock,
  Clock,
  Plus,
  RefreshCw,
} from "lucide-react";

interface Transaction {
  id: string;
  type: string;
  amount: string;
  currency: string;
  description: string | null;
  createdAt: string;
  isNegative?: boolean;
}

interface WalletData {
  id: string;
  availableBalance: string;
  escrowBalance: string;
  currency: string;
}

export default function WalletPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [depositAmount, setDepositAmount] = useState("");
  const [depositOpen, setDepositOpen] = useState(false);

  const { data: wallet, isLoading: walletLoading } = useQuery<WalletData>({
    queryKey: ["wallet"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/wallet");
      return res.json();
    },
  });

  const { data: transactions, isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ["transactions"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/wallet/transactions");
      return res.json();
    },
  });

  const depositMutation = useMutation({
    mutationFn: async (amount: string) => {
      const res = await fetchWithAuth("/api/wallet/deposit", {
        method: "POST",
        body: JSON.stringify({ amount: parseFloat(amount) }),
      });
      if (!res.ok) throw new Error("Deposit failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setDepositOpen(false);
      setDepositAmount("");
      toast({ title: "Deposit successful", description: "Funds added to your wallet" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Deposit failed" });
    },
  });

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "deposit":
        return <ArrowDownLeft className="h-4 w-4 text-green-400" />;
      case "withdraw":
        return <ArrowUpRight className="h-4 w-4 text-red-400" />;
      case "escrow_hold":
        return <Lock className="h-4 w-4 text-yellow-400" />;
      case "escrow_release":
        return <ArrowDownLeft className="h-4 w-4 text-green-400" />;
      case "refund":
        return <RefreshCw className="h-4 w-4 text-blue-400" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case "deposit":
      case "escrow_release":
        return "text-green-400";
      case "withdraw":
      case "escrow_hold":
        return "text-red-400";
      case "refund":
        return "text-blue-400";
      default:
        return "text-gray-400";
    }
  };

  return (
    <Layout>
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-white">Wallet</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 border-purple-700 md:col-span-2">
            <CardContent className="p-6">
              {walletLoading ? (
                <Skeleton className="h-24 bg-purple-800/50" />
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-300 text-sm mb-1">Available Balance</p>
                    <p className="text-4xl font-bold text-white">
                      {parseFloat(wallet?.availableBalance || "0").toFixed(2)}
                      <span className="text-xl ml-2 text-purple-300">USDT</span>
                    </p>
                  </div>
                  <div className="p-4 bg-purple-600 rounded-2xl">
                    <Wallet className="h-8 w-8 text-white" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-900/50 to-yellow-800/30 border-yellow-700">
            <CardContent className="p-6">
              {walletLoading ? (
                <Skeleton className="h-24 bg-yellow-800/50" />
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-4 w-4 text-yellow-400" />
                    <p className="text-yellow-300 text-sm">In Escrow</p>
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {parseFloat(wallet?.escrowBalance || "0").toFixed(2)}
                    <span className="text-lg ml-2 text-yellow-300">USDT</span>
                  </p>
                  <p className="text-xs text-yellow-400 mt-2">Protected funds in active trades</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-4">
          <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
            <DialogTrigger asChild>
              <Button className="bg-green-600 hover:bg-green-700 gap-2" data-testid="button-deposit">
                <Plus className="h-4 w-4" />
                Deposit
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 border-gray-800">
              <DialogHeader>
                <DialogTitle className="text-white">Deposit Funds</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">Amount (USDT)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    className="bg-gray-800 border-gray-700 text-white"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    data-testid="input-deposit-amount"
                  />
                </div>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => depositMutation.mutate(depositAmount)}
                  disabled={!depositAmount || depositMutation.isPending}
                  data-testid="button-confirm-deposit"
                >
                  {depositMutation.isPending ? "Processing..." : "Confirm Deposit"}
                </Button>
                <p className="text-xs text-gray-500 text-center">
                  This is a demo deposit. In production, this would connect to a crypto wallet.
                </p>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" className="gap-2" data-testid="button-withdraw">
            <ArrowUpRight className="h-4 w-4" />
            Withdraw
          </Button>
        </div>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Transaction History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {txLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 bg-gray-800" />
                ))}
              </div>
            ) : transactions && transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-gray-800/50 border border-gray-700"
                    data-testid={`transaction-${tx.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-gray-700">
                        {getTransactionIcon(tx.type)}
                      </div>
                      <div>
                        <p className="text-white font-medium capitalize">
                          {tx.type.replace("_", " ")}
                        </p>
                        <p className="text-sm text-gray-400">
                          {tx.description || new Date(tx.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${tx.isNegative ? "text-red-400" : getTransactionColor(tx.type)}`}>
                        {tx.isNegative ? "-" : "+"}
                        {parseFloat(tx.amount).toFixed(4)} {tx.currency}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(tx.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No transactions yet</p>
                <p className="text-gray-500 text-sm">Your transaction history will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
