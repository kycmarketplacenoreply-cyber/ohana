import { eq, and, desc, sql, gte, lte, or, like } from "drizzle-orm";
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
  exchanges,
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
  type Exchange,
  type InsertExchange,
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
      })
      .from(offers)
      .innerJoin(vendorProfiles, eq(offers.vendorId, vendorProfiles.id))
      .innerJoin(users, eq(vendorProfiles.userId, users.id))
      .where(and(eq(offers.isActive, true), eq(vendorProfiles.isApproved, true)))
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
          like(sql`LOWER(${offers.terms})`, searchTerm)
        )
      );
    }

    const results = await query.orderBy(desc(offers.isPriority), desc(offers.createdAt));
    return results.map((r) => ({
      ...r.offer,
      vendorName: r.vendor.businessName || r.user.username,
      vendorTrades: r.vendor.totalTrades,
      vendorCompletionRate: r.vendor.totalTrades > 0 
        ? ((r.vendor.completedTrades / r.vendor.totalTrades) * 100).toFixed(2)
        : "100.00",
      vendorRating: parseFloat(r.vendor.averageRating || "0") > 0 
        ? (parseFloat(r.vendor.averageRating || "0") * 20).toFixed(2)
        : "99.00",
      vendorVerified: r.user.emailVerified,
      responseTime: 15,
    }));
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
      const newEscrow = (parseFloat(wallet.escrowBalance) - parseFloat(amount)).toFixed(8);
      await this.updateWalletBalance(walletId, wallet.availableBalance, newEscrow);
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
}

export const storage = new DatabaseStorage();
