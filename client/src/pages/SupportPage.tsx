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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { fetchWithAuth, getUser } from "@/lib/auth";
import { useLocation } from "wouter";
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
  Search,
  Key,
  Flag,
  Eye,
  ShieldCheck,
  Headphones,
  ShoppingCart,
} from "lucide-react";
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
  username?: string;
}

interface VendorProfile {
  id: string;
  userId: string;
  businessName: string | null;
  bio: string | null;
  country: string;
  isApproved: boolean;
  createdAt: string;
  username?: string;
}

interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: string;
  isFrozen: boolean;
  frozenReason: string | null;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  createdAt: string;
  kycStatus: string | null;
}

interface OrderData {
  id: string;
  buyerId: string;
  vendorId: string;
  status: string;
  fiatAmount: string;
  cryptoAmount: string;
  createdAt: string;
}

export default function SupportPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = getUser();
  const [, setLocation] = useLocation();
  const [selectedKyc, setSelectedKyc] = useState<KycApplication | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedTier, setSelectedTier] = useState("tier1");
  const [searchUsername, setSearchUsername] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [viewingDocuments, setViewingDocuments] = useState<KycApplication | null>(null);
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [submittingTicket, setSubmittingTicket] = useState(false);

  const isAdmin = user?.role === "admin" || user?.role === "support";

  const getDocuments = (kyc: KycApplication) => {
    const docs: { url: string; label: string }[] = [];
    if (kyc.idFrontUrl) docs.push({ url: kyc.idFrontUrl, label: "ID Front" });
    if (kyc.idBackUrl) docs.push({ url: kyc.idBackUrl, label: "ID Back" });
    if (kyc.selfieUrl) docs.push({ url: kyc.selfieUrl, label: "Selfie" });
    return docs;
  };

  const { data: pendingKyc, isLoading: loadingKyc } = useQuery({
    queryKey: ["support-pending-kyc"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/kyc/pending");
      if (!res.ok) throw new Error("Failed to fetch pending KYC");
      return res.json();
    },
  });

  const { data: pendingVendors, isLoading: loadingVendors } = useQuery({
    queryKey: ["support-pending-vendors"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/admin/vendors/pending");
      if (!res.ok) throw new Error("Failed to fetch pending vendors");
      return res.json();
    },
  });

  const { data: allOrders, isLoading: loadingOrders } = useQuery<OrderData[]>({
    queryKey: ["support-orders"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/support/orders");
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
  });

  const { data: searchedUser, isLoading: searchingUser, refetch: searchUser } = useQuery({
    queryKey: ["support-search-user", searchUsername],
    queryFn: async () => {
      if (!searchUsername.trim()) return null;
      const res = await fetchWithAuth(`/api/support/user/search?username=${encodeURIComponent(searchUsername)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: false,
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
      queryClient.invalidateQueries({ queryKey: ["support-pending-kyc"] });
      setSelectedKyc(null);
      setReviewNotes("");
      setRejectionReason("");
      toast({ title: "KYC Reviewed", description: "The KYC application has been processed" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to process KYC review" });
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
      queryClient.invalidateQueries({ queryKey: ["support-pending-vendors"] });
      toast({ title: "Vendor Approved", description: "The vendor has been approved" });
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to approve vendor" });
    },
  });

  const reset2FAMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetchWithAuth(`/api/support/user/${userId}/reset-2fa`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to reset 2FA");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "2FA Reset", description: "User's 2FA has been disabled" });
      searchUser();
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to reset 2FA" });
    },
  });

  const flagUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const res = await fetchWithAuth(`/api/support/user/${userId}/flag`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Failed to flag user");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User Flagged", description: "Suspicious behavior has been reported" });
      setFlagReason("");
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "Failed to flag user" });
    },
  });

  const canApproveKyc = (kyc: KycApplication) => {
    const hasAllThree = kyc.idFrontUrl && kyc.idBackUrl && kyc.selfieUrl;
    const hasDocAndSelfie = kyc.idDocumentUrl && kyc.selfieUrl;
    return hasAllThree || hasDocAndSelfie;
  };

  const handleApprove = (kyc: KycApplication) => {
    if (!canApproveKyc(kyc)) {
      toast({ variant: "destructive", title: "Cannot Approve", description: "User must upload required documents" });
      return;
    }
    approveKycMutation.mutate({ id: kyc.id, status: "approved", tier: selectedTier, adminNotes: reviewNotes });
  };

  const handleReject = (kyc: KycApplication) => {
    if (!rejectionReason.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Please provide a rejection reason" });
      return;
    }
    approveKycMutation.mutate({ id: kyc.id, status: "rejected", tier: kyc.tier, adminNotes: reviewNotes, rejectionReason });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchUser();
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketMessage.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Please fill in all fields" });
      return;
    }
    
    setSubmittingTicket(true);
    try {
      const res = await fetchWithAuth("/api/support/tickets", {
        method: "POST",
        body: JSON.stringify({ subject: ticketSubject, message: ticketMessage }),
      });
      if (!res.ok) throw new Error("Failed to submit ticket");
      toast({ title: "Success", description: "Your support ticket has been created. We'll respond soon!" });
      setTicketSubject("");
      setTicketMessage("");
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to create support ticket" });
    } finally {
      setSubmittingTicket(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6" data-testid="support-page">
        <div className="flex items-center gap-3">
          <Headphones className="h-8 w-8 text-green-500" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Customer Support</h1>
        </div>

        {/* Customer Support Ticket Form */}
        {!isAdmin && (
          <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Report Issue or Get Help</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitTicket} className="space-y-4">
                <div>
                  <Label htmlFor="subject" className="text-gray-700 dark:text-gray-300">Subject</Label>
                  <Input
                    id="subject"
                    placeholder="What's the issue? (e.g., 'Withdrawal not received', 'Cannot post ads')"
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    className="mt-2 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
                    data-testid="input-ticket-subject"
                  />
                </div>
                <div>
                  <Label htmlFor="message" className="text-gray-700 dark:text-gray-300">Message</Label>
                  <Textarea
                    id="message"
                    placeholder="Please describe the issue in detail. Include order IDs or specific details if applicable..."
                    value={ticketMessage}
                    onChange={(e) => setTicketMessage(e.target.value)}
                    className="mt-2 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 min-h-32"
                    data-testid="textarea-ticket-message"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={submittingTicket}
                  data-testid="button-submit-ticket"
                >
                  {submittingTicket ? "Submitting..." : "Submit Support Ticket"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/30 border-blue-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <FileText className="h-10 w-10 text-blue-400" />
                <div>
                  <p className="text-blue-300 text-sm">Pending KYC</p>
                  <p className="text-3xl font-bold text-white" data-testid="pending-kyc-count">{pendingKyc?.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-900/40 to-purple-800/30 border-purple-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Store className="h-10 w-10 text-purple-400" />
                <div>
                  <p className="text-purple-300 text-sm">Pending Vendors</p>
                  <p className="text-3xl font-bold text-white" data-testid="pending-vendors-count">{pendingVendors?.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-900/40 to-green-800/30 border-green-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-10 w-10 text-green-400" />
                <div>
                  <p className="text-green-300 text-sm">Role</p>
                  <p className="text-xl font-bold text-white">Customer Support</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="kyc" className="space-y-4">
          <TabsList className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700">
            <TabsTrigger value="kyc" data-testid="tab-kyc">
              <FileText className="h-4 w-4 mr-2" />
              KYC Applications
            </TabsTrigger>
            <TabsTrigger value="vendors" data-testid="tab-vendors">
              <Store className="h-4 w-4 mr-2" />
              Pending Vendors
            </TabsTrigger>
            <TabsTrigger value="orders" data-testid="tab-orders">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Orders
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <User className="h-4 w-4 mr-2" />
              User Lookup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="kyc" className="space-y-4">
            {loadingKyc ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 bg-gray-200 dark:bg-gray-800" />)}
              </div>
            ) : pendingKyc?.length === 0 ? (
              <Card className="bg-gray-100 dark:bg-gray-900/50 border-gray-300 dark:border-gray-800">
                <CardContent className="py-12 text-center">
                  <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">No pending KYC applications</p>
                </CardContent>
              </Card>
            ) : (
              pendingKyc?.map((kyc: KycApplication) => (
                <Card key={kyc.id} className="bg-gray-100 dark:bg-gray-900/50 border-gray-300 dark:border-gray-800" data-testid={`kyc-card-${kyc.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                        <User className="h-5 w-5" />
                        KYC Application
                        {kyc.isStarVerified && <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border-yellow-500">{kyc.status}</Badge>
                        <Badge variant="outline">{kyc.tier}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">ID Type</p>
                        <p className="text-gray-900 dark:text-white">{kyc.idType || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">ID Number</p>
                        <p className="text-gray-900 dark:text-white">{kyc.idNumber || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Face Match Score</p>
                        <p className="text-gray-900 dark:text-white">{kyc.faceMatchScore ? `${kyc.faceMatchScore}%` : "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Submitted</p>
                        <p className="text-gray-900 dark:text-white">{new Date(kyc.submittedAt).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {kyc.idFrontUrl && (
                        <div className="space-y-2">
                          <p className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-1">
                            <Image className="h-4 w-4" />ID Front
                          </p>
                          <img src={kyc.idFrontUrl} alt="ID Front" className="w-full h-40 object-cover rounded-lg border border-gray-300 dark:border-gray-700" />
                        </div>
                      )}
                      {kyc.idBackUrl && (
                        <div className="space-y-2">
                          <p className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-1">
                            <Image className="h-4 w-4" />ID Back
                          </p>
                          <img src={kyc.idBackUrl} alt="ID Back" className="w-full h-40 object-cover rounded-lg border border-gray-300 dark:border-gray-700" />
                        </div>
                      )}
                      {kyc.selfieUrl && (
                        <div className="space-y-2">
                          <p className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-1">
                            <User className="h-4 w-4" />Selfie
                          </p>
                          <img src={kyc.selfieUrl} alt="Selfie" className="w-full h-40 object-cover rounded-lg border border-gray-300 dark:border-gray-700" />
                        </div>
                      )}
                    </div>

                    {!canApproveKyc(kyc) && (
                      <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-700 rounded-lg">
                        <p className="text-yellow-700 dark:text-yellow-400 text-sm flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Cannot approve: User must upload required documents (ID document + selfie)
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-300 dark:border-gray-800">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button className="bg-green-600 hover:bg-green-700" disabled={!canApproveKyc(kyc)} data-testid={`button-approve-kyc-${kyc.id}`}>
                            <Check className="h-4 w-4 mr-2" />Approve
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                          <DialogHeader>
                            <DialogTitle className="text-gray-900 dark:text-white">Approve KYC</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-gray-600 dark:text-gray-400">Verification Tier</Label>
                              <Select value={selectedTier} onValueChange={setSelectedTier}>
                                <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                                  <SelectItem value="tier1">Tier 1</SelectItem>
                                  <SelectItem value="tier2">Tier 2</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-gray-600 dark:text-gray-400">Notes (optional)</Label>
                              <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Add any notes..." className="bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700" />
                            </div>
                          </div>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline" className="border-gray-300 dark:border-gray-700">Cancel</Button>
                            </DialogClose>
                            <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleApprove(kyc)} disabled={approveKycMutation.isPending}>
                              Confirm Approval
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="destructive" data-testid={`button-reject-kyc-${kyc.id}`}>
                            <X className="h-4 w-4 mr-2" />Reject
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                          <DialogHeader>
                            <DialogTitle className="text-gray-900 dark:text-white">Reject KYC</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-gray-600 dark:text-gray-400">Rejection Reason (required)</Label>
                              <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Explain why this KYC is being rejected..." className="bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700" />
                            </div>
                          </div>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline" className="border-gray-300 dark:border-gray-700">Cancel</Button>
                            </DialogClose>
                            <Button variant="destructive" onClick={() => handleReject(kyc)} disabled={approveKycMutation.isPending}>
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

          <TabsContent value="vendors" className="space-y-4">
            {loadingVendors ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 bg-gray-200 dark:bg-gray-800" />)}
              </div>
            ) : pendingVendors?.length === 0 ? (
              <Card className="bg-gray-100 dark:bg-gray-900/50 border-gray-300 dark:border-gray-800">
                <CardContent className="py-12 text-center">
                  <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">No pending vendor applications</p>
                </CardContent>
              </Card>
            ) : (
              pendingVendors?.map((vendor: VendorProfile) => (
                <Card key={vendor.id} className="bg-gray-100 dark:bg-gray-900/50 border-gray-300 dark:border-gray-800" data-testid={`vendor-card-${vendor.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                        <Store className="h-5 w-5" />
                        {vendor.businessName || "Vendor Application"}
                      </CardTitle>
                      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 border-yellow-500">
                        Pending Approval
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Country</p>
                        <p className="text-gray-900 dark:text-white">{vendor.country}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Bio</p>
                        <p className="text-gray-900 dark:text-white">{vendor.bio || "No bio provided"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Applied</p>
                        <p className="text-gray-900 dark:text-white">{new Date(vendor.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <Button className="bg-green-600 hover:bg-green-700" onClick={() => approveVendorMutation.mutate(vendor.id)} disabled={approveVendorMutation.isPending} data-testid={`button-approve-vendor-${vendor.id}`}>
                      <Check className="h-4 w-4 mr-2" />Approve Vendor
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            <Card className="bg-gray-100 dark:bg-gray-900/50 border-gray-300 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  All Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingOrders ? (
                  <Skeleton className="h-64 bg-gray-200 dark:bg-gray-800" />
                ) : allOrders?.length === 0 ? (
                  <p className="text-gray-600 dark:text-gray-400 text-center py-8">No orders found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-300 dark:border-gray-700">
                          <TableHead className="text-gray-600 dark:text-gray-400">Order ID</TableHead>
                          <TableHead className="text-gray-600 dark:text-gray-400">Status</TableHead>
                          <TableHead className="text-gray-600 dark:text-gray-400">Fiat Amount</TableHead>
                          <TableHead className="text-gray-600 dark:text-gray-400">Crypto Amount</TableHead>
                          <TableHead className="text-gray-600 dark:text-gray-400">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allOrders?.slice(0, 50).map((order: OrderData) => (
                          <TableRow key={order.id} className="border-gray-300 dark:border-gray-700" data-testid={`order-row-${order.id}`}>
                            <TableCell className="text-gray-600 dark:text-gray-300 font-mono text-xs">{order.id.slice(0, 8)}...</TableCell>
                            <TableCell>
                              <Badge className={
                                order.status === "completed" ? "bg-green-600" :
                                order.status === "escrowed" ? "bg-blue-600" :
                                order.status === "paid" ? "bg-purple-600" :
                                order.status === "disputed" ? "bg-red-600" :
                                "bg-yellow-600"
                              }>
                                {order.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-gray-900 dark:text-white font-medium">${order.fiatAmount}</TableCell>
                            <TableCell className="text-gray-900 dark:text-white">{order.cryptoAmount}</TableCell>
                            <TableCell className="text-gray-600 dark:text-gray-300">
                              {new Date(order.createdAt).toLocaleDateString()}
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

          <TabsContent value="users" className="space-y-4">
            <Card className="bg-gray-100 dark:bg-gray-900/50 border-gray-300 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  User Lookup
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

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 dark:text-gray-400">KYC Status</p>
                          <p className="text-gray-900 dark:text-white">{searchedUser.kycStatus || "Not submitted"}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400">2FA Enabled</p>
                          <p className="text-gray-900 dark:text-white">{searchedUser.twoFactorEnabled ? "Yes" : "No"}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400">Email Verified</p>
                          <p className="text-gray-900 dark:text-white">{searchedUser.emailVerified ? "Yes" : "No"}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400">Joined</p>
                          <p className="text-gray-900 dark:text-white">{new Date(searchedUser.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                        {searchedUser.twoFactorEnabled && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" className="border-orange-500 text-orange-500 hover:bg-orange-500/10" data-testid="button-reset-2fa">
                                <Key className="h-4 w-4 mr-2" />Reset 2FA
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                              <DialogHeader>
                                <DialogTitle className="text-gray-900 dark:text-white">Reset 2FA</DialogTitle>
                                <DialogDescription className="text-gray-600 dark:text-gray-400">
                                  This will disable 2FA for this user. They will need to set it up again.
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <DialogClose asChild>
                                  <Button variant="outline">Cancel</Button>
                                </DialogClose>
                                <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => reset2FAMutation.mutate(searchedUser.id)} disabled={reset2FAMutation.isPending}>
                                  Confirm Reset
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        )}

                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" className="border-red-500 text-red-500 hover:bg-red-500/10" data-testid="button-flag-user">
                              <Flag className="h-4 w-4 mr-2" />Flag Suspicious
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
                            <DialogHeader>
                              <DialogTitle className="text-gray-900 dark:text-white">Flag Suspicious Behavior</DialogTitle>
                              <DialogDescription className="text-gray-600 dark:text-gray-400">
                                Report this user for suspicious activity. This will be reviewed by admins.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <Textarea value={flagReason} onChange={(e) => setFlagReason(e.target.value)} placeholder="Describe the suspicious behavior..." className="bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700" />
                            </div>
                            <DialogFooter>
                              <DialogClose asChild>
                                <Button variant="outline">Cancel</Button>
                              </DialogClose>
                              <Button variant="destructive" onClick={() => flagUserMutation.mutate({ userId: searchedUser.id, reason: flagReason })} disabled={flagUserMutation.isPending || !flagReason.trim()}>
                                Submit Report
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
          </>
        )}
      </div>
    </Layout>
  );
}
