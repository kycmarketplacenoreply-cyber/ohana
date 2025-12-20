import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth } from "@/lib/auth";
import QRCode from "qrcode";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Lock,
  Clock,
  Copy,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
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

interface DepositAddress {
  address: string;
  network: string;
  token: string;
  warning: string;
  minConfirmations: number;
}

interface WalletControls {
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
  minWithdrawalAmount: string;
  withdrawalFeePercent: string;
  withdrawalFeeFixed: string;
  perUserDailyLimit: string;
}

interface WithdrawalRequest {
  id: string;
  amount: string;
  currency: string;
  status: string;
  walletAddress: string;
  txHash: string | null;
  createdAt: string;
}

export default function WalletPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

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

  const { data: userStatus } = useQuery({
    queryKey: ["userStatus"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/auth/me");
      return res.json();
    },
  });

  const { data: depositAddress, isLoading: addressLoading } = useQuery<DepositAddress>({
    queryKey: ["depositAddress"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/wallet/deposit-address");
      return res.json();
    },
    enabled: depositOpen,
  });

  const { data: controls } = useQuery<WalletControls>({
    queryKey: ["walletControls"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/wallet/controls");
      return res.json();
    },
  });

  const { data: withdrawals } = useQuery<WithdrawalRequest[]>({
    queryKey: ["withdrawals"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/wallet/withdrawals");
      return res.json();
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async ({ amount, walletAddress }: { amount: string; walletAddress: string }) => {
      const res = await fetchWithAuth("/api/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify({ amount: parseFloat(amount), walletAddress }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["withdrawals"] });
      setWithdrawOpen(false);
      setWithdrawAmount("");
      setWithdrawAddress("");
      toast({ 
        title: "Withdrawal Requested", 
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Withdrawal Failed", description: error.message });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Address copied to clipboard" });
  };

  useEffect(() => {
    if (depositAddress?.address && depositOpen) {
      QRCode.toDataURL(depositAddress.address, { width: 200, margin: 2 })
        .then(setQrCodeUrl)
        .catch((err) => console.error("QR Code generation failed:", err));
    }
  }, [depositAddress?.address, depositOpen]);

  const calculateFee = () => {
    if (!controls || !withdrawAmount) return 0;
    const amount = parseFloat(withdrawAmount) || 0;
    const percentFee = amount * (parseFloat(controls.withdrawalFeePercent) / 100);
    const fixedFee = parseFloat(controls.withdrawalFeeFixed);
    return percentFee + fixedFee;
  };

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
        return <ArrowDownLeft className="h-4 w-4 text-blue-400" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case "deposit":
      case "escrow_release":
      case "refund":
        return "text-green-400";
      case "withdraw":
      case "escrow_hold":
      case "fee":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" /> Completed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-600"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case "approved":
        return <Badge className="bg-blue-600"><Clock className="h-3 w-3 mr-1" /> Approved</Badge>;
      case "processing":
      case "sent":
        return <Badge className="bg-purple-600"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processing</Badge>;
      case "rejected":
      case "failed":
        return <Badge className="bg-red-600"><XCircle className="h-3 w-3 mr-1" /> {status}</Badge>;
      default:
        return <Badge>{status}</Badge>;
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
              <Button 
                className="bg-green-600 hover:bg-green-700 gap-2" 
                data-testid="button-deposit"
                disabled={!controls?.depositsEnabled}
              >
                <ArrowDownLeft className="h-4 w-4" />
                Deposit
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 border-gray-800 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-white">Deposit USDT</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Send USDT on BNB Smart Chain
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {addressLoading ? (
                  <Skeleton className="h-48 bg-gray-800" />
                ) : depositAddress ? (
                  <>
                    <div className="flex justify-center">
                      <div className="p-4 bg-white rounded-lg">
                        {qrCodeUrl ? (
                          <img src={qrCodeUrl} alt="Deposit Address QR Code" className="w-48 h-48" />
                        ) : (
                          <Skeleton className="w-48 h-48" />
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 bg-gray-800 rounded-lg">
                        <p className="text-gray-400 text-xs">Network</p>
                        <p className="text-white font-medium">BSC</p>
                        <p className="text-gray-500 text-xs">BNB Smart Chain (BEP20)</p>
                      </div>

                      <div className="p-3 bg-gray-800 rounded-lg">
                        <p className="text-gray-400 text-xs mb-2">Deposit Address</p>
                        <div className="flex items-center gap-2">
                          <code className="text-green-400 text-xs break-all flex-1 font-mono">
                            {depositAddress.address}
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(depositAddress.address)}
                            data-testid="button-copy-address"
                          >
                            {copied ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      <Alert className="bg-blue-900/30 border-blue-700">
                        <AlertTriangle className="h-4 w-4 text-blue-400" />
                        <AlertDescription className="text-blue-300 text-xs">
                          Minimum deposit: 5 USDT. Deposits below this amount won't be credited to your account. {depositAddress.minConfirmations} confirmations required.
                        </AlertDescription>
                      </Alert>

                      <Alert className="bg-red-900/30 border-red-700">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                        <AlertDescription className="text-red-300 text-xs">
                          SEND ONLY USDT (BEP20) ON BNB SMART CHAIN. Other tokens or networks will result in permanent loss.
                        </AlertDescription>
                      </Alert>

                      <Button className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-medium">
                        Save and Share Address
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-red-400">Failed to generate deposit address</p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                className="gap-2" 
                data-testid="button-withdraw"
                disabled={userStatus?.isFrozen || !controls?.withdrawalsEnabled}
                title={userStatus?.isFrozen ? "Withdrawals are disabled while your account is frozen" : undefined}
              >
                <ArrowUpRight className="h-4 w-4" />
                Withdraw
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 border-gray-800 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-white">Withdraw USDT</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Withdraw to any BNB Smart Chain address
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-3">
                  <div className="p-3 bg-gray-800 rounded-lg">
                    <p className="text-gray-400 text-xs">Network</p>
                    <p className="text-white font-medium">BSC</p>
                    <p className="text-gray-500 text-xs">BNB Smart Chain (BEP20)</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-300 text-xs">Amount (USDT)</Label>
                    <Input
                      type="text"
                      placeholder="0.00"
                      className="bg-gray-800 border-gray-700 text-white"
                      value={withdrawAmount}
                      onChange={(e) => {
                        const val = e.target.value;
                        // Only allow positive decimal numbers (e.g., 5, 5.5, 10.25)
                        if (val === "") {
                          setWithdrawAmount("");
                        } else if (/^\d+(\.\d{0,8})?$/.test(val)) {
                          setWithdrawAmount(val);
                        }
                        // Invalid input is silently rejected (e.g., -5, 8.w7, -5.+)
                      }}
                      data-testid="input-withdraw-amount"
                    />
                    <p className="text-xs text-gray-500">
                      Available: {parseFloat(wallet?.availableBalance || "0").toFixed(4)} USDT
                      {controls && ` | Min: 5 USDT`}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-300 text-xs">Destination Address (BEP20)</Label>
                    <Input
                      placeholder="0x..."
                      className="bg-gray-800 border-gray-700 text-white font-mono text-sm"
                      value={withdrawAddress}
                      onChange={(e) => setWithdrawAddress(e.target.value)}
                      data-testid="input-withdraw-address"
                    />
                  </div>

                  {withdrawAmount && parseFloat(withdrawAmount) > 0 && (
                    <div className="p-3 bg-gray-800 rounded-lg space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Amount</span>
                        <span className="text-white">{parseFloat(withdrawAmount).toFixed(4)} USDT</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Gas Fee</span>
                        <span className="text-yellow-400">-{calculateFee().toFixed(4)} USDT</span>
                      </div>
                      <div className="border-t border-gray-700 pt-2 flex justify-between text-sm font-medium">
                        <span className="text-gray-400">You will receive</span>
                        <span className="text-green-400">{(parseFloat(withdrawAmount) - calculateFee()).toFixed(4)} USDT</span>
                      </div>
                    </div>
                  )}

                  <Alert className="bg-red-900/30 border-red-700">
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                    <AlertDescription className="text-red-300 text-xs">
                      SEND ONLY TO BNB SMART CHAIN ADDRESSES. Double-check the address before submitting.
                    </AlertDescription>
                  </Alert>

                  <Button
                    className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-medium"
                    onClick={() => withdrawMutation.mutate({ amount: withdrawAmount, walletAddress: withdrawAddress })}
                    disabled={
                      !withdrawAmount || 
                      !withdrawAddress || 
                      withdrawMutation.isPending || 
                      parseFloat(withdrawAmount) < 5 ||
                      (parseFloat(withdrawAmount) + calculateFee() > parseFloat(wallet?.availableBalance || "0"))
                    }
                    data-testid="button-confirm-withdraw"
                  >
                    {withdrawMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Submit Withdrawal"
                    )}
                  </Button>

                  <p className="text-xs text-gray-500 text-center">
                    Withdrawals require approval before processing,expect a delay up to 24 hours.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {withdrawals && withdrawals.length > 0 && (
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5" />
                Withdrawal Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {withdrawals.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-gray-800/50 border border-gray-700"
                    data-testid={`withdrawal-${w.id}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-white font-medium">{parseFloat(w.amount).toFixed(4)} USDT</p>
                        {getStatusBadge(w.status)}
                      </div>
                      <p className="text-xs text-gray-400 font-mono">
                        To: {w.walletAddress?.slice(0, 10)}...{w.walletAddress?.slice(-8)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(w.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {w.txHash && (
                      <a
                        href={`https://bscscan.com/tx/${w.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
