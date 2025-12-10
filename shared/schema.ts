import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  integer, 
  boolean, 
  timestamp, 
  numeric,
  jsonb,
  pgEnum
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "vendor", "customer", "support", "dispute_admin"]);
export const kycStatusEnum = pgEnum("kyc_status", ["pending", "approved", "rejected", "resubmit"]);
export const kycTierEnum = pgEnum("kyc_tier", ["tier0", "tier1", "tier2"]);
export const tradeIntentEnum = pgEnum("trade_intent", ["sell_ad", "buy_ad"]);
export const orderStatusEnum = pgEnum("order_status", ["created", "awaiting_deposit", "escrowed", "paid", "confirmed", "completed", "cancelled", "disputed"]);
export const disputeStatusEnum = pgEnum("dispute_status", ["open", "in_review", "resolved_refund", "resolved_release"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["deposit", "withdraw", "escrow_hold", "escrow_release", "fee", "refund"]);
export const subscriptionPlanEnum = pgEnum("subscription_plan", ["free", "basic", "pro", "featured"]);
export const notificationTypeEnum = pgEnum("notification_type", ["order", "payment", "escrow", "dispute", "kyc", "vendor", "wallet", "system"]);
export const maintenanceModeEnum = pgEnum("maintenance_mode", ["none", "partial", "full"]);

// Loader Zone Enums
export const loaderOrderStatusEnum = pgEnum("loader_order_status", [
  "created",
  "awaiting_liability_confirmation",
  "funds_sent_by_loader",
  "asset_frozen_waiting",
  "completed",
  "closed_no_payment",
  "dispute_resolved",
  "cancelled"
]);

export const liabilityTypeEnum = pgEnum("liability_type", [
  "full_payment",
  "partial_10",
  "partial_25",
  "partial_50",
  "time_bound_24h",
  "time_bound_48h",
  "time_bound_72h",
  "time_bound_1week",
  "time_bound_1month"
]);

// Users Table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull().default("customer"),
  profilePicture: text("profile_picture"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorRecoveryCodes: text("two_factor_recovery_codes").array(),
  emailVerified: boolean("email_verified").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  isFrozen: boolean("is_frozen").notNull().default(false),
  frozenReason: text("frozen_reason"),
  lastLoginAt: timestamp("last_login_at"),
  loginAttempts: integer("login_attempts").notNull().default(0),
  deviceFingerprints: text("device_fingerprints").array().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// KYC Table
export const kyc = pgTable("kyc", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tier: kycTierEnum("tier").notNull().default("tier0"),
  status: kycStatusEnum("status").notNull().default("pending"),
  idType: text("id_type"),
  idNumber: text("id_number"),
  idDocumentUrl: text("id_document_url"),
  idFrontUrl: text("id_front_url"),
  idBackUrl: text("id_back_url"),
  selfieUrl: text("selfie_url"),
  faceMatchScore: numeric("face_match_score", { precision: 5, scale: 2 }),
  adminNotes: text("admin_notes"),
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at").notNull().default(sql`now()`),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  isStarVerified: boolean("is_star_verified").notNull().default(false),
});

// Vendor Profiles Table
export const vendorProfiles = pgTable("vendor_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  businessName: text("business_name"),
  bio: text("bio"),
  country: text("country").notNull(),
  subscriptionPlan: subscriptionPlanEnum("subscription_plan").notNull().default("free"),
  isApproved: boolean("is_approved").notNull().default(false),
  totalTrades: integer("total_trades").notNull().default(0),
  completedTrades: integer("completed_trades").notNull().default(0),
  cancelledTrades: integer("cancelled_trades").notNull().default(0),
  averageRating: numeric("average_rating", { precision: 3, scale: 2 }).default("0"),
  totalRatings: integer("total_ratings").notNull().default(0),
  suspiciousActivityScore: integer("suspicious_activity_score").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Offers/Ads Table
export const offers = pgTable("offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: varchar("vendor_id").notNull().references(() => vendorProfiles.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  tradeIntent: tradeIntentEnum("trade_intent").notNull().default("sell_ad"),
  currency: text("currency").notNull(),
  pricePerUnit: numeric("price_per_unit", { precision: 18, scale: 8 }).notNull(),
  minLimit: numeric("min_limit", { precision: 18, scale: 2 }).notNull(),
  maxLimit: numeric("max_limit", { precision: 18, scale: 2 }).notNull(),
  availableAmount: numeric("available_amount", { precision: 18, scale: 8 }).notNull(),
  paymentMethods: text("payment_methods").array().notNull(),
  terms: text("terms"),
  accountDetails: jsonb("account_details"),
  escrowHeldAmount: numeric("escrow_held_amount", { precision: 18, scale: 8 }).default("0"),
  isActive: boolean("is_active").notNull().default(true),
  isPriority: boolean("is_priority").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Orders Table
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  offerId: varchar("offer_id").notNull().references(() => offers.id),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  vendorId: varchar("vendor_id").notNull().references(() => vendorProfiles.id),
  createdBy: varchar("created_by").references(() => users.id),
  tradeIntent: tradeIntentEnum("trade_intent").notNull().default("sell_ad"),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  fiatAmount: numeric("fiat_amount", { precision: 18, scale: 2 }).notNull(),
  pricePerUnit: numeric("price_per_unit", { precision: 18, scale: 8 }).notNull(),
  currency: text("currency").notNull(),
  paymentMethod: text("payment_method").notNull(),
  status: orderStatusEnum("status").notNull().default("created"),
  escrowAmount: numeric("escrow_amount", { precision: 18, scale: 8 }),
  platformFee: numeric("platform_fee", { precision: 18, scale: 8 }),
  sellerReceives: numeric("seller_receives", { precision: 18, scale: 8 }),
  buyerPaidAt: timestamp("buyer_paid_at"),
  vendorConfirmedAt: timestamp("vendor_confirmed_at"),
  completedAt: timestamp("completed_at"),
  escrowHeldAt: timestamp("escrow_held_at"),
  escrowReleasedAt: timestamp("escrow_released_at"),
  autoReleaseAt: timestamp("auto_release_at"),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Chat Messages Table
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  fileUrl: text("file_url"),
  isSystemMessage: boolean("is_system_message").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Disputes Table
export const disputes = pgTable("disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  openedBy: varchar("opened_by").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  evidenceUrls: text("evidence_urls").array().default(sql`ARRAY[]::text[]`),
  status: disputeStatusEnum("status").notNull().default("open"),
  resolution: text("resolution"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  resolvedAt: timestamp("resolved_at"),
});

// Dispute Chat Messages Table
export const disputeChatMessages = pgTable("dispute_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  disputeId: varchar("dispute_id").notNull().references(() => disputes.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  fileUrl: text("file_url"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Wallets Table
export const wallets = pgTable("wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  currency: text("currency").notNull().default("USDT"),
  availableBalance: numeric("available_balance", { precision: 18, scale: 8 }).notNull().default("0"),
  escrowBalance: numeric("escrow_balance", { precision: 18, scale: 8 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Transactions Table
export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  walletId: varchar("wallet_id").notNull().references(() => wallets.id),
  type: transactionTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  currency: text("currency").notNull(),
  relatedOrderId: varchar("related_order_id").references(() => orders.id),
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Ratings Table
export const ratings = pgTable("ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  vendorId: varchar("vendor_id").notNull().references(() => vendorProfiles.id),
  ratedBy: varchar("rated_by").notNull().references(() => users.id),
  stars: integer("stars").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Notifications Table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  isRead: boolean("is_read").notNull().default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Audit Logs Table
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  changes: jsonb("changes"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Maintenance Settings Table
export const maintenanceSettings = pgTable("maintenance_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: maintenanceModeEnum("mode").notNull().default("none"),
  message: text("message"),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Theme Settings Table
export const themeSettings = pgTable("theme_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  primaryColor: text("primary_color").default("#3b82f6"),
  logoUrl: text("logo_url"),
  bannerUrls: text("banner_urls").array().default(sql`ARRAY[]::text[]`),
  brandingConfig: jsonb("branding_config"),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Exchanges Table (Admin-managed crypto exchanges)
export const exchanges = pgTable("exchanges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  symbol: text("symbol").notNull().unique(),
  description: text("description"),
  iconUrl: text("icon_url"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Social Feed Posts Table
export const socialPosts = pgTable("social_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  authorId: varchar("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  likesCount: integer("likes_count").notNull().default(0),
  dislikesCount: integer("dislikes_count").notNull().default(0),
  commentsCount: integer("comments_count").notNull().default(0),
  sharesCount: integer("shares_count").notNull().default(0),
  originalPostId: varchar("original_post_id").references((): any => socialPosts.id),
  quoteText: text("quote_text"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Social Feed Comments Table
export const socialComments = pgTable("social_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => socialPosts.id, { onDelete: "cascade" }),
  authorId: varchar("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Social Feed Likes Table
export const socialLikes = pgTable("social_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => socialPosts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Social Feed Dislikes Table
export const socialDislikes = pgTable("social_dislikes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => socialPosts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Social Feed User Mutes (for moderation)
export const socialMutes = pgTable("social_mutes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mutedBy: varchar("muted_by").notNull().references(() => users.id),
  reason: text("reason"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  kyc: one(kyc, {
    fields: [users.id],
    references: [kyc.userId],
  }),
  vendorProfile: one(vendorProfiles, {
    fields: [users.id],
    references: [vendorProfiles.userId],
  }),
  wallets: many(wallets),
  notifications: many(notifications),
  auditLogs: many(auditLogs),
}));

export const kycRelations = relations(kyc, ({ one }) => ({
  user: one(users, {
    fields: [kyc.userId],
    references: [users.id],
  }),
  reviewer: one(users, {
    fields: [kyc.reviewedBy],
    references: [users.id],
  }),
}));

export const vendorProfilesRelations = relations(vendorProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [vendorProfiles.userId],
    references: [users.id],
  }),
  offers: many(offers),
  ratings: many(ratings),
}));

export const offersRelations = relations(offers, ({ one, many }) => ({
  vendor: one(vendorProfiles, {
    fields: [offers.vendorId],
    references: [vendorProfiles.id],
  }),
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  offer: one(offers, {
    fields: [orders.offerId],
    references: [offers.id],
  }),
  buyer: one(users, {
    fields: [orders.buyerId],
    references: [users.id],
  }),
  vendor: one(vendorProfiles, {
    fields: [orders.vendorId],
    references: [vendorProfiles.id],
  }),
  chatMessages: many(chatMessages),
  dispute: one(disputes),
  rating: one(ratings),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  order: one(orders, {
    fields: [chatMessages.orderId],
    references: [orders.id],
  }),
  sender: one(users, {
    fields: [chatMessages.senderId],
    references: [users.id],
  }),
}));

export const disputesRelations = relations(disputes, ({ one, many }) => ({
  order: one(orders, {
    fields: [disputes.orderId],
    references: [orders.id],
  }),
  opener: one(users, {
    fields: [disputes.openedBy],
    references: [users.id],
  }),
  resolver: one(users, {
    fields: [disputes.resolvedBy],
    references: [users.id],
  }),
  messages: many(disputeChatMessages),
}));

export const disputeChatMessagesRelations = relations(disputeChatMessages, ({ one }) => ({
  dispute: one(disputes, {
    fields: [disputeChatMessages.disputeId],
    references: [disputes.id],
  }),
  sender: one(users, {
    fields: [disputeChatMessages.senderId],
    references: [users.id],
  }),
}));

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  wallet: one(wallets, {
    fields: [transactions.walletId],
    references: [wallets.id],
  }),
  order: one(orders, {
    fields: [transactions.relatedOrderId],
    references: [orders.id],
  }),
}));

export const ratingsRelations = relations(ratings, ({ one }) => ({
  order: one(orders, {
    fields: [ratings.orderId],
    references: [orders.id],
  }),
  vendor: one(vendorProfiles, {
    fields: [ratings.vendorId],
    references: [vendorProfiles.id],
  }),
  rater: one(users, {
    fields: [ratings.ratedBy],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const socialPostsRelations = relations(socialPosts, ({ one, many }) => ({
  author: one(users, {
    fields: [socialPosts.authorId],
    references: [users.id],
  }),
  originalPost: one(socialPosts, {
    fields: [socialPosts.originalPostId],
    references: [socialPosts.id],
  }),
  comments: many(socialComments),
  likes: many(socialLikes),
}));

export const socialCommentsRelations = relations(socialComments, ({ one }) => ({
  post: one(socialPosts, {
    fields: [socialComments.postId],
    references: [socialPosts.id],
  }),
  author: one(users, {
    fields: [socialComments.authorId],
    references: [users.id],
  }),
}));

export const socialLikesRelations = relations(socialLikes, ({ one }) => ({
  post: one(socialPosts, {
    fields: [socialLikes.postId],
    references: [socialPosts.id],
  }),
  user: one(users, {
    fields: [socialLikes.userId],
    references: [users.id],
  }),
}));

export const socialMutesRelations = relations(socialMutes, ({ one }) => ({
  user: one(users, {
    fields: [socialMutes.userId],
    references: [users.id],
  }),
  moderator: one(users, {
    fields: [socialMutes.mutedBy],
    references: [users.id],
  }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  loginAttempts: true,
  deviceFingerprints: true,
  isActive: true,
  isFrozen: true,
  frozenReason: true,
  emailVerified: true,
  twoFactorEnabled: true,
  twoFactorSecret: true,
  twoFactorRecoveryCodes: true,
});

export const insertKycSchema = createInsertSchema(kyc).omit({
  id: true,
  submittedAt: true,
  reviewedAt: true,
  reviewedBy: true,
  status: true,
  tier: true,
  adminNotes: true,
  rejectionReason: true,
  faceMatchScore: true,
});

export const insertVendorProfileSchema = createInsertSchema(vendorProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalTrades: true,
  completedTrades: true,
  cancelledTrades: true,
  averageRating: true,
  totalRatings: true,
  suspiciousActivityScore: true,
  isApproved: true,
});

export const insertOfferSchema = createInsertSchema(offers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isPriority: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  buyerPaidAt: true,
  vendorConfirmedAt: true,
  completedAt: true,
  escrowHeldAt: true,
  escrowReleasedAt: true,
  autoReleaseAt: true,
  cancelReason: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
  isSystemMessage: true,
});

export const insertDisputeSchema = createInsertSchema(disputes).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  status: true,
  resolution: true,
  resolvedBy: true,
  adminNotes: true,
});

export const insertDisputeChatMessageSchema = createInsertSchema(disputeChatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertWalletSchema = createInsertSchema(wallets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  availableBalance: true,
  escrowBalance: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export const insertRatingSchema = createInsertSchema(ratings).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  isRead: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

// Type Exports
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertKyc = z.infer<typeof insertKycSchema>;
export type Kyc = typeof kyc.$inferSelect;

export type InsertVendorProfile = z.infer<typeof insertVendorProfileSchema>;
export type VendorProfile = typeof vendorProfiles.$inferSelect;

export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offers.$inferSelect;

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export type InsertDispute = z.infer<typeof insertDisputeSchema>;
export type Dispute = typeof disputes.$inferSelect;

export type InsertDisputeChatMessage = z.infer<typeof insertDisputeChatMessageSchema>;
export type DisputeChatMessage = typeof disputeChatMessages.$inferSelect;

export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof wallets.$inferSelect;

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

export type InsertRating = z.infer<typeof insertRatingSchema>;
export type Rating = typeof ratings.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

export type MaintenanceSettings = typeof maintenanceSettings.$inferSelect;
export type ThemeSettings = typeof themeSettings.$inferSelect;

export const insertExchangeSchema = createInsertSchema(exchanges).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertExchange = z.infer<typeof insertExchangeSchema>;
export type Exchange = typeof exchanges.$inferSelect;

// Social Feed Insert Schemas
export const insertSocialPostSchema = createInsertSchema(socialPosts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  likesCount: true,
  dislikesCount: true,
  commentsCount: true,
  sharesCount: true,
  isDeleted: true,
});

export const insertSocialCommentSchema = createInsertSchema(socialComments).omit({
  id: true,
  createdAt: true,
  isDeleted: true,
});

export const insertSocialLikeSchema = createInsertSchema(socialLikes).omit({
  id: true,
  createdAt: true,
});

export const insertSocialDislikeSchema = createInsertSchema(socialDislikes).omit({
  id: true,
  createdAt: true,
});

export const insertSocialMuteSchema = createInsertSchema(socialMutes).omit({
  id: true,
  createdAt: true,
});

// Social Feed Type Exports
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;
export type SocialPost = typeof socialPosts.$inferSelect;

export type InsertSocialComment = z.infer<typeof insertSocialCommentSchema>;
export type SocialComment = typeof socialComments.$inferSelect;

export type InsertSocialLike = z.infer<typeof insertSocialLikeSchema>;
export type SocialLike = typeof socialLikes.$inferSelect;

export type InsertSocialDislike = z.infer<typeof insertSocialDislikeSchema>;
export type SocialDislike = typeof socialDislikes.$inferSelect;

export type InsertSocialMute = z.infer<typeof insertSocialMuteSchema>;
export type SocialMute = typeof socialMutes.$inferSelect;

// Loader Zone Tables
export const loaderAds = pgTable("loader_ads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loaderId: varchar("loader_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assetType: text("asset_type").notNull(),
  dealAmount: numeric("deal_amount", { precision: 18, scale: 2 }).notNull(),
  loadingTerms: text("loading_terms"),
  upfrontPercentage: integer("upfront_percentage").default(0),
  paymentMethods: text("payment_methods").array().notNull(),
  frozenCommitment: numeric("frozen_commitment", { precision: 18, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const loaderOrders = pgTable("loader_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adId: varchar("ad_id").notNull().references(() => loaderAds.id, { onDelete: "cascade" }),
  loaderId: varchar("loader_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiverId: varchar("receiver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dealAmount: numeric("deal_amount", { precision: 18, scale: 2 }).notNull(),
  loaderFrozenAmount: numeric("loader_frozen_amount", { precision: 18, scale: 2 }).notNull(),
  receiverFrozenAmount: numeric("receiver_frozen_amount", { precision: 18, scale: 2 }).default("0"),
  status: loaderOrderStatusEnum("status").notNull().default("created"),
  liabilityType: liabilityTypeEnum("liability_type"),
  liabilityDeadline: timestamp("liability_deadline"),
  receiverConfirmed: boolean("receiver_confirmed").notNull().default(false),
  loaderConfirmed: boolean("loader_confirmed").notNull().default(false),
  loaderFeeDeducted: numeric("loader_fee_deducted", { precision: 18, scale: 2 }).default("0"),
  receiverFeeDeducted: numeric("receiver_fee_deducted", { precision: 18, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  completedAt: timestamp("completed_at"),
});

export const loaderOrderMessages = pgTable("loader_order_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => loaderOrders.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").references(() => users.id),
  isSystem: boolean("is_system").notNull().default(false),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Loader Zone Relations
export const loaderAdsRelations = relations(loaderAds, ({ one, many }) => ({
  loader: one(users, {
    fields: [loaderAds.loaderId],
    references: [users.id],
  }),
  orders: many(loaderOrders),
}));

export const loaderOrdersRelations = relations(loaderOrders, ({ one, many }) => ({
  ad: one(loaderAds, {
    fields: [loaderOrders.adId],
    references: [loaderAds.id],
  }),
  loader: one(users, {
    fields: [loaderOrders.loaderId],
    references: [users.id],
    relationName: "loaderOrders",
  }),
  receiver: one(users, {
    fields: [loaderOrders.receiverId],
    references: [users.id],
    relationName: "receiverOrders",
  }),
  messages: many(loaderOrderMessages),
}));

export const loaderOrderMessagesRelations = relations(loaderOrderMessages, ({ one }) => ({
  order: one(loaderOrders, {
    fields: [loaderOrderMessages.orderId],
    references: [loaderOrders.id],
  }),
  sender: one(users, {
    fields: [loaderOrderMessages.senderId],
    references: [users.id],
  }),
}));

// Loader Zone Insert Schemas
export const insertLoaderAdSchema = createInsertSchema(loaderAds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  frozenCommitment: true,
  isActive: true,
});

export const insertLoaderOrderSchema = createInsertSchema(loaderOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  loaderFeeDeducted: true,
  receiverFeeDeducted: true,
});

export const insertLoaderOrderMessageSchema = createInsertSchema(loaderOrderMessages).omit({
  id: true,
  createdAt: true,
});

// Loader Zone Type Exports
export type InsertLoaderAd = z.infer<typeof insertLoaderAdSchema>;
export type LoaderAd = typeof loaderAds.$inferSelect;

export type InsertLoaderOrder = z.infer<typeof insertLoaderOrderSchema>;
export type LoaderOrder = typeof loaderOrders.$inferSelect;

export type InsertLoaderOrderMessage = z.infer<typeof insertLoaderOrderMessageSchema>;
export type LoaderOrderMessage = typeof loaderOrderMessages.$inferSelect;
