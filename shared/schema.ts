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
export const userRoleEnum = pgEnum("user_role", ["admin", "vendor", "customer", "support", "dispute_admin", "finance_manager"]);
export const kycStatusEnum = pgEnum("kyc_status", ["pending", "approved", "rejected", "resubmit"]);
export const kycTierEnum = pgEnum("kyc_tier", ["tier0", "tier1", "tier2"]);
export const tradeIntentEnum = pgEnum("trade_intent", ["sell_ad", "buy_ad"]);
export const orderStatusEnum = pgEnum("order_status", ["created", "awaiting_deposit", "escrowed", "paid", "confirmed", "completed", "cancelled", "disputed"]);
export const disputeStatusEnum = pgEnum("dispute_status", ["open", "in_review", "resolved_refund", "resolved_release"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["deposit", "withdraw", "escrow_hold", "escrow_release", "fee", "refund"]);
export const subscriptionPlanEnum = pgEnum("subscription_plan", ["free", "basic", "pro", "featured"]);
export const notificationTypeEnum = pgEnum("notification_type", ["order", "payment", "escrow", "dispute", "kyc", "vendor", "wallet", "system"]);
export const maintenanceModeEnum = pgEnum("maintenance_mode", ["none", "full", "financial", "trading", "readonly"]);

// Loader Zone Enums
export const countdownTimeEnum = pgEnum("countdown_time", [
  "15min",
  "30min",
  "1hr",
  "2hr"
]);

export const loaderOrderStatusEnum = pgEnum("loader_order_status", [
  "created",
  "awaiting_liability_confirmation",
  "awaiting_payment_details",
  "payment_details_sent",
  "payment_sent",
  "asset_frozen_waiting",
  "completed",
  "closed_no_payment",
  "cancelled_auto",
  "cancelled_loader",
  "cancelled_receiver",
  "disputed",
  "resolved_loader_wins",
  "resolved_receiver_wins",
  "resolved_mutual"
]);

export const loaderDisputeStatusEnum = pgEnum("loader_dispute_status", [
  "open",
  "in_review",
  "resolved_loader_wins",
  "resolved_receiver_wins",
  "resolved_mutual"
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
  hasVerifyBadge: boolean("has_verify_badge").notNull().default(false),
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

// Support Tickets Table
export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Support Ticket Messages Table
export const supportMessages = pgTable("support_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Maintenance Settings Table
export const maintenanceSettings = pgTable("maintenance_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: maintenanceModeEnum("mode").notNull().default("none"),
  message: text("message"),
  customReason: text("custom_reason"),
  expectedDowntime: text("expected_downtime"),
  depositsEnabled: boolean("deposits_enabled").notNull().default(true),
  withdrawalsEnabled: boolean("withdrawals_enabled").notNull().default(true),
  tradingEnabled: boolean("trading_enabled").notNull().default(true),
  loginEnabled: boolean("login_enabled").notNull().default(true),
  autoWithdrawalEnabled: boolean("auto_withdrawal_enabled").notNull().default(false),
  kycRequired: boolean("kyc_required").notNull().default(false),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Withdrawal Requests Table
export const withdrawalRequests = pgTable("withdrawal_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  walletId: varchar("wallet_id").notNull().references(() => wallets.id),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  currency: text("currency").notNull().default("USDT"),
  status: text("status").notNull().default("pending"),
  walletAddress: text("wallet_address"),
  network: text("network"),
  txHash: text("tx_hash"),
  adminNotes: text("admin_notes"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
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

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  assignedTo: true,
});

export const insertSupportMessageSchema = createInsertSchema(supportMessages).omit({
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

export const insertWithdrawalRequestSchema = createInsertSchema(withdrawalRequests).omit({
  id: true,
  createdAt: true,
  status: true,
  reviewedBy: true,
  reviewedAt: true,
  adminNotes: true,
  txHash: true,
});
export type InsertWithdrawalRequest = z.infer<typeof insertWithdrawalRequestSchema>;
export type WithdrawalRequest = typeof withdrawalRequests.$inferSelect;

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
  countdownTime: countdownTimeEnum("countdown_time").notNull().default("30min"),
  paymentMethods: text("payment_methods").array().notNull(),
  frozenCommitment: numeric("frozen_commitment", { precision: 18, scale: 2 }).notNull(),
  loaderFeeReserve: numeric("loader_fee_reserve", { precision: 18, scale: 2 }).notNull().default("0"),
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
  loaderFeeReserve: numeric("loader_fee_reserve", { precision: 18, scale: 2 }).notNull().default("0"),
  receiverFrozenAmount: numeric("receiver_frozen_amount", { precision: 18, scale: 2 }).default("0"),
  receiverFeeReserve: numeric("receiver_fee_reserve", { precision: 18, scale: 2 }).default("0"),
  status: loaderOrderStatusEnum("status").notNull().default("created"),
  countdownTime: countdownTimeEnum("countdown_time").notNull().default("30min"),
  countdownExpiresAt: timestamp("countdown_expires_at"),
  countdownStopped: boolean("countdown_stopped").notNull().default(false),
  loaderSentPaymentDetails: boolean("loader_sent_payment_details").notNull().default(false),
  receiverSentPaymentDetails: boolean("receiver_sent_payment_details").notNull().default(false),
  loaderMarkedPaymentSent: boolean("loader_marked_payment_sent").notNull().default(false),
  receiverConfirmedPayment: boolean("receiver_confirmed_payment").notNull().default(false),
  liabilityType: liabilityTypeEnum("liability_type"),
  receiverLiabilityConfirmed: boolean("receiver_liability_confirmed").notNull().default(false),
  loaderLiabilityConfirmed: boolean("loader_liability_confirmed").notNull().default(false),
  liabilityLockedAt: timestamp("liability_locked_at"),
  liabilityDeadline: timestamp("liability_deadline"),
  cancelledBy: varchar("cancelled_by").references(() => users.id),
  cancelReason: text("cancel_reason"),
  loaderFeeDeducted: numeric("loader_fee_deducted", { precision: 18, scale: 2 }).default("0"),
  receiverFeeDeducted: numeric("receiver_fee_deducted", { precision: 18, scale: 2 }).default("0"),
  penaltyAmount: numeric("penalty_amount", { precision: 18, scale: 2 }).default("0"),
  penaltyPaidBy: varchar("penalty_paid_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
  completedAt: timestamp("completed_at"),
});

export const loaderOrderMessages = pgTable("loader_order_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => loaderOrders.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").references(() => users.id),
  isSystem: boolean("is_system").notNull().default(false),
  isAdminMessage: boolean("is_admin_message").notNull().default(false),
  content: text("content").notNull(),
  fileUrl: text("file_url"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const loaderDisputes = pgTable("loader_disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => loaderOrders.id, { onDelete: "cascade" }),
  openedBy: varchar("opened_by").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  evidenceUrls: text("evidence_urls").array().default(sql`ARRAY[]::text[]`),
  status: loaderDisputeStatusEnum("status").notNull().default("open"),
  resolution: text("resolution"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  winnerId: varchar("winner_id").references(() => users.id),
  loserId: varchar("loser_id").references(() => users.id),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  resolvedAt: timestamp("resolved_at"),
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
  dispute: one(loaderDisputes),
}));

export const loaderDisputesRelations = relations(loaderDisputes, ({ one }) => ({
  order: one(loaderOrders, {
    fields: [loaderDisputes.orderId],
    references: [loaderOrders.id],
  }),
  opener: one(users, {
    fields: [loaderDisputes.openedBy],
    references: [users.id],
  }),
  resolver: one(users, {
    fields: [loaderDisputes.resolvedBy],
    references: [users.id],
  }),
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
  isActive: true,
});

export const insertLoaderOrderSchema = createInsertSchema(loaderOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  loaderFeeDeducted: true,
  receiverFeeDeducted: true,
  penaltyAmount: true,
  penaltyPaidBy: true,
  countdownStopped: true,
  loaderSentPaymentDetails: true,
  receiverSentPaymentDetails: true,
  loaderMarkedPaymentSent: true,
  receiverConfirmedPayment: true,
  cancelledBy: true,
  cancelReason: true,
});

export const insertLoaderOrderMessageSchema = createInsertSchema(loaderOrderMessages).omit({
  id: true,
  createdAt: true,
});

export const insertLoaderDisputeSchema = createInsertSchema(loaderDisputes).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  status: true,
  resolution: true,
  resolvedBy: true,
  winnerId: true,
  loserId: true,
  adminNotes: true,
});

// Loader Zone Type Exports
export type InsertLoaderAd = z.infer<typeof insertLoaderAdSchema>;
export type LoaderAd = typeof loaderAds.$inferSelect;

export type InsertLoaderOrder = z.infer<typeof insertLoaderOrderSchema>;
export type LoaderOrder = typeof loaderOrders.$inferSelect;

export type InsertLoaderOrderMessage = z.infer<typeof insertLoaderOrderMessageSchema>;
export type LoaderOrderMessage = typeof loaderOrderMessages.$inferSelect;

export type InsertLoaderDispute = z.infer<typeof insertLoaderDisputeSchema>;
export type LoaderDispute = typeof loaderDisputes.$inferSelect;

// Loader Feedback Table for trust scores
export const loaderFeedbackTypeEnum = pgEnum("loader_feedback_type", ["positive", "negative"]);

export const loaderFeedback = pgTable("loader_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => loaderOrders.id, { onDelete: "cascade" }),
  giverId: varchar("giver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiverId: varchar("receiver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  feedbackType: loaderFeedbackTypeEnum("feedback_type").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Loader Stats Table for tracking trades and trust scores
export const loaderStats = pgTable("loader_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  totalTrades: integer("total_trades").notNull().default(0),
  completedTrades: integer("completed_trades").notNull().default(0),
  cancelledTrades: integer("cancelled_trades").notNull().default(0),
  disputedTrades: integer("disputed_trades").notNull().default(0),
  positiveFeedback: integer("positive_feedback").notNull().default(0),
  negativeFeedback: integer("negative_feedback").notNull().default(0),
  isVerifiedVendor: boolean("is_verified_vendor").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Loader Feedback Relations
export const loaderFeedbackRelations = relations(loaderFeedback, ({ one }) => ({
  order: one(loaderOrders, {
    fields: [loaderFeedback.orderId],
    references: [loaderOrders.id],
  }),
  giver: one(users, {
    fields: [loaderFeedback.giverId],
    references: [users.id],
    relationName: "givenFeedback",
  }),
  receiver: one(users, {
    fields: [loaderFeedback.receiverId],
    references: [users.id],
    relationName: "receivedFeedback",
  }),
}));

export const loaderStatsRelations = relations(loaderStats, ({ one }) => ({
  user: one(users, {
    fields: [loaderStats.userId],
    references: [users.id],
  }),
}));

// Loader Feedback Insert Schema
export const insertLoaderFeedbackSchema = createInsertSchema(loaderFeedback).omit({
  id: true,
  createdAt: true,
});

export const insertLoaderStatsSchema = createInsertSchema(loaderStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalTrades: true,
  completedTrades: true,
  cancelledTrades: true,
  disputedTrades: true,
  positiveFeedback: true,
  negativeFeedback: true,
});

// Loader Feedback Type Exports
export type InsertLoaderFeedback = z.infer<typeof insertLoaderFeedbackSchema>;
export type LoaderFeedback = typeof loaderFeedback.$inferSelect;

export type InsertLoaderStats = z.infer<typeof insertLoaderStatsSchema>;
export type LoaderStats = typeof loaderStats.$inferSelect;

// ==================== BLOCKCHAIN WALLET TABLES ====================

// Deposit Status Enum
export const depositStatusEnum = pgEnum("deposit_status", [
  "pending",
  "confirming",
  "confirmed",
  "credited",
  "sweep_pending",
  "swept",
  "sweep_failed",
  "failed"
]);

// Sweep Status Enum
export const sweepStatusEnum = pgEnum("sweep_status", [
  "pending",
  "processing",
  "completed",
  "failed"
]);

// Withdrawal Status Enum (extended)
export const withdrawalStatusEnum = pgEnum("withdrawal_status", [
  "pending",
  "approved",
  "processing",
  "sent",
  "completed",
  "rejected",
  "failed",
  "cancelled"
]);

// Wallet Index Counter - Atomic counter for HD wallet derivation indexes
export const walletIndexCounter = pgTable("wallet_index_counter", {
  id: varchar("id").primaryKey().default("singleton"),
  nextIndex: integer("next_index").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// User Deposit Addresses - Unique deposit address per user
export const userDepositAddresses = pgTable("user_deposit_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull().unique(),
  network: text("network").notNull().default("BSC"),
  derivationIndex: integer("derivation_index").notNull().unique(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Blockchain Deposits - Track all incoming deposits
export const blockchainDeposits = pgTable("blockchain_deposits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  depositAddressId: varchar("deposit_address_id").notNull().references(() => userDepositAddresses.id),
  txHash: text("tx_hash").notNull().unique(),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  tokenContract: text("token_contract").notNull(),
  network: text("network").notNull().default("BSC"),
  blockNumber: integer("block_number").notNull(),
  confirmations: integer("confirmations").notNull().default(0),
  requiredConfirmations: integer("required_confirmations").notNull().default(15),
  status: depositStatusEnum("status").notNull().default("pending"),
  confirmedAt: timestamp("confirmed_at"),
  creditedAt: timestamp("credited_at"),
  creditedTransactionId: varchar("credited_transaction_id"),
  detectedAt: timestamp("detected_at").notNull().default(sql`now()`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Deposit Sweeps - Track sweep transactions to master wallet
export const depositSweeps = pgTable("deposit_sweeps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  depositId: varchar("deposit_id").notNull().references(() => blockchainDeposits.id),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  gasFee: numeric("gas_fee", { precision: 18, scale: 8 }),
  txHash: text("tx_hash"),
  status: sweepStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Platform Wallet Controls - Kill switches and limits
export const platformWalletControls = pgTable("platform_wallet_controls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  withdrawalsEnabled: boolean("withdrawals_enabled").notNull().default(true),
  depositsEnabled: boolean("deposits_enabled").notNull().default(true),
  sweepsEnabled: boolean("sweeps_enabled").notNull().default(true),
  emergencyMode: boolean("emergency_mode").notNull().default(false),
  hotWalletBalanceCap: numeric("hot_wallet_balance_cap", { precision: 18, scale: 8 }).notNull().default("100000"),
  perUserDailyWithdrawalLimit: numeric("per_user_daily_withdrawal_limit", { precision: 18, scale: 8 }).notNull().default("10000"),
  platformDailyWithdrawalLimit: numeric("platform_daily_withdrawal_limit", { precision: 18, scale: 8 }).notNull().default("100000"),
  minDepositAmount: numeric("min_deposit_amount", { precision: 18, scale: 8 }).notNull().default("5"), // Database column added via migration 0001
  minWithdrawalAmount: numeric("min_withdrawal_amount", { precision: 18, scale: 8 }).notNull().default("5"),
  withdrawalFeePercent: numeric("withdrawal_fee_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  withdrawalFeeFixed: numeric("withdrawal_fee_fixed", { precision: 18, scale: 8 }).notNull().default("0.5"),
  firstWithdrawalDelayMinutes: integer("first_withdrawal_delay_minutes").notNull().default(60),
  largeWithdrawalThreshold: numeric("large_withdrawal_threshold", { precision: 18, scale: 8 }).notNull().default("1000"),
  largeWithdrawalDelayMinutes: integer("large_withdrawal_delay_minutes").notNull().default(120),
  requiredConfirmations: integer("required_confirmations").notNull().default(15),
  walletUnlocked: boolean("wallet_unlocked").notNull().default(false),
  unlockedAt: timestamp("unlocked_at"),
  unlockedBy: varchar("unlocked_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Blockchain Admin Actions - Immutable audit log for wallet operations
export const blockchainAdminActions = pgTable("blockchain_admin_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: varchar("target_id"),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  reason: text("reason"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// User Withdrawal Limits - Track daily withdrawal usage
export const userWithdrawalLimits = pgTable("user_withdrawal_limits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  totalWithdrawn: numeric("total_withdrawn", { precision: 18, scale: 8 }).notNull().default("0"),
  withdrawalCount: integer("withdrawal_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// User First Withdrawal Tracking
export const userFirstWithdrawals = pgTable("user_first_withdrawals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  hasWithdrawn: boolean("has_withdrawn").notNull().default(false),
  firstWithdrawalAt: timestamp("first_withdrawal_at"),
  lastPasswordChangeAt: timestamp("last_password_change_at"),
  lastEmailChangeAt: timestamp("last_email_change_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Blockchain Deposit Address Relations
export const userDepositAddressesRelations = relations(userDepositAddresses, ({ one, many }) => ({
  user: one(users, {
    fields: [userDepositAddresses.userId],
    references: [users.id],
  }),
  deposits: many(blockchainDeposits),
}));

export const blockchainDepositsRelations = relations(blockchainDeposits, ({ one }) => ({
  user: one(users, {
    fields: [blockchainDeposits.userId],
    references: [users.id],
  }),
  depositAddress: one(userDepositAddresses, {
    fields: [blockchainDeposits.depositAddressId],
    references: [userDepositAddresses.id],
  }),
}));

export const depositSweepsRelations = relations(depositSweeps, ({ one }) => ({
  deposit: one(blockchainDeposits, {
    fields: [depositSweeps.depositId],
    references: [blockchainDeposits.id],
  }),
}));

// Blockchain Insert Schemas
export const insertUserDepositAddressSchema = createInsertSchema(userDepositAddresses).omit({
  id: true,
  createdAt: true,
  isActive: true,
});

export const insertBlockchainDepositSchema = createInsertSchema(blockchainDeposits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  creditedAt: true,
  creditedTransactionId: true,
});

export const insertDepositSweepSchema = createInsertSchema(depositSweeps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  txHash: true,
  completedAt: true,
  errorMessage: true,
  attempts: true,
  lastAttemptAt: true,
});

export const insertBlockchainAdminActionSchema = createInsertSchema(blockchainAdminActions).omit({
  id: true,
  createdAt: true,
});

export const insertUserWithdrawalLimitSchema = createInsertSchema(userWithdrawalLimits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserFirstWithdrawalSchema = createInsertSchema(userFirstWithdrawals).omit({
  id: true,
  createdAt: true,
  hasWithdrawn: true,
  firstWithdrawalAt: true,
});

// Blockchain Type Exports
export type InsertUserDepositAddress = z.infer<typeof insertUserDepositAddressSchema>;
export type UserDepositAddress = typeof userDepositAddresses.$inferSelect;

export type InsertBlockchainDeposit = z.infer<typeof insertBlockchainDepositSchema>;
export type BlockchainDeposit = typeof blockchainDeposits.$inferSelect;

export type InsertDepositSweep = z.infer<typeof insertDepositSweepSchema>;
export type DepositSweep = typeof depositSweeps.$inferSelect;

export type PlatformWalletControls = typeof platformWalletControls.$inferSelect;

export type InsertBlockchainAdminAction = z.infer<typeof insertBlockchainAdminActionSchema>;
export type BlockchainAdminAction = typeof blockchainAdminActions.$inferSelect;

export type InsertUserWithdrawalLimit = z.infer<typeof insertUserWithdrawalLimitSchema>;
export type UserWithdrawalLimit = typeof userWithdrawalLimits.$inferSelect;

export type InsertUserFirstWithdrawal = z.infer<typeof insertUserFirstWithdrawalSchema>;
export type UserFirstWithdrawal = typeof userFirstWithdrawals.$inferSelect;

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;

export type SupportMessage = typeof supportMessages.$inferSelect;
export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;
