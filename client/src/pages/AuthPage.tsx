import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Shield, Mail, Lock, User } from "lucide-react";

export default function AuthPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loginForm, setLoginForm] = useState({ email: "", password: "", twoFactorToken: "" });
  const [registerForm, setRegisterForm] = useState({ username: "", email: "", password: "" });
  const [verificationCode, setVerificationCode] = useState("");
  const [registrationStep, setRegistrationStep] = useState<"email" | "verify" | "create">("email");
  const [requires2FA, setRequires2FA] = useState(false);
  const [canUseEmailCode, setCanUseEmailCode] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [useEmailCodeMode, setUseEmailCodeMode] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState<"email" | "reset">("email");
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          twoFactorToken: data.twoFactorToken,
          emailVerificationCode: data.emailVerificationCode,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      return json;
    },
    onSuccess: (data) => {
      if (data.requiresTwoFactor) {
        setRequires2FA(true);
        setCanUseEmailCode(data.canUseEmailCode || false);
        toast({ 
          title: "2FA Required", 
          description: data.canUseEmailCode 
            ? "Use authenticator code or email code if you lost your device"
            : "Please enter your authenticator code" 
        });
        return;
      }
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      toast({ title: "Welcome back!", description: `Logged in as ${data.user.username}` });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Login Failed", description: error.message });
    },
  });

  const sendVerificationMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/auth/send-verification-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      return json;
    },
    onSuccess: () => {
      toast({ title: "Code Sent", description: "Check your email for the verification code" });
      setRegistrationStep("verify");
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed", description: error.message });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: typeof registerForm & { verificationCode: string }) => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      return json;
    },
    onSuccess: (data) => {
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      toast({ title: "Account Created!", description: "Welcome to KYC Marketplace" });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Registration Failed", description: error.message });
    },
  });

  const requestPasswordResetMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      return json;
    },
    onSuccess: () => {
      toast({ title: "Check Email", description: "Password reset code sent to your email" });
      setForgotPasswordStep("reset");
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed", description: error.message });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match");
      }
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: resetCode, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      return json;
    },
    onSuccess: () => {
      toast({ title: "Success!", description: "Password reset successfully. You can now login." });
      setForgotPasswordOpen(false);
      setForgotPasswordStep("email");
      setForgotPasswordEmail("");
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Failed", description: error.message });
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-3 sm:p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary rounded-xl">
              <Shield className="h-7 sm:h-8 w-7 sm:w-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground truncate">KYC Marketplace</h1>
          <p className="text-muted-foreground text-sm sm:text-base mt-2">Secure peer-to-peer trading</p>
        </div>

        <Card className="border-border bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-foreground">Get Started</CardTitle>
            <CardDescription>Sign in or create an account to start trading</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login" data-testid="tab-login">Login</TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">Register</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = { ...loginForm };
                    if (useEmailCodeMode && emailCode) {
                      data.emailVerificationCode = emailCode;
                      data.twoFactorToken = "";
                    }
                    loginMutation.mutate(data);
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-foreground">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="login-email"
                        data-testid="input-login-email"
                        type="email"
                        placeholder="Enter your email address"
                        className="pl-10 bg-muted border-border text-foreground"
                        value={loginForm.email}
                        onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-foreground">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="login-password"
                        data-testid="input-login-password"
                        type="password"
                        placeholder="Enter password"
                        className="pl-10 bg-muted border-border text-foreground"
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      />
                    </div>
                  </div>
                  {requires2FA && (
                    <div className="space-y-3">
                      {!useEmailCodeMode ? (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="2fa-token" className="text-foreground">Authenticator Code</Label>
                            <Input
                              id="2fa-token"
                              data-testid="input-2fa-token"
                              placeholder="Enter 6-digit code"
                              className="bg-muted border-border text-foreground text-center text-lg tracking-widest"
                              maxLength={6}
                              value={loginForm.twoFactorToken}
                              onChange={(e) => setLoginForm({ ...loginForm, twoFactorToken: e.target.value })}
                            />
                          </div>
                          {canUseEmailCode && (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full text-sm"
                              onClick={() => {
                                setUseEmailCodeMode(true);
                                setLoginForm({ ...loginForm, twoFactorToken: "" });
                              }}
                              data-testid="button-use-email-code"
                            >
                              Lost your authenticator? Use email code instead
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="email-code" className="text-foreground">Email Code</Label>
                            <Input
                              id="email-code"
                              data-testid="input-email-code"
                              placeholder="Enter code from email"
                              className="bg-muted border-border text-foreground"
                              value={emailCode}
                              onChange={(e) => setEmailCode(e.target.value)}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full text-sm"
                            onClick={() => {
                              setUseEmailCodeMode(false);
                              setEmailCode("");
                            }}
                            data-testid="button-back-to-authenticator"
                          >
                            Back to authenticator code
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  <Button
                    type="submit"
                    data-testid="button-login"
                    className="w-full"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? "Signing in..." : "Sign In"}
                  </Button>
                  <div className="text-center">
                    <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
                      <DialogTrigger asChild>
                        <Button variant="link" className="text-sm p-0" data-testid="button-forgot-password">
                          Forgot Password?
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle className="text-foreground">Reset Password</DialogTitle>
                        </DialogHeader>
                        {forgotPasswordStep === "email" ? (
                          <div className="space-y-4 pt-4">
                            <p className="text-sm text-muted-foreground">
                              Enter your email address and we'll send you a code to reset your password.
                            </p>
                            <div className="space-y-2">
                              <Label htmlFor="forgot-email" className="text-foreground">Email Address</Label>
                              <Input
                                id="forgot-email"
                                type="email"
                                placeholder="Enter your email"
                                className="bg-muted border-border"
                                value={forgotPasswordEmail}
                                onChange={(e) => setForgotPasswordEmail(e.target.value)}
                                data-testid="input-forgot-password-email"
                              />
                            </div>
                            <Button
                              className="w-full"
                              onClick={() => requestPasswordResetMutation.mutate(forgotPasswordEmail)}
                              disabled={!forgotPasswordEmail || requestPasswordResetMutation.isPending}
                              data-testid="button-send-reset-code"
                            >
                              {requestPasswordResetMutation.isPending ? "Sending..." : "Send Reset Code"}
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-4 pt-4">
                            <p className="text-sm text-muted-foreground">
                              Enter the reset code from your email and your new password.
                            </p>
                            <div className="space-y-2">
                              <Label htmlFor="reset-code" className="text-foreground">Reset Code</Label>
                              <Input
                                id="reset-code"
                                placeholder="Enter reset code"
                                className="bg-muted border-border"
                                value={resetCode}
                                onChange={(e) => setResetCode(e.target.value)}
                                data-testid="input-reset-code"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="new-pwd" className="text-foreground">New Password</Label>
                              <Input
                                id="new-pwd"
                                type="password"
                                placeholder="Enter new password"
                                className="bg-muted border-border"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                data-testid="input-reset-new-password"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="confirm-pwd" className="text-foreground">Confirm Password</Label>
                              <Input
                                id="confirm-pwd"
                                type="password"
                                placeholder="Confirm new password"
                                className="bg-muted border-border"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                data-testid="input-reset-confirm-password"
                              />
                            </div>
                            <Button
                              className="w-full bg-green-600 hover:bg-green-700"
                              onClick={() => resetPasswordMutation.mutate()}
                              disabled={!resetCode || !newPassword || !confirmPassword || resetPasswordMutation.isPending}
                              data-testid="button-confirm-reset-password"
                            >
                              {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
                            </Button>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="register">
                {registrationStep === "email" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendVerificationMutation.mutate(registerForm.email);
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="register-email" className="text-foreground">Email Address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                        <Input
                          id="register-email"
                          data-testid="input-register-email"
                          type="email"
                          placeholder="Enter your email"
                          className="pl-10 bg-muted border-border text-foreground"
                          value={registerForm.email}
                          onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      data-testid="button-send-code"
                      className="w-full"
                      disabled={sendVerificationMutation.isPending}
                    >
                      {sendVerificationMutation.isPending ? "Sending..." : "Send Verification Code"}
                    </Button>
                  </form>
                )}

                {registrationStep === "verify" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setRegistrationStep("create");
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label className="text-foreground">Verification Code</Label>
                      <p className="text-xs text-muted-foreground mb-2">Enter the code sent to {registerForm.email}</p>
                      <div className="relative">
                        <Input
                          data-testid="input-verification-code"
                          placeholder="Enter 6-digit code"
                          className="bg-muted border-border text-foreground text-center text-lg tracking-widest"
                          maxLength={6}
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          required
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      data-testid="button-verify-code"
                      className="w-full"
                      disabled={verificationCode.length !== 6}
                    >
                      Continue
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => setRegistrationStep("email")}
                    >
                      Back
                    </Button>
                  </form>
                )}

                {registrationStep === "create" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      registerMutation.mutate({ ...registerForm, verificationCode });
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="register-username" className="text-foreground">Username</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                        <Input
                          id="register-username"
                          data-testid="input-register-username"
                          placeholder="Choose username"
                          className="pl-10 bg-muted border-border text-foreground"
                          value={registerForm.username}
                          onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password" className="text-foreground">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                        <Input
                          id="register-password"
                          data-testid="input-register-password"
                          type="password"
                          placeholder="Create password"
                          className="pl-10 bg-muted border-border text-foreground"
                          value={registerForm.password}
                          onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      data-testid="button-register"
                      className="w-full"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? "Creating account..." : "Create Account"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => setRegistrationStep("verify")}
                    >
                      Back
                    </Button>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
