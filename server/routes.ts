import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { hashPassword, comparePassword } from "./utils/bcrypt";
import { generateToken } from "./utils/jwt";
import { requireAuth, requireAdmin, requireRole, type AuthRequest } from "./middleware/auth";
import { loginLimiter, registerLimiter, apiLimiter } from "./middleware/rateLimiter";
import { upload } from "./middleware/upload";
import { generateTotpSecret, verifyTotp, generateRecoveryCodes } from "./utils/totp";
import { holdEscrow, releaseEscrow, refundEscrow } from "./services/escrow";
import { 
  createNotification, 
  notifyOrderCreated, 
  notifyOrderPaid, 
  notifyOrderCompleted,
  notifyDisputeOpened 
} from "./services/notifications";
import { insertUserSchema, insertKycSchema, insertVendorProfileSchema, insertOfferSchema, insertOrderSchema, insertRatingSchema, insertExchangeSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Apply rate limiting to all API routes
  app.use("/api", apiLimiter);

  // ==================== AUTH ROUTES ====================
  
  // Register
  app.post("/api/auth/register", registerLimiter, async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const existingUsername = await storage.getUserByUsername(validatedData.username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await hashPassword(validatedData.password);
      
      const user = await storage.createUser({
        ...validatedData,
        password: hashedPassword,
      });

      await storage.createWallet({
        userId: user.id,
        currency: "USDT",
      });

      await storage.createAuditLog({
        userId: user.id,
        action: "user_registered",
        resource: "users",
        resourceId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      const token = generateToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      });

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Registration failed" });
    }
  });

  // Login
  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const { username, password, twoFactorToken } = req.body;

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (user.isFrozen) {
        return res.status(403).json({ message: `Account frozen: ${user.frozenReason}` });
      }

      if (!user.isActive) {
        return res.status(403).json({ message: "Account is not active" });
      }

      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        await storage.updateUserLoginAttempts(user.id, user.loginAttempts + 1);
        
        if (user.loginAttempts + 1 >= 5) {
          await storage.freezeUser(user.id, "Too many failed login attempts");
        }
        
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (user.twoFactorEnabled) {
        if (!twoFactorToken) {
          return res.status(200).json({ 
            requiresTwoFactor: true,
            message: "2FA token required" 
          });
        }

        const isValidTotp = verifyTotp(twoFactorToken, user.twoFactorSecret!);
        const isRecoveryCode = user.twoFactorRecoveryCodes?.includes(twoFactorToken);

        if (!isValidTotp && !isRecoveryCode) {
          return res.status(401).json({ message: "Invalid 2FA token" });
        }

        if (isRecoveryCode) {
          const updatedCodes = user.twoFactorRecoveryCodes!.filter(code => code !== twoFactorToken);
          await storage.updateUser(user.id, { twoFactorRecoveryCodes: updatedCodes });
        }
      }

      await storage.updateUser(user.id, { 
        lastLoginAt: new Date(),
        loginAttempts: 0,
      });

      await storage.createAuditLog({
        userId: user.id,
        action: "user_login",
        resource: "users",
        resourceId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      const token = generateToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      });

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          twoFactorEnabled: user.twoFactorEnabled,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Login failed" });
    }
  });

  // Get current user
  app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== 2FA ROUTES ====================
  
  // Setup 2FA
  app.post("/api/auth/2fa/setup", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.twoFactorEnabled) {
        return res.status(400).json({ message: "2FA is already enabled" });
      }

      const { secret, qrCode } = await generateTotpSecret(user.username);
      const recoveryCodes = generateRecoveryCodes();

      await storage.updateUser(user.id, {
        twoFactorSecret: secret,
        twoFactorRecoveryCodes: recoveryCodes,
      });

      res.json({
        secret,
        qrCode,
        recoveryCodes,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Enable 2FA
  app.post("/api/auth/2fa/enable", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { token } = req.body;
      
      const user = await storage.getUser(req.user!.userId);
      if (!user || !user.twoFactorSecret) {
        return res.status(400).json({ message: "2FA not set up" });
      }

      const isValid = verifyTotp(token, user.twoFactorSecret);
      if (!isValid) {
        return res.status(400).json({ message: "Invalid token" });
      }

      await storage.updateUser(user.id, { twoFactorEnabled: true });

      await storage.createAuditLog({
        userId: user.id,
        action: "2fa_enabled",
        resource: "users",
        resourceId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({ message: "2FA enabled successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Disable 2FA
  app.post("/api/auth/2fa/disable", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { token } = req.body;
      
      const user = await storage.getUser(req.user!.userId);
      if (!user || !user.twoFactorSecret) {
        return res.status(400).json({ message: "2FA not enabled" });
      }

      const isValid = verifyTotp(token, user.twoFactorSecret);
      if (!isValid) {
        return res.status(400).json({ message: "Invalid token" });
      }

      await storage.updateUser(user.id, {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: null,
      });

      await storage.createAuditLog({
        userId: user.id,
        action: "2fa_disabled",
        resource: "users",
        resourceId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({ message: "2FA disabled successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== KYC ROUTES ====================
  
  // Submit KYC
  app.post("/api/kyc/submit", requireAuth, upload.fields([
    { name: "idDocument", maxCount: 1 },
    { name: "selfie", maxCount: 1 }
  ]), async (req: AuthRequest, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      const existingKyc = await storage.getKycByUserId(req.user!.userId);
      if (existingKyc && existingKyc.status === "approved") {
        return res.status(400).json({ message: "KYC already approved" });
      }

      const faceMatchScore = (Math.random() * 20 + 80).toFixed(2);

      const kycData = {
        userId: req.user!.userId,
        idType: req.body.idType,
        idNumber: req.body.idNumber,
        idDocumentUrl: files.idDocument?.[0]?.path || null,
        selfieUrl: files.selfie?.[0]?.path || null,
        faceMatchScore,
      };

      let kyc;
      if (existingKyc) {
        kyc = await storage.updateKyc(existingKyc.id, kycData);
      } else {
        kyc = await storage.createKyc(kycData);
      }

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "kyc_submitted",
        resource: "kyc",
        resourceId: kyc!.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json(kyc);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get KYC status
  app.get("/api/kyc/status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const kyc = await storage.getKycByUserId(req.user!.userId);
      res.json(kyc || { status: "not_submitted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== VENDOR ROUTES ====================
  
  // Create vendor profile
  app.post("/api/vendor/profile", requireAuth, async (req: AuthRequest, res) => {
    try {
      const existingProfile = await storage.getVendorProfileByUserId(req.user!.userId);
      if (existingProfile) {
        return res.status(400).json({ message: "Vendor profile already exists" });
      }

      const validatedData = insertVendorProfileSchema.parse({
        ...req.body,
        userId: req.user!.userId,
      });

      const profile = await storage.createVendorProfile(validatedData);

      await storage.updateUser(req.user!.userId, { role: "vendor" });

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "vendor_profile_created",
        resource: "vendor_profiles",
        resourceId: profile.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json(profile);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get vendor profile
  app.get("/api/vendor/profile", requireAuth, async (req: AuthRequest, res) => {
    try {
      const profile = await storage.getVendorProfileByUserId(req.user!.userId);
      res.json(profile || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create offer
  app.post("/api/vendor/offers", requireAuth, requireRole("vendor", "admin"), async (req: AuthRequest, res) => {
    try {
      const profile = await storage.getVendorProfileByUserId(req.user!.userId);
      if (!profile) {
        return res.status(404).json({ message: "Vendor profile not found" });
      }

      if (!profile.isApproved) {
        return res.status(403).json({ message: "Vendor profile not approved" });
      }

      const kyc = await storage.getKycByUserId(req.user!.userId);
      if (!kyc || kyc.status !== "approved") {
        return res.status(403).json({ message: "KYC verification required before posting ads. Please complete your KYC verification." });
      }

      const validatedData = insertOfferSchema.parse({
        ...req.body,
        vendorId: profile.id,
      });

      const offer = await storage.createOffer(validatedData);

      res.json(offer);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get vendor's offers
  app.get("/api/vendor/offers", requireAuth, requireRole("vendor", "admin"), async (req: AuthRequest, res) => {
    try {
      const profile = await storage.getVendorProfileByUserId(req.user!.userId);
      if (!profile) {
        return res.status(404).json({ message: "Vendor profile not found" });
      }

      const offers = await storage.getOffersByVendor(profile.id);
      res.json(offers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update offer
  app.patch("/api/vendor/offers/:id", requireAuth, requireRole("vendor", "admin"), async (req: AuthRequest, res) => {
    try {
      const offer = await storage.getOffer(req.params.id);
      if (!offer) {
        return res.status(404).json({ message: "Offer not found" });
      }

      const profile = await storage.getVendorProfileByUserId(req.user!.userId);
      if (!profile || offer.vendorId !== profile.id) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const updated = await storage.updateOffer(req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== MARKETPLACE ROUTES ====================
  
  // Get active offers
  app.get("/api/marketplace/offers", async (req, res) => {
    try {
      const filters = {
        type: req.query.type as string | undefined,
        currency: req.query.currency as string | undefined,
        country: req.query.country as string | undefined,
        paymentMethod: req.query.paymentMethod as string | undefined,
        search: req.query.search as string | undefined,
      };

      const offers = await storage.getActiveOffers(filters);
      res.json(offers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create order
  app.post("/api/orders", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { offerId, amount, fiatAmount, paymentMethod } = req.body;

      const offer = await storage.getOffer(offerId);
      if (!offer || !offer.isActive) {
        return res.status(404).json({ message: "Offer not found or inactive" });
      }

      const validatedData = insertOrderSchema.parse({
        offerId,
        buyerId: req.user!.userId,
        vendorId: offer.vendorId,
        amount,
        fiatAmount,
        pricePerUnit: offer.pricePerUnit,
        currency: offer.currency,
        paymentMethod,
      });

      const order = await storage.createOrder(validatedData);

      await holdEscrow(offer.vendorId, amount, order.id);

      await storage.updateOrder(order.id, {
        escrowHeldAt: new Date(),
      });

      await notifyOrderCreated(order.id, req.user!.userId, offer.vendorId);

      await storage.createChatMessage({
        orderId: order.id,
        senderId: req.user!.userId,
        message: "Order created. Please proceed with payment.",
      });

      res.json(order);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get order details
  app.get("/api/orders/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const vendorProfile = await storage.getVendorProfile(order.vendorId);
      if (order.buyerId !== req.user!.userId && vendorProfile?.userId !== req.user!.userId && req.user!.role !== "admin") {
        return res.status(403).json({ message: "Not authorized" });
      }

      res.json(order);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Mark order as paid
  app.post("/api/orders/:id/paid", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.buyerId !== req.user!.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      if (order.status !== "created") {
        return res.status(400).json({ message: "Order cannot be marked as paid" });
      }

      const updated = await storage.updateOrder(req.params.id, {
        status: "paid",
        buyerPaidAt: new Date(),
      });

      await notifyOrderPaid(req.params.id, order.vendorId);

      await storage.createChatMessage({
        orderId: req.params.id,
        senderId: req.user!.userId,
        message: "Buyer marked payment as sent",
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Confirm order and release - ADMIN ONLY
  app.post("/api/orders/:id/confirm", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.status !== "paid") {
        return res.status(400).json({ message: "Order must be paid first" });
      }

      const vendorProfile = await storage.getVendorProfile(order.vendorId);

      const updated = await storage.updateOrder(req.params.id, {
        status: "completed",
        vendorConfirmedAt: new Date(),
        completedAt: new Date(),
        escrowReleasedAt: new Date(),
      });

      await releaseEscrow(order.vendorId, order.buyerId, order.amount, order.id);

      await notifyOrderCompleted(req.params.id, order.buyerId);

      if (vendorProfile) {
        await storage.updateVendorStats(order.vendorId, {
          completedTrades: (vendorProfile.completedTrades || 0) + 1,
          totalTrades: (vendorProfile.totalTrades || 0) + 1,
        });
      }

      await storage.createChatMessage({
        orderId: req.params.id,
        senderId: req.user!.userId,
        message: "Order completed and released by admin",
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get account details for completed order (buyer only)
  app.get("/api/orders/:id/account-details", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.buyerId !== req.user!.userId && req.user!.role !== "admin") {
        return res.status(403).json({ message: "Not authorized" });
      }

      if (order.status !== "completed") {
        return res.status(400).json({ message: "Account details are only available after order is completed" });
      }

      const offer = await storage.getOffer(order.offerId);
      if (!offer) {
        return res.status(404).json({ message: "Offer not found" });
      }

      res.json({ accountDetails: offer.accountDetails || null });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get user's orders
  app.get("/api/orders", requireAuth, async (req: AuthRequest, res) => {
    try {
      const buyerOrders = await storage.getOrdersByBuyer(req.user!.userId);
      
      const vendorProfile = await storage.getVendorProfileByUserId(req.user!.userId);
      let vendorOrders: any[] = [];
      if (vendorProfile) {
        vendorOrders = await storage.getOrdersByVendor(vendorProfile.id);
      }

      res.json({
        buyerOrders,
        vendorOrders,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== CHAT ROUTES ====================
  
  // Get order chat messages
  app.get("/api/orders/:id/messages", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const vendorProfile = await storage.getVendorProfile(order.vendorId);
      if (order.buyerId !== req.user!.userId && vendorProfile?.userId !== req.user!.userId && req.user!.role !== "admin") {
        return res.status(403).json({ message: "Not authorized" });
      }

      const messages = await storage.getChatMessagesByOrder(req.params.id);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Send chat message
  app.post("/api/orders/:id/messages", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const vendorProfile = await storage.getVendorProfile(order.vendorId);
      if (order.buyerId !== req.user!.userId && vendorProfile?.userId !== req.user!.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const message = await storage.createChatMessage({
        orderId: req.params.id,
        senderId: req.user!.userId,
        message: req.body.message,
      });

      res.json(message);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== WALLET ROUTES ====================
  
  // Get wallet balance
  app.get("/api/wallet", requireAuth, async (req: AuthRequest, res) => {
    try {
      const wallet = await storage.getWalletByUserId(req.user!.userId);
      res.json(wallet || null);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get transactions
  app.get("/api/wallet/transactions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const transactions = await storage.getTransactionsByUser(req.user!.userId);
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Mock deposit
  app.post("/api/wallet/deposit", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { amount } = req.body;
      const wallet = await storage.getWalletByUserId(req.user!.userId);
      
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      const newBalance = (parseFloat(wallet.availableBalance) + parseFloat(amount)).toFixed(8);
      await storage.updateWalletBalance(wallet.id, newBalance, wallet.escrowBalance);

      await storage.createTransaction({
        userId: req.user!.userId,
        walletId: wallet.id,
        type: "deposit",
        amount,
        currency: "USDT",
        description: "Mock deposit",
      });

      res.json({ message: "Deposit successful", newBalance });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== DISPUTE ROUTES ====================
  
  // Create dispute
  app.post("/api/orders/:id/dispute", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const vendorProfile = await storage.getVendorProfile(order.vendorId);
      if (order.buyerId !== req.user!.userId && vendorProfile?.userId !== req.user!.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const existingDispute = await storage.getDisputeByOrderId(req.params.id);
      if (existingDispute) {
        return res.status(400).json({ message: "Dispute already exists" });
      }

      const dispute = await storage.createDispute({
        orderId: req.params.id,
        openedBy: req.user!.userId,
        reason: req.body.reason,
      });

      await storage.updateOrder(req.params.id, { status: "disputed" });

      const otherUserId = order.buyerId === req.user!.userId ? vendorProfile!.userId : order.buyerId;
      await notifyDisputeOpened(req.params.id, otherUserId);

      res.json(dispute);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get dispute
  app.get("/api/disputes/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const dispute = await storage.getDispute(req.params.id);
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      res.json(dispute);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== RATING ROUTES ====================
  
  // Submit rating
  app.post("/api/orders/:id/rating", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.buyerId !== req.user!.userId) {
        return res.status(403).json({ message: "Only buyers can rate" });
      }

      if (order.status !== "completed") {
        return res.status(400).json({ message: "Can only rate completed orders" });
      }

      const existingRating = await storage.getRatingByOrder(req.params.id);
      if (existingRating) {
        return res.status(400).json({ message: "Order already rated" });
      }

      const validatedData = insertRatingSchema.parse({
        orderId: req.params.id,
        vendorId: order.vendorId,
        ratedBy: req.user!.userId,
        stars: req.body.stars,
        comment: req.body.comment,
      });

      const rating = await storage.createRating(validatedData);

      const allRatings = await storage.getRatingsByVendor(order.vendorId);
      const avgRating = (allRatings.reduce((sum, r) => sum + r.stars, 0) / allRatings.length).toFixed(2);
      
      await storage.updateVendorStats(order.vendorId, {
        averageRating: avgRating,
        totalRatings: allRatings.length,
      });

      res.json(rating);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== NOTIFICATION ROUTES ====================
  
  // Get notifications
  app.get("/api/notifications", requireAuth, async (req: AuthRequest, res) => {
    try {
      const notifications = await storage.getNotificationsByUser(req.user!.userId);
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Mark notification as read
  app.patch("/api/notifications/:id/read", requireAuth, async (req: AuthRequest, res) => {
    try {
      await storage.markNotificationAsRead(req.params.id);
      res.json({ message: "Marked as read" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get unread count
  app.get("/api/notifications/unread/count", requireAuth, async (req: AuthRequest, res) => {
    try {
      const count = await storage.getUnreadCount(req.user!.userId);
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== ADMIN ROUTES ====================
  
  // Get pending KYC
  app.get("/api/admin/kyc/pending", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const pending = await storage.getPendingKyc();
      res.json(pending);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Review KYC
  app.post("/api/admin/kyc/:id/review", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { status, tier, adminNotes, rejectionReason } = req.body;

      const updated = await storage.updateKyc(req.params.id, {
        status,
        tier,
        adminNotes,
        rejectionReason,
        reviewedAt: new Date(),
        reviewedBy: req.user!.userId,
      });

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "kyc_reviewed",
        resource: "kyc",
        resourceId: req.params.id,
        changes: { status, tier },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Toggle star verification
  app.post("/api/admin/kyc/:id/star-verify", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const kyc = await storage.getKyc(req.params.id);
      if (!kyc) {
        return res.status(404).json({ message: "KYC not found" });
      }

      const updated = await storage.updateKyc(req.params.id, {
        isStarVerified: !kyc.isStarVerified,
      });

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: kyc.isStarVerified ? "star_verification_removed" : "star_verification_added",
        resource: "kyc",
        resourceId: req.params.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get pending vendors
  app.get("/api/admin/vendors/pending", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const pending = await storage.getPendingVendors();
      res.json(pending);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Approve vendor
  app.post("/api/admin/vendors/:id/approve", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const updated = await storage.updateVendorProfile(req.params.id, {
        isApproved: true,
      });

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "vendor_approved",
        resource: "vendor_profiles",
        resourceId: req.params.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get open disputes
  app.get("/api/admin/disputes", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const disputes = await storage.getOpenDisputes();
      res.json(disputes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Resolve dispute
  app.post("/api/admin/disputes/:id/resolve", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { resolution, status, adminNotes } = req.body;

      const dispute = await storage.getDispute(req.params.id);
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      const order = await storage.getOrder(dispute.orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (status === "resolved_refund") {
        await refundEscrow(order.vendorId, order.amount, order.id);
      } else if (status === "resolved_release") {
        await releaseEscrow(order.vendorId, order.buyerId, order.amount, order.id);
      }

      const updated = await storage.updateDispute(req.params.id, {
        status,
        resolution,
        adminNotes,
        resolvedAt: new Date(),
        resolvedBy: req.user!.userId,
      });

      await storage.updateOrder(dispute.orderId, {
        status: status === "resolved_refund" ? "cancelled" : "completed",
      });

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "dispute_resolved",
        resource: "disputes",
        resourceId: req.params.id,
        changes: { status, resolution },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get audit logs
  app.get("/api/admin/audit-logs", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const filters = {
        userId: req.query.userId as string | undefined,
        action: req.query.action as string | undefined,
        resource: req.query.resource as string | undefined,
      };

      const logs = await storage.getAuditLogs(filters);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Freeze user
  app.post("/api/admin/users/:id/freeze", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { reason } = req.body;
      await storage.freezeUser(req.params.id, reason);

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "user_frozen",
        resource: "users",
        resourceId: req.params.id,
        changes: { reason },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({ message: "User frozen" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Unfreeze user
  app.post("/api/admin/users/:id/unfreeze", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      await storage.unfreezeUser(req.params.id);

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "user_unfrozen",
        resource: "users",
        resourceId: req.params.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({ message: "User unfrozen" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Maintenance settings
  app.get("/api/admin/maintenance", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getMaintenanceSettings();
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/maintenance", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const updated = await storage.updateMaintenanceSettings({
        ...req.body,
        updatedBy: req.user!.userId,
      });

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "maintenance_updated",
        resource: "maintenance_settings",
        resourceId: updated.id,
        changes: req.body,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Theme settings
  app.get("/api/admin/theme", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getThemeSettings();
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/theme", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const updated = await storage.updateThemeSettings({
        ...req.body,
        updatedBy: req.user!.userId,
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // ==================== EXCHANGE ROUTES ====================

  // Get all active exchanges (public)
  app.get("/api/exchanges", async (req, res) => {
    try {
      const exchanges = await storage.getActiveExchanges();
      res.json(exchanges);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get all exchanges (admin)
  app.get("/api/admin/exchanges", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const exchanges = await storage.getAllExchanges();
      res.json(exchanges);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create exchange (admin)
  app.post("/api/admin/exchanges", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertExchangeSchema.parse({
        ...req.body,
        createdBy: req.user!.userId,
      });

      const exchange = await storage.createExchange(validatedData);

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "exchange_created",
        resource: "exchanges",
        resourceId: exchange.id,
        changes: { name: exchange.name, symbol: exchange.symbol },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json(exchange);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Update exchange (admin)
  app.patch("/api/admin/exchanges/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const exchange = await storage.getExchange(req.params.id);
      if (!exchange) {
        return res.status(404).json({ message: "Exchange not found" });
      }

      const allowedFields = ["name", "symbol", "description", "iconUrl", "isActive", "sortOrder"];
      const updateData: Record<string, any> = {};
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const updated = await storage.updateExchange(req.params.id, updateData);

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "exchange_updated",
        resource: "exchanges",
        resourceId: req.params.id,
        changes: updateData,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Delete exchange (admin)
  app.delete("/api/admin/exchanges/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const exchange = await storage.getExchange(req.params.id);
      if (!exchange) {
        return res.status(404).json({ message: "Exchange not found" });
      }

      await storage.deleteExchange(req.params.id);

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "exchange_deleted",
        resource: "exchanges",
        resourceId: req.params.id,
        changes: { name: exchange.name, symbol: exchange.symbol },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({ message: "Exchange deleted" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  return httpServer;
}
