import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
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
} from "lucide-react";

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

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const user = getUser();
  const [selectedKyc, setSelectedKyc] = useState<KycApplication | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedTier, setSelectedTier] = useState("tier1");

  if (user?.role !== "admin") {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white">Access Denied</h2>
            <p className="text-gray-400">You don't have permission to access this page.</p>
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

  const handleApprove = (kyc: KycApplication) => {
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
      <div className="space-y-6" data-testid="admin-page">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-blue-500" />
          <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
        </div>

        <Tabs defaultValue="kyc" className="space-y-4">
          <TabsList className="bg-gray-800">
            <TabsTrigger value="kyc" data-testid="tab-kyc">
              <FileText className="h-4 w-4 mr-2" />
              KYC Applications ({pendingKyc?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="vendors" data-testid="tab-vendors">
              <Store className="h-4 w-4 mr-2" />
              Pending Vendors ({pendingVendors?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="kyc" className="space-y-4">
            {loadingKyc ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-48 bg-gray-800" />
                ))}
              </div>
            ) : pendingKyc?.length === 0 ? (
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="py-12 text-center">
                  <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-400">No pending KYC applications</p>
                </CardContent>
              </Card>
            ) : (
              pendingKyc?.map((kyc: KycApplication) => (
                <Card key={kyc.id} className="bg-gray-900/50 border-gray-800" data-testid={`kyc-card-${kyc.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white flex items-center gap-2">
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
                        <p className="text-gray-400">ID Type</p>
                        <p className="text-white">{kyc.idType || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">ID Number</p>
                        <p className="text-white">{kyc.idNumber || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Face Match Score</p>
                        <p className="text-white">{kyc.faceMatchScore ? `${kyc.faceMatchScore}%` : "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Submitted</p>
                        <p className="text-white">{new Date(kyc.submittedAt).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <p className="text-gray-400 text-sm flex items-center gap-1">
                          <Image className="h-4 w-4" />
                          ID Front
                        </p>
                        {kyc.idFrontUrl ? (
                          <img 
                            src={kyc.idFrontUrl} 
                            alt="ID Front" 
                            className="w-full h-40 object-cover rounded-lg border border-gray-700"
                            data-testid={`kyc-id-front-${kyc.id}`}
                          />
                        ) : (
                          <div className="w-full h-40 bg-gray-800 rounded-lg flex items-center justify-center border border-gray-700">
                            <p className="text-gray-500 text-sm">Not uploaded</p>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <p className="text-gray-400 text-sm flex items-center gap-1">
                          <Image className="h-4 w-4" />
                          ID Back
                        </p>
                        {kyc.idBackUrl ? (
                          <img 
                            src={kyc.idBackUrl} 
                            alt="ID Back" 
                            className="w-full h-40 object-cover rounded-lg border border-gray-700"
                            data-testid={`kyc-id-back-${kyc.id}`}
                          />
                        ) : (
                          <div className="w-full h-40 bg-gray-800 rounded-lg flex items-center justify-center border border-gray-700">
                            <p className="text-gray-500 text-sm">Not uploaded</p>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <p className="text-gray-400 text-sm flex items-center gap-1">
                          <User className="h-4 w-4" />
                          Selfie
                        </p>
                        {kyc.selfieUrl ? (
                          <img 
                            src={kyc.selfieUrl} 
                            alt="Selfie" 
                            className="w-full h-40 object-cover rounded-lg border border-gray-700"
                            data-testid={`kyc-selfie-${kyc.id}`}
                          />
                        ) : (
                          <div className="w-full h-40 bg-gray-800 rounded-lg flex items-center justify-center border border-gray-700">
                            <p className="text-gray-500 text-sm">Not uploaded</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-800">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            className="bg-green-600 hover:bg-green-700" 
                            onClick={() => setSelectedKyc(kyc)}
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
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleApprove(kyc)}
                              disabled={approveKycMutation.isPending}
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
                  <Skeleton key={i} className="h-32 bg-gray-800" />
                ))}
              </div>
            ) : pendingVendors?.length === 0 ? (
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="py-12 text-center">
                  <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-400">No pending vendor applications</p>
                </CardContent>
              </Card>
            ) : (
              pendingVendors?.map((vendor: VendorProfile) => (
                <Card key={vendor.id} className="bg-gray-900/50 border-gray-800" data-testid={`vendor-card-${vendor.id}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white flex items-center gap-2">
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
                        <p className="text-gray-400">Country</p>
                        <p className="text-white">{vendor.country}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Applied</p>
                        <p className="text-white">{new Date(vendor.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="md:col-span-1 col-span-2">
                        <p className="text-gray-400">Bio</p>
                        <p className="text-white">{vendor.bio || "No bio provided"}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-gray-800">
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
        </Tabs>
      </div>
    </Layout>
  );
}
