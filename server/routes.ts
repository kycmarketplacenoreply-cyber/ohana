import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { hashPassword, comparePassword } from "./utils/bcrypt";
import { generateToken } from "./utils/jwt";
import { requireAuth, requireAdmin, requireRole, requireDisputeAdmin, type AuthRequest } from "./middleware/auth";
import { loginLimiter, registerLimiter, apiLimiter } from "./middleware/rateLimiter";
import { upload } from "./middleware/upload";
import { generateTotpSecret, verifyTotp, generateRecoveryCodes } from "./utils/totp";
import { holdEscrow, releaseEscrow, refundEscrow, holdBuyerEscrow, releaseEscrowWithFee, refundBuyerEscrow, holdOfferEscrow, releaseOfferEscrow } from "./services/escrow";
import { 
  createNotification, 
  notifyOrderCreated, 
  notifyOrderPaid, 
  notifyOrderCompleted,
  notifyDisputeOpened,
  notifyAccountFrozen,
  notifyAccountUnfrozen
} from "./services/notifications";
import { insertUserSchema, insertKycSchema, insertVendorProfileSchema, insertOfferSchema, insertOrderSchema, insertRatingSchema, insertExchangeSchema, disputes } from "@shared/schema";
import { db } from "./db";

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
        profilePicture: user.profilePicture,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        isFrozen: user.isFrozen,
        frozenReason: user.frozenReason,
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

  // Create offer - allows any KYC verified user with 2FA enabled to post ads (admin cannot post)
  app.post("/api/vendor/offers", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Check if user is admin - admin cannot post ads, only monitor
      const user = await storage.getUser(req.user!.userId);
      if (user?.role === "admin" || user?.role === "dispute_admin") {
        return res.status(403).json({ message: "Admin accounts cannot post ads. Admins are for platform monitoring only." });
      }

      // Check if user is frozen
      if (user?.isFrozen) {
        return res.status(403).json({ message: "Your account is frozen. You cannot post ads until your account is unfrozen." });
      }

      // Check KYC status first
      const kyc = await storage.getKycByUserId(req.user!.userId);
      if (!kyc || kyc.status !== "approved") {
        return res.status(403).json({ message: "KYC verification required before posting ads. Please complete your KYC verification." });
      }

      // Check 2FA is enabled
      if (!user?.twoFactorEnabled) {
        return res.status(403).json({ message: "Two-factor authentication (2FA) must be enabled before posting ads. Please enable 2FA in your security settings." });
      }

      // Auto-create vendor profile if user doesn't have one
      let profile = await storage.getVendorProfileByUserId(req.user!.userId);
      if (!profile) {
        const user = await storage.getUser(req.user!.userId);
        profile = await storage.createVendorProfile({
          userId: req.user!.userId,
          country: "Unknown",
          bio: `Verified trader - ${user?.username}`,
        });
        // Auto-approve for KYC verified users
        await storage.updateVendorProfile(profile.id, { isApproved: true });
        profile.isApproved = true;
        // Update user role to vendor
        await storage.updateUser(req.user!.userId, { role: "vendor" });
      }

      if (!profile.isApproved) {
        return res.status(403).json({ message: "Vendor profile not approved. Please wait for admin approval." });
      }

      // Automatically set tradeIntent based on offer type
      // type "sell" = vendor is selling (sell_ad) 
      // type "buy" = vendor is buying (buy_ad)
      const tradeIntent = req.body.type === "buy" ? "buy_ad" : "sell_ad";

      // For buy ads, check buyer's balance and hold escrow immediately
      let escrowHeldAmount = "0";
      if (tradeIntent === "buy_ad") {
        // Calculate the total escrow required based on available amount and price per unit
        const availableAmount = parseFloat(req.body.availableAmount || "0");
        const pricePerUnit = parseFloat(req.body.pricePerUnit || "0");
        const requiredEscrow = (availableAmount * pricePerUnit).toFixed(8);
        
        // Check buyer's wallet balance
        const buyerWallet = await storage.getWalletByUserId(req.user!.userId, "USDT");
        if (!buyerWallet) {
          return res.status(400).json({ message: "Wallet not found. Please contact support." });
        }

        const availableBalance = parseFloat(buyerWallet.availableBalance);
        const escrowRequired = parseFloat(requiredEscrow);

        if (availableBalance < escrowRequired) {
          return res.status(400).json({ 
            message: `Insufficient balance to post this buy ad. You need ${escrowRequired.toFixed(2)} USDT but only have ${availableBalance.toFixed(2)} USDT available. Please deposit more funds first.` 
          });
        }

        escrowHeldAmount = requiredEscrow;
      }

      const validatedData = insertOfferSchema.parse({
        ...req.body,
        vendorId: profile.id,
        tradeIntent,
      });

      const offer = await storage.createOffer(validatedData);

      // For buy ads, hold the escrow after creating the offer
      if (tradeIntent === "buy_ad" && parseFloat(escrowHeldAmount) > 0) {
        try {
          await holdOfferEscrow(req.user!.userId, escrowHeldAmount, offer.id);
          await storage.updateOffer(offer.id, { escrowHeldAmount });
        } catch (escrowError: any) {
          // If escrow hold fails, deactivate the offer
          await storage.deactivateOffer(offer.id);
          return res.status(400).json({ message: escrowError.message });
        }
      }

      const updatedOffer = await storage.getOffer(offer.id);
      res.json(updatedOffer);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get vendor's offers - allows any authenticated user (for KYC verified users)
  app.get("/api/vendor/offers", requireAuth, async (req: AuthRequest, res) => {
    try {
      const profile = await storage.getVendorProfileByUserId(req.user!.userId);
      if (!profile) {
        return res.json([]);
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

      // If deactivating a buy_ad, check for active orders and release only unassigned escrow
      if (req.body.isActive === false && offer.tradeIntent === "buy_ad") {
        // Check for active orders - warn user but don't block
        const activeOrders = await storage.getActiveOrdersByOffer(offer.id);
        if (activeOrders.length > 0) {
          // There are active orders - only release the unassigned escrow
          // The escrow for active orders stays in place and will be handled when orders complete
        }
        
        // Release only the unassigned escrow (escrowHeldAmount tracks only unassigned funds)
        const remainingEscrow = parseFloat(offer.escrowHeldAmount || "0");
        if (remainingEscrow > 0) {
          await releaseOfferEscrow(profile.userId, remainingEscrow.toString(), offer.id);
          req.body.escrowHeldAmount = "0";
        }
      }

      const updated = await storage.updateOffer(req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Delete offer
  app.delete("/api/vendor/offers/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const offer = await storage.getOffer(req.params.id);
      if (!offer) {
        return res.status(404).json({ message: "Offer not found" });
      }

      const profile = await storage.getVendorProfileByUserId(req.user!.userId);
      if (!profile || offer.vendorId !== profile.id) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Check for active orders
      const activeOrders = await storage.getActiveOrdersByOffer(offer.id);
      if (activeOrders.length > 0) {
        return res.status(400).json({ message: "Cannot delete offer with active orders. Please wait for orders to complete or cancel them first." });
      }

      // For buy_ad, release any held escrow
      if (offer.tradeIntent === "buy_ad") {
        const remainingEscrow = parseFloat(offer.escrowHeldAmount || "0");
        if (remainingEscrow > 0) {
          await releaseOfferEscrow(profile.userId, remainingEscrow.toString(), offer.id);
        }
      }

      // Deactivate instead of delete to preserve history
      await storage.deactivateOffer(offer.id);
      res.json({ message: "Offer deleted successfully" });
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
      // Check if user is frozen
      const user = await storage.getUser(req.user!.userId);
      if (user?.isFrozen) {
        return res.status(403).json({ message: "Your account is frozen. You cannot create orders until your account is unfrozen." });
      }

      const { offerId, amount, fiatAmount, paymentMethod, buyerId } = req.body;

      const offer = await storage.getOffer(offerId);
      if (!offer || !offer.isActive) {
        return res.status(404).json({ message: "Offer not found or inactive" });
      }

      const tradeIntent = offer.tradeIntent || "sell_ad";
      const platformFeeRate = 0.20;
      const escrowAmount = parseFloat(fiatAmount);
      const platformFee = escrowAmount * platformFeeRate;
      const sellerReceives = escrowAmount - platformFee;

      let orderBuyerId: string;
      const initialStatus: "escrowed" = "escrowed";

      if (tradeIntent === "sell_ad") {
        orderBuyerId = req.user!.userId;

        const buyerWallet = await storage.getWalletByUserId(req.user!.userId, "USDT");
        if (!buyerWallet) {
          return res.status(400).json({ message: "Wallet not found" });
        }

        const buyerBalance = parseFloat(buyerWallet.availableBalance);
        if (buyerBalance < escrowAmount) {
          return res.status(400).json({ message: `Insufficient balance. You need ${escrowAmount} USDT but have ${buyerBalance.toFixed(2)} USDT. Please deposit funds to your wallet first.` });
        }

        // Validate that order amount doesn't exceed available amount
        const requestedAmount = parseFloat(amount);
        const offerAvailable = parseFloat(offer.availableAmount);
        if (requestedAmount > offerAvailable) {
          return res.status(400).json({ message: `Order amount (${requestedAmount}) exceeds available amount (${offerAvailable}). Please reduce your order size.` });
        }
      } else {
        // For buy_ad, the buyer is the offer creator (vendor)
        // The person accepting (seller) is the current user
        // Funds are already held in escrow from when the buy ad was posted
        const vendorProfile = await storage.getVendorProfile(offer.vendorId);
        if (!vendorProfile) {
          return res.status(400).json({ message: "Offer vendor not found" });
        }
        orderBuyerId = vendorProfile.userId;

        // Verify offer has sufficient escrow held
        const offerEscrowHeld = parseFloat(offer.escrowHeldAmount || "0");
        if (offerEscrowHeld < escrowAmount) {
          return res.status(400).json({ message: "Offer does not have sufficient escrow held for this order." });
        }

        // Validate that order amount doesn't exceed available amount
        const requestedAmount = parseFloat(amount);
        const offerAvailable = parseFloat(offer.availableAmount);
        if (requestedAmount > offerAvailable) {
          return res.status(400).json({ message: `Order amount (${requestedAmount}) exceeds available amount (${offerAvailable}). Please reduce your order size.` });
        }
      }

      const validatedData = insertOrderSchema.parse({
        offerId,
        buyerId: orderBuyerId,
        vendorId: offer.vendorId,
        amount,
        fiatAmount,
        pricePerUnit: offer.pricePerUnit,
        currency: offer.currency,
        paymentMethod,
        tradeIntent,
      });

      const order = await storage.createOrder({
        ...validatedData,
        createdBy: req.user!.userId,
        escrowAmount: escrowAmount.toString(),
        platformFee: platformFee.toString(),
        sellerReceives: sellerReceives.toString(),
      });

      // All orders now start as escrowed immediately
      await storage.updateOrder(order.id, { status: initialStatus, escrowHeldAt: new Date() });

      if (tradeIntent === "sell_ad") {
        await holdBuyerEscrow(req.user!.userId, fiatAmount, order.id);
        
        // Reduce the available amount on the offer
        const remainingAmount = (parseFloat(offer.availableAmount) - parseFloat(amount)).toFixed(8);
        await storage.updateOffer(offer.id, { availableAmount: remainingAmount });
        
        // If offer is depleted, deactivate it
        if (parseFloat(remainingAmount) <= 0) {
          await storage.deactivateOffer(offer.id);
        }
        
        await notifyOrderCreated(order.id, req.user!.userId, offer.vendorId);
        await storage.createChatMessage({
          orderId: order.id,
          senderId: req.user!.userId,
          message: "Order created. Funds are in escrow. Seller, please proceed with delivery.",
        });
      } else {
        // For buy_ad orders, funds are already in buyer's wallet escrow from when the offer was posted
        // No need to hold again - just track that this portion is now assigned to an order
        const vendorProfile = await storage.getVendorProfile(offer.vendorId);
        if (!vendorProfile) {
          return res.status(400).json({ message: "Vendor profile not found" });
        }

        // Update offer's escrow held amount (reduce by order amount - this tracks unassigned escrow)
        const remainingOfferEscrow = (parseFloat(offer.escrowHeldAmount || "0") - escrowAmount).toFixed(8);
        await storage.updateOffer(offer.id, { escrowHeldAmount: remainingOfferEscrow });

        // Reduce the available amount on the offer
        const remainingAmount = (parseFloat(offer.availableAmount) - parseFloat(amount)).toFixed(8);
        await storage.updateOffer(offer.id, { availableAmount: remainingAmount });

        // If offer is depleted, deactivate it
        // Note: We only release offer.escrowHeldAmount (unassigned escrow), not order escrow
        if (parseFloat(remainingAmount) <= 0) {
          // If there's still unassigned escrow, release it (this happens if there's rounding)
          if (parseFloat(remainingOfferEscrow) > 0) {
            await releaseOfferEscrow(orderBuyerId, remainingOfferEscrow, offer.id);
            await storage.updateOffer(offer.id, { escrowHeldAmount: "0" });
          }
          await storage.deactivateOffer(offer.id);
        }

        await notifyOrderCreated(order.id, req.user!.userId, offer.vendorId);
        await storage.createChatMessage({
          orderId: order.id,
          senderId: req.user!.userId,
          message: `Order accepted. Buyer's funds (${escrowAmount} USDT) are already in escrow. Please proceed with delivery.`,
        });
        
        // Notify the buyer (offer creator) that their buy order has been accepted
        await createNotification(
          vendorProfile.userId,
          "order",
          "Buy Order Accepted",
          `A seller has accepted your buy offer. ${escrowAmount} USDT is held in escrow. Order #${order.id.slice(0, 8)}`,
          `/order/${order.id}`
        );
      }

      const updatedOrder = await storage.getOrder(order.id);
      res.json(updatedOrder);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Deposit funds for buy_ad orders - DEPRECATED: Funds are now held when posting buy ads
  // This endpoint is kept for backward compatibility but will return an error
  app.post("/api/orders/:id/deposit", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // For buy_ad orders, funds are automatically held when the ad is posted
      // No separate deposit step is needed
      if (order.tradeIntent === "buy_ad") {
        if (order.status === "escrowed") {
          return res.status(400).json({ message: "Funds are already in escrow. No deposit needed - funds were held when the buy ad was posted." });
        }
        return res.status(400).json({ message: "Deposit is no longer required. Funds are held automatically when posting buy ads." });
      }

      // For sell_ad orders, this endpoint shouldn't be used
      return res.status(400).json({ message: "This endpoint is not applicable for this order type." });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Legacy deposit confirmation route (placeholder for old clients) - DEPRECATED
  app.post("/api/orders/:id/confirm-deposit", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Deposits are automatic now - return success if already escrowed
      if (order.status === "escrowed") {
        res.json({ message: "Funds already confirmed in escrow", order });
      } else {
        res.status(400).json({ message: "Deposit confirmation is no longer needed. Funds are held automatically." });
      }
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Placeholder to clean up old deposit chat message pattern
  app.get("/api/orders/:id/deposit-status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // For buy_ad, funds are always already in escrow since we hold them when posting the ad
      const isDepositRequired = false;
      const isDeposited = order.status === "escrowed" || order.status === "paid" || order.status === "completed";

      res.json({
        isDepositRequired,
        isDeposited,
        message: "Funds are held automatically when buy ads are posted. No separate deposit step required."
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Keep the rest of the original deposit handler structure for potential legacy code
  // Original deposit flow was here - now simplified above
  /*
  The old flow was:
  1. Buyer posts buy ad - no escrow held
  2. Seller accepts - order created with "awaiting_deposit" status
  3. Buyer had to manually deposit
  
  New flow:
  1. Buyer posts buy ad - escrow is held immediately
  2. Seller accepts - order starts as "escrowed" automatically
  No manual deposit step needed!
  */

  // Get order details
  app.get("/api/orders/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const vendorProfile = await storage.getVendorProfile(order.vendorId);
      const isCreator = order.createdBy === req.user!.userId;
      if (order.buyerId !== req.user!.userId && vendorProfile?.userId !== req.user!.userId && !isCreator && req.user!.role !== "admin") {
        return res.status(403).json({ message: "Not authorized" });
      }

      res.json(order);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Mark order as paid (for external fiat payments if applicable)
  app.post("/api/orders/:id/paid", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.buyerId !== req.user!.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      if (order.status !== "escrowed" && order.status !== "created") {
        return res.status(400).json({ message: "Order cannot be marked as paid in current status" });
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

  // Confirm delivery - Buyer confirms they received the product (or Admin can confirm)
  app.post("/api/orders/:id/confirm", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { twoFactorToken } = req.body;
      
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const vendorProfile = await storage.getVendorProfile(order.vendorId);
      const isBuyer = order.buyerId === req.user!.userId;
      const isAdmin = req.user!.role === "admin" || req.user!.role === "dispute_admin";
      
      if (!isBuyer && !isAdmin) {
        return res.status(403).json({ message: "Only the buyer or admin can confirm delivery" });
      }

      // Require 2FA for non-admin users when releasing funds
      if (!isAdmin) {
        const user = await storage.getUser(req.user!.userId);
        
        // 2FA must be enabled to release funds
        if (!user?.twoFactorEnabled) {
          return res.status(403).json({ 
            message: "Two-factor authentication (2FA) must be enabled before confirming delivery. Please enable 2FA in your security settings.", 
            requires2FASetup: true 
          });
        }
        
        // 2FA token is required
        if (!twoFactorToken) {
          return res.status(400).json({ 
            message: "Please enter your authenticator code to confirm delivery and release funds.", 
            requires2FA: true 
          });
        }
        
        // Verify the 2FA token
        const isValid = verifyTotp(twoFactorToken, user.twoFactorSecret!);
        if (!isValid) {
          return res.status(401).json({ message: "Invalid authenticator code. Please try again." });
        }
      }

      if (order.status !== "confirmed") {
        return res.status(400).json({ message: "Seller must deliver the product first" });
      }

      const sellerId = order.tradeIntent === "buy_ad" && order.createdBy 
        ? order.createdBy 
        : vendorProfile?.userId;
      
      if (!sellerId) {
        return res.status(400).json({ message: "Seller not found" });
      }

      const { sellerAmount, platformFee } = await releaseEscrowWithFee(
        order.buyerId,
        sellerId,
        order.fiatAmount,
        order.id
      );

      const updated = await storage.updateOrder(req.params.id, {
        status: "completed",
        completedAt: new Date(),
        escrowReleasedAt: new Date(),
      });

      await notifyOrderCompleted(req.params.id, order.buyerId);

      if (vendorProfile && order.tradeIntent === "sell_ad") {
        await storage.updateVendorStats(order.vendorId, {
          completedTrades: (vendorProfile.completedTrades || 0) + 1,
          totalTrades: (vendorProfile.totalTrades || 0) + 1,
        });
      }
      
      await createNotification(
        sellerId,
        "payment",
        "Payment Received",
        `You received ${sellerAmount} USDT for order ${order.id.slice(0, 8)} (20% platform fee: ${platformFee} USDT)`,
        `/order/${order.id}`
      );

      const confirmedBy = isAdmin ? "admin" : "buyer";
      await storage.createChatMessage({
        orderId: req.params.id,
        senderId: req.user!.userId,
        message: `Delivery confirmed by ${confirmedBy}. Payment of ${sellerAmount} USDT released to seller (20% platform fee: ${platformFee} USDT).`,
      });

      res.json({ ...updated, sellerAmount, platformFee });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Seller delivers product - marks order as product delivered
  app.post("/api/orders/:id/deliver", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const vendorProfile = await storage.getVendorProfile(order.vendorId);
      const isVendor = vendorProfile && vendorProfile.userId === req.user!.userId;
      const isCreator = order.createdBy === req.user!.userId;
      const isSeller = order.tradeIntent === "buy_ad" ? isCreator : isVendor;
      const isAdmin = req.user!.role === "admin";
      
      if (!isSeller && !isAdmin) {
        return res.status(403).json({ message: "Only the seller or admin can mark as delivered" });
      }

      if (order.status !== "paid" && order.status !== "escrowed") {
        return res.status(400).json({ message: "Funds must be in escrow before delivery" });
      }

      const { deliveryDetails } = req.body;

      const updated = await storage.updateOrder(req.params.id, {
        status: "confirmed",
        vendorConfirmedAt: new Date(),
      });

      await createNotification(
        order.buyerId,
        "order",
        "Product Delivered",
        `Seller has delivered your order. Please review and confirm receipt.`,
        `/order/${order.id}`
      );

      await storage.createChatMessage({
        orderId: req.params.id,
        senderId: req.user!.userId,
        message: deliveryDetails ? `Product delivered: ${deliveryDetails}` : "Product has been delivered. Please review and confirm receipt.",
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

      const allOrders = [...buyerOrders, ...vendorOrders];
      const uniqueOrders = allOrders.filter((order, index, self) => 
        index === self.findIndex(o => o.id === order.id)
      );
      const pendingOrders = uniqueOrders.filter(o => 
        o.status === "created" || o.status === "awaiting_deposit" || o.status === "escrowed" || o.status === "paid" || o.status === "confirmed"
      );
      const cancelledOrders = uniqueOrders.filter(o => o.status === "cancelled");
      const disputedOrders = uniqueOrders.filter(o => o.status === "disputed");

      // Get Loader Zone orders
      const loaderOrders = await storage.getLoaderOrdersByLoader(req.user!.userId);
      const receiverOrders = await storage.getLoaderOrdersByReceiver(req.user!.userId);
      const allLoaderOrders = [...loaderOrders, ...receiverOrders];
      const uniqueLoaderOrders = allLoaderOrders.filter((order, index, self) => 
        index === self.findIndex(o => o.id === order.id)
      );
      
      // Fetch usernames for loader orders
      const loaderOrdersWithDetails = await Promise.all(uniqueLoaderOrders.map(async (order) => {
        const loader = await storage.getUser(order.loaderId);
        const receiver = await storage.getUser(order.receiverId);
        return {
          ...order,
          loaderUsername: loader?.username,
          receiverUsername: receiver?.username,
          role: order.loaderId === req.user!.userId ? "loader" : "receiver",
          orderType: "loader" as const,
        };
      }));

      res.json({
        buyerOrders,
        vendorOrders,
        pendingOrders,
        cancelledOrders,
        disputedOrders,
        loaderOrders: loaderOrdersWithDetails,
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
      const isCreator = order.createdBy === req.user!.userId;
      if (order.buyerId !== req.user!.userId && vendorProfile?.userId !== req.user!.userId && !isCreator && req.user!.role !== "admin") {
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
      const isCreator = order.createdBy === req.user!.userId;
      if (order.buyerId !== req.user!.userId && vendorProfile?.userId !== req.user!.userId && !isCreator) {
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

  // Cancel order (before account/payment exchange only)
  app.post("/api/orders/:id/cancel", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const vendorProfile = await storage.getVendorProfile(order.vendorId);
      const isBuyer = order.buyerId === req.user!.userId;
      const isVendor = vendorProfile?.userId === req.user!.userId;
      
      if (!isBuyer && !isVendor) {
        return res.status(403).json({ message: "Not authorized to cancel this order" });
      }

      const cancellableStatuses = ["created", "escrowed"];
      if (!cancellableStatuses.includes(order.status)) {
        return res.status(400).json({ message: "Order cannot be cancelled after payment or account details have been exchanged" });
      }

      const { reason } = req.body;
      
      if (order.status === "escrowed" && order.escrowAmount) {
        const escrowAmount = parseFloat(order.escrowAmount);
        if (escrowAmount > 0) {
          const buyerWallet = await storage.getWalletByUserId(order.buyerId, "USDT");
          if (buyerWallet) {
            await storage.releaseEscrow(buyerWallet.id, order.escrowAmount);
            await storage.createTransaction({
              userId: order.buyerId,
              walletId: buyerWallet.id,
              type: "refund",
              amount: order.escrowAmount,
              currency: "USDT",
              relatedOrderId: order.id,
              description: "Order cancelled - escrow refunded",
            });
          }
        }
      }

      const offer = await storage.getOffer(order.offerId);
      if (offer) {
        const restoredAmount = (parseFloat(offer.availableAmount) + parseFloat(order.amount)).toFixed(8);
        await storage.updateOffer(offer.id, { availableAmount: restoredAmount, isActive: true });
      }

      await storage.updateOrder(req.params.id, {
        status: "cancelled",
        cancelReason: reason || "Cancelled by user",
      });

      await storage.createChatMessage({
        orderId: req.params.id,
        senderId: req.user!.userId,
        message: `Order cancelled: ${reason || "No reason provided"}`,
        isSystemMessage: true,
      });

      res.json({ message: "Order cancelled successfully" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Submit feedback after successful trade
  app.post("/api/orders/:id/feedback", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.status !== "completed") {
        return res.status(400).json({ message: "Feedback can only be submitted for completed orders" });
      }

      const vendorProfile = await storage.getVendorProfile(order.vendorId);
      const isBuyer = order.buyerId === req.user!.userId;
      const isVendor = vendorProfile?.userId === req.user!.userId;
      
      if (!isBuyer && !isVendor) {
        return res.status(403).json({ message: "Not authorized to submit feedback for this order" });
      }

      const existingRating = await storage.getRatingByOrder(order.id);
      if (existingRating && existingRating.ratedBy === req.user!.userId) {
        return res.status(400).json({ message: "You have already submitted feedback for this order" });
      }

      const { stars, comment } = req.body;
      if (!stars || stars < 1 || stars > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5 stars" });
      }

      const rating = await storage.createRating({
        orderId: order.id,
        vendorId: order.vendorId,
        ratedBy: req.user!.userId,
        stars,
        comment: comment || "",
      });

      const allRatings = await storage.getRatingsByVendor(order.vendorId);
      const totalStars = allRatings.reduce((sum, r) => sum + r.stars, 0);
      const averageRating = (totalStars / allRatings.length).toFixed(2);
      
      await storage.updateVendorStats(order.vendorId, {
        averageRating,
        totalRatings: allRatings.length,
      });

      res.json(rating);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Check if feedback was submitted for order
  app.get("/api/orders/:id/feedback", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const existingRating = await storage.getRatingByOrder(order.id);
      const hasSubmitted = existingRating?.ratedBy === req.user!.userId;
      
      res.json({ hasSubmitted, rating: existingRating });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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
      const user = await storage.getUser(req.user!.userId);
      const isAdmin = user?.role === "admin" || user?.role === "dispute_admin";
      
      let transactions = await storage.getTransactionsByUser(req.user!.userId);
      
      // Hide fee transactions from non-admin users
      if (!isAdmin) {
        transactions = transactions.filter(tx => tx.type !== "fee");
      }
      
      // Add displayAmount for proper sign display
      // For escrow_release where user is buyer (funds going to seller), show as negative
      const transactionsWithDisplay = await Promise.all(transactions.map(async (tx) => {
        let isNegative = false;
        
        if (tx.type === "escrow_release" && tx.relatedOrderId) {
          // Check if this user was the buyer in this order
          const order = await storage.getOrder(tx.relatedOrderId);
          if (order && order.buyerId === req.user!.userId) {
            // Buyer's escrow is being released to seller - show as negative
            isNegative = true;
          }
        }
        
        // escrow_hold and withdraw are always negative
        if (tx.type === "escrow_hold" || tx.type === "withdraw") {
          isNegative = true;
        }
        
        return {
          ...tx,
          isNegative,
        };
      }));
      
      res.json(transactionsWithDisplay);
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
      const isCreator = order.createdBy === req.user!.userId;
      if (order.buyerId !== req.user!.userId && vendorProfile?.userId !== req.user!.userId && !isCreator) {
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

      const kycRecord = await storage.getKyc(req.params.id);
      if (!kycRecord) {
        return res.status(404).json({ message: "KYC record not found" });
      }

      if (status === "approved") {
        const hasAllThree = kycRecord.idFrontUrl && kycRecord.idBackUrl && kycRecord.selfieUrl;
        const hasDocAndSelfie = kycRecord.idDocumentUrl && kycRecord.selfieUrl;
        if (!hasAllThree && !hasDocAndSelfie) {
          return res.status(400).json({ 
            message: "Cannot approve KYC: User must upload required documents (ID document + selfie) before approval" 
          });
        }
      }

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
  app.get("/api/admin/disputes", requireAuth, requireDisputeAdmin, async (req: AuthRequest, res) => {
    try {
      const disputes = await storage.getOpenDisputes();
      res.json(disputes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get resolved disputes with resolver info
  app.get("/api/admin/disputes/resolved", requireAuth, requireDisputeAdmin, async (req: AuthRequest, res) => {
    try {
      const disputes = await storage.getResolvedDisputes();
      
      // Add resolver name to each dispute
      const disputesWithResolver = await Promise.all(
        disputes.map(async (dispute) => {
          let resolverName = null;
          if (dispute.resolvedBy) {
            const resolver = await storage.getUser(dispute.resolvedBy);
            resolverName = resolver?.username || null;
          }
          return {
            ...dispute,
            resolverName,
          };
        })
      );
      
      res.json(disputesWithResolver);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get dispute details with order info, chat messages, and wallet info
  app.get("/api/admin/disputes/:id/details", requireAuth, requireDisputeAdmin, async (req: AuthRequest, res) => {
    try {
      const dispute = await storage.getDispute(req.params.id);
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      const order = await storage.getOrder(dispute.orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Get order chat messages with sender info
      const rawChatMessages = await storage.getChatMessagesByOrder(order.id);
      
      // Enrich chat messages with sender names and roles
      const chatMessages = await Promise.all(
        rawChatMessages.map(async (msg) => {
          const sender = await storage.getUser(msg.senderId);
          return {
            ...msg,
            senderName: sender?.username || "Unknown",
            senderRole: sender?.role || "user",
          };
        })
      );

      // Get vendor profile to determine the vendor's user
      const vendorProfile = await storage.getVendorProfile(order.vendorId);
      const vendorUserId = vendorProfile?.userId;

      // Determine actual buyer and seller based on tradeIntent
      // sell_ad: vendor sells USDT to the order creator (buyerId is buyer)
      // buy_ad: vendor buys USDT from the order creator (buyerId is seller)
      let actualBuyerId: string;
      let actualSellerId: string;

      if (order.tradeIntent === "buy_ad") {
        // Vendor wants to buy USDT, order creator is selling USDT
        actualBuyerId = vendorUserId || order.vendorId;
        actualSellerId = order.buyerId;
      } else {
        // sell_ad: Vendor sells USDT, order creator is buying USDT
        actualBuyerId = order.buyerId;
        actualSellerId = vendorUserId || order.vendorId;
      }

      // Get buyer info and wallet
      const buyer = await storage.getUser(actualBuyerId);
      const buyerWallet = await storage.getWalletByUserId(actualBuyerId, "USDT");

      // Get seller info and wallet
      const seller = await storage.getUser(actualSellerId);
      const sellerWallet = await storage.getWalletByUserId(actualSellerId, "USDT");

      res.json({
        dispute,
        order,
        chatMessages,
        buyer: buyer ? {
          id: buyer.id,
          username: buyer.username,
          isFrozen: buyer.isFrozen,
          frozenReason: buyer.frozenReason,
        } : null,
        buyerWallet: buyerWallet ? {
          availableBalance: buyerWallet.availableBalance,
          escrowBalance: buyerWallet.escrowBalance,
          currency: buyerWallet.currency,
        } : null,
        seller: seller ? {
          id: seller.id,
          username: seller.username,
          isFrozen: seller.isFrozen,
          frozenReason: seller.frozenReason,
        } : null,
        sellerWallet: sellerWallet ? {
          availableBalance: sellerWallet.availableBalance,
          escrowBalance: sellerWallet.escrowBalance,
          currency: sellerWallet.currency,
        } : null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Resolve dispute
  app.post("/api/admin/disputes/:id/resolve", requireAuth, requireDisputeAdmin, async (req: AuthRequest, res) => {
    try {
      const { resolution, status, adminNotes, twoFactorToken, amount } = req.body;

      // Get the dispute admin user and verify 2FA
      const user = await storage.getUser(req.user!.userId);
      
      // 2FA must be enabled for dispute admins to resolve disputes
      if (!user?.twoFactorEnabled) {
        return res.status(403).json({ 
          message: "Two-factor authentication (2FA) must be enabled to resolve disputes. Please enable 2FA in your security settings.", 
          requires2FASetup: true 
        });
      }

      // 2FA token is required
      if (!twoFactorToken) {
        return res.status(403).json({ 
          message: "Please enter your 2FA code to resolve this dispute.",
          requires2FA: true 
        });
      }

      // Verify the 2FA token
      const isValid = verifyTotp(twoFactorToken, user.twoFactorSecret!);
      if (!isValid) {
        return res.status(403).json({ message: "Invalid 2FA code. Please try again." });
      }

      const dispute = await storage.getDispute(req.params.id);
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      const order = await storage.getOrder(dispute.orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Determine the amount to release/refund (default to full escrow amount)
      const escrowAmount = parseFloat(order.escrowAmount || order.fiatAmount);
      let releaseAmountValue = escrowAmount;
      
      if (amount) {
        const requestedAmount = parseFloat(amount);
        if (isNaN(requestedAmount) || requestedAmount <= 0) {
          return res.status(400).json({ message: "Invalid release amount" });
        }
        if (requestedAmount > escrowAmount) {
          return res.status(400).json({ message: `Release amount cannot exceed escrow amount of $${escrowAmount.toFixed(2)}` });
        }
        releaseAmountValue = requestedAmount;
      }

      if (status === "resolved_refund") {
        await refundBuyerEscrow(order.buyerId, releaseAmountValue.toString(), order.id);
      } else if (status === "resolved_release") {
        await releaseEscrowWithFee(order.buyerId, order.vendorId, releaseAmountValue.toString(), order.id);
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
        changes: { status, resolution, releasedAmount: releaseAmountValue.toFixed(2) },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({ ...updated, releasedAmount: releaseAmountValue.toFixed(2) });
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

  // Freeze user (both admin and dispute_admin can freeze)
  app.post("/api/admin/users/:id/freeze", requireAuth, requireDisputeAdmin, async (req: AuthRequest, res) => {
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

      // Notify the frozen user
      await notifyAccountFrozen(req.params.id, reason);

      res.json({ message: "User frozen" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Unfreeze user (both admin and dispute_admin can unfreeze)
  app.post("/api/admin/users/:id/unfreeze", requireAuth, requireDisputeAdmin, async (req: AuthRequest, res) => {
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

      // Notify the unfrozen user
      await notifyAccountUnfrozen(req.params.id);

      res.json({ message: "User unfrozen" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Dispute admin sends message to disputed order chat
  app.post("/api/admin/disputes/:id/message", requireAuth, requireDisputeAdmin, async (req: AuthRequest, res) => {
    try {
      const { message } = req.body;
      
      if (!message?.trim()) {
        return res.status(400).json({ message: "Message is required" });
      }

      const dispute = await storage.getDispute(req.params.id);
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      const chatMessage = await storage.createChatMessage({
        orderId: dispute.orderId,
        senderId: req.user!.userId,
        message: `[Dispute Admin] ${message}`,
      });

      res.json(chatMessage);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get dispute stats for dispute admin dashboard
  app.get("/api/admin/disputes/stats", requireAuth, requireDisputeAdmin, async (req: AuthRequest, res) => {
    try {
      const openDisputes = await storage.getOpenDisputes();
      const allDisputes = await db.select().from(disputes);
      
      const stats = {
        openCount: openDisputes.length,
        totalCount: allDisputes.length,
        resolvedCount: allDisputes.filter(d => d.status === "resolved_refund" || d.status === "resolved_release").length,
        inReviewCount: allDisputes.filter(d => d.status === "in_review").length,
      };

      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
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

  // ==================== ADMIN INITIALIZATION ====================
  
  // Initialize admin users (creates Kai admin and Turbo dispute_admin if they don't exist)
  app.post("/api/admin/init", async (req, res) => {
    try {
      const results: { user: string; status: string }[] = [];

      // Create Kai admin user
      const existingKai = await storage.getUserByUsername("Kai");
      if (!existingKai) {
        const kaiPassword = await hashPassword("487530Turbo");
        const kaiUser = await storage.createUser({
          username: "Kai",
          email: "kai@admin.local",
          password: kaiPassword,
          role: "admin",
        });
        await storage.createWallet({ userId: kaiUser.id, currency: "USDT" });
        results.push({ user: "Kai", status: "created" });
      } else {
        // Update password if user exists
        const kaiPassword = await hashPassword("487530Turbo");
        await storage.updateUser(existingKai.id, { password: kaiPassword, role: "admin" });
        results.push({ user: "Kai", status: "password updated" });
      }

      // Create Turbo dispute_admin user
      const existingTurbo = await storage.getUserByUsername("Turbo");
      if (!existingTurbo) {
        const turboPassword = await hashPassword("1CU14CU");
        const turboUser = await storage.createUser({
          username: "Turbo",
          email: "turbo@admin.local",
          password: turboPassword,
          role: "dispute_admin",
        });
        await storage.createWallet({ userId: turboUser.id, currency: "USDT" });
        results.push({ user: "Turbo", status: "created" });
      } else {
        // Update password if user exists
        const turboPassword = await hashPassword("1CU14CU");
        await storage.updateUser(existingTurbo.id, { password: turboPassword, role: "dispute_admin" });
        results.push({ user: "Turbo", status: "password updated" });
      }

      res.json({ message: "Admin initialization complete", results });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== SOCIAL FEED ROUTES ====================

  // Get social feed posts
  app.get("/api/social/posts", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const search = req.query.search as string | undefined;
      
      let posts;
      if (search && search.trim()) {
        posts = await storage.searchSocialPosts(search.trim(), limit, offset);
      } else {
        posts = await storage.getSocialPosts(limit, offset);
      }
      res.json(posts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get single post with comments
  app.get("/api/social/posts/:id", async (req, res) => {
    try {
      const post = await storage.getSocialPost(req.params.id);
      if (!post || post.isDeleted) {
        return res.status(404).json({ message: "Post not found" });
      }
      const comments = await storage.getSocialCommentsByPost(req.params.id);
      res.json({ ...post, comments });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Helper function to detect URLs in content
  const containsUrl = (text: string): boolean => {
    const urlPattern = /(?:https?:\/\/|www\.)[^\s]+|(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|io|co|app|dev|me|xyz|info|biz|us|uk|ca|au|de|fr|ru|cn|jp|kr|in|br|nl|se|no|dk|fi|ch|at|be|es|it|pl|cz|pt|ie|nz|sg|hk|tw|my|th|ph|vn|id|ae|sa|za|eg|ng|ke|gh|tn|ma|dz|ly|mu|sn|ci|cm|tz|ug|rw|et|sd|ao|mz|zw|zm|bw|na|sz|ls|mw|mg|sc|mu|re|yt|km|dj|er|so|ss|cf|cg|cd|ga|gq|st|cv|gw|sl|lr|gm|sn|ml|mr|bf|ne|td|bi|km|dj|er|so|ss|cf|cg|cd|ga|gq|st|cv|gw|sl|lr|gm|sn|ml|mr|bf|ne|td|bi)[^\s]*/gi;
    return urlPattern.test(text);
  };

  // Create post (admin cannot post)
  app.post("/api/social/posts", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Check if user is admin - admin cannot post, only monitor
      const user = await storage.getUser(req.user!.userId);
      if (user?.role === "admin" || user?.role === "dispute_admin") {
        return res.status(403).json({ message: "Admin accounts cannot create posts. Admins are for platform monitoring only." });
      }

      const isMuted = await storage.isUserMuted(req.user!.userId);
      if (isMuted) {
        return res.status(403).json({ message: "You are muted from the social feed" });
      }

      const { content, originalPostId, quoteText } = req.body;

      if (!content || content.length === 0) {
        return res.status(400).json({ message: "Post content is required" });
      }

      if (content.length > 800) {
        return res.status(400).json({ message: "Post content cannot exceed 800 characters" });
      }

      if (containsUrl(content)) {
        return res.status(400).json({ message: "URLs are not allowed in posts" });
      }

      if (quoteText && containsUrl(quoteText)) {
        return res.status(400).json({ message: "URLs are not allowed in quote text" });
      }

      const post = await storage.createSocialPost({
        authorId: req.user!.userId,
        content,
        originalPostId: originalPostId || null,
        quoteText: quoteText || null,
      });

      if (originalPostId) {
        await storage.updateSocialPost(originalPostId, {
          sharesCount: db.$client ? undefined : undefined,
        });
        const originalPost = await storage.getSocialPost(originalPostId);
        if (originalPost) {
          await storage.updateSocialPost(originalPostId, {
            sharesCount: originalPost.sharesCount + 1,
          });
        }
      }

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "social_post_created",
        resource: "social_posts",
        resourceId: post.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json(post);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Delete post (author or admin)
  app.delete("/api/social/posts/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const post = await storage.getSocialPost(req.params.id);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      const user = await storage.getUser(req.user!.userId);
      const isAdmin = user?.role === "admin";
      const isAuthor = post.authorId === req.user!.userId;

      if (!isAdmin && !isAuthor) {
        return res.status(403).json({ message: "Not authorized" });
      }

      await storage.deleteSocialPost(req.params.id);

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: isAdmin && !isAuthor ? "social_post_deleted_admin" : "social_post_deleted",
        resource: "social_posts",
        resourceId: req.params.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({ message: "Post deleted" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get comments for a post
  app.get("/api/social/posts/:id/comments", async (req, res) => {
    try {
      const comments = await storage.getSocialCommentsByPost(req.params.id);
      res.json(comments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create comment
  app.post("/api/social/posts/:id/comments", requireAuth, async (req: AuthRequest, res) => {
    try {
      const isMuted = await storage.isUserMuted(req.user!.userId);
      if (isMuted) {
        return res.status(403).json({ message: "You are muted from the social feed" });
      }

      const post = await storage.getSocialPost(req.params.id);
      if (!post || post.isDeleted) {
        return res.status(404).json({ message: "Post not found" });
      }

      const { content } = req.body;

      if (!content || content.length === 0) {
        return res.status(400).json({ message: "Comment content is required" });
      }

      if (content.length > 500) {
        return res.status(400).json({ message: "Comment cannot exceed 500 characters" });
      }

      if (containsUrl(content)) {
        return res.status(400).json({ message: "URLs are not allowed in comments" });
      }

      const comment = await storage.createSocialComment({
        postId: req.params.id,
        authorId: req.user!.userId,
        content,
      });

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "social_comment_created",
        resource: "social_comments",
        resourceId: comment.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json(comment);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Delete comment (author or admin)
  app.delete("/api/social/comments/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const comment = await storage.getSocialComment(req.params.id);
      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      const user = await storage.getUser(req.user!.userId);
      const isAdmin = user?.role === "admin";
      const isAuthor = comment.authorId === req.user!.userId;

      if (!isAdmin && !isAuthor) {
        return res.status(403).json({ message: "Not authorized" });
      }

      await storage.deleteSocialComment(req.params.id);

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: isAdmin && !isAuthor ? "social_comment_deleted_admin" : "social_comment_deleted",
        resource: "social_comments",
        resourceId: req.params.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({ message: "Comment deleted" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Like a post
  app.post("/api/social/posts/:id/like", requireAuth, async (req: AuthRequest, res) => {
    try {
      const post = await storage.getSocialPost(req.params.id);
      if (!post || post.isDeleted) {
        return res.status(404).json({ message: "Post not found" });
      }

      const existingLike = await storage.getSocialLike(req.params.id, req.user!.userId);
      if (existingLike) {
        return res.json({ message: "Already liked", liked: true });
      }

      await storage.createSocialLike({
        postId: req.params.id,
        userId: req.user!.userId,
      });

      res.json({ message: "Post liked", liked: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Unlike a post
  app.delete("/api/social/posts/:id/like", requireAuth, async (req: AuthRequest, res) => {
    try {
      await storage.deleteSocialLike(req.params.id, req.user!.userId);
      res.json({ message: "Like removed", liked: false });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Check if user liked a post
  app.get("/api/social/posts/:id/liked", requireAuth, async (req: AuthRequest, res) => {
    try {
      const like = await storage.getSocialLike(req.params.id, req.user!.userId);
      res.json({ liked: !!like });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Dislike a post
  app.post("/api/social/posts/:id/dislike", requireAuth, async (req: AuthRequest, res) => {
    try {
      const post = await storage.getSocialPost(req.params.id);
      if (!post || post.isDeleted) {
        return res.status(404).json({ message: "Post not found" });
      }

      const existingDislike = await storage.getSocialDislike(req.params.id, req.user!.userId);
      if (existingDislike) {
        return res.json({ message: "Already disliked", disliked: true });
      }

      await storage.createSocialDislike({
        postId: req.params.id,
        userId: req.user!.userId,
      });

      res.json({ message: "Post disliked", disliked: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Remove dislike from a post
  app.delete("/api/social/posts/:id/dislike", requireAuth, async (req: AuthRequest, res) => {
    try {
      await storage.deleteSocialDislike(req.params.id, req.user!.userId);
      res.json({ message: "Dislike removed", disliked: false });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Check if user disliked a post
  app.get("/api/social/posts/:id/disliked", requireAuth, async (req: AuthRequest, res) => {
    try {
      const dislike = await storage.getSocialDislike(req.params.id, req.user!.userId);
      res.json({ disliked: !!dislike });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Auto-delete old posts (24 hours) - can be called by admin or scheduled job
  app.post("/api/admin/social/cleanup-old-posts", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const deletedCount = await storage.deleteOldPosts();
      res.json({ message: `Deleted ${deletedCount} old posts`, deletedCount });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Upload profile picture
  app.post("/api/users/profile-picture", requireAuth, upload.single("profilePicture"), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Only image files (JPEG, PNG, GIF, WebP) are allowed" });
      }

      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ message: "File size must be less than 5MB" });
      }

      const profilePictureUrl = `/uploads/${req.file.filename}`;
      await storage.updateUser(req.user!.userId, { profilePicture: profilePictureUrl });

      res.json({ message: "Profile picture updated", profilePicture: profilePictureUrl });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Get user profile (includes profile picture)
  app.get("/api/users/:id/profile", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({
        id: user.id,
        username: user.username,
        profilePicture: user.profilePicture,
        createdAt: user.createdAt,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Mute a user from social feed
  app.post("/api/admin/social/mute/:userId", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const targetUser = await storage.getUser(req.params.userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const { reason, expiresAt } = req.body;

      const existingMute = await storage.getSocialMute(req.params.userId);
      if (existingMute) {
        return res.status(400).json({ message: "User is already muted" });
      }

      const mute = await storage.createSocialMute({
        userId: req.params.userId,
        mutedBy: req.user!.userId,
        reason: reason || "Moderation action",
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "social_user_muted",
        resource: "social_mutes",
        resourceId: mute.id,
        changes: { targetUserId: req.params.userId, reason },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({ message: "User muted from social feed", mute });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Admin: Unmute a user from social feed
  app.delete("/api/admin/social/mute/:userId", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      await storage.deleteSocialMute(req.params.userId);

      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "social_user_unmuted",
        resource: "social_mutes",
        resourceId: req.params.userId,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({ message: "User unmuted from social feed" });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Seed social feed with test users and posts
  app.post("/api/admin/seed-social-feed", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const results: any[] = [];
      
      const testUsers = [
        { username: "CryptoTrader_Mike", email: "mike@p2p.local" },
        { username: "BitcoinBella", email: "bella@p2p.local" },
        { username: "EtherealEthan", email: "ethan@p2p.local" },
        { username: "SatoshiSarah", email: "sarah@p2p.local" },
        { username: "BlockchainBob", email: "bob@p2p.local" },
      ];

      const p2pPosts = [
        "Just completed a smooth P2P trade for 0.5 BTC! The escrow system worked perfectly. Highly recommend this platform for secure trades.",
        "Looking for reliable USDT sellers. I can offer competitive rates and fast bank transfers. DM me for details!",
        "Pro tip for P2P traders: Always verify the payment before releasing crypto. Safety first!",
        "Successfully traded ETH to local currency today. The dispute resolution team is amazing if any issues arise.",
        "Anyone interested in bulk P2P deals? I have verified traders network. Let's connect!",
        "New to P2P trading? Happy to guide newcomers. The community here is super helpful.",
        "Just hit 100 completed trades milestone! Thanks to all my trading partners. Trust is everything in P2P.",
        "Best rates for crypto-to-fiat conversions in my region. Fast settlements guaranteed.",
        "Weekend special: Lower fees for P2P trades above 500 USDT. Limited time offer!",
        "The escrow protection on this platform is unmatched. Never had a failed trade in 6 months.",
      ];

      const comments = [
        "Great experience trading with you!",
        "Smooth transaction, would trade again",
        "Fast and reliable trader",
        "Thanks for the quick response",
        "Very professional, highly recommended",
        "Best rates I've found so far",
        "Trustworthy seller, A++ service",
        "Quick payment confirmation, thanks!",
        "Perfect trade, no issues at all",
        "Will definitely trade with you again",
      ];

      const userIds: string[] = [];

      // Create 5 test users
      for (const userData of testUsers) {
        let user = await storage.getUserByUsername(userData.username);
        if (!user) {
          const hashedPassword = await hashPassword("Test123!");
          user = await storage.createUser({
            username: userData.username,
            email: userData.email,
            password: hashedPassword,
          });
          await storage.createWallet({ userId: user.id, currency: "USDT" });
          results.push({ action: "created_user", username: userData.username });
        } else {
          results.push({ action: "user_exists", username: userData.username });
        }
        userIds.push(user.id);
      }

      // Create 7 posts per user
      for (let i = 0; i < userIds.length; i++) {
        const userId = userIds[i];
        
        for (let j = 0; j < 7; j++) {
          const postContent = p2pPosts[(i * 7 + j) % p2pPosts.length];
          const post = await storage.createSocialPost({
            authorId: userId,
            content: postContent,
            originalPostId: null,
            quoteText: null,
          });

          // Add 5 likes from different users
          for (let k = 0; k < 5; k++) {
            const likerIndex = (i + k + 1) % userIds.length;
            await storage.createSocialLike({
              postId: post.id,
              userId: userIds[likerIndex],
            });
          }

          // Add 5 comments from different users
          for (let k = 0; k < 5; k++) {
            const commenterIndex = (i + k + 1) % userIds.length;
            const commentContent = comments[(j * 5 + k) % comments.length];
            await storage.createSocialComment({
              postId: post.id,
              authorId: userIds[commenterIndex],
              content: commentContent,
            });
          }
        }
        results.push({ action: "created_posts", username: testUsers[i].username, posts: 7, likesPerPost: 5, commentsPerPost: 5 });
      }

      res.json({ message: "Social feed seeded successfully", results });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==================== LOADER ZONE ROUTES ====================

  // Get active loader ads
  app.get("/api/loaders/ads", async (req, res) => {
    try {
      const ads = await storage.getActiveLoaderAds();
      
      // Enrich ads with loader stats
      const enrichedAds = await Promise.all(
        ads.map(async (ad) => {
          const loaderStats = await storage.getLoaderStats(ad.loaderId);
          const vendorProfile = await storage.getVendorProfileByUserId(ad.loaderId);
          return {
            ...ad,
            loaderStats: loaderStats ? {
              completedTrades: loaderStats.completedTrades || 0,
              positiveFeedback: loaderStats.positiveFeedback || 0,
              negativeFeedback: loaderStats.negativeFeedback || 0,
              isVerifiedVendor: vendorProfile?.isApproved || false,
            } : {
              completedTrades: 0,
              positiveFeedback: 0,
              negativeFeedback: 0,
              isVerifiedVendor: vendorProfile?.isApproved || false,
            },
          };
        })
      );
      
      res.json(enrichedAds);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get my loader ads
  app.get("/api/loaders/my-ads", requireAuth, async (req: AuthRequest, res) => {
    try {
      const ads = await storage.getLoaderAdsByLoader(req.user!.userId);
      res.json(ads);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Create loader ad (admin cannot post)
  app.post("/api/loaders/ads", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Check if user is admin - admin cannot post loader ads, only monitor
      const user = await storage.getUser(req.user!.userId);
      if (user?.role === "admin" || user?.role === "dispute_admin") {
        return res.status(403).json({ message: "Admin accounts cannot post loader ads. Admins are for platform monitoring only." });
      }

      const { assetType, dealAmount, loadingTerms, upfrontPercentage, paymentMethods, countdownTime } = req.body;
      
      if (!assetType || !dealAmount || !paymentMethods || paymentMethods.length === 0) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const validCountdownTimes = ["15min", "30min", "1hr", "2hr"];
      const selectedCountdown = countdownTime && validCountdownTimes.includes(countdownTime) ? countdownTime : "30min";

      // Validate deal amount - only allow regular numbers, no scientific notation
      const dealAmountStr = String(dealAmount);
      if (!/^[0-9]+\.?[0-9]*$/.test(dealAmountStr)) {
        return res.status(400).json({ message: "Deal amount must be a valid number (no scientific notation)" });
      }
      const amount = parseFloat(dealAmount);
      if (isNaN(amount) || amount < 0) {
        return res.status(400).json({ message: "Deal amount cannot be negative" });
      }
      if (amount <= 0) {
        return res.status(400).json({ message: "Deal amount must be greater than 0" });
      }

      // Validate upfront percentage (0-100, integers only, no scientific notation)
      const upfrontStr = String(upfrontPercentage || "0");
      if (!/^[0-9]+$/.test(upfrontStr)) {
        return res.status(400).json({ message: "Upfront percentage must be a whole number (no decimals or scientific notation)" });
      }
      const upfrontPct = parseInt(upfrontPercentage) || 0;
      if (upfrontPct < 0 || upfrontPct > 100) {
        return res.status(400).json({ message: "Upfront percentage must be between 0 and 100" });
      }

      // Check wallet balance (need 10% collateral + 3% fee reserve = 13% total)
      const wallet = await storage.getWalletByUserId(req.user!.userId);
      if (!wallet) {
        return res.status(400).json({ message: "Wallet not found" });
      }

      const collateral = amount * 0.1; // 10% collateral
      const feeReserve = amount * 0.03; // 3% fee reserve
      const totalRequired = collateral + feeReserve;
      const availableBalance = parseFloat(wallet.availableBalance || "0");
      
      if (availableBalance < totalRequired) {
        return res.status(400).json({ 
          message: `Insufficient balance. You need at least ${totalRequired.toFixed(2)} (10% collateral + 3% fee reserve) but have ${availableBalance.toFixed(2)}` 
        });
      }

      // Freeze total commitment from wallet
      await storage.holdEscrow(wallet.id, totalRequired.toString());

      // Create the ad
      const ad = await storage.createLoaderAd({
        loaderId: req.user!.userId,
        assetType,
        dealAmount: amount.toString(),
        loadingTerms: loadingTerms || null,
        upfrontPercentage: upfrontPct,
        countdownTime: selectedCountdown,
        paymentMethods,
        frozenCommitment: collateral.toString(),
        loaderFeeReserve: feeReserve.toString(),
      });

      // Log transaction
      await storage.createTransaction({
        userId: req.user!.userId,
        walletId: wallet.id,
        type: "escrow_hold",
        amount: totalRequired.toString(),
        currency: "USDT",
        description: `Loader ad: ${collateral.toFixed(2)} collateral + ${feeReserve.toFixed(2)} fee reserve for ${assetType} deal of ${amount}`,
      });

      res.json(ad);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Cancel loader ad (before acceptance)
  app.delete("/api/loaders/ads/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const ad = await storage.getLoaderAd(req.params.id);
      if (!ad) {
        return res.status(404).json({ message: "Ad not found" });
      }

      if (ad.loaderId !== req.user!.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Check if there are active orders
      const orders = await storage.getLoaderOrdersByAd(ad.id);
      const activeOrders = orders.filter(o => !["completed", "closed_no_payment", "cancelled"].includes(o.status));
      
      if (activeOrders.length > 0) {
        return res.status(400).json({ message: "Cannot cancel ad with active orders" });
      }

      // Refund full escrow: 10% collateral + 3% fee reserve (no penalty when no active trade)
      const wallet = await storage.getWalletByUserId(req.user!.userId);
      if (wallet) {
        const frozenCommitment = parseFloat(ad.frozenCommitment || "0");
        const feeReserve = parseFloat(ad.loaderFeeReserve || "0");
        const totalRefund = frozenCommitment + feeReserve;
        
        await storage.releaseEscrow(wallet.id, totalRefund.toString());
        await storage.createTransaction({
          userId: req.user!.userId,
          walletId: wallet.id,
          type: "escrow_release",
          amount: totalRefund.toString(),
          currency: "USDT",
          description: `Loader ad cancelled - full refund: ${frozenCommitment.toFixed(2)} collateral + ${feeReserve.toFixed(2)} fee reserve`,
        });
      }

      await storage.deactivateLoaderAd(ad.id);
      res.json({ message: "Ad cancelled successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Accept loader deal (receiver side)
  app.post("/api/loaders/ads/:id/accept", requireAuth, async (req: AuthRequest, res) => {
    try {
      const ad = await storage.getLoaderAd(req.params.id);
      if (!ad) {
        return res.status(404).json({ message: "Ad not found" });
      }

      if (!ad.isActive) {
        return res.status(400).json({ message: "Ad is no longer active" });
      }

      if (ad.loaderId === req.user!.userId) {
        return res.status(400).json({ message: "Cannot accept your own ad" });
      }

      const receiver = await storage.getUser(req.user!.userId);
      if (!receiver?.twoFactorEnabled) {
        return res.status(400).json({ message: "Two-factor authentication must be enabled to accept deals. Please enable 2FA in Settings." });
      }

      const dealAmount = parseFloat(ad.dealAmount);
      const upfrontRequired = (dealAmount * (ad.upfrontPercentage || 0)) / 100;
      const receiverFeeReserve = dealAmount * 0.02; // 2% platform fee from receiver
      const totalReceiverRequired = upfrontRequired + receiverFeeReserve;
      
      const receiverWallet = await storage.getWalletByUserId(req.user!.userId);
      if (!receiverWallet) {
        return res.status(400).json({ message: "Wallet not found" });
      }
      
      const receiverBalance = parseFloat(receiverWallet.availableBalance || "0");
      if (receiverBalance < totalReceiverRequired) {
        return res.status(400).json({ 
          message: `Insufficient balance. You need ${upfrontRequired.toFixed(2)} upfront + ${receiverFeeReserve.toFixed(2)} (2% fee) = ${totalReceiverRequired.toFixed(2)}, but have ${receiverBalance.toFixed(2)}` 
        });
      }

      // Freeze total from receiver (upfront + 2% fee reserve)
      await storage.holdEscrow(receiverWallet.id, totalReceiverRequired.toString());
      await storage.createTransaction({
        userId: req.user!.userId,
        walletId: receiverWallet.id,
        type: "escrow_hold",
        amount: totalReceiverRequired.toString(),
        currency: "USDT",
        description: `Loader order: ${upfrontRequired.toFixed(2)} upfront + ${receiverFeeReserve.toFixed(2)} fee reserve`,
      });

      // Calculate countdown expiry
      const countdownMs: Record<string, number> = {
        "15min": 15 * 60 * 1000,
        "30min": 30 * 60 * 1000,
        "1hr": 60 * 60 * 1000,
        "2hr": 2 * 60 * 60 * 1000,
      };
      const expiresAt = new Date(Date.now() + (countdownMs[ad.countdownTime || "30min"] || 30 * 60 * 1000));

      // Create order with new flow - start with liability confirmation
      const order = await storage.createLoaderOrder({
        adId: ad.id,
        loaderId: ad.loaderId,
        receiverId: req.user!.userId,
        dealAmount: ad.dealAmount,
        loaderFrozenAmount: ad.frozenCommitment,
        loaderFeeReserve: (dealAmount * 0.03).toString(),
        receiverFrozenAmount: upfrontRequired.toString(),
        receiverFeeReserve: receiverFeeReserve.toString(),
        status: "awaiting_liability_confirmation",
        countdownTime: ad.countdownTime || "30min",
        countdownExpiresAt: expiresAt,
      });

      // Deactivate the ad
      await storage.deactivateLoaderAd(ad.id);

      // Create system message
      await storage.createLoaderOrderMessage({
        orderId: order.id,
        senderId: null,
        isSystem: true,
        content: `Deal accepted! Receiver must select liability terms before funds are sent. Both parties must confirm the agreement to proceed.`,
      });

      // Send notifications to both parties (non-blocking)
      try {
        await createNotification(ad.loaderId, "order", "Loader Deal Accepted", 
          "Someone accepted your loading ad", `/loader-order/${order.id}`);
        await createNotification(req.user!.userId, "order", "Deal Started", 
          "You accepted a loader deal", `/loader-order/${order.id}`);
      } catch (notifError) {
        console.error("Failed to send notifications:", notifError);
      }

      res.json(order);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get loader order
  app.get("/api/loaders/orders/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getLoaderOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.loaderId !== req.user!.userId && order.receiverId !== req.user!.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Get loader and receiver info
      const loader = await storage.getUser(order.loaderId);
      const receiver = await storage.getUser(order.receiverId);
      const ad = await storage.getLoaderAd(order.adId);

      res.json({
        ...order,
        loaderUsername: loader?.username,
        receiverUsername: receiver?.username,
        ad,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get my loader orders
  app.get("/api/loaders/my-orders", requireAuth, async (req: AuthRequest, res) => {
    try {
      const loaderOrders = await storage.getLoaderOrdersByLoader(req.user!.userId);
      const receiverOrders = await storage.getLoaderOrdersByReceiver(req.user!.userId);
      
      const allOrders = [...loaderOrders, ...receiverOrders].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Add user info to orders
      const enrichedOrders = await Promise.all(allOrders.map(async (order) => {
        const loader = await storage.getUser(order.loaderId);
        const receiver = await storage.getUser(order.receiverId);
        return {
          ...order,
          loaderUsername: loader?.username,
          receiverUsername: receiver?.username,
          role: order.loaderId === req.user!.userId ? "loader" : "receiver",
        };
      }));

      res.json(enrichedOrders);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Send payment details (stops countdown)
  app.post("/api/loaders/orders/:id/send-payment-details", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getLoaderOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const isLoader = order.loaderId === req.user!.userId;
      const isReceiver = order.receiverId === req.user!.userId;
      
      if (!isLoader && !isReceiver) {
        return res.status(403).json({ message: "Not authorized" });
      }

      if (order.status !== "awaiting_payment_details" && order.status !== "payment_details_sent") {
        return res.status(400).json({ message: "Cannot send payment details in current state" });
      }

      // Stop the countdown permanently
      const updates: any = { countdownStopped: true };
      
      if (isLoader) {
        updates.loaderSentPaymentDetails = true;
      } else {
        updates.receiverSentPaymentDetails = true;
      }

      // Move to payment_details_sent status
      updates.status = "payment_details_sent";

      await storage.updateLoaderOrder(order.id, updates);

      const sender = isLoader ? "Loader" : "Receiver";
      await storage.createLoaderOrderMessage({
        orderId: order.id,
        senderId: null,
        isSystem: true,
        content: `${sender} has sent payment details. Countdown stopped. Deal now waits for completion.`,
      });

      res.json({ message: "Payment details sent. Countdown stopped." });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Mark payment sent (loader only)
  app.post("/api/loaders/orders/:id/mark-payment-sent", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getLoaderOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.loaderId !== req.user!.userId) {
        return res.status(403).json({ message: "Only loader can mark payment as sent" });
      }

      if (order.status !== "payment_details_sent") {
        return res.status(400).json({ message: "Payment details must be exchanged first" });
      }

      await storage.updateLoaderOrder(order.id, {
        loaderMarkedPaymentSent: true,
        status: "payment_sent",
      });

      await storage.createLoaderOrderMessage({
        orderId: order.id,
        senderId: null,
        isSystem: true,
        content: "Loader has marked payment as sent. Waiting for receiver to confirm receipt.",
      });

      res.json({ message: "Payment marked as sent" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Cancel order with 5% penalty
  app.post("/api/loaders/orders/:id/cancel", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getLoaderOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const isLoader = order.loaderId === req.user!.userId;
      const isReceiver = order.receiverId === req.user!.userId;
      
      if (!isLoader && !isReceiver) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Receiver cannot cancel after payment is marked sent
      if (isReceiver && order.loaderMarkedPaymentSent) {
        return res.status(400).json({ message: "Cannot cancel after payment has been sent. Open a dispute instead." });
      }

      // Cannot cancel if already completed, cancelled, or disputed
      const invalidStatuses = ["completed", "cancelled_auto", "cancelled_loader", "cancelled_receiver", "disputed", "resolved_loader_wins", "resolved_receiver_wins", "resolved_mutual"];
      if (invalidStatuses.includes(order.status)) {
        return res.status(400).json({ message: "Cannot cancel order in current state" });
      }

      const dealAmount = parseFloat(order.dealAmount);
      const penaltyAmount = dealAmount * 0.05; // 5% penalty
      
      // Get admin wallet for fee
      const kaiAdmin = await storage.getUserByUsername("Kai");
      const adminUser = kaiAdmin || (await storage.getUsersByRole("admin"))[0];
      const adminWallet = adminUser ? await storage.getWalletByUserId(adminUser.id) : null;

      if (isLoader) {
        // Loader cancels: pays 5% penalty from collateral
        const loaderWallet = await storage.getWalletByUserId(order.loaderId);
        if (loaderWallet) {
          const loaderCollateral = parseFloat(order.loaderFrozenAmount);
          const loaderFeeReserve = parseFloat(order.loaderFeeReserve || "0");
          const loaderEscrowTotal = loaderCollateral + loaderFeeReserve;
          const actualPenalty = Math.min(penaltyAmount, loaderEscrowTotal);
          const loaderRefund = loaderEscrowTotal - actualPenalty;
          
          // Move funds from escrow to available (minus penalty), clear all escrow
          const currentLoaderAvailable = parseFloat(loaderWallet.availableBalance);
          const currentLoaderEscrow = parseFloat(loaderWallet.escrowBalance);
          const newLoaderAvailable = (currentLoaderAvailable + loaderRefund).toFixed(8);
          const newLoaderEscrow = (currentLoaderEscrow - loaderEscrowTotal).toFixed(8);
          
          await storage.updateWalletBalance(loaderWallet.id, newLoaderAvailable, newLoaderEscrow);
          
          if (loaderRefund > 0) {
            await storage.createTransaction({
              userId: order.loaderId,
              walletId: loaderWallet.id,
              type: "refund",
              amount: loaderRefund.toString(),
              currency: "USDT",
              description: `Refund minus 5% penalty - loader cancelled order ${order.id}`,
            });
          }
          
          // Transfer penalty to admin
          if (adminWallet && actualPenalty > 0) {
            const newAdminBalance = (parseFloat(adminWallet.availableBalance) + actualPenalty).toFixed(8);
            await storage.updateWalletBalance(adminWallet.id, newAdminBalance, adminWallet.escrowBalance);
            await storage.createTransaction({
              userId: adminUser!.id,
              walletId: adminWallet.id,
              type: "fee",
              amount: actualPenalty.toString(),
              currency: "USDT",
              description: `Cancellation penalty from loader on order ${order.id}`,
            });
          }

          await storage.createTransaction({
            userId: order.loaderId,
            walletId: loaderWallet.id,
            type: "fee",
            amount: actualPenalty.toString(),
            currency: "USDT",
            description: `5% cancellation penalty for order ${order.id}`,
          });
        }

        // Full refund to receiver (escrow to available, no penalty)
        const receiverWallet = await storage.getWalletByUserId(order.receiverId);
        if (receiverWallet) {
          const receiverUpfront = parseFloat(order.receiverFrozenAmount || "0");
          const receiverFeeReserve = parseFloat(order.receiverFeeReserve || "0");
          const receiverRefund = receiverUpfront + receiverFeeReserve;
          if (receiverRefund > 0) {
            // Move from escrow to available
            const currentReceiverAvailable = parseFloat(receiverWallet.availableBalance);
            const currentReceiverEscrow = parseFloat(receiverWallet.escrowBalance);
            const newReceiverAvailable = (currentReceiverAvailable + receiverRefund).toFixed(8);
            const newReceiverEscrow = (currentReceiverEscrow - receiverRefund).toFixed(8);
            
            await storage.updateWalletBalance(receiverWallet.id, newReceiverAvailable, newReceiverEscrow);
            await storage.createTransaction({
              userId: order.receiverId,
              walletId: receiverWallet.id,
              type: "refund",
              amount: receiverRefund.toString(),
              currency: "USDT",
              description: `Full refund - loader cancelled order ${order.id}`,
            });
          }
        }

        await storage.updateLoaderOrder(order.id, {
          status: "cancelled_loader",
          cancelledBy: req.user!.userId,
          penaltyAmount: penaltyAmount.toString(),
          penaltyPaidBy: order.loaderId,
        });

        // Remove the ad
        await storage.deactivateLoaderAd(order.adId);
      } else {
        // Receiver cancels: pays 5% penalty from their escrowed funds
        const receiverWallet = await storage.getWalletByUserId(order.receiverId);
        const receiverUpfront = parseFloat(order.receiverFrozenAmount || "0");
        const receiverFeeReserve = parseFloat(order.receiverFeeReserve || "0");
        const receiverTotal = receiverUpfront + receiverFeeReserve;
        
        if (receiverWallet) {
          // Calculate refund: escrow minus 5% penalty
          const actualPenalty = Math.min(penaltyAmount, receiverTotal);
          const receiverRefund = receiverTotal - actualPenalty;
          
          // Move funds from escrow to available (minus penalty)
          const currentAvailable = parseFloat(receiverWallet.availableBalance);
          const currentEscrow = parseFloat(receiverWallet.escrowBalance);
          const newAvailable = (currentAvailable + receiverRefund).toFixed(8);
          const newEscrow = (currentEscrow - receiverTotal).toFixed(8);
          
          await storage.updateWalletBalance(receiverWallet.id, newAvailable, newEscrow);
          
          if (receiverRefund > 0) {
            await storage.createTransaction({
              userId: order.receiverId,
              walletId: receiverWallet.id,
              type: "refund",
              amount: receiverRefund.toString(),
              currency: "USDT",
              description: `Refund minus 5% penalty - receiver cancelled order ${order.id}`,
            });
          }
          
          // Transfer penalty to admin
          if (adminWallet && actualPenalty > 0) {
            const newAdminBalance = (parseFloat(adminWallet.availableBalance) + actualPenalty).toFixed(8);
            await storage.updateWalletBalance(adminWallet.id, newAdminBalance, adminWallet.escrowBalance);
            await storage.createTransaction({
              userId: adminUser!.id,
              walletId: adminWallet.id,
              type: "fee",
              amount: actualPenalty.toString(),
              currency: "USDT",
              description: `Cancellation penalty from receiver on order ${order.id}`,
            });
          }

          await storage.createTransaction({
            userId: order.receiverId,
            walletId: receiverWallet.id,
            type: "fee",
            amount: actualPenalty.toString(),
            currency: "USDT",
            description: `5% cancellation penalty for order ${order.id}`,
          });
        }

        // Full refund to loader (collateral + fee reserve back to available)
        const loaderWallet = await storage.getWalletByUserId(order.loaderId);
        if (loaderWallet) {
          const loaderCollateral = parseFloat(order.loaderFrozenAmount);
          const loaderFeeReserve = parseFloat(order.loaderFeeReserve || "0");
          const loaderRefund = loaderCollateral + loaderFeeReserve;
          if (loaderRefund > 0) {
            // Move from escrow to available
            const currentLoaderAvailable = parseFloat(loaderWallet.availableBalance);
            const currentLoaderEscrow = parseFloat(loaderWallet.escrowBalance);
            const newLoaderAvailable = (currentLoaderAvailable + loaderRefund).toFixed(8);
            const newLoaderEscrow = (currentLoaderEscrow - loaderRefund).toFixed(8);
            
            await storage.updateWalletBalance(loaderWallet.id, newLoaderAvailable, newLoaderEscrow);
            await storage.createTransaction({
              userId: order.loaderId,
              walletId: loaderWallet.id,
              type: "refund",
              amount: loaderRefund.toString(),
              currency: "USDT",
              description: `Full refund - receiver cancelled order ${order.id}`,
            });
          }
        }

        await storage.updateLoaderOrder(order.id, {
          status: "cancelled_receiver",
          cancelledBy: req.user!.userId,
          penaltyAmount: penaltyAmount.toString(),
          penaltyPaidBy: order.receiverId,
        });

        // Remove the ad
        await storage.deactivateLoaderAd(order.adId);
      }

      await storage.createLoaderOrderMessage({
        orderId: order.id,
        senderId: null,
        isSystem: true,
        content: `Order cancelled by ${isLoader ? "loader" : "receiver"}. 5% penalty (${penaltyAmount.toFixed(2)}) deducted.`,
      });

      // Send notifications to both parties (non-blocking)
      try {
        await createNotification(order.loaderId, "order", "Order Cancelled", 
          `Loader order was cancelled by ${isLoader ? "you" : "the receiver"}`, `/loader-order/${order.id}`);
        await createNotification(order.receiverId, "order", "Order Cancelled", 
          `Loader order was cancelled by ${isReceiver ? "you" : "the loader"}`, `/loader-order/${order.id}`);
      } catch (notifError) {
        console.error("Failed to send notifications:", notifError);
      }

      res.json({ message: "Order cancelled. 5% penalty applied." });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Open dispute
  app.post("/api/loaders/orders/:id/dispute", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { reason } = req.body;
      
      const order = await storage.getLoaderOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const isLoader = order.loaderId === req.user!.userId;
      const isReceiver = order.receiverId === req.user!.userId;
      
      if (!isLoader && !isReceiver) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Can dispute during active order or after completion/cancellation
      const disputeableStatuses = ["payment_details_sent", "payment_sent", "completed", "cancelled_loader", "cancelled_receiver", "cancelled_auto"];
      if (!disputeableStatuses.includes(order.status)) {
        return res.status(400).json({ message: "Cannot open dispute in current order state" });
      }

      // Check if dispute already exists
      const existingDispute = await storage.getLoaderDisputeByOrderId(order.id);
      if (existingDispute) {
        return res.status(400).json({ message: "A dispute is already open for this order" });
      }

      // Create dispute
      const dispute = await storage.createLoaderDispute({
        orderId: order.id,
        openedBy: req.user!.userId,
        reason: reason || "No reason provided",
      });

      // Update order status
      await storage.updateLoaderOrder(order.id, {
        status: "disputed",
      });

      const opener = isLoader ? "Loader" : "Receiver";
      await storage.createLoaderOrderMessage({
        orderId: order.id,
        senderId: null,
        isSystem: true,
        content: `Dispute opened by ${opener}. Reason: ${reason || "No reason provided"}. Admin will review and resolve.`,
      });

      // Notify the other party
      const otherPartyId = isLoader ? order.receiverId : order.loaderId;
      await storage.createNotification({
        userId: otherPartyId,
        type: "dispute",
        title: "Dispute Opened",
        message: `A dispute has been opened on your loader order`,
        link: `/loader-order/${order.id}`,
      });

      res.json({ message: "Dispute opened successfully", dispute });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get dispute for order
  app.get("/api/loaders/orders/:id/dispute", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getLoaderOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const isLoader = order.loaderId === req.user!.userId;
      const isReceiver = order.receiverId === req.user!.userId;
      const isAdmin = req.user!.role === "admin" || req.user!.role === "dispute_admin";
      
      if (!isLoader && !isReceiver && !isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const dispute = await storage.getLoaderDisputeByOrderId(order.id);
      if (!dispute) {
        return res.status(404).json({ message: "No dispute found for this order" });
      }

      res.json(dispute);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Get all open loader disputes
  app.get("/api/admin/loader-disputes", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.role !== "dispute_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const disputes = await storage.getOpenLoaderDisputes();
      
      // Enrich with order and user info
      const enrichedDisputes = await Promise.all(disputes.map(async (dispute) => {
        const order = await storage.getLoaderOrder(dispute.orderId);
        const opener = await storage.getUser(dispute.openedBy);
        const loader = order ? await storage.getUser(order.loaderId) : null;
        const receiver = order ? await storage.getUser(order.receiverId) : null;
        
        return {
          ...dispute,
          order,
          openerUsername: opener?.username,
          loaderUsername: loader?.username,
          receiverUsername: receiver?.username,
        };
      }));

      res.json(enrichedDisputes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Get loader dispute stats
  app.get("/api/admin/loader-disputes/stats", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.role !== "dispute_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const openDisputes = await storage.getOpenLoaderDisputes();
      const resolvedDisputes = await storage.getResolvedLoaderDisputes();
      const inReviewDisputes = await storage.getInReviewLoaderDisputes();
      const allDisputes = await storage.getAllLoaderDisputes();

      res.json({
        openCount: openDisputes.length,
        resolvedCount: resolvedDisputes.length,
        inReviewCount: inReviewDisputes.length,
        totalCount: allDisputes.length,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Get resolved loader disputes
  app.get("/api/admin/loader-disputes/resolved", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.role !== "dispute_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const disputes = await storage.getResolvedLoaderDisputes();
      
      const enrichedDisputes = await Promise.all(disputes.map(async (dispute) => {
        const order = await storage.getLoaderOrder(dispute.orderId);
        const opener = await storage.getUser(dispute.openedBy);
        const loader = order ? await storage.getUser(order.loaderId) : null;
        const receiver = order ? await storage.getUser(order.receiverId) : null;
        let resolverName = null;
        if (dispute.resolvedBy) {
          const resolver = await storage.getUser(dispute.resolvedBy);
          resolverName = resolver?.username || null;
        }
        
        return {
          ...dispute,
          order,
          openerUsername: opener?.username,
          loaderUsername: loader?.username,
          receiverUsername: receiver?.username,
          resolverName,
        };
      }));

      res.json(enrichedDisputes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Get loader dispute details
  app.get("/api/admin/loader-disputes/:id/details", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.role !== "dispute_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const dispute = await storage.getLoaderDispute(req.params.id);
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      const order = await storage.getLoaderOrder(dispute.orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const loader = await storage.getUser(order.loaderId);
      const receiver = await storage.getUser(order.receiverId);
      const loaderWallet = await storage.getWalletByUserId(order.loaderId);
      const receiverWallet = await storage.getWalletByUserId(order.receiverId);

      const messages = await storage.getLoaderOrderMessages(order.id);
      const enrichedMessages = await Promise.all(messages.map(async (msg) => {
        if (msg.senderId) {
          const sender = await storage.getUser(msg.senderId);
          return { 
            ...msg, 
            senderName: sender?.username,
            senderRole: sender?.role,
          };
        }
        return { ...msg, senderName: "System", senderRole: "system" };
      }));

      res.json({
        dispute,
        order,
        loader: loader ? { 
          id: loader.id, 
          username: loader.username, 
          isFrozen: loader.isFrozen || false,
          frozenReason: loader.frozenReason || null,
        } : null,
        receiver: receiver ? { 
          id: receiver.id, 
          username: receiver.username, 
          isFrozen: receiver.isFrozen || false,
          frozenReason: receiver.frozenReason || null,
        } : null,
        loaderWallet: loaderWallet ? {
          availableBalance: loaderWallet.availableBalance,
          escrowBalance: loaderWallet.escrowBalance,
        } : null,
        receiverWallet: receiverWallet ? {
          availableBalance: receiverWallet.availableBalance,
          escrowBalance: receiverWallet.escrowBalance,
        } : null,
        chatMessages: enrichedMessages,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Send message to loader dispute
  app.post("/api/admin/loader-disputes/:id/message", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.role !== "dispute_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { message } = req.body;
      
      const dispute = await storage.getLoaderDispute(req.params.id);
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      const newMessage = await storage.createLoaderOrderMessage({
        orderId: dispute.orderId,
        senderId: req.user!.userId,
        isSystem: true,
        isAdminMessage: true,
        content: `[Admin]: ${message}`,
      });

      res.json(newMessage);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Admin: Resolve dispute
  app.post("/api/admin/loader-disputes/:id/resolve", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role !== "admin" && req.user!.role !== "dispute_admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { winner, resolution } = req.body; // winner: "loader" | "receiver" | "mutual"
      
      const dispute = await storage.getLoaderDispute(req.params.id);
      if (!dispute) {
        return res.status(404).json({ message: "Dispute not found" });
      }

      if (dispute.status !== "open" && dispute.status !== "in_review") {
        return res.status(400).json({ message: "Dispute is already resolved" });
      }

      const order = await storage.getLoaderOrder(dispute.orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const dealAmount = parseFloat(order.dealAmount);
      const penaltyAmount = dealAmount * 0.05; // 5% penalty
      
      const kaiAdmin = await storage.getUserByUsername("Kai");
      const adminUser = kaiAdmin || (await storage.getUsersByRole("admin"))[0];
      const adminWallet = adminUser ? await storage.getWalletByUserId(adminUser.id) : null;

      let newStatus: string;
      let winnerId: string | null = null;
      let loserId: string | null = null;

      if (winner === "loader") {
        // Loader wins: receiver pays 5% penalty
        newStatus = "resolved_loader_wins";
        winnerId = order.loaderId;
        loserId = order.receiverId;

        const receiverWallet = await storage.getWalletByUserId(order.receiverId);
        const loaderWallet = await storage.getWalletByUserId(order.loaderId);
        
        // Get the ad to access upfront percentage
        const ad = await storage.getLoaderAd(order.adId);
        
        // Calculate if loader had already sent upfront payment
        const upfrontPercentage = ad?.upfrontPercentage || 0;
        const upfrontAmountSent = order.loaderMarkedPaymentSent && upfrontPercentage > 0 
          ? (dealAmount * upfrontPercentage / 100) 
          : 0;
        
        if (receiverWallet) {
          const receiverEscrowTotal = parseFloat(order.receiverFrozenAmount || "0") + parseFloat(order.receiverFeeReserve || "0");
          const currentReceiverEscrow = parseFloat(receiverWallet.escrowBalance);
          const currentReceiverAvailable = parseFloat(receiverWallet.availableBalance);
          
          // Total amount receiver owes: 5% penalty + any upfront amount loader already sent
          const totalReceiverOwes = penaltyAmount + upfrontAmountSent;
          
          // Calculate how much can come from escrow vs available balance
          const amountFromEscrow = Math.min(totalReceiverOwes, receiverEscrowTotal);
          const amountFromAvailable = totalReceiverOwes - amountFromEscrow;
          
          // Clear receiver's escrow, deduct what they owe
          const receiverRefund = receiverEscrowTotal - amountFromEscrow;
          const newReceiverEscrow = (currentReceiverEscrow - receiverEscrowTotal).toFixed(8);
          const newReceiverAvailable = (currentReceiverAvailable + receiverRefund - amountFromAvailable).toFixed(8);
          
          await storage.updateWalletBalance(receiverWallet.id, newReceiverAvailable, newReceiverEscrow);
          
          // Transfer penalty (5%) to admin wallet
          if (adminWallet) {
            const newAdminBalance = (parseFloat(adminWallet.availableBalance) + penaltyAmount).toFixed(8);
            await storage.updateWalletBalance(adminWallet.id, newAdminBalance, adminWallet.escrowBalance);
            
            await storage.createTransaction({
              walletId: adminWallet.id,
              userId: adminUser!.id,
              type: "fee",
              amount: penaltyAmount.toString(),
              currency: "USDT",
              description: `Dispute penalty from loser (receiver) - order ${order.id}`,
            });
          }
          
          // Credit loader the upfront amount they already sent (if any)
          if (upfrontAmountSent > 0 && loaderWallet) {
            const newLoaderAvailable = (parseFloat(loaderWallet.availableBalance) + upfrontAmountSent).toFixed(8);
            await storage.updateWalletBalance(loaderWallet.id, newLoaderAvailable, loaderWallet.escrowBalance);
            
            await storage.createTransaction({
              walletId: loaderWallet.id,
              userId: order.loaderId,
              type: "refund",
              amount: upfrontAmountSent.toString(),
              currency: "USDT",
              description: `Refund of upfront payment (${upfrontPercentage}%) from dispute resolution - order ${order.id}`,
            });
          }
        }

        // Full refund to loader of their escrow (winner)
        if (loaderWallet) {
          const loaderRefund = parseFloat(order.loaderFrozenAmount) + parseFloat(order.loaderFeeReserve || "0");
          await storage.releaseEscrow(loaderWallet.id, loaderRefund.toString());
        }
      } else if (winner === "receiver") {
        // Receiver wins: loader pays 5% penalty
        newStatus = "resolved_receiver_wins";
        winnerId = order.receiverId;
        loserId = order.loaderId;

        const loaderWallet = await storage.getWalletByUserId(order.loaderId);
        if (loaderWallet) {
          const loaderEscrowTotal = parseFloat(order.loaderFrozenAmount) + parseFloat(order.loaderFeeReserve || "0");
          const currentLoaderEscrow = parseFloat(loaderWallet.escrowBalance);
          const currentLoaderAvailable = parseFloat(loaderWallet.availableBalance);
          
          // Calculate how much penalty can come from escrow vs available balance
          const penaltyFromEscrow = Math.min(penaltyAmount, loaderEscrowTotal);
          const penaltyFromAvailable = penaltyAmount - penaltyFromEscrow;
          
          // Release escrow minus penalty (loser's escrow is cleared, penalty goes to admin)
          const loaderRefund = loaderEscrowTotal - penaltyFromEscrow;
          const newLoaderEscrow = (currentLoaderEscrow - loaderEscrowTotal).toFixed(8);
          const newLoaderAvailable = (currentLoaderAvailable + loaderRefund - penaltyFromAvailable).toFixed(8);
          
          await storage.updateWalletBalance(loaderWallet.id, newLoaderAvailable, newLoaderEscrow);
          
          // Transfer penalty to admin wallet
          if (adminWallet) {
            const newAdminBalance = (parseFloat(adminWallet.availableBalance) + penaltyAmount).toFixed(8);
            await storage.updateWalletBalance(adminWallet.id, newAdminBalance, adminWallet.escrowBalance);
            
            await storage.createTransaction({
              walletId: adminWallet.id,
              userId: adminUser!.id,
              type: "fee",
              amount: penaltyAmount.toString(),
              currency: "USDT",
              description: `Dispute penalty from loser (loader) - order ${order.id}`,
            });
          }
        }

        // Full refund to receiver (winner)
        const receiverWallet = await storage.getWalletByUserId(order.receiverId);
        if (receiverWallet) {
          const receiverRefund = parseFloat(order.receiverFrozenAmount || "0") + parseFloat(order.receiverFeeReserve || "0");
          if (receiverRefund > 0) {
            await storage.releaseEscrow(receiverWallet.id, receiverRefund.toString());
          }
        }
      } else {
        // Mutual fault: no penalty, both refunded
        newStatus = "resolved_mutual";

        const loaderWallet = await storage.getWalletByUserId(order.loaderId);
        if (loaderWallet) {
          const loaderRefund = parseFloat(order.loaderFrozenAmount) + parseFloat(order.loaderFeeReserve || "0");
          await storage.releaseEscrow(loaderWallet.id, loaderRefund.toString());
        }

        const receiverWallet = await storage.getWalletByUserId(order.receiverId);
        if (receiverWallet) {
          const receiverRefund = parseFloat(order.receiverFrozenAmount || "0") + parseFloat(order.receiverFeeReserve || "0");
          if (receiverRefund > 0) {
            await storage.releaseEscrow(receiverWallet.id, receiverRefund.toString());
          }
        }
      }

      // Update dispute
      await storage.updateLoaderDispute(dispute.id, {
        status: newStatus as any,
        resolution: resolution || `Resolved in favor of ${winner}`,
        resolvedBy: req.user!.userId,
        winnerId,
        loserId,
        resolvedAt: new Date(),
      });

      // Update order
      await storage.updateLoaderOrder(order.id, {
        status: newStatus as any,
        penaltyAmount: winner === "mutual" ? "0" : penaltyAmount.toString(),
        penaltyPaidBy: loserId,
      });

      await storage.createLoaderOrderMessage({
        orderId: order.id,
        senderId: null,
        isSystem: true,
        isAdminMessage: true,
        content: `Dispute resolved by admin. ${winner === "mutual" ? "Mutual fault - no penalty applied." : `${winner.charAt(0).toUpperCase() + winner.slice(1)} wins. 5% penalty (${penaltyAmount.toFixed(2)}) charged to loser.`}`,
      });

      res.json({ message: "Dispute resolved successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Complete order (confirm payment received)
  app.post("/api/loaders/orders/:id/complete", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getLoaderOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.receiverId !== req.user!.userId) {
        return res.status(403).json({ message: "Only receiver can confirm payment received" });
      }

      // Updated to work with new statuses
      if (!["payment_sent", "payment_details_sent"].includes(order.status)) {
        return res.status(400).json({ message: "Order cannot be completed in current state" });
      }

      // Verify 2FA if user has it enabled
      const user = await storage.getUser(req.user!.userId);
      if (user?.twoFactorEnabled) {
        const { twoFactorCode } = req.body;
        if (!twoFactorCode) {
          return res.status(400).json({ message: "2FA verification required" });
        }
        const isValidTotp = verifyTotp(twoFactorCode, user.twoFactorSecret!);
        const isRecoveryCode = user.twoFactorRecoveryCodes?.includes(twoFactorCode);
        
        if (!isValidTotp && !isRecoveryCode) {
          return res.status(401).json({ message: "Invalid 2FA code" });
        }
        
        // Consume recovery code if used
        if (isRecoveryCode) {
          const updatedCodes = user.twoFactorRecoveryCodes!.filter(code => code !== twoFactorCode);
          await storage.updateUser(user.id, { twoFactorRecoveryCodes: updatedCodes });
        }
      }

      const dealAmount = parseFloat(order.dealAmount);
      const loaderFee = dealAmount * 0.03; // 3% loader fee (from reserved fee)
      const receiverFee = dealAmount * 0.02; // 2% receiver fee (from reserved fee)

      // Get admin wallet for fees
      const kaiAdmin = await storage.getUserByUsername("Kai");
      const adminUser = kaiAdmin || (await storage.getUsersByRole("admin"))[0];
      const adminWallet = adminUser ? await storage.getWalletByUserId(adminUser.id) : null;
      const totalPlatformFee = loaderFee + receiverFee;

      // Release loader collateral (fee reserve goes to platform)
      const loaderWallet = await storage.getWalletByUserId(order.loaderId);
      const loaderCollateral = parseFloat(order.loaderFrozenAmount);
      const loaderFeeReserve = parseFloat(order.loaderFeeReserve || "0");
      
      if (loaderWallet) {
        // Loader gets collateral back, fee reserve goes to admin
        const loaderEscrowTotal = loaderCollateral + loaderFeeReserve;
        const loaderRefund = loaderCollateral; // Only collateral, fee goes to platform
        
        // Move collateral from escrow to available, fee reserve is removed from escrow (goes to admin)
        const currentLoaderAvailable = parseFloat(loaderWallet.availableBalance);
        const currentLoaderEscrow = parseFloat(loaderWallet.escrowBalance);
        const newLoaderAvailable = (currentLoaderAvailable + loaderRefund).toFixed(8);
        const newLoaderEscrow = (currentLoaderEscrow - loaderEscrowTotal).toFixed(8);
        
        await storage.updateWalletBalance(loaderWallet.id, newLoaderAvailable, newLoaderEscrow);
        
        await storage.createTransaction({
          userId: order.loaderId,
          walletId: loaderWallet.id,
          type: "escrow_release",
          amount: loaderRefund.toString(),
          currency: "USDT",
          description: `Collateral released - order completed`,
        });
        
        await storage.createTransaction({
          userId: order.loaderId,
          walletId: loaderWallet.id,
          type: "fee",
          amount: loaderFee.toString(),
          currency: "USDT",
          description: `3% loader platform fee for completed order`,
        });
      }

      // Release receiver escrow and deduct fee, transfer upfront to loader
      const receiverWallet = await storage.getWalletByUserId(order.receiverId);
      const receiverUpfront = parseFloat(order.receiverFrozenAmount || "0");
      const receiverFeeReserve = parseFloat(order.receiverFeeReserve || "0");
      const receiverEscrowTotal = receiverUpfront + receiverFeeReserve;
      
      if (receiverWallet && receiverEscrowTotal > 0) {
        // Receiver's upfront goes to loader, fee reserve goes to admin
        // So receiver gets nothing back to available, but escrow is cleared
        const currentReceiverAvailable = parseFloat(receiverWallet.availableBalance);
        const currentReceiverEscrow = parseFloat(receiverWallet.escrowBalance);
        const newReceiverEscrow = (currentReceiverEscrow - receiverEscrowTotal).toFixed(8);
        
        await storage.updateWalletBalance(receiverWallet.id, currentReceiverAvailable.toFixed(8), newReceiverEscrow);
        
        await storage.createTransaction({
          userId: order.receiverId,
          walletId: receiverWallet.id,
          type: "fee",
          amount: receiverFee.toString(),
          currency: "USDT",
          description: `2% receiver platform fee for completed order`,
        });

        // Transfer upfront to loader (add to loader's available balance)
        if (receiverUpfront > 0 && loaderWallet) {
          // Re-fetch loader wallet to get updated balance
          const updatedLoaderWallet = await storage.getWalletByUserId(order.loaderId);
          if (updatedLoaderWallet) {
            const loaderAvailableNow = parseFloat(updatedLoaderWallet.availableBalance);
            const loaderEscrowNow = parseFloat(updatedLoaderWallet.escrowBalance);
            const newLoaderAvailableWithUpfront = (loaderAvailableNow + receiverUpfront).toFixed(8);
            
            await storage.updateWalletBalance(loaderWallet.id, newLoaderAvailableWithUpfront, loaderEscrowNow.toFixed(8));
            
            await storage.createTransaction({
              userId: order.loaderId,
              walletId: loaderWallet.id,
              type: "escrow_release",
              amount: receiverUpfront.toString(),
              currency: "USDT",
              description: `Upfront payment received from receiver`,
            });
          }
        }
      }

      // Transfer fees to admin
      if (adminWallet) {
        const newAdminBalance = (parseFloat(adminWallet.availableBalance) + totalPlatformFee).toFixed(2);
        await storage.updateWalletBalance(adminWallet.id, newAdminBalance, adminWallet.escrowBalance);
        await storage.createTransaction({
          userId: adminUser!.id,
          walletId: adminWallet.id,
          type: "fee",
          amount: totalPlatformFee.toString(),
          currency: "USDT",
          description: `Platform fees from completed loader order: ${loaderFee.toFixed(2)} (loader 3%) + ${receiverFee.toFixed(2)} (receiver 2%)`,
        });
      }

      await storage.updateLoaderOrder(order.id, {
        status: "completed",
        completedAt: new Date(),
        receiverConfirmedPayment: true,
        loaderFeeDeducted: loaderFee.toString(),
        receiverFeeDeducted: receiverFee.toString(),
      });

      await storage.createLoaderOrderMessage({
        orderId: order.id,
        senderId: null,
        isSystem: true,
        content: `Order completed! Loader paid 3% fee (${loaderFee.toFixed(2)}). Receiver paid 2% fee (${receiverFee.toFixed(2)}). Upfront transferred to loader.`,
      });

      // Update loader stats for both parties (increment completedTrades)
      try {
        const loaderStats = await storage.getOrCreateLoaderStats(order.loaderId);
        await storage.updateLoaderStats(order.loaderId, {
          completedTrades: loaderStats.completedTrades + 1,
        });
        
        const receiverStats = await storage.getOrCreateLoaderStats(order.receiverId);
        await storage.updateLoaderStats(order.receiverId, {
          completedTrades: receiverStats.completedTrades + 1,
        });
      } catch (statsError) {
        console.error("Failed to update loader stats:", statsError);
      }

      // Send notifications to both parties (non-blocking)
      try {
        await createNotification(order.loaderId, "order", "Order Completed", 
          "Loader order completed successfully", `/loader-order/${order.id}`);
        await createNotification(order.receiverId, "order", "Order Completed", 
          "Loader order completed successfully", `/loader-order/${order.id}`);
      } catch (notifError) {
        console.error("Failed to send notifications:", notifError);
      }

      res.json({ message: "Order completed successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Submit feedback for completed order
  app.post("/api/loaders/orders/:id/feedback", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { feedbackType, comment } = req.body;
      
      if (!["positive", "negative"].includes(feedbackType)) {
        return res.status(400).json({ message: "Invalid feedback type. Must be 'positive' or 'negative'" });
      }

      const order = await storage.getLoaderOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.status !== "completed") {
        return res.status(400).json({ message: "Feedback can only be left on completed orders" });
      }

      const isLoader = order.loaderId === req.user!.userId;
      const isReceiver = order.receiverId === req.user!.userId;
      
      if (!isLoader && !isReceiver) {
        return res.status(403).json({ message: "Only order participants can leave feedback" });
      }

      // Determine who is receiving the feedback
      const receiverId = isLoader ? order.receiverId : order.loaderId;
      const giverId = req.user!.userId;

      // Check if user already left feedback for this order
      const existingFeedback = await storage.getLoaderFeedbackByOrderId(order.id);
      const alreadyLeft = existingFeedback.some(f => f.giverId === giverId);
      
      if (alreadyLeft) {
        return res.status(400).json({ message: "You have already left feedback for this order" });
      }

      // Create feedback
      const feedback = await storage.createLoaderFeedback({
        orderId: order.id,
        giverId,
        receiverId,
        feedbackType: feedbackType as "positive" | "negative",
        comment: comment || null,
      });

      // Update receiver's stats
      const receiverStats = await storage.getOrCreateLoaderStats(receiverId);
      if (feedbackType === "positive") {
        await storage.updateLoaderStats(receiverId, {
          positiveFeedback: receiverStats.positiveFeedback + 1,
        });
      } else {
        await storage.updateLoaderStats(receiverId, {
          negativeFeedback: receiverStats.negativeFeedback + 1,
        });
      }

      res.json({ message: "Feedback submitted successfully", feedback });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get feedback for an order
  app.get("/api/loaders/orders/:id/feedback", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getLoaderOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const isLoader = order.loaderId === req.user!.userId;
      const isReceiver = order.receiverId === req.user!.userId;
      
      if (!isLoader && !isReceiver) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const feedback = await storage.getLoaderFeedbackByOrderId(order.id);
      
      // Enrich with giver usernames
      const enrichedFeedback = await Promise.all(feedback.map(async (f) => {
        const giver = await storage.getUser(f.giverId);
        return { ...f, giverUsername: giver?.username };
      }));

      // Check if current user already left feedback
      const userFeedback = enrichedFeedback.find(f => f.giverId === req.user!.userId);
      
      res.json({ 
        feedback: enrichedFeedback,
        hasLeftFeedback: !!userFeedback,
        userFeedback: userFeedback || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Auto-cancel check endpoint (can be called by a cron job)
  app.post("/api/loaders/check-expired-orders", async (req, res) => {
    try {
      const expiredOrders = await storage.getExpiredLoaderOrders();
      let cancelledCount = 0;

      for (const order of expiredOrders) {
        // Refund both parties fully - no penalty for auto-cancel
        const loaderWallet = await storage.getWalletByUserId(order.loaderId);
        if (loaderWallet) {
          const loaderRefund = parseFloat(order.loaderFrozenAmount) + parseFloat(order.loaderFeeReserve || "0");
          await storage.releaseEscrow(loaderWallet.id, loaderRefund.toString());
          await storage.createTransaction({
            userId: order.loaderId,
            walletId: loaderWallet.id,
            type: "refund",
            amount: loaderRefund.toString(),
            currency: "USDT",
            description: `Auto-cancel refund - countdown expired`,
          });
        }

        const receiverWallet = await storage.getWalletByUserId(order.receiverId);
        if (receiverWallet) {
          const receiverRefund = parseFloat(order.receiverFrozenAmount || "0") + parseFloat(order.receiverFeeReserve || "0");
          if (receiverRefund > 0) {
            await storage.releaseEscrow(receiverWallet.id, receiverRefund.toString());
            await storage.createTransaction({
              userId: order.receiverId,
              walletId: receiverWallet.id,
              type: "refund",
              amount: receiverRefund.toString(),
              currency: "USDT",
              description: `Auto-cancel refund - countdown expired`,
            });
          }
        }

        await storage.updateLoaderOrder(order.id, {
          status: "cancelled_auto",
        });

        // Reactivate the ad
        await storage.updateLoaderAd(order.adId, { isActive: true });

        await storage.createLoaderOrderMessage({
          orderId: order.id,
          senderId: null,
          isSystem: true,
          content: "Order auto-cancelled. Countdown expired before payment details were sent. Full refund to both parties. Ad is now active again.",
        });

        cancelledCount++;
      }

      res.json({ message: `Checked expired orders. Cancelled ${cancelledCount} orders.` });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get order messages
  app.get("/api/loaders/orders/:id/messages", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getLoaderOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.loaderId !== req.user!.userId && order.receiverId !== req.user!.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const messages = await storage.getLoaderOrderMessages(order.id);
      
      // Enrich with sender info
      const enrichedMessages = await Promise.all(messages.map(async (msg) => {
        if (msg.senderId) {
          const sender = await storage.getUser(msg.senderId);
          return { ...msg, senderUsername: sender?.username };
        }
        return { ...msg, senderUsername: "System" };
      }));

      res.json(enrichedMessages);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Send message in order chat
  app.post("/api/loaders/orders/:id/messages", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { content } = req.body;
      
      const order = await storage.getLoaderOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.loaderId !== req.user!.userId && order.receiverId !== req.user!.userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const message = await storage.createLoaderOrderMessage({
        orderId: order.id,
        senderId: req.user!.userId,
        isSystem: false,
        content,
      });

      res.json(message);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Receiver selects liability terms
  app.post("/api/loaders/orders/:id/select-liability", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { liabilityType } = req.body;
      
      const validTypes = [
        "full_payment",
        "partial_10", "partial_25", "partial_50",
        "time_bound_24h", "time_bound_48h", "time_bound_72h", "time_bound_1week", "time_bound_1month"
      ];
      
      if (!validTypes.includes(liabilityType)) {
        return res.status(400).json({ message: "Invalid liability type" });
      }

      const order = await storage.getLoaderOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.receiverId !== req.user!.userId) {
        return res.status(403).json({ message: "Only receiver can select liability terms" });
      }

      if (order.status !== "awaiting_liability_confirmation") {
        return res.status(400).json({ message: "Liability terms can only be selected in awaiting_liability_confirmation status" });
      }

      if (order.liabilityLockedAt) {
        return res.status(400).json({ message: "Liability agreement is already locked" });
      }

      await storage.updateLoaderOrder(order.id, {
        liabilityType,
        receiverLiabilityConfirmed: false,
        loaderLiabilityConfirmed: false,
      });

      const liabilityLabels: Record<string, string> = {
        "full_payment": "Full Payment (pay full amount even if assets frozen)",
        "partial_10": "Partial Payment (10% if assets frozen)",
        "partial_25": "Partial Payment (25% if assets frozen)",
        "partial_50": "Partial Payment (50% if assets frozen)",
        "time_bound_24h": "Time-Bound (wait 24 hours)",
        "time_bound_48h": "Time-Bound (wait 48 hours)",
        "time_bound_72h": "Time-Bound (wait 72 hours)",
        "time_bound_1week": "Time-Bound (wait 1 week)",
        "time_bound_1month": "Time-Bound (wait 1 month)",
      };

      await storage.createLoaderOrderMessage({
        orderId: order.id,
        senderId: null,
        isSystem: true,
        content: `Receiver selected liability terms: ${liabilityLabels[liabilityType]}. Both parties must confirm to lock the agreement.`,
      });

      res.json({ message: "Liability terms selected. Both parties must now confirm." });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Confirm liability agreement (both parties must confirm)
  app.post("/api/loaders/orders/:id/confirm-liability", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getLoaderOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const isLoader = order.loaderId === req.user!.userId;
      const isReceiver = order.receiverId === req.user!.userId;
      
      if (!isLoader && !isReceiver) {
        return res.status(403).json({ message: "Not authorized" });
      }

      if (order.status !== "awaiting_liability_confirmation") {
        return res.status(400).json({ message: "Cannot confirm liability in current status" });
      }

      if (!order.liabilityType) {
        return res.status(400).json({ message: "Receiver must select liability terms first" });
      }

      if (order.liabilityLockedAt) {
        return res.status(400).json({ message: "Liability agreement is already locked" });
      }

      const updates: any = {};
      
      if (isReceiver) {
        if (order.receiverLiabilityConfirmed) {
          return res.status(400).json({ message: "You have already confirmed" });
        }
        updates.receiverLiabilityConfirmed = true;
      } else {
        if (order.loaderLiabilityConfirmed) {
          return res.status(400).json({ message: "You have already confirmed" });
        }
        updates.loaderLiabilityConfirmed = true;
      }

      await storage.updateLoaderOrder(order.id, updates);

      const confirmer = isLoader ? "Loader" : "Receiver";
      await storage.createLoaderOrderMessage({
        orderId: order.id,
        senderId: null,
        isSystem: true,
        content: `${confirmer} confirmed liability agreement.`,
      });

      // Check if both have confirmed
      const updatedOrder = await storage.getLoaderOrder(order.id);
      if (updatedOrder && 
          (updatedOrder.receiverLiabilityConfirmed || (isReceiver && updates.receiverLiabilityConfirmed)) && 
          (updatedOrder.loaderLiabilityConfirmed || (isLoader && updates.loaderLiabilityConfirmed))) {
        
        // Calculate liability deadline for time-bound options
        let liabilityDeadline = null;
        if (order.liabilityType?.startsWith("time_bound_")) {
          const timeMs: Record<string, number> = {
            "time_bound_24h": 24 * 60 * 60 * 1000,
            "time_bound_48h": 48 * 60 * 60 * 1000,
            "time_bound_72h": 72 * 60 * 60 * 1000,
            "time_bound_1week": 7 * 24 * 60 * 60 * 1000,
            "time_bound_1month": 30 * 24 * 60 * 60 * 1000,
          };
          liabilityDeadline = new Date(Date.now() + (timeMs[order.liabilityType] || 0));
        }

        await storage.updateLoaderOrder(order.id, {
          liabilityLockedAt: new Date(),
          liabilityDeadline,
          status: "awaiting_payment_details",
          receiverLiabilityConfirmed: true,
          loaderLiabilityConfirmed: true,
        });

        await storage.createLoaderOrderMessage({
          orderId: order.id,
          senderId: null,
          isSystem: true,
          content: `Liability agreement locked! Both parties confirmed. Loader can now proceed to send funds. Countdown is active.`,
        });

        return res.json({ message: "Liability agreement locked. Order proceeding to payment details phase.", locked: true });
      }

      res.json({ message: "Confirmation recorded. Waiting for other party to confirm.", locked: false });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
