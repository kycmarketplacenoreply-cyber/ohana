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

  // Create offer - allows any KYC verified user with 2FA enabled to post ads
  app.post("/api/vendor/offers", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Check KYC status first
      const kyc = await storage.getKycByUserId(req.user!.userId);
      if (!kyc || kyc.status !== "approved") {
        return res.status(403).json({ message: "KYC verification required before posting ads. Please complete your KYC verification." });
      }

      // Check 2FA is enabled
      const user = await storage.getUser(req.user!.userId);
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
        if (user?.twoFactorEnabled) {
          if (!twoFactorToken) {
            return res.status(400).json({ message: "2FA token required to release funds", requires2FA: true });
          }
          const isValid = verifyTotp(twoFactorToken, user.twoFactorSecret!);
          if (!isValid) {
            return res.status(401).json({ message: "Invalid 2FA token" });
          }
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

      res.json({
        buyerOrders,
        vendorOrders,
        pendingOrders,
        cancelledOrders,
        disputedOrders,
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

      // Get order chat messages
      const chatMessages = await storage.getChatMessagesByOrder(order.id);

      // Get buyer info and wallet
      const buyer = await storage.getUser(order.buyerId);
      const buyerWallet = await storage.getWalletByUserId(order.buyerId, "USDT");

      // Get seller info and wallet (via vendor profile)
      const vendorProfile = await storage.getVendorProfile(order.vendorId);
      let seller = null;
      let sellerWallet = null;
      if (vendorProfile) {
        seller = await storage.getUser(vendorProfile.userId);
        sellerWallet = await storage.getWalletByUserId(vendorProfile.userId, "USDT");
      }

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
        await refundBuyerEscrow(order.buyerId, order.fiatAmount, order.id);
      } else if (status === "resolved_release") {
        await releaseEscrowWithFee(order.buyerId, order.vendorId, order.fiatAmount, order.id);
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

  // ==================== ADMIN INITIALIZATION ====================
  
  // Initialize admin users (creates Kai admin and Turbo dispute_admin if they don't exist)
  app.post("/api/admin/init", async (req, res) => {
    try {
      const results: { user: string; status: string }[] = [];

      // Create Kai admin user
      const existingKai = await storage.getUserByUsername("Kai");
      if (!existingKai) {
        const kaiPassword = await hashPassword("#487530Turbo");
        const kaiUser = await storage.createUser({
          username: "Kai",
          email: "kai@admin.local",
          password: kaiPassword,
          role: "admin",
        });
        await storage.createWallet({ userId: kaiUser.id, currency: "USDT" });
        results.push({ user: "Kai", status: "created" });
      } else {
        results.push({ user: "Kai", status: "already exists" });
      }

      // Create Turbo dispute_admin user
      const existingTurbo = await storage.getUserByUsername("Turbo");
      if (!existingTurbo) {
        const turboPassword = await hashPassword("icu14c");
        const turboUser = await storage.createUser({
          username: "Turbo",
          email: "turbo@admin.local",
          password: turboPassword,
          role: "dispute_admin",
        });
        await storage.createWallet({ userId: turboUser.id, currency: "USDT" });
        results.push({ user: "Turbo", status: "created" });
      } else {
        results.push({ user: "Turbo", status: "already exists" });
      }

      res.json({ message: "Admin initialization complete", results });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
