import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth, getUser, getToken } from "@/lib/auth";
import {
  Settings,
  Shield,
  User,
  Key,
  Smartphone,
  CheckCircle,
  AlertCircle,
  Copy,
  QrCode,
  Upload,
  FileText,
  Camera,
} from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = getUser();
  const [setup2FAOpen, setSetup2FAOpen] = useState(false);
  const [verifyToken, setVerifyToken] = useState("");
  const [kycDialogOpen, setKycDialogOpen] = useState(false);
  const [idType, setIdType] = useState("passport");
  const [idNumber, setIdNumber] = useState("");
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const idDocumentRef = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);

  const { data: me, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/auth/me");
      return res.json();
    },
  });

  const { data: kycStatus } = useQuery({
    queryKey: ["kyc-status"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/kyc/status");
      return res.json();
    },
  });

  const setup2FAMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth("/api/auth/2fa/setup", { method: "POST" });
      if (!res.ok) throw new Error("Failed to setup 2FA");
      return res.json();
    },
  });

  const enable2FAMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await fetchWithAuth("/api/auth/2fa/enable", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error("Invalid token");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      setSetup2FAOpen(false);
      setVerifyToken("");
      toast({ title: "2FA Enabled", description: "Your account is now more secure" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Invalid code", description: "Please try again" });
    },
  });

  const disable2FAMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await fetchWithAuth("/api/auth/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error("Invalid token");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast({ title: "2FA Disabled" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Invalid code" });
    },
  });

  const copyRecoveryCodes = (codes: string[]) => {
    navigator.clipboard.writeText(codes.join("\n"));
    toast({ title: "Copied!", description: "Recovery codes copied to clipboard" });
  };

  const submitKycMutation = useMutation({
    mutationFn: async () => {
      if (!idDocument || !selfie || !idNumber) {
        throw new Error("Please fill in all required fields");
      }
      const formData = new FormData();
      formData.append("idType", idType);
      formData.append("idNumber", idNumber);
      formData.append("idDocument", idDocument);
      formData.append("selfie", selfie);

      const token = getToken();
      const res = await fetch("/api/kyc/submit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to submit KYC");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kyc-status"] });
      setKycDialogOpen(false);
      setIdNumber("");
      setIdDocument(null);
      setSelfie(null);
      if (idDocumentRef.current) idDocumentRef.current.value = "";
      if (selfieRef.current) selfieRef.current.value = "";
      toast({ title: "KYC Submitted", description: "Your documents are being reviewed" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Submission Failed", description: error.message });
    },
  });

  return (
    <Layout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white">Settings</h1>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <User className="h-5 w-5" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <Skeleton className="h-32 bg-gray-800" />
            ) : (
              <div className="grid gap-4">
                <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                  <div>
                    <p className="text-gray-400 text-sm">Username</p>
                    <p className="text-white font-medium">{me?.username}</p>
                  </div>
                  <Badge>{me?.role}</Badge>
                </div>
                <div className="p-4 bg-gray-800 rounded-lg">
                  <p className="text-gray-400 text-sm">Email</p>
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium">{me?.email}</p>
                    {me?.emailVerified ? (
                      <CheckCircle className="h-4 w-4 text-green-400" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-400" />
                    )}
                  </div>
                </div>
                <div className="p-4 bg-gray-800 rounded-lg">
                  <p className="text-gray-400 text-sm">Member since</p>
                  <p className="text-white font-medium">
                    {new Date(me?.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security
            </CardTitle>
            <CardDescription>
              Protect your account with two-factor authentication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-900">
                  <Smartphone className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Two-Factor Authentication</p>
                  <p className="text-gray-400 text-sm">
                    Use an authenticator app for extra security
                  </p>
                </div>
              </div>
              {me?.twoFactorEnabled ? (
                <Badge className="bg-green-600">Enabled</Badge>
              ) : (
                <Dialog open={setup2FAOpen} onOpenChange={setSetup2FAOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="bg-purple-600 hover:bg-purple-700"
                      onClick={() => setup2FAMutation.mutate()}
                      data-testid="button-setup-2fa"
                    >
                      Enable 2FA
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-gray-900 border-gray-800 max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-white">Setup Two-Factor Authentication</DialogTitle>
                    </DialogHeader>
                    {setup2FAMutation.data ? (
                      <div className="space-y-6 pt-4">
                        <div className="text-center">
                          <p className="text-gray-400 text-sm mb-4">
                            Scan this QR code with your authenticator app
                          </p>
                          <div className="flex justify-center p-4 bg-white rounded-lg">
                            <img src={setup2FAMutation.data.qrCode} alt="QR Code" className="w-48 h-48" />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-gray-300">Or enter this code manually</Label>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={setup2FAMutation.data.secret}
                              className="bg-gray-800 border-gray-700 text-white font-mono text-sm"
                            />
                            <Button
                              variant="outline"
                              onClick={() => {
                                navigator.clipboard.writeText(setup2FAMutation.data.secret);
                                toast({ title: "Copied!" });
                              }}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                          <p className="text-yellow-300 font-medium text-sm mb-2">Save your recovery codes</p>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {setup2FAMutation.data.recoveryCodes?.map((code: string, i: number) => (
                              <code key={i} className="text-xs text-yellow-400 bg-gray-800 p-1 rounded">
                                {code}
                              </code>
                            ))}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyRecoveryCodes(setup2FAMutation.data.recoveryCodes)}
                          >
                            <Copy className="h-3 w-3 mr-2" />
                            Copy All
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-gray-300">Enter verification code</Label>
                          <Input
                            placeholder="000000"
                            maxLength={6}
                            className="bg-gray-800 border-gray-700 text-white text-center text-lg tracking-widest"
                            value={verifyToken}
                            onChange={(e) => setVerifyToken(e.target.value)}
                            data-testid="input-2fa-verify"
                          />
                        </div>

                        <Button
                          className="w-full bg-green-600 hover:bg-green-700"
                          disabled={verifyToken.length !== 6 || enable2FAMutation.isPending}
                          onClick={() => enable2FAMutation.mutate(verifyToken)}
                          data-testid="button-verify-2fa"
                        >
                          {enable2FAMutation.isPending ? "Verifying..." : "Verify & Enable"}
                        </Button>
                      </div>
                    ) : (
                      <div className="py-8 text-center">
                        <div className="animate-spin h-8 w-8 border-2 border-purple-600 border-t-transparent rounded-full mx-auto" />
                        <p className="text-gray-400 mt-4">Setting up 2FA...</p>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Key className="h-5 w-5" />
              KYC Verification
            </CardTitle>
            <CardDescription>
              Verify your identity to unlock higher trading limits
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 bg-gray-800 rounded-lg">
              {kycStatus?.status === "approved" ? (
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-6 w-6 text-green-400" />
                  <div>
                    <p className="text-white font-medium">KYC Verified</p>
                    <p className="text-gray-400 text-sm">Tier: {kycStatus.tier}</p>
                  </div>
                </div>
              ) : kycStatus?.status === "pending" ? (
                <div className="flex items-center gap-3">
                  <div className="animate-spin h-6 w-6 border-2 border-yellow-400 border-t-transparent rounded-full" />
                  <div>
                    <p className="text-white font-medium">Verification Pending</p>
                    <p className="text-gray-400 text-sm">Your documents are being reviewed</p>
                  </div>
                </div>
              ) : kycStatus?.status === "rejected" ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-6 w-6 text-red-400" />
                    <div>
                      <p className="text-white font-medium">Verification Rejected</p>
                      <p className="text-gray-400 text-sm">{kycStatus.rejectionReason || "Please resubmit"}</p>
                    </div>
                  </div>
                  <Button 
                    className="bg-purple-600 hover:bg-purple-700"
                    onClick={() => setKycDialogOpen(true)}
                    data-testid="button-resubmit-kyc"
                  >
                    Resubmit
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">Not Verified</p>
                    <p className="text-gray-400 text-sm">Complete KYC to increase your limits</p>
                  </div>
                  <Button 
                    className="bg-purple-600 hover:bg-purple-700"
                    onClick={() => setKycDialogOpen(true)}
                    data-testid="button-start-kyc"
                  >
                    Start Verification
                  </Button>
                </div>
              )}

              <Dialog open={kycDialogOpen} onOpenChange={setKycDialogOpen}>
                    <DialogContent className="bg-gray-900 border-gray-800 max-w-md max-h-[90vh]">
                      <DialogHeader>
                        <DialogTitle className="text-white">KYC Verification</DialogTitle>
                      </DialogHeader>
                      <ScrollArea className="max-h-[70vh] pr-4">
                      <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label className="text-gray-300">ID Type</Label>
                          <Select value={idType} onValueChange={setIdType}>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white" data-testid="select-id-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="passport">Passport</SelectItem>
                              <SelectItem value="national_id">National ID</SelectItem>
                              <SelectItem value="drivers_license">Driver's License</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-gray-300">ID Number</Label>
                          <Input
                            placeholder="Enter your ID number"
                            value={idNumber}
                            onChange={(e) => setIdNumber(e.target.value)}
                            className="bg-gray-800 border-gray-700 text-white"
                            data-testid="input-id-number"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-gray-300">ID Document (front)</Label>
                          <input
                            type="file"
                            ref={idDocumentRef}
                            accept="image/*,.pdf"
                            className="hidden"
                            onChange={(e) => setIdDocument(e.target.files?.[0] || null)}
                          />
                          <div
                            onClick={() => idDocumentRef.current?.click()}
                            className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 transition-colors"
                            data-testid="upload-id-document"
                          >
                            {idDocument ? (
                              <div className="flex items-center justify-center gap-2 text-green-400">
                                <FileText className="h-5 w-5" />
                                <span>{idDocument.name}</span>
                              </div>
                            ) : (
                              <div className="text-gray-400">
                                <Upload className="h-8 w-8 mx-auto mb-2" />
                                <p>Click to upload ID document</p>
                                <p className="text-xs">JPG, PNG or PDF (max 5MB)</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-gray-300">Selfie with ID</Label>
                          <input
                            type="file"
                            ref={selfieRef}
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => setSelfie(e.target.files?.[0] || null)}
                          />
                          <div
                            onClick={() => selfieRef.current?.click()}
                            className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 transition-colors"
                            data-testid="upload-selfie"
                          >
                            {selfie ? (
                              <div className="flex items-center justify-center gap-2 text-green-400">
                                <Camera className="h-5 w-5" />
                                <span>{selfie.name}</span>
                              </div>
                            ) : (
                              <div className="text-gray-400">
                                <Camera className="h-8 w-8 mx-auto mb-2" />
                                <p>Click to upload selfie holding your ID</p>
                                <p className="text-xs">JPG or PNG (max 5MB)</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <Button
                          className="w-full bg-purple-600 hover:bg-purple-700"
                          disabled={!idDocument || !selfie || !idNumber || submitKycMutation.isPending}
                          onClick={() => submitKycMutation.mutate()}
                          data-testid="button-submit-kyc"
                        >
                          {submitKycMutation.isPending ? "Submitting..." : "Submit Verification"}
                        </Button>
                      </div>
                      </ScrollArea>
                    </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
