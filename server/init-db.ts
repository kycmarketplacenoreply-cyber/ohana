import { db, pool } from "./db";
import { users, wallets } from "@shared/schema";
import { hashPassword } from "./utils/bcrypt";
import { eq } from "drizzle-orm";

async function createEnumsIfNotExist() {
  const enumQueries = [
    `DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'vendor', 'customer', 'support', 'dispute_admin'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE kyc_status AS ENUM ('pending', 'approved', 'rejected', 'resubmit'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE kyc_tier AS ENUM ('tier0', 'tier1', 'tier2'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE trade_intent AS ENUM ('sell_ad', 'buy_ad'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE order_status AS ENUM ('created', 'awaiting_deposit', 'escrowed', 'paid', 'confirmed', 'completed', 'cancelled', 'disputed'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE dispute_status AS ENUM ('open', 'in_review', 'resolved_refund', 'resolved_release'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE transaction_type AS ENUM ('deposit', 'withdraw', 'escrow_hold', 'escrow_release', 'fee', 'refund'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE subscription_plan AS ENUM ('free', 'basic', 'pro', 'featured'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE notification_type AS ENUM ('order', 'payment', 'escrow', 'dispute', 'kyc', 'vendor', 'wallet', 'system'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE maintenance_mode AS ENUM ('none', 'partial', 'full'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  ];

  for (const query of enumQueries) {
    await pool.query(query);
  }
}

async function createTablesIfNotExist() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role user_role NOT NULL DEFAULT 'customer',
      two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
      two_factor_secret TEXT,
      two_factor_recovery_codes TEXT[],
      email_verified BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      is_frozen BOOLEAN NOT NULL DEFAULT false,
      frozen_reason TEXT,
      last_login_at TIMESTAMP,
      login_attempts INTEGER NOT NULL DEFAULT 0,
      device_fingerprints TEXT[] DEFAULT ARRAY[]::text[],
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS kyc (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tier kyc_tier NOT NULL DEFAULT 'tier0',
      status kyc_status NOT NULL DEFAULT 'pending',
      id_type TEXT,
      id_number TEXT,
      id_document_url TEXT,
      id_front_url TEXT,
      id_back_url TEXT,
      selfie_url TEXT,
      face_match_score NUMERIC(5, 2),
      admin_notes TEXT,
      rejection_reason TEXT,
      submitted_at TIMESTAMP NOT NULL DEFAULT now(),
      reviewed_at TIMESTAMP,
      reviewed_by VARCHAR REFERENCES users(id),
      is_star_verified BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS vendor_profiles (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      business_name TEXT,
      bio TEXT,
      country TEXT NOT NULL,
      subscription_plan subscription_plan NOT NULL DEFAULT 'free',
      is_approved BOOLEAN NOT NULL DEFAULT false,
      total_trades INTEGER NOT NULL DEFAULT 0,
      completed_trades INTEGER NOT NULL DEFAULT 0,
      cancelled_trades INTEGER NOT NULL DEFAULT 0,
      average_rating NUMERIC(3, 2) DEFAULT 0,
      total_ratings INTEGER NOT NULL DEFAULT 0,
      suspicious_activity_score INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS offers (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_id VARCHAR NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      trade_intent trade_intent NOT NULL DEFAULT 'sell_ad',
      currency TEXT NOT NULL,
      price_per_unit NUMERIC(18, 8) NOT NULL,
      min_limit NUMERIC(18, 2) NOT NULL,
      max_limit NUMERIC(18, 2) NOT NULL,
      available_amount NUMERIC(18, 8) NOT NULL,
      payment_methods TEXT[] NOT NULL,
      terms TEXT,
      account_details JSONB,
      escrow_held_amount NUMERIC(18, 8) DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      is_priority BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      offer_id VARCHAR NOT NULL REFERENCES offers(id),
      buyer_id VARCHAR NOT NULL REFERENCES users(id),
      vendor_id VARCHAR NOT NULL REFERENCES vendor_profiles(id),
      created_by VARCHAR REFERENCES users(id),
      trade_intent trade_intent NOT NULL DEFAULT 'sell_ad',
      amount NUMERIC(18, 8) NOT NULL,
      fiat_amount NUMERIC(18, 2) NOT NULL,
      price_per_unit NUMERIC(18, 8) NOT NULL,
      currency TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      status order_status NOT NULL DEFAULT 'created',
      escrow_amount NUMERIC(18, 8),
      platform_fee NUMERIC(18, 8),
      seller_receives NUMERIC(18, 8),
      buyer_paid_at TIMESTAMP,
      vendor_confirmed_at TIMESTAMP,
      completed_at TIMESTAMP,
      escrow_held_at TIMESTAMP,
      escrow_released_at TIMESTAMP,
      auto_release_at TIMESTAMP,
      cancel_reason TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id VARCHAR NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      sender_id VARCHAR NOT NULL REFERENCES users(id),
      message TEXT NOT NULL,
      file_url TEXT,
      is_system_message BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS disputes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id VARCHAR NOT NULL REFERENCES orders(id),
      opened_by VARCHAR NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      evidence_urls TEXT[] DEFAULT ARRAY[]::text[],
      status dispute_status NOT NULL DEFAULT 'open',
      resolution TEXT,
      resolved_by VARCHAR REFERENCES users(id),
      admin_notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      resolved_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dispute_chat_messages (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      dispute_id VARCHAR NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
      sender_id VARCHAR NOT NULL REFERENCES users(id),
      message TEXT NOT NULL,
      file_url TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      currency TEXT NOT NULL DEFAULT 'USDT',
      available_balance NUMERIC(18, 8) NOT NULL DEFAULT 0,
      escrow_balance NUMERIC(18, 8) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id),
      wallet_id VARCHAR NOT NULL REFERENCES wallets(id),
      type transaction_type NOT NULL,
      amount NUMERIC(18, 8) NOT NULL,
      currency TEXT NOT NULL,
      related_order_id VARCHAR REFERENCES orders(id),
      description TEXT,
      metadata JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id VARCHAR NOT NULL REFERENCES orders(id),
      vendor_id VARCHAR NOT NULL REFERENCES vendor_profiles(id),
      rated_by VARCHAR NOT NULL REFERENCES users(id),
      stars INTEGER NOT NULL,
      comment TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type notification_type NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      is_read BOOLEAN NOT NULL DEFAULT false,
      metadata JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR REFERENCES users(id),
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT,
      changes JSONB,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS maintenance_settings (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      mode maintenance_mode NOT NULL DEFAULT 'none',
      message TEXT,
      updated_by VARCHAR REFERENCES users(id),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS theme_settings (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      primary_color TEXT DEFAULT '#3b82f6',
      logo_url TEXT,
      banner_urls TEXT[] DEFAULT ARRAY[]::text[],
      branding_config JSONB,
      updated_by VARCHAR REFERENCES users(id),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS exchanges (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      symbol TEXT NOT NULL UNIQUE,
      description TEXT,
      icon_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by VARCHAR REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `);
}

async function seedOrUpdateAdmin(
  username: string,
  email: string,
  password: string,
  role: "admin" | "dispute_admin" = "admin",
) {
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existingUser.length > 0) {
    console.log(`Admin user ${username} already exists. Ensuring wallet exists...`);
    
    const existingWallet = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, existingUser[0].id))
      .limit(1);
      
    if (existingWallet.length === 0) {
      await db.insert(wallets).values({
        userId: existingUser[0].id,
        currency: "USDT",
      });
      console.log(`Wallet created for ${username}!`);
    }
    return;
  }

  const hashedPassword = await hashPassword(password);

  const [adminUser] = await db
    .insert(users)
    .values({
      username,
      email,
      password: hashedPassword,
      role: role,
      emailVerified: true,
      isActive: true,
    })
    .returning();

  await db.insert(wallets).values({
    userId: adminUser.id,
    currency: "USDT",
  });

  console.log(`${role} user ${username} created successfully!`);
}

async function seedAdminUsers() {
  const kaiPassword = process.env.ADMIN_KAI_PASSWORD || "487530Turbo";
  const turboPassword = process.env.ADMIN_TURBO_PASSWORD || "1CU14CU";

  await seedOrUpdateAdmin("Kai", "kai@admin.local", kaiPassword, "admin");
  await seedOrUpdateAdmin("Turbo", "turbo@admin.local", turboPassword, "dispute_admin");
}

export async function initializeDatabase(): Promise<void> {
  console.log("Initializing database...");
  
  try {
    await createEnumsIfNotExist();
    console.log("Enums created/verified.");
    
    await createTablesIfNotExist();
    console.log("Tables created/verified.");
    
    await seedAdminUsers();
    console.log("Admin users seeded/verified.");
    
    console.log("Database initialization complete!");
  } catch (error) {
    console.error("Database initialization failed:", error);
    throw error;
  }
}
