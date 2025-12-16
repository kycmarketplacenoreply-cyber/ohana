import { eq, and, desc, sql, gte, lte, or, like, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  kyc,
  vendorProfiles,
  offers,
  orders,
  chatMessages,
  disputes,
  disputeChatMessages,
  wallets,
  transactions,
  ratings,
  notifications,
  auditLogs,
  maintenanceSettings,
  themeSettings,
  withdrawalRequests,
  exchanges,
  socialPosts,
  socialComments,
  socialLikes,
  socialDislikes,
  socialMutes,
  loaderAds,
  loaderOrders,
  loaderOrderMessages,
  loaderDisputes,
  loaderFeedback,
  loaderStats,
  userDepositAddresses,
  blockchainDeposits,
  depositSweeps,
  platformWalletControls,
  blockchainAdminActions,
  userWithdrawalLimits,
  userFirstWithdrawals,
  walletIndexCounter,
  type User,
  type InsertUser,
  type Kyc,
  type InsertKyc,
  type VendorProfile,
  type InsertVendorProfile,
  type Offer,
  type InsertOffer,
  type Order,
  type InsertOrder,
  type ChatMessage,
  type InsertChatMessage,
  type Dispute,
  type InsertDispute,
  type DisputeChatMessage,
  type InsertDisputeChatMessage,
  type Wallet,
  type InsertWallet,
  type Transaction,
  type InsertTransaction,
  type Rating,
  type InsertRating,
  type Notification,
  type InsertNotification,
  type AuditLog,
  type InsertAuditLog,
  type MaintenanceSettings,
  type ThemeSettings,
  type WithdrawalRequest,
  type InsertWithdrawalRequest,
  type Exchange,
  type InsertExchange,
  type SocialPost,
  type InsertSocialPost,
  type SocialComment,
  type InsertSocialComment,
  type SocialLike,
  type InsertSocialLike,
  type SocialDislike,
  type InsertSocialDislike,
  type SocialMute,
  type InsertSocialMute,
  type LoaderAd,
  type InsertLoaderAd,
  type LoaderOrder,
  type InsertLoaderOrder,
  type LoaderOrderMessage,
  type InsertLoaderOrderMessage,
  type LoaderDispute,
  type InsertLoaderDispute,
  type LoaderFeedback,
  type InsertLoaderFeedback,
  type LoaderStats,
  type InsertLoaderStats,
  type UserDepositAddress,
  type InsertUserDepositAddress,
  type BlockchainDeposit,
  type InsertBlockchainDeposit,
  type DepositSweep,
  type InsertDepositSweep,
  type PlatformWalletControls,
  type BlockchainAdminAction,
  type InsertBlockchainAdminAction,
  type UserWithdrawalLimit,
  type InsertUserWithdrawalLimit,
  type UserFirstWithdrawal,
  type InsertUserFirstWithdrawal,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  updateUserLoginAttempts(id: string, attempts: number): Promise<void>;
  freezeUser(id: string, reason: string): Promise<void>;
  unfreezeUser(id: string): Promise<void>;
  addDeviceFingerprint(userId: string, fingerprint: string): Promise<void>;
  getUsersByRole(role: string): Promise<User[]>;

  // KYC
  getKyc(id: string): Promise<Kyc | undefined>;
  getKycByUserId(userId: string): Promise<Kyc | undefined>;
  createKyc(kyc: InsertKyc): Promise<Kyc>;
  updateKyc(id: string, updates: Partial<Kyc>): Promise<Kyc | undefined>;
  getPendingKyc(): Promise<Kyc[]>;
  
  // Vendor Profiles
  getVendorProfile(id: string): Promise<VendorProfile | undefined>;
  getVendorProfileByUserId(userId: string): Promise<VendorProfile | undefined>;
  createVendorProfile(profile: InsertVendorProfile): Promise<VendorProfile>;
  updateVendorProfile(id: string, updates: Partial<VendorProfile>): Promise<VendorProfile | undefined>;
  getApprovedVendors(): Promise<VendorProfile[]>;
  getPendingVendors(): Promise<VendorProfile[]>;
  updateVendorStats(vendorId: string, stats: Partial<VendorProfile>): Promise<void>;

  // Offers
  getOffer(id: string): Promise<Offer | undefined>;
  getOffersByVendor(vendorId: string): Promise<Offer[]>;
  createOffer(offer: InsertOffer): Promise<Offer>;
  updateOffer(id: string, updates: Partial<Offer>): Promise<Offer | undefined>;
  getActiveOffers(filters?: { type?: string; currency?: string; country?: string }): Promise<Offer[]>;
  deactivateOffer(id: string): Promise<void>;

  // Orders
  getOrder(id: string): Promise<Order | undefined>;
  getOrdersByBuyer(buyerId: string): Promise<Order[]>;
  getOrdersByVendor(vendorId: string): Promise<Order[]>;
  getOrdersByOffer(offerId: string): Promise<Order[]>;
  getActiveOrdersByOffer(offerId: string): Promise<Order[]>;
  createOrder(order: InsertOrder): Promise<Order>;
  updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined>;
  getOrdersForAutoRelease(): Promise<Order[]>;

  // Chat Messages
  getChatMessagesByOrder(orderId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;

  // Disputes
  getDispute(id: string): Promise<Dispute | undefined>;
  getDisputeByOrderId(orderId: string): Promise<Dispute | undefined>;
  createDispute(dispute: InsertDispute): Promise<Dispute>;
  updateDispute(id: string, updates: Partial<Dispute>): Promise<Dispute | undefined>;
  getOpenDisputes(): Promise<Dispute[]>;
  getResolvedDisputes(): Promise<Dispute[]>;

  // Dispute Chat Messages
  getDisputeChatMessages(disputeId: string): Promise<DisputeChatMessage[]>;
  createDisputeChatMessage(message: InsertDisputeChatMessage): Promise<DisputeChatMessage>;

  // Wallets
  getWallet(id: string): Promise<Wallet | undefined>;
  getWalletByUserId(userId: string, currency?: string): Promise<Wallet | undefined>;
  createWallet(wallet: InsertWallet): Promise<Wallet>;
  updateWalletBalance(id: string, available: string, escrow: string): Promise<void>;
  holdEscrow(walletId: string, amount: string): Promise<void>;
  releaseEscrow(walletId: string, amount: string): Promise<void>;

  // Transactions
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getTransactionsByUser(userId: string): Promise<Transaction[]>;
  getTransactionsByWallet(walletId: string): Promise<Transaction[]>;

  // Ratings
  createRating(rating: InsertRating): Promise<Rating>;
  getRatingsByVendor(vendorId: string): Promise<Rating[]>;
  getRatingByOrder(orderId: string): Promise<Rating | undefined>;

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  markNotificationAsRead(id: string): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  getUnreadCount(userId: string): Promise<number>;

  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(filters?: { userId?: string; action?: string; resource?: string; startDate?: Date; endDate?: Date }): Promise<AuditLog[]>;

  // Maintenance Settings
  getMaintenanceSettings(): Promise<MaintenanceSettings | undefined>;
  updateMaintenanceSettings(updates: Partial<MaintenanceSettings>): Promise<MaintenanceSettings>;

  // Theme Settings
  getThemeSettings(): Promise<ThemeSettings | undefined>;
  updateThemeSettings(updates: Partial<ThemeSettings>): Promise<ThemeSettings>;

  // Exchanges
  getExchange(id: string): Promise<Exchange | undefined>;
  getExchangeBySymbol(symbol: string): Promise<Exchange | undefined>;
  getAllExchanges(): Promise<Exchange[]>;
  getActiveExchanges(): Promise<Exchange[]>;
  createExchange(exchange: InsertExchange): Promise<Exchange>;
  updateExchange(id: string, updates: Partial<Exchange>): Promise<Exchange | undefined>;
  deleteExchange(id: string): Promise<void>;

  // Social Feed - Posts
  getSocialPost(id: string): Promise<SocialPost | undefined>;
  getSocialPosts(limit?: number, offset?: number): Promise<any[]>;
  searchSocialPosts(query: string, limit?: number, offset?: number): Promise<any[]>;
  createSocialPost(post: InsertSocialPost): Promise<SocialPost>;
  updateSocialPost(id: string, updates: Partial<SocialPost>): Promise<SocialPost | undefined>;
  deleteSocialPost(id: string): Promise<void>;
  deleteOldPosts(): Promise<number>;

  // Social Feed - Comments
  getSocialComment(id: string): Promise<SocialComment | undefined>;
  getSocialCommentsByPost(postId: string): Promise<any[]>;
  createSocialComment(comment: InsertSocialComment): Promise<SocialComment>;
  deleteSocialComment(id: string): Promise<void>;

  // Social Feed - Likes
  getSocialLike(postId: string, userId: string): Promise<SocialLike | undefined>;
  createSocialLike(like: InsertSocialLike): Promise<SocialLike>;
  deleteSocialLike(postId: string, userId: string): Promise<void>;

  // Social Feed - Dislikes
  getSocialDislike(postId: string, userId: string): Promise<SocialDislike | undefined>;
  createSocialDislike(dislike: InsertSocialDislike): Promise<SocialDislike>;
  deleteSocialDislike(postId: string, userId: string): Promise<void>;

  // Social Feed - Mutes
  getSocialMute(userId: string): Promise<SocialMute | undefined>;
  createSocialMute(mute: InsertSocialMute): Promise<SocialMute>;
  deleteSocialMute(userId: string): Promise<void>;
  isUserMuted(userId: string): Promise<boolean>;

  // Loader Zone - Ads
  getLoaderAd(id: string): Promise<LoaderAd | undefined>;
  getLoaderAdsByLoader(loaderId: string): Promise<LoaderAd[]>;
  getActiveLoaderAds(): Promise<any[]>;
  createLoaderAd(ad: InsertLoaderAd): Promise<LoaderAd>;
  updateLoaderAd(id: string, updates: Partial<LoaderAd>): Promise<LoaderAd | undefined>;
  deactivateLoaderAd(id: string): Promise<void>;

  // Loader Zone - Orders
  getLoaderOrder(id: string): Promise<LoaderOrder | undefined>;
  getLoaderOrdersByLoader(loaderId: string): Promise<LoaderOrder[]>;
  getLoaderOrdersByReceiver(receiverId: string): Promise<LoaderOrder[]>;
  getLoaderOrdersByAd(adId: string): Promise<LoaderOrder[]>;
  createLoaderOrder(order: InsertLoaderOrder): Promise<LoaderOrder>;
  updateLoaderOrder(id: string, updates: Partial<LoaderOrder>): Promise<LoaderOrder | undefined>;

  // Loader Zone - Messages
  getLoaderOrderMessages(orderId: string): Promise<LoaderOrderMessage[]>;
  createLoaderOrderMessage(message: InsertLoaderOrderMessage): Promise<LoaderOrderMessage>;

  // Loader Zone - Disputes
  getLoaderDispute(id: string): Promise<LoaderDispute | undefined>;
  getLoaderDisputeByOrderId(orderId: string): Promise<LoaderDispute | undefined>;
  getOpenLoaderDisputes(): Promise<LoaderDispute[]>;
  getResolvedLoaderDisputes(): Promise<LoaderDispute[]>;
  getInReviewLoaderDisputes(): Promise<LoaderDispute[]>;
  getAllLoaderDisputes(): Promise<LoaderDispute[]>;
  createLoaderDispute(dispute: InsertLoaderDispute): Promise<LoaderDispute>;
  updateLoaderDispute(id: string, updates: Partial<LoaderDispute>): Promise<LoaderDispute | undefined>;
  getExpiredLoaderOrders(): Promise<LoaderOrder[]>;

  // Loader Zone - Feedback
  getLoaderFeedback(id: string): Promise<LoaderFeedback | undefined>;
  getLoaderFeedbackByOrderId(orderId: string): Promise<LoaderFeedback[]>;
  getLoaderFeedbackByUser(userId: string): Promise<LoaderFeedback[]>;
  createLoaderFeedback(feedback: InsertLoaderFeedback): Promise<LoaderFeedback>;

  // Loader Zone - Stats
  getLoaderStats(userId: string): Promise<LoaderStats | undefined>;
  createLoaderStats(stats: InsertLoaderStats): Promise<LoaderStats>;
  updateLoaderStats(userId: string, updates: Partial<LoaderStats>): Promise<LoaderStats | undefined>;
  getOrCreateLoaderStats(userId: string): Promise<LoaderStats>;

  // Withdrawal Requests
  getWithdrawalRequest(id: string): Promise<WithdrawalRequest | undefined>;
  getPendingWithdrawalRequests(): Promise<WithdrawalRequest[]>;
  createWithdrawalRequest(request: InsertWithdrawalRequest): Promise<WithdrawalRequest>;
  updateWithdrawalRequest(id: string, updates: Partial<WithdrawalRequest>): Promise<WithdrawalRequest | undefined>;
  
  // User search and stats
  searchUsersByUsername(username: string): Promise<User[]>;
  getAllUsers(): Promise<User[]>;
  getTotalPlatformBalance(): Promise<string>;
  
  // Admin management
  getAllTransactions(): Promise<Transaction[]>;
  getAllWallets(): Promise<Wallet[]>;
  getAllOrders(): Promise<Order[]>;
  deleteUser(id: string): Promise<void>;

  // Blockchain Wallet - Deposit Addresses
  getUserDepositAddress(userId: string, network?: string): Promise<UserDepositAddress | undefined>;
  getUserDepositAddressByAddress(address: string): Promise<UserDepositAddress | undefined>;
  createUserDepositAddress(address: InsertUserDepositAddress): Promise<UserDepositAddress>;
  getNextDerivationIndex(): Promise<number>;
  getAllActiveDepositAddresses(): Promise<UserDepositAddress[]>;

  // Blockchain Wallet - Deposits
  getBlockchainDeposit(id: string): Promise<BlockchainDeposit | undefined>;
  getBlockchainDepositByTxHash(txHash: string): Promise<BlockchainDeposit | undefined>;
  getBlockchainDepositsByUser(userId: string): Promise<BlockchainDeposit[]>;
  getPendingBlockchainDeposits(): Promise<BlockchainDeposit[]>;
  getConfirmedUncreditedDeposits(): Promise<BlockchainDeposit[]>;
  getCreditedUnsweptDeposits(): Promise<BlockchainDeposit[]>;
  createBlockchainDeposit(deposit: InsertBlockchainDeposit): Promise<BlockchainDeposit>;
  updateBlockchainDeposit(id: string, updates: Partial<BlockchainDeposit>): Promise<BlockchainDeposit | undefined>;

  // Blockchain Wallet - Sweeps
  getDepositSweep(id: string): Promise<DepositSweep | undefined>;
  getDepositSweepByDepositId(depositId: string): Promise<DepositSweep | undefined>;
  getPendingSweeps(): Promise<DepositSweep[]>;
  createDepositSweep(sweep: InsertDepositSweep): Promise<DepositSweep>;
  updateDepositSweep(id: string, updates: Partial<DepositSweep>): Promise<DepositSweep | undefined>;

  // Platform Wallet Controls
  getPlatformWalletControls(): Promise<PlatformWalletControls | undefined>;
  updatePlatformWalletControls(updates: Partial<PlatformWalletControls>): Promise<PlatformWalletControls>;
  initPlatformWalletControls(): Promise<PlatformWalletControls>;

  // Blockchain Admin Actions
  createBlockchainAdminAction(action: InsertBlockchainAdminAction): Promise<BlockchainAdminAction>;
  getBlockchainAdminActions(limit?: number): Promise<BlockchainAdminAction[]>;

  // User Withdrawal Limits
  getUserWithdrawalLimit(userId: string, date: string): Promise<UserWithdrawalLimit | undefined>;
  createUserWithdrawalLimit(limit: InsertUserWithdrawalLimit): Promise<UserWithdrawalLimit>;
  updateUserWithdrawalLimit(id: string, updates: Partial<UserWithdrawalLimit>): Promise<UserWithdrawalLimit | undefined>;
  getOrCreateUserWithdrawalLimit(userId: string, date: string): Promise<UserWithdrawalLimit>;

  // User First Withdrawals
  getUserFirstWithdrawal(userId: string): Promise<UserFirstWithdrawal | undefined>;
  createUserFirstWithdrawal(data: InsertUserFirstWithdrawal): Promise<UserFirstWithdrawal>;
  updateUserFirstWithdrawal(userId: string, updates: Partial<UserFirstWithdrawal>): Promise<UserFirstWithdrawal | undefined>;
  getOrCreateUserFirstWithdrawal(userId: string): Promise<UserFirstWithdrawal>;

  // Extended Withdrawal Requests
  getAllWithdrawalRequests(): Promise<WithdrawalRequest[]>;
  getWithdrawalRequestsByUser(userId: string): Promise<WithdrawalRequest[]>;
  getApprovedWithdrawalRequests(): Promise<WithdrawalRequest[]>;
  getTodayPlatformWithdrawalTotal(): Promise<string>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async updateUserLoginAttempts(id: string, attempts: number): Promise<void> {
    await db.update(users).set({ loginAttempts: attempts }).where(eq(users.id, id));
  }

  async freezeUser(id: string, reason: string): Promise<void> {
    await db.update(users).set({ isFrozen: true, frozenReason: reason }).where(eq(users.id, id));
  }

  async unfreezeUser(id: string): Promise<void> {
    await db.update(users).set({ isFrozen: false, frozenReason: null }).where(eq(users.id, id));
  }

  async addDeviceFingerprint(userId: string, fingerprint: string): Promise<void> {
    const user = await this.getUser(userId);
    if (user) {
      const fingerprints = user.deviceFingerprints || [];
      if (!fingerprints.includes(fingerprint)) {
        fingerprints.push(fingerprint);
        await db.update(users).set({ deviceFingerprints: fingerprints }).where(eq(users.id, userId));
      }
    }
  }

  async getUsersByRole(role: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.role, role as any));
  }

  // KYC
  async getKyc(id: string): Promise<Kyc | undefined> {
    const [kycRecord] = await db.select().from(kyc).where(eq(kyc.id, id));
    return kycRecord || undefined;
  }

  async getKycByUserId(userId: string): Promise<Kyc | undefined> {
    const [kycRecord] = await db.select().from(kyc).where(eq(kyc.userId, userId));
    return kycRecord || undefined;
  }

  async createKyc(insertKyc: InsertKyc): Promise<Kyc> {
    const [kycRecord] = await db.insert(kyc).values(insertKyc).returning();
    return kycRecord;
  }

  async updateKyc(id: string, updates: Partial<Kyc>): Promise<Kyc | undefined> {
    const [kycRecord] = await db.update(kyc).set(updates).where(eq(kyc.id, id)).returning();
    return kycRecord || undefined;
  }

  async getPendingKyc(): Promise<Kyc[]> {
    return await db.select().from(kyc).where(eq(kyc.status, "pending")).orderBy(desc(kyc.submittedAt));
  }

  // Vendor Profiles
  async getVendorProfile(id: string): Promise<VendorProfile | undefined> {
    const [profile] = await db.select().from(vendorProfiles).where(eq(vendorProfiles.id, id));
    return profile || undefined;
  }

  async getVendorProfileByUserId(userId: string): Promise<VendorProfile | undefined> {
    const [profile] = await db.select().from(vendorProfiles).where(eq(vendorProfiles.userId, userId));
    return profile || undefined;
  }

  async createVendorProfile(profile: InsertVendorProfile): Promise<VendorProfile> {
    const [vendorProfile] = await db.insert(vendorProfiles).values(profile).returning();
    return vendorProfile;
  }

  async updateVendorProfile(id: string, updates: Partial<VendorProfile>): Promise<VendorProfile | undefined> {
    const [profile] = await db
      .update(vendorProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(vendorProfiles.id, id))
      .returning();
    return profile || undefined;
  }

  async getApprovedVendors(): Promise<VendorProfile[]> {
    return await db.select().from(vendorProfiles).where(eq(vendorProfiles.isApproved, true));
  }

  async getPendingVendors(): Promise<VendorProfile[]> {
    return await db.select().from(vendorProfiles).where(eq(vendorProfiles.isApproved, false));
  }

  async updateVendorStats(vendorId: string, stats: Partial<VendorProfile>): Promise<void> {
    await db.update(vendorProfiles).set(stats).where(eq(vendorProfiles.id, vendorId));
  }

  // Offers
  async getOffer(id: string): Promise<Offer | undefined> {
    const [offer] = await db.select().from(offers).where(eq(offers.id, id));
    return offer || undefined;
  }

  async getOffersByVendor(vendorId: string): Promise<Offer[]> {
    return await db.select().from(offers).where(eq(offers.vendorId, vendorId)).orderBy(desc(offers.createdAt));
  }

  async createOffer(offer: InsertOffer): Promise<Offer> {
    const [newOffer] = await db.insert(offers).values(offer).returning();
    return newOffer;
  }

  async updateOffer(id: string, updates: Partial<Offer>): Promise<Offer | undefined> {
    const [offer] = await db
      .update(offers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(offers.id, id))
      .returning();
    return offer || undefined;
  }

  async getActiveOffers(filters?: { type?: string; currency?: string; country?: string; paymentMethod?: string; search?: string }): Promise<any[]> {
    let query = db
      .select({
        offer: offers,
        vendor: vendorProfiles,
        user: users,
        kycRecord: kyc,
      })
      .from(offers)
      .innerJoin(vendorProfiles, eq(offers.vendorId, vendorProfiles.id))
      .innerJoin(users, eq(vendorProfiles.userId, users.id))
      .leftJoin(kyc, eq(kyc.userId, users.id))
      .where(and(
        eq(offers.isActive, true), 
        eq(vendorProfiles.isApproved, true),
        sql`CAST(${offers.availableAmount} AS DECIMAL(18,8)) > 0`
      ))
      .$dynamic();

    if (filters?.type) {
      query = query.where(eq(offers.type, filters.type));
    }
    if (filters?.currency) {
      query = query.where(eq(offers.currency, filters.currency));
    }
    if (filters?.country) {
      query = query.where(eq(vendorProfiles.country, filters.country));
    }
    if (filters?.paymentMethod && filters.paymentMethod !== "all") {
      query = query.where(sql`${offers.paymentMethods} @> ARRAY[${filters.paymentMethod}]::text[]`);
    }
    if (filters?.search) {
      const searchTerm = `%${filters.search.toLowerCase()}%`;
      query = query.where(
        or(
          like(sql`LOWER(${users.username})`, searchTerm),
          like(sql`LOWER(${vendorProfiles.businessName})`, searchTerm),
          like(sql`LOWER(${offers.terms})`, searchTerm),
          sql`EXISTS (SELECT 1 FROM unnest(${offers.paymentMethods}) AS pm WHERE LOWER(pm) LIKE ${searchTerm})`
        )
      );
    }

    const results = await query.orderBy(desc(offers.isPriority), desc(offers.createdAt));
    
    return results.map((r) => {
      const isKycVerified = r.kycRecord?.status === "approved";
      const isStarVerified = r.kycRecord?.isStarVerified || false;
      
      return {
        ...r.offer,
        vendorUserId: r.vendor.userId,
        vendorName: r.vendor.businessName || r.user.username,
        vendorTrades: r.vendor.totalTrades,
        vendorCompletionRate: r.vendor.totalTrades > 0 
          ? ((r.vendor.completedTrades / r.vendor.totalTrades) * 100).toFixed(2)
          : "100.00",
        vendorRating: parseFloat(r.vendor.averageRating || "0") > 0 
          ? (parseFloat(r.vendor.averageRating || "0") * 20).toFixed(2)
          : "99.00",
        vendorVerified: isKycVerified,
        vendorStarVerified: isStarVerified,
        responseTime: 15,
      };
    });
  }

  async deactivateOffer(id: string): Promise<void> {
    await db.update(offers).set({ isActive: false }).where(eq(offers.id, id));
  }

  // Orders
  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order || undefined;
  }

  async getOrdersByBuyer(buyerId: string): Promise<Order[]> {
    return await db.select().from(orders).where(eq(orders.buyerId, buyerId)).orderBy(desc(orders.createdAt));
  }

  async getOrdersByVendor(vendorId: string): Promise<Order[]> {
    return await db.select().from(orders).where(eq(orders.vendorId, vendorId)).orderBy(desc(orders.createdAt));
  }

  async getOrdersByOffer(offerId: string): Promise<Order[]> {
    return await db.select().from(orders).where(eq(orders.offerId, offerId)).orderBy(desc(orders.createdAt));
  }

  async getActiveOrdersByOffer(offerId: string): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.offerId, offerId),
          or(
            eq(orders.status, "created"),
            eq(orders.status, "escrowed"),
            eq(orders.status, "paid"),
            eq(orders.status, "confirmed"),
            eq(orders.status, "disputed")
          )
        )
      )
      .orderBy(desc(orders.createdAt));
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db.insert(orders).values(order).returning();
    return newOrder;
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined> {
    const [order] = await db
      .update(orders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return order || undefined;
  }

  async getOrdersForAutoRelease(): Promise<Order[]> {
    const now = new Date();
    return await db
      .select()
      .from(orders)
      .where(and(eq(orders.status, "paid"), lte(orders.autoReleaseAt, now)));
  }

  // Chat Messages
  async getChatMessagesByOrder(orderId: string): Promise<ChatMessage[]> {
    return await db.select().from(chatMessages).where(eq(chatMessages.orderId, orderId)).orderBy(chatMessages.createdAt);
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [chatMessage] = await db.insert(chatMessages).values(message).returning();
    return chatMessage;
  }

  // Disputes
  async getDispute(id: string): Promise<Dispute | undefined> {
    const [dispute] = await db.select().from(disputes).where(eq(disputes.id, id));
    return dispute || undefined;
  }

  async getDisputeByOrderId(orderId: string): Promise<Dispute | undefined> {
    const [dispute] = await db.select().from(disputes).where(eq(disputes.orderId, orderId));
    return dispute || undefined;
  }

  async createDispute(dispute: InsertDispute): Promise<Dispute> {
    const [newDispute] = await db.insert(disputes).values(dispute).returning();
    return newDispute;
  }

  async updateDispute(id: string, updates: Partial<Dispute>): Promise<Dispute | undefined> {
    const [dispute] = await db.update(disputes).set(updates).where(eq(disputes.id, id)).returning();
    return dispute || undefined;
  }

  async getOpenDisputes(): Promise<Dispute[]> {
    return await db.select().from(disputes).where(eq(disputes.status, "open")).orderBy(desc(disputes.createdAt));
  }

  async getResolvedDisputes(): Promise<Dispute[]> {
    return await db
      .select()
      .from(disputes)
      .where(
        or(
          eq(disputes.status, "resolved_refund"),
          eq(disputes.status, "resolved_release")
        )
      )
      .orderBy(desc(disputes.resolvedAt));
  }

  // Dispute Chat Messages
  async getDisputeChatMessages(disputeId: string): Promise<DisputeChatMessage[]> {
    return await db
      .select()
      .from(disputeChatMessages)
      .where(eq(disputeChatMessages.disputeId, disputeId))
      .orderBy(disputeChatMessages.createdAt);
  }

  async createDisputeChatMessage(message: InsertDisputeChatMessage): Promise<DisputeChatMessage> {
    const [chatMessage] = await db.insert(disputeChatMessages).values(message).returning();
    return chatMessage;
  }

  // Wallets
  async getWallet(id: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.id, id));
    return wallet || undefined;
  }

  async getWalletByUserId(userId: string, currency: string = "USDT"): Promise<Wallet | undefined> {
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(and(eq(wallets.userId, userId), eq(wallets.currency, currency)));
    return wallet || undefined;
  }

  async createWallet(wallet: InsertWallet): Promise<Wallet> {
    const [newWallet] = await db.insert(wallets).values(wallet).returning();
    return newWallet;
  }

  async updateWalletBalance(id: string, available: string, escrow: string): Promise<void> {
    await db
      .update(wallets)
      .set({
        availableBalance: available,
        escrowBalance: escrow,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, id));
  }

  async holdEscrow(walletId: string, amount: string): Promise<void> {
    const wallet = await this.getWallet(walletId);
    if (wallet) {
      const newAvailable = (parseFloat(wallet.availableBalance) - parseFloat(amount)).toFixed(8);
      const newEscrow = (parseFloat(wallet.escrowBalance) + parseFloat(amount)).toFixed(8);
      await this.updateWalletBalance(walletId, newAvailable, newEscrow);
    }
  }

  async releaseEscrow(walletId: string, amount: string): Promise<void> {
    const wallet = await this.getWallet(walletId);
    if (wallet) {
      const releaseAmount = parseFloat(amount);
      const newAvailable = (parseFloat(wallet.availableBalance) + releaseAmount).toFixed(8);
      const newEscrow = (parseFloat(wallet.escrowBalance) - releaseAmount).toFixed(8);
      await this.updateWalletBalance(walletId, newAvailable, newEscrow);
    }
  }

  // Transactions
  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTransaction] = await db.insert(transactions).values(transaction).returning();
    return newTransaction;
  }

  async getTransactionsByUser(userId: string): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.createdAt));
  }

  async getTransactionsByWallet(walletId: string): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.walletId, walletId)).orderBy(desc(transactions.createdAt));
  }

  // Ratings
  async createRating(rating: InsertRating): Promise<Rating> {
    const [newRating] = await db.insert(ratings).values(rating).returning();
    return newRating;
  }

  async getRatingsByVendor(vendorId: string): Promise<Rating[]> {
    return await db.select().from(ratings).where(eq(ratings.vendorId, vendorId)).orderBy(desc(ratings.createdAt));
  }

  async getRatingByOrder(orderId: string): Promise<Rating | undefined> {
    const [rating] = await db.select().from(ratings).where(eq(ratings.orderId, orderId));
    return rating || undefined;
  }

  // Notifications
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return result[0]?.count || 0;
  }

  // Audit Logs
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [auditLog] = await db.insert(auditLogs).values(log).returning();
    return auditLog;
  }

  async getAuditLogs(filters?: {
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<AuditLog[]> {
    let query = db.select().from(auditLogs).$dynamic();

    const conditions = [];
    if (filters?.userId) conditions.push(eq(auditLogs.userId, filters.userId));
    if (filters?.action) conditions.push(like(auditLogs.action, `%${filters.action}%`));
    if (filters?.resource) conditions.push(eq(auditLogs.resource, filters.resource));
    if (filters?.startDate) conditions.push(gte(auditLogs.createdAt, filters.startDate));
    if (filters?.endDate) conditions.push(lte(auditLogs.createdAt, filters.endDate));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    return await query.orderBy(desc(auditLogs.createdAt));
  }

  // Maintenance Settings
  async getMaintenanceSettings(): Promise<MaintenanceSettings | undefined> {
    const [settings] = await db.select().from(maintenanceSettings).limit(1);
    if (!settings) {
      const [newSettings] = await db
        .insert(maintenanceSettings)
        .values({ mode: "none" })
        .returning();
      return newSettings;
    }
    return settings;
  }

  async updateMaintenanceSettings(updates: Partial<MaintenanceSettings>): Promise<MaintenanceSettings> {
    const current = await this.getMaintenanceSettings();
    if (current) {
      const [updated] = await db
        .update(maintenanceSettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(maintenanceSettings.id, current.id))
        .returning();
      return updated;
    }
    const [newSettings] = await db.insert(maintenanceSettings).values(updates as any).returning();
    return newSettings;
  }

  // Theme Settings
  async getThemeSettings(): Promise<ThemeSettings | undefined> {
    const [settings] = await db.select().from(themeSettings).limit(1);
    if (!settings) {
      const [newSettings] = await db
        .insert(themeSettings)
        .values({ primaryColor: "#3b82f6" })
        .returning();
      return newSettings;
    }
    return settings;
  }

  async updateThemeSettings(updates: Partial<ThemeSettings>): Promise<ThemeSettings> {
    const current = await this.getThemeSettings();
    if (current) {
      const [updated] = await db
        .update(themeSettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(themeSettings.id, current.id))
        .returning();
      return updated;
    }
    const [newSettings] = await db.insert(themeSettings).values(updates as any).returning();
    return newSettings;
  }

  // Exchanges
  async getExchange(id: string): Promise<Exchange | undefined> {
    const [exchange] = await db.select().from(exchanges).where(eq(exchanges.id, id));
    return exchange || undefined;
  }

  async getExchangeBySymbol(symbol: string): Promise<Exchange | undefined> {
    const [exchange] = await db.select().from(exchanges).where(eq(exchanges.symbol, symbol));
    return exchange || undefined;
  }

  async getAllExchanges(): Promise<Exchange[]> {
    return await db.select().from(exchanges).orderBy(exchanges.sortOrder);
  }

  async getActiveExchanges(): Promise<Exchange[]> {
    return await db.select().from(exchanges).where(eq(exchanges.isActive, true)).orderBy(exchanges.sortOrder);
  }

  async createExchange(exchange: InsertExchange): Promise<Exchange> {
    const [newExchange] = await db.insert(exchanges).values(exchange).returning();
    return newExchange;
  }

  async updateExchange(id: string, updates: Partial<Exchange>): Promise<Exchange | undefined> {
    const [updated] = await db
      .update(exchanges)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(exchanges.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteExchange(id: string): Promise<void> {
    await db.delete(exchanges).where(eq(exchanges.id, id));
  }

  // Social Feed - Posts
  async getSocialPost(id: string): Promise<SocialPost | undefined> {
    const [post] = await db.select().from(socialPosts).where(eq(socialPosts.id, id));
    return post || undefined;
  }

  async getSocialPosts(limit: number = 50, offset: number = 0): Promise<any[]> {
    const results = await db
      .select({
        post: socialPosts,
        author: users,
        vendorProfile: vendorProfiles,
      })
      .from(socialPosts)
      .innerJoin(users, eq(socialPosts.authorId, users.id))
      .leftJoin(vendorProfiles, eq(users.id, vendorProfiles.userId))
      .where(eq(socialPosts.isDeleted, false))
      .orderBy(desc(socialPosts.createdAt))
      .limit(limit)
      .offset(offset);

    return results.map((r) => ({
      ...r.post,
      author: {
        id: r.author.id,
        username: r.author.username,
        profilePicture: r.author.profilePicture,
        isVerifiedVendor: r.vendorProfile?.isApproved || false,
      },
    }));
  }

  async createSocialPost(post: InsertSocialPost): Promise<SocialPost> {
    const [newPost] = await db.insert(socialPosts).values(post).returning();
    return newPost;
  }

  async updateSocialPost(id: string, updates: Partial<SocialPost>): Promise<SocialPost | undefined> {
    const [updated] = await db
      .update(socialPosts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(socialPosts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteSocialPost(id: string): Promise<void> {
    await db.update(socialPosts).set({ isDeleted: true }).where(eq(socialPosts.id, id));
  }

  async searchSocialPosts(query: string, limit: number = 50, offset: number = 0): Promise<any[]> {
    const searchPattern = `%${query.toLowerCase()}%`;
    const results = await db
      .select({
        post: socialPosts,
        author: users,
        vendorProfile: vendorProfiles,
      })
      .from(socialPosts)
      .innerJoin(users, eq(socialPosts.authorId, users.id))
      .leftJoin(vendorProfiles, eq(users.id, vendorProfiles.userId))
      .where(
        and(
          eq(socialPosts.isDeleted, false),
          or(
            sql`LOWER(${socialPosts.content}) LIKE ${searchPattern}`,
            sql`LOWER(${users.username}) LIKE ${searchPattern}`
          )
        )
      )
      .orderBy(desc(socialPosts.createdAt))
      .limit(limit)
      .offset(offset);

    return results.map((r) => ({
      ...r.post,
      author: {
        id: r.author.id,
        username: r.author.username,
        profilePicture: r.author.profilePicture,
        isVerifiedVendor: r.vendorProfile?.isApproved || false,
      },
    }));
  }

  async deleteOldPosts(): Promise<number> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await db
      .update(socialPosts)
      .set({ isDeleted: true })
      .where(
        and(
          eq(socialPosts.isDeleted, false),
          lte(socialPosts.createdAt, twentyFourHoursAgo)
        )
      )
      .returning();
    return result.length;
  }

  // Social Feed - Comments
  async getSocialComment(id: string): Promise<SocialComment | undefined> {
    const [comment] = await db.select().from(socialComments).where(eq(socialComments.id, id));
    return comment || undefined;
  }

  async getSocialCommentsByPost(postId: string): Promise<any[]> {
    const results = await db
      .select({
        comment: socialComments,
        author: users,
        vendorProfile: vendorProfiles,
      })
      .from(socialComments)
      .innerJoin(users, eq(socialComments.authorId, users.id))
      .leftJoin(vendorProfiles, eq(users.id, vendorProfiles.userId))
      .where(and(eq(socialComments.postId, postId), eq(socialComments.isDeleted, false)))
      .orderBy(socialComments.createdAt);

    return results.map((r) => ({
      ...r.comment,
      author: {
        id: r.author.id,
        username: r.author.username,
        isVerifiedVendor: r.vendorProfile?.isApproved || false,
      },
    }));
  }

  async createSocialComment(comment: InsertSocialComment): Promise<SocialComment> {
    const [newComment] = await db.insert(socialComments).values(comment).returning();
    await db
      .update(socialPosts)
      .set({ commentsCount: sql`${socialPosts.commentsCount} + 1` })
      .where(eq(socialPosts.id, comment.postId));
    return newComment;
  }

  async deleteSocialComment(id: string): Promise<void> {
    const comment = await this.getSocialComment(id);
    if (comment) {
      await db.update(socialComments).set({ isDeleted: true }).where(eq(socialComments.id, id));
      await db
        .update(socialPosts)
        .set({ commentsCount: sql`GREATEST(${socialPosts.commentsCount} - 1, 0)` })
        .where(eq(socialPosts.id, comment.postId));
    }
  }

  // Social Feed - Likes
  async getSocialLike(postId: string, userId: string): Promise<SocialLike | undefined> {
    const [like] = await db
      .select()
      .from(socialLikes)
      .where(and(eq(socialLikes.postId, postId), eq(socialLikes.userId, userId)));
    return like || undefined;
  }

  async createSocialLike(like: InsertSocialLike): Promise<SocialLike> {
    const existing = await this.getSocialLike(like.postId, like.userId);
    if (existing) return existing;

    // Remove dislike if exists (mutual exclusion)
    await this.deleteSocialDislike(like.postId, like.userId);

    const [newLike] = await db.insert(socialLikes).values(like).returning();
    await db
      .update(socialPosts)
      .set({ likesCount: sql`${socialPosts.likesCount} + 1` })
      .where(eq(socialPosts.id, like.postId));
    return newLike;
  }

  async deleteSocialLike(postId: string, userId: string): Promise<void> {
    const like = await this.getSocialLike(postId, userId);
    if (like) {
      await db
        .delete(socialLikes)
        .where(and(eq(socialLikes.postId, postId), eq(socialLikes.userId, userId)));
      await db
        .update(socialPosts)
        .set({ likesCount: sql`GREATEST(${socialPosts.likesCount} - 1, 0)` })
        .where(eq(socialPosts.id, postId));
    }
  }

  // Social Feed - Dislikes
  async getSocialDislike(postId: string, userId: string): Promise<SocialDislike | undefined> {
    const [dislike] = await db
      .select()
      .from(socialDislikes)
      .where(and(eq(socialDislikes.postId, postId), eq(socialDislikes.userId, userId)));
    return dislike || undefined;
  }

  async createSocialDislike(dislike: InsertSocialDislike): Promise<SocialDislike> {
    const existing = await this.getSocialDislike(dislike.postId, dislike.userId);
    if (existing) return existing;

    // Remove like if exists (mutual exclusion)
    await this.deleteSocialLike(dislike.postId, dislike.userId);

    const [newDislike] = await db.insert(socialDislikes).values(dislike).returning();
    await db
      .update(socialPosts)
      .set({ dislikesCount: sql`${socialPosts.dislikesCount} + 1` })
      .where(eq(socialPosts.id, dislike.postId));
    return newDislike;
  }

  async deleteSocialDislike(postId: string, userId: string): Promise<void> {
    const dislike = await this.getSocialDislike(postId, userId);
    if (dislike) {
      await db
        .delete(socialDislikes)
        .where(and(eq(socialDislikes.postId, postId), eq(socialDislikes.userId, userId)));
      await db
        .update(socialPosts)
        .set({ dislikesCount: sql`GREATEST(${socialPosts.dislikesCount} - 1, 0)` })
        .where(eq(socialPosts.id, postId));
    }
  }

  // Social Feed - Mutes
  async getSocialMute(userId: string): Promise<SocialMute | undefined> {
    const [mute] = await db
      .select()
      .from(socialMutes)
      .where(
        and(
          eq(socialMutes.userId, userId),
          or(isNull(socialMutes.expiresAt), gte(socialMutes.expiresAt, new Date()))
        )
      );
    return mute || undefined;
  }

  async createSocialMute(mute: InsertSocialMute): Promise<SocialMute> {
    const [newMute] = await db.insert(socialMutes).values(mute).returning();
    return newMute;
  }

  async deleteSocialMute(userId: string): Promise<void> {
    await db.delete(socialMutes).where(eq(socialMutes.userId, userId));
  }

  async isUserMuted(userId: string): Promise<boolean> {
    const mute = await this.getSocialMute(userId);
    return !!mute;
  }

  // Loader Zone - Ads
  async getLoaderAd(id: string): Promise<LoaderAd | undefined> {
    const [ad] = await db.select().from(loaderAds).where(eq(loaderAds.id, id));
    return ad || undefined;
  }

  async getLoaderAdsByLoader(loaderId: string): Promise<LoaderAd[]> {
    return await db
      .select()
      .from(loaderAds)
      .where(eq(loaderAds.loaderId, loaderId))
      .orderBy(desc(loaderAds.createdAt));
  }

  async getActiveLoaderAds(): Promise<any[]> {
    const ads = await db
      .select({
        id: loaderAds.id,
        loaderId: loaderAds.loaderId,
        assetType: loaderAds.assetType,
        dealAmount: loaderAds.dealAmount,
        loadingTerms: loaderAds.loadingTerms,
        upfrontPercentage: loaderAds.upfrontPercentage,
        countdownTime: loaderAds.countdownTime,
        paymentMethods: loaderAds.paymentMethods,
        frozenCommitment: loaderAds.frozenCommitment,
        loaderFeeReserve: loaderAds.loaderFeeReserve,
        isActive: loaderAds.isActive,
        createdAt: loaderAds.createdAt,
        loaderUsername: users.username,
      })
      .from(loaderAds)
      .leftJoin(users, eq(loaderAds.loaderId, users.id))
      .where(eq(loaderAds.isActive, true))
      .orderBy(desc(loaderAds.createdAt));
    return ads;
  }

  async createLoaderAd(ad: InsertLoaderAd): Promise<LoaderAd> {
    const [newAd] = await db.insert(loaderAds).values(ad).returning();
    return newAd;
  }

  async updateLoaderAd(id: string, updates: Partial<LoaderAd>): Promise<LoaderAd | undefined> {
    const [ad] = await db
      .update(loaderAds)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(loaderAds.id, id))
      .returning();
    return ad || undefined;
  }

  async deactivateLoaderAd(id: string): Promise<void> {
    await db.update(loaderAds).set({ isActive: false, updatedAt: new Date() }).where(eq(loaderAds.id, id));
  }

  // Loader Zone - Orders
  async getLoaderOrder(id: string): Promise<LoaderOrder | undefined> {
    const [order] = await db.select().from(loaderOrders).where(eq(loaderOrders.id, id));
    return order || undefined;
  }

  async getLoaderOrdersByLoader(loaderId: string): Promise<LoaderOrder[]> {
    return await db
      .select()
      .from(loaderOrders)
      .where(eq(loaderOrders.loaderId, loaderId))
      .orderBy(desc(loaderOrders.createdAt));
  }

  async getLoaderOrdersByReceiver(receiverId: string): Promise<LoaderOrder[]> {
    return await db
      .select()
      .from(loaderOrders)
      .where(eq(loaderOrders.receiverId, receiverId))
      .orderBy(desc(loaderOrders.createdAt));
  }

  async getLoaderOrdersByAd(adId: string): Promise<LoaderOrder[]> {
    return await db
      .select()
      .from(loaderOrders)
      .where(eq(loaderOrders.adId, adId))
      .orderBy(desc(loaderOrders.createdAt));
  }

  async createLoaderOrder(order: InsertLoaderOrder): Promise<LoaderOrder> {
    const [newOrder] = await db.insert(loaderOrders).values(order).returning();
    return newOrder;
  }

  async updateLoaderOrder(id: string, updates: Partial<LoaderOrder>): Promise<LoaderOrder | undefined> {
    const [order] = await db
      .update(loaderOrders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(loaderOrders.id, id))
      .returning();
    return order || undefined;
  }

  // Loader Zone - Messages
  async getLoaderOrderMessages(orderId: string): Promise<LoaderOrderMessage[]> {
    return await db
      .select()
      .from(loaderOrderMessages)
      .where(eq(loaderOrderMessages.orderId, orderId))
      .orderBy(loaderOrderMessages.createdAt);
  }

  async createLoaderOrderMessage(message: InsertLoaderOrderMessage): Promise<LoaderOrderMessage> {
    const [newMessage] = await db.insert(loaderOrderMessages).values(message).returning();
    return newMessage;
  }

  // Loader Zone - Disputes
  async getLoaderDispute(id: string): Promise<LoaderDispute | undefined> {
    const [dispute] = await db.select().from(loaderDisputes).where(eq(loaderDisputes.id, id));
    return dispute || undefined;
  }

  async getLoaderDisputeByOrderId(orderId: string): Promise<LoaderDispute | undefined> {
    const [dispute] = await db.select().from(loaderDisputes).where(eq(loaderDisputes.orderId, orderId));
    return dispute || undefined;
  }

  async getOpenLoaderDisputes(): Promise<LoaderDispute[]> {
    return await db.select().from(loaderDisputes).where(eq(loaderDisputes.status, "open")).orderBy(desc(loaderDisputes.createdAt));
  }

  async getResolvedLoaderDisputes(): Promise<LoaderDispute[]> {
    return await db.select().from(loaderDisputes).where(
      or(
        eq(loaderDisputes.status, "resolved_loader_wins"),
        eq(loaderDisputes.status, "resolved_receiver_wins"),
        eq(loaderDisputes.status, "resolved_mutual")
      )
    ).orderBy(desc(loaderDisputes.resolvedAt));
  }

  async getInReviewLoaderDisputes(): Promise<LoaderDispute[]> {
    return await db.select().from(loaderDisputes).where(eq(loaderDisputes.status, "in_review")).orderBy(desc(loaderDisputes.createdAt));
  }

  async getAllLoaderDisputes(): Promise<LoaderDispute[]> {
    return await db.select().from(loaderDisputes).orderBy(desc(loaderDisputes.createdAt));
  }

  async createLoaderDispute(dispute: InsertLoaderDispute): Promise<LoaderDispute> {
    const [newDispute] = await db.insert(loaderDisputes).values(dispute).returning();
    return newDispute;
  }

  async updateLoaderDispute(id: string, updates: Partial<LoaderDispute>): Promise<LoaderDispute | undefined> {
    const [dispute] = await db.update(loaderDisputes).set(updates).where(eq(loaderDisputes.id, id)).returning();
    return dispute || undefined;
  }

  async getExpiredLoaderOrders(): Promise<LoaderOrder[]> {
    return await db
      .select()
      .from(loaderOrders)
      .where(
        and(
          or(
            eq(loaderOrders.status, "awaiting_payment_details"),
            eq(loaderOrders.status, "awaiting_liability_confirmation")
          ),
          eq(loaderOrders.countdownStopped, false),
          lte(loaderOrders.countdownExpiresAt, new Date())
        )
      );
  }

  // Loader Zone - Feedback
  async getLoaderFeedback(id: string): Promise<LoaderFeedback | undefined> {
    const [feedback] = await db.select().from(loaderFeedback).where(eq(loaderFeedback.id, id));
    return feedback || undefined;
  }

  async getLoaderFeedbackByOrderId(orderId: string): Promise<LoaderFeedback[]> {
    return await db.select().from(loaderFeedback).where(eq(loaderFeedback.orderId, orderId));
  }

  async getLoaderFeedbackByUser(userId: string): Promise<LoaderFeedback[]> {
    return await db
      .select()
      .from(loaderFeedback)
      .where(eq(loaderFeedback.receiverId, userId))
      .orderBy(desc(loaderFeedback.createdAt));
  }

  async createLoaderFeedback(feedback: InsertLoaderFeedback): Promise<LoaderFeedback> {
    const [newFeedback] = await db.insert(loaderFeedback).values(feedback).returning();
    return newFeedback;
  }

  // Loader Zone - Stats
  async getLoaderStats(userId: string): Promise<LoaderStats | undefined> {
    const [stats] = await db.select().from(loaderStats).where(eq(loaderStats.userId, userId));
    return stats || undefined;
  }

  async createLoaderStats(stats: InsertLoaderStats): Promise<LoaderStats> {
    const [newStats] = await db.insert(loaderStats).values(stats).returning();
    return newStats;
  }

  async updateLoaderStats(userId: string, updates: Partial<LoaderStats>): Promise<LoaderStats | undefined> {
    const [stats] = await db
      .update(loaderStats)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(loaderStats.userId, userId))
      .returning();
    return stats || undefined;
  }

  async getOrCreateLoaderStats(userId: string): Promise<LoaderStats> {
    let stats = await this.getLoaderStats(userId);
    if (!stats) {
      stats = await this.createLoaderStats({ userId });
    }
    return stats;
  }

  // Withdrawal Requests
  async getWithdrawalRequest(id: string): Promise<WithdrawalRequest | undefined> {
    const [request] = await db.select().from(withdrawalRequests).where(eq(withdrawalRequests.id, id));
    return request || undefined;
  }

  async getPendingWithdrawalRequests(): Promise<WithdrawalRequest[]> {
    return await db
      .select()
      .from(withdrawalRequests)
      .where(eq(withdrawalRequests.status, "pending"))
      .orderBy(desc(withdrawalRequests.createdAt));
  }

  async createWithdrawalRequest(request: InsertWithdrawalRequest): Promise<WithdrawalRequest> {
    const [newRequest] = await db.insert(withdrawalRequests).values(request).returning();
    return newRequest;
  }

  async updateWithdrawalRequest(id: string, updates: Partial<WithdrawalRequest>): Promise<WithdrawalRequest | undefined> {
    const [request] = await db
      .update(withdrawalRequests)
      .set(updates)
      .where(eq(withdrawalRequests.id, id))
      .returning();
    return request || undefined;
  }

  // User search and stats
  async searchUsersByUsername(username: string): Promise<User[]> {
    const searchTerm = `%${username.toLowerCase()}%`;
    return await db
      .select()
      .from(users)
      .where(like(sql`LOWER(${users.username})`, searchTerm))
      .limit(10);
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getTotalPlatformBalance(): Promise<string> {
    const result = await db
      .select({ total: sql<string>`COALESCE(SUM(${wallets.availableBalance}::numeric + ${wallets.escrowBalance}::numeric), 0)` })
      .from(wallets);
    return result[0]?.total || "0";
  }

  // Admin management
  async getAllTransactions(): Promise<Transaction[]> {
    return await db.select().from(transactions).orderBy(desc(transactions.createdAt));
  }

  async getAllWallets(): Promise<Wallet[]> {
    return await db.select().from(wallets);
  }

  async getAllOrders(): Promise<Order[]> {
    return await db.select().from(orders).orderBy(desc(orders.createdAt));
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // Blockchain Wallet - Deposit Addresses
  async getUserDepositAddress(userId: string, network: string = "BSC"): Promise<UserDepositAddress | undefined> {
    const [address] = await db
      .select()
      .from(userDepositAddresses)
      .where(and(eq(userDepositAddresses.userId, userId), eq(userDepositAddresses.network, network)));
    return address || undefined;
  }

  async getUserDepositAddressByAddress(address: string): Promise<UserDepositAddress | undefined> {
    const [result] = await db
      .select()
      .from(userDepositAddresses)
      .where(eq(userDepositAddresses.address, address));
    return result || undefined;
  }

  async createUserDepositAddress(address: InsertUserDepositAddress): Promise<UserDepositAddress> {
    const [newAddress] = await db.insert(userDepositAddresses).values(address).returning();
    return newAddress;
  }

  async getAndIncrementDerivationIndex(): Promise<number> {
    const result = await db.execute(sql`
      INSERT INTO wallet_index_counter (id, next_index, updated_at)
      VALUES ('singleton', 1, NOW())
      ON CONFLICT (id) DO UPDATE SET
        next_index = wallet_index_counter.next_index + 1,
        updated_at = NOW()
      RETURNING next_index - 1 AS current_index
    `);
    
    const rows = result.rows as Array<{ current_index: number }>;
    if (!rows || rows.length === 0) {
      throw new Error("Failed to get atomic derivation index");
    }
    return rows[0].current_index;
  }

  async getNextDerivationIndex(): Promise<number> {
    const result = await db
      .select({ maxIndex: sql<number>`COALESCE(MAX(${userDepositAddresses.derivationIndex}), -1)` })
      .from(userDepositAddresses);
    return (result[0]?.maxIndex || 0) + 1;
  }

  async getAllActiveDepositAddresses(): Promise<UserDepositAddress[]> {
    return await db
      .select()
      .from(userDepositAddresses)
      .where(eq(userDepositAddresses.isActive, true));
  }

  // Blockchain Wallet - Deposits
  async getBlockchainDeposit(id: string): Promise<BlockchainDeposit | undefined> {
    const [deposit] = await db.select().from(blockchainDeposits).where(eq(blockchainDeposits.id, id));
    return deposit || undefined;
  }

  async getBlockchainDepositByTxHash(txHash: string): Promise<BlockchainDeposit | undefined> {
    const [deposit] = await db.select().from(blockchainDeposits).where(eq(blockchainDeposits.txHash, txHash));
    return deposit || undefined;
  }

  async getBlockchainDepositsByUser(userId: string): Promise<BlockchainDeposit[]> {
    return await db
      .select()
      .from(blockchainDeposits)
      .where(eq(blockchainDeposits.userId, userId))
      .orderBy(desc(blockchainDeposits.createdAt));
  }

  async getPendingBlockchainDeposits(): Promise<BlockchainDeposit[]> {
    return await db
      .select()
      .from(blockchainDeposits)
      .where(or(eq(blockchainDeposits.status, "pending"), eq(blockchainDeposits.status, "confirming")));
  }

  async getConfirmedUncreditedDeposits(): Promise<BlockchainDeposit[]> {
    return await db
      .select()
      .from(blockchainDeposits)
      .where(eq(blockchainDeposits.status, "confirmed"));
  }

  async getCreditedUnsweptDeposits(): Promise<BlockchainDeposit[]> {
    return await db
      .select()
      .from(blockchainDeposits)
      .where(eq(blockchainDeposits.status, "credited"));
  }

  async createBlockchainDeposit(deposit: InsertBlockchainDeposit): Promise<BlockchainDeposit> {
    const [newDeposit] = await db.insert(blockchainDeposits).values(deposit).returning();
    return newDeposit;
  }

  async updateBlockchainDeposit(id: string, updates: Partial<BlockchainDeposit>): Promise<BlockchainDeposit | undefined> {
    const [deposit] = await db
      .update(blockchainDeposits)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(blockchainDeposits.id, id))
      .returning();
    return deposit || undefined;
  }

  // Blockchain Wallet - Sweeps
  async getDepositSweep(id: string): Promise<DepositSweep | undefined> {
    const [sweep] = await db.select().from(depositSweeps).where(eq(depositSweeps.id, id));
    return sweep || undefined;
  }

  async getDepositSweepByDepositId(depositId: string): Promise<DepositSweep | undefined> {
    const [sweep] = await db.select().from(depositSweeps).where(eq(depositSweeps.depositId, depositId));
    return sweep || undefined;
  }

  async getPendingSweeps(): Promise<DepositSweep[]> {
    return await db
      .select()
      .from(depositSweeps)
      .where(or(eq(depositSweeps.status, "pending"), eq(depositSweeps.status, "failed")));
  }

  async createDepositSweep(sweep: InsertDepositSweep): Promise<DepositSweep> {
    const [newSweep] = await db.insert(depositSweeps).values(sweep).returning();
    return newSweep;
  }

  async updateDepositSweep(id: string, updates: Partial<DepositSweep>): Promise<DepositSweep | undefined> {
    const [sweep] = await db
      .update(depositSweeps)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(depositSweeps.id, id))
      .returning();
    return sweep || undefined;
  }

  // Platform Wallet Controls
  async getPlatformWalletControls(): Promise<PlatformWalletControls | undefined> {
    const [controls] = await db.select().from(platformWalletControls).limit(1);
    return controls || undefined;
  }

  async updatePlatformWalletControls(updates: Partial<PlatformWalletControls>): Promise<PlatformWalletControls> {
    const existing = await this.getPlatformWalletControls();
    if (!existing) {
      return await this.initPlatformWalletControls();
    }
    const [updated] = await db
      .update(platformWalletControls)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(platformWalletControls.id, existing.id))
      .returning();
    return updated;
  }

  async initPlatformWalletControls(): Promise<PlatformWalletControls> {
    const existing = await this.getPlatformWalletControls();
    if (existing) return existing;
    const [controls] = await db.insert(platformWalletControls).values({}).returning();
    return controls;
  }

  // Blockchain Admin Actions
  async createBlockchainAdminAction(action: InsertBlockchainAdminAction): Promise<BlockchainAdminAction> {
    const [newAction] = await db.insert(blockchainAdminActions).values(action).returning();
    return newAction;
  }

  async getBlockchainAdminActions(limit: number = 100): Promise<BlockchainAdminAction[]> {
    return await db
      .select()
      .from(blockchainAdminActions)
      .orderBy(desc(blockchainAdminActions.createdAt))
      .limit(limit);
  }

  // User Withdrawal Limits
  async getUserWithdrawalLimit(userId: string, date: string): Promise<UserWithdrawalLimit | undefined> {
    const [limit] = await db
      .select()
      .from(userWithdrawalLimits)
      .where(and(eq(userWithdrawalLimits.userId, userId), eq(userWithdrawalLimits.date, date)));
    return limit || undefined;
  }

  async createUserWithdrawalLimit(limit: InsertUserWithdrawalLimit): Promise<UserWithdrawalLimit> {
    const [newLimit] = await db.insert(userWithdrawalLimits).values(limit).returning();
    return newLimit;
  }

  async updateUserWithdrawalLimit(id: string, updates: Partial<UserWithdrawalLimit>): Promise<UserWithdrawalLimit | undefined> {
    const [limit] = await db
      .update(userWithdrawalLimits)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userWithdrawalLimits.id, id))
      .returning();
    return limit || undefined;
  }

  async getOrCreateUserWithdrawalLimit(userId: string, date: string): Promise<UserWithdrawalLimit> {
    let limit = await this.getUserWithdrawalLimit(userId, date);
    if (!limit) {
      limit = await this.createUserWithdrawalLimit({ userId, date });
    }
    return limit;
  }

  // User First Withdrawals
  async getUserFirstWithdrawal(userId: string): Promise<UserFirstWithdrawal | undefined> {
    const [record] = await db
      .select()
      .from(userFirstWithdrawals)
      .where(eq(userFirstWithdrawals.userId, userId));
    return record || undefined;
  }

  async createUserFirstWithdrawal(data: InsertUserFirstWithdrawal): Promise<UserFirstWithdrawal> {
    const [newRecord] = await db.insert(userFirstWithdrawals).values(data).returning();
    return newRecord;
  }

  async updateUserFirstWithdrawal(userId: string, updates: Partial<UserFirstWithdrawal>): Promise<UserFirstWithdrawal | undefined> {
    const [record] = await db
      .update(userFirstWithdrawals)
      .set(updates)
      .where(eq(userFirstWithdrawals.userId, userId))
      .returning();
    return record || undefined;
  }

  async getOrCreateUserFirstWithdrawal(userId: string): Promise<UserFirstWithdrawal> {
    let record = await this.getUserFirstWithdrawal(userId);
    if (!record) {
      record = await this.createUserFirstWithdrawal({ userId });
    }
    return record;
  }

  // Extended Withdrawal Requests
  async getAllWithdrawalRequests(): Promise<WithdrawalRequest[]> {
    return await db
      .select()
      .from(withdrawalRequests)
      .orderBy(desc(withdrawalRequests.createdAt));
  }

  async getWithdrawalRequestsByUser(userId: string): Promise<WithdrawalRequest[]> {
    return await db
      .select()
      .from(withdrawalRequests)
      .where(eq(withdrawalRequests.userId, userId))
      .orderBy(desc(withdrawalRequests.createdAt));
  }

  async getApprovedWithdrawalRequests(): Promise<WithdrawalRequest[]> {
    return await db
      .select()
      .from(withdrawalRequests)
      .where(eq(withdrawalRequests.status, "approved"))
      .orderBy(desc(withdrawalRequests.createdAt));
  }

  async getTodayPlatformWithdrawalTotal(): Promise<string> {
    const today = new Date().toISOString().split("T")[0];
    const result = await db
      .select({ total: sql<string>`COALESCE(SUM(${withdrawalRequests.amount}::numeric), 0)` })
      .from(withdrawalRequests)
      .where(
        and(
          gte(withdrawalRequests.createdAt, new Date(today)),
          or(
            eq(withdrawalRequests.status, "completed"),
            eq(withdrawalRequests.status, "sent"),
            eq(withdrawalRequests.status, "approved")
          )
        )
      );
    return result[0]?.total || "0";
  }
}

export const storage = new DatabaseStorage();
