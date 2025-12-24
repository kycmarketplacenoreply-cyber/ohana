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

// Email Verification Codes Table
export const emailVerificationCodes = pgTable("email_verification_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Password Reset Codes Table
export const passwordResetCodes = pgTable("password_reset_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// 2FA Reset Codes Table
export const twoFactorResetCodes = pgTable("two_factor_reset_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
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

// Loader Zone Tables (from your existing schema) - Placeholder for import
export const loaderAds = pgTable("loader_ads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  loaderId: varchar("loader_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  countdownTime: countdownTimeEnum("countdown_time").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const loaderOrders = pgTable("loader_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adId: varchar("ad_id").notNull().references(() => loaderAds.id),
  loaderId: varchar("loader_id").notNull().references(() => users.id),
  receiverId: varchar("receiver_id").notNull().references(() => users.id),
  status: loaderOrderStatusEnum("status").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const loaderOrderMessages = pgTable("loader_order_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => loaderOrders.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const loaderDisputes = pgTable("loader_disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => loaderOrders.id),
  openedBy: varchar("opened_by").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  status: loaderDisputeStatusEnum("status").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const loaderFeedback = pgTable("loader_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => loaderOrders.id),
  fromUserId: varchar("from_user_id").notNull().references(() => users.id),
  toUserId: varchar("to_user_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const loaderStats = pgTable("loader_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  totalOrders: integer("total_orders").notNull().default(0),
  completedOrders: integer("completed_orders").notNull().default(0),
  averageRating: numeric("average_rating", { precision: 3, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Blockchain Wallet Tables
export const userDepositAddresses = pgTable("user_deposit_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  address: text("address").notNull().unique(),
  derivationIndex: integer("derivation_index").notNull(),
  network: text("network").notNull().default("bsc"),
  encryptedPrivateKey: text("encrypted_private_key"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const blockchainDeposits = pgTable("blockchain_deposits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  depositAddressId: varchar("deposit_address_id").notNull().references(() => userDepositAddresses.id),
  txHash: text("tx_hash").notNull().unique(),
  fromAddress: text("from_address"),
  toAddress: text("to_address"),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  tokenContract: text("token_contract"),
  network: text("network"),
  blockNumber: integer("block_number"),
  confirmations: integer("confirmations").notNull().default(0),
  requiredConfirmations: integer("required_confirmations"),
  status: text("status").notNull().default("pending"),
  confirmedAt: timestamp("confirmed_at"),
  creditedAt: timestamp("credited_at"),
  creditedTransactionId: varchar("credited_transaction_id"),
  detectedAt: timestamp("detected_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const depositSweeps = pgTable("deposit_sweeps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  depositId: varchar("deposit_id").notNull().references(() => blockchainDeposits.id),
  sweepTxHash: text("sweep_tx_hash"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const platformWalletControls = pgTable("platform_wallet_controls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  withdrawalsEnabled: boolean("withdrawals_enabled").notNull().default(true),
  depositsEnabled: boolean("deposits_enabled").notNull().default(true),
  sweepsEnabled: boolean("sweeps_enabled").notNull().default(true),
  emergencyMode: boolean("emergency_mode").notNull().default(false),
  hotWalletBalanceCap: numeric("hot_wallet_balance_cap", { precision: 18, scale: 8 }).notNull().default("100000"),
  perUserDailyWithdrawalLimit: numeric("per_user_daily_withdrawal_limit", { precision: 18, scale: 8 }).notNull().default("10000"),
  platformDailyWithdrawalLimit: numeric("platform_daily_withdrawal_limit", { precision: 18, scale: 8 }).notNull().default("100000"),
  minDepositAmount: numeric("min_deposit_amount", { precision: 18, scale: 8 }).notNull().default("5"),
  minWithdrawalAmount: numeric("min_withdrawal_amount", { precision: 18, scale: 8 }).notNull().default("10"),
  withdrawalFeePercent: numeric("withdrawal_fee_percent", { precision: 5, scale: 2 }).notNull().default("0.1"),
  withdrawalFeeFixed: numeric("withdrawal_fee_fixed", { precision: 18, scale: 8 }).notNull().default("0.5"),
  firstWithdrawalDelayMinutes: integer("first_withdrawal_delay_minutes").notNull().default(60),
  largeWithdrawalThreshold: numeric("large_withdrawal_threshold", { precision: 18, scale: 8 }).notNull().default("1000"),
  largeWithdrawalDelayMinutes: integer("large_withdrawal_delay_minutes").notNull().default(120),
  requiredConfirmations: integer("required_confirmations").notNull().default(15),
  walletUnlocked: boolean("wallet_unlocked").notNull().default(true),
  unlockedAt: timestamp("unlocked_at"),
  unlockedBy: varchar("unlocked_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const blockchainAdminActions = pgTable("blockchain_admin_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").references(() => users.id),
  action: text("action").notNull(),
  txHash: text("tx_hash"),
  amount: numeric("amount", { precision: 18, scale: 8 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const userWithdrawalLimits = pgTable("user_withdrawal_limits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: text("date").notNull(),
  totalWithdrawn: numeric("total_withdrawn", { precision: 18, scale: 8 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const userFirstWithdrawals = pgTable("user_first_withdrawals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  confirmed: boolean("confirmed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const walletIndexCounter = pgTable("wallet_index_counter", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nextIndex: integer("next_index").notNull().default(0),
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
  emailVerificationCodes: many(emailVerificationCodes),
  passwordResetCodes: many(passwordResetCodes),
  twoFactorResetCodes: many(twoFactorResetCodes),
}));

export const emailVerificationCodesRelations = relations(emailVerificationCodes, ({ one }) => ({
  user: one(users, {
    fields: [emailVerificationCodes.userId],
    references: [users.id],
  }),
}));

export const passwordResetCodesRelations = relations(passwordResetCodes, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetCodes.userId],
    references: [users.id],
  }),
}));

export const twoFactorResetCodesRelations = relations(twoFactorResetCodes, ({ one }) => ({
  user: one(users, {
    fields: [twoFactorResetCodes.userId],
    references: [users.id],
  }),
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
  comments: many(socialComments),
  likes: many(socialLikes),
  dislikes: many(socialDislikes),
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

export const socialDislikesRelations = relations(socialDislikes, ({ one }) => ({
  post: one(socialPosts, {
    fields: [socialDislikes.postId],
    references: [socialPosts.id],
  }),
  user: one(users, {
    fields: [socialDislikes.userId],
    references: [users.id],
  }),
}));

export const socialMutesRelations = relations(socialMutes, ({ one }) => ({
  user: one(users, {
    fields: [socialMutes.userId],
    references: [users.id],
  }),
  mutedByUser: one(users, {
    fields: [socialMutes.mutedBy],
    references: [users.id],
  }),
}));

// Zod Schemas
const baseUserSchema = {
  username: z.string().trim().min(1, "Username is required").regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores").min(3, "Username must be at least 3 characters"),
  email: z.string().trim().min(1, "Email is required").email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
};

export const insertUserSchema = createInsertSchema(users, {
  username: z.string().trim().min(1, "Username is required").regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores").min(3, "Username must be at least 3 characters"),
  email: z.string().trim().min(1, "Email is required").email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
}).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const insertEmailVerificationCodeSchema = createInsertSchema(emailVerificationCodes).omit({ id: true, createdAt: true });
export type InsertEmailVerificationCode = z.infer<typeof insertEmailVerificationCodeSchema>;
export type EmailVerificationCode = typeof emailVerificationCodes.$inferSelect;

export const insertPasswordResetCodeSchema = createInsertSchema(passwordResetCodes).omit({ id: true, createdAt: true });
export type InsertPasswordResetCode = z.infer<typeof insertPasswordResetCodeSchema>;
export type PasswordResetCode = typeof passwordResetCodes.$inferSelect;

export const insertTwoFactorResetCodeSchema = createInsertSchema(twoFactorResetCodes).omit({ id: true, createdAt: true });
export type InsertTwoFactorResetCode = z.infer<typeof insertTwoFactorResetCodeSchema>;
export type TwoFactorResetCode = typeof twoFactorResetCodes.$inferSelect;

export const insertKycSchema = createInsertSchema(kyc).omit({ id: true, submittedAt: true, reviewedAt: true });
export type InsertKyc = z.infer<typeof insertKycSchema>;
export type Kyc = typeof kyc.$inferSelect;

export const insertVendorProfileSchema = createInsertSchema(vendorProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVendorProfile = z.infer<typeof insertVendorProfileSchema>;
export type VendorProfile = typeof vendorProfiles.$inferSelect;

export const insertOfferSchema = createInsertSchema(offers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offers.$inferSelect;

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export const insertDisputeSchema = createInsertSchema(disputes).omit({ id: true, createdAt: true, resolvedAt: true });
export type InsertDispute = z.infer<typeof insertDisputeSchema>;
export type Dispute = typeof disputes.$inferSelect;

export const insertDisputeChatMessageSchema = createInsertSchema(disputeChatMessages).omit({ id: true, createdAt: true });
export type InsertDisputeChatMessage = z.infer<typeof insertDisputeChatMessageSchema>;
export type DisputeChatMessage = typeof disputeChatMessages.$inferSelect;

export const insertWalletSchema = createInsertSchema(wallets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWallet = z.infer<typeof insertWalletSchema>;
// Fix: Remove duplicate type declarations, keep just the schema definitions and inferred types

export type Exchange = typeof exchanges.$inferSelect;
export const insertExchangeSchema = createInsertSchema(exchanges).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExchange = z.infer<typeof insertExchangeSchema>;

export type WithdrawalRequest = typeof withdrawalRequests.$inferSelect;
export const insertWithdrawalRequestSchema = createInsertSchema(withdrawalRequests).omit({ id: true, createdAt: true });
export type InsertWithdrawalRequest = z.infer<typeof insertWithdrawalRequestSchema>;

export type SocialPost = typeof socialPosts.$inferSelect;
export const insertSocialPostSchema = createInsertSchema(socialPosts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;

export type SocialComment = typeof socialComments.$inferSelect;
export const insertSocialCommentSchema = createInsertSchema(socialComments).omit({ id: true, createdAt: true });
export type InsertSocialComment = z.infer<typeof insertSocialCommentSchema>;

export type SocialLike = typeof socialLikes.$inferSelect;
export const insertSocialLikeSchema = createInsertSchema(socialLikes).omit({ id: true, createdAt: true });
export type InsertSocialLike = z.infer<typeof insertSocialLikeSchema>;

export type SocialDislike = typeof socialDislikes.$inferSelect;
export const insertSocialDislikeSchema = createInsertSchema(socialDislikes).omit({ id: true, createdAt: true });
export type InsertSocialDislike = z.infer<typeof insertSocialDislikeSchema>;

export type SocialMute = typeof socialMutes.$inferSelect;
export const insertSocialMuteSchema = createInsertSchema(socialMutes).omit({ id: true, createdAt: true });
export type InsertSocialMute = z.infer<typeof insertSocialMuteSchema>;

export type LoaderAd = typeof loaderAds.$inferSelect;
export const insertLoaderAdSchema = createInsertSchema(loaderAds).omit({ id: true, createdAt: true });
export type InsertLoaderAd = z.infer<typeof insertLoaderAdSchema>;

export type LoaderOrder = typeof loaderOrders.$inferSelect;
export const insertLoaderOrderSchema = createInsertSchema(loaderOrders).omit({ id: true, createdAt: true });
export type InsertLoaderOrder = z.infer<typeof insertLoaderOrderSchema>;

export type LoaderOrderMessage = typeof loaderOrderMessages.$inferSelect;
export const insertLoaderOrderMessageSchema = createInsertSchema(loaderOrderMessages).omit({ id: true, createdAt: true });
export type InsertLoaderOrderMessage = z.infer<typeof insertLoaderOrderMessageSchema>;

export type LoaderDispute = typeof loaderDisputes.$inferSelect;
export const insertLoaderDisputeSchema = createInsertSchema(loaderDisputes).omit({ id: true, createdAt: true });
export type InsertLoaderDispute = z.infer<typeof insertLoaderDisputeSchema>;

export type LoaderFeedback = typeof loaderFeedback.$inferSelect;
export const insertLoaderFeedbackSchema = createInsertSchema(loaderFeedback).omit({ id: true, createdAt: true });
export type InsertLoaderFeedback = z.infer<typeof insertLoaderFeedbackSchema>;

export type LoaderStats = typeof loaderStats.$inferSelect;
export const insertLoaderStatsSchema = createInsertSchema(loaderStats).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLoaderStats = z.infer<typeof insertLoaderStatsSchema>;

export type UserDepositAddress = typeof userDepositAddresses.$inferSelect;
export const insertUserDepositAddressSchema = createInsertSchema(userDepositAddresses).omit({ id: true, createdAt: true });
export type InsertUserDepositAddress = z.infer<typeof insertUserDepositAddressSchema>;

export type BlockchainDeposit = typeof blockchainDeposits.$inferSelect;
export const insertBlockchainDepositSchema = createInsertSchema(blockchainDeposits).omit({ id: true, createdAt: true });
export type InsertBlockchainDeposit = z.infer<typeof insertBlockchainDepositSchema>;

export type DepositSweep = typeof depositSweeps.$inferSelect;
export const insertDepositSweepSchema = createInsertSchema(depositSweeps).omit({ id: true, createdAt: true });
export type InsertDepositSweep = z.infer<typeof insertDepositSweepSchema>;

export type PlatformWalletControls = typeof platformWalletControls.$inferSelect;

export type BlockchainAdminAction = typeof blockchainAdminActions.$inferSelect;
export const insertBlockchainAdminActionSchema = createInsertSchema(blockchainAdminActions).omit({ id: true, createdAt: true });
export type InsertBlockchainAdminAction = z.infer<typeof insertBlockchainAdminActionSchema>;

export type UserWithdrawalLimit = typeof userWithdrawalLimits.$inferSelect;
export const insertUserWithdrawalLimitSchema = createInsertSchema(userWithdrawalLimits).omit({ id: true, createdAt: true });
export type InsertUserWithdrawalLimit = z.infer<typeof insertUserWithdrawalLimitSchema>;

export type UserFirstWithdrawal = typeof userFirstWithdrawals.$inferSelect;
export const insertUserFirstWithdrawalSchema = createInsertSchema(userFirstWithdrawals).omit({ id: true, createdAt: true });
export type InsertUserFirstWithdrawal = z.infer<typeof insertUserFirstWithdrawalSchema>;
