import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Shield, Mail, Lock, User } from "lucide-react";

export default function AuthPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loginForm, setLoginForm] = useState({ username: "", password: "", twoFactorToken: "" });
  const [registerForm, setRegisterForm] = useState({ username: "", email: "", password: "" });
  const [verificationCode, setVerificationCode] = useState("");
  const [registrationStep, setRegistrationStep] = useState<"email" | "verify" | "create">("email");
  const [requires2FA, setRequires2FA] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async (data: typeof loginForm) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      return json;
    },
    onSuccess: (data) => {
      if (data.requiresTwoFactor) {
        setRequires2FA(true);
        toast({ title: "2FA Required", description: "Please enter your authenticator code" });
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

  const [devCode, setDevCode] = useState("");

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
    onSuccess: (data) => {
      setDevCode(data.code || "");
      toast({ title: "Code Sent", description: `Your verification code: ${data.code}` });
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
                    loginMutation.mutate(loginForm);
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="login-username" className="text-foreground">Username</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="login-username"
                        data-testid="input-login-username"
                        placeholder="Enter username"
                        className="pl-10 bg-muted border-border text-foreground"
                        value={loginForm.username}
                        onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
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
                    <div className="space-y-2">
                      <Label htmlFor="2fa-token" className="text-foreground">2FA Code</Label>
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
                  )}
                  <Button
                    type="submit"
                    data-testid="button-login"
                    className="w-full"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? "Signing in..." : "Sign In"}
                  </Button>
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
                      {devCode && (
                        <div className="p-3 bg-blue-900/20 border border-blue-700/50 rounded-md text-sm">
                          <p className="text-blue-400">Dev Code: <span className="font-mono font-bold text-lg">{devCode}</span></p>
                        </div>
                      )}
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
