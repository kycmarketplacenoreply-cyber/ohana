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
    `DO $$ BEGIN CREATE TYPE loader_order_status AS ENUM ('created', 'awaiting_liability_confirmation', 'awaiting_payment_details', 'payment_details_sent', 'payment_sent', 'asset_frozen_waiting', 'completed', 'closed_no_payment', 'cancelled_auto', 'cancelled_loader', 'cancelled_receiver', 'disputed', 'resolved_loader_wins', 'resolved_receiver_wins', 'resolved_mutual'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE liability_type AS ENUM ('full_payment', 'partial_10', 'partial_25', 'partial_50', 'time_bound_24h', 'time_bound_48h', 'time_bound_72h', 'time_bound_1week', 'time_bound_1month'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE countdown_time AS ENUM ('15min', '30min', '1hr', '2hr', '4hr', '24hr'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE loader_feedback_type AS ENUM ('positive', 'negative'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE loader_dispute_status AS ENUM ('open', 'in_review', 'resolved_loader_wins', 'resolved_receiver_wins', 'resolved_mutual'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
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
      profile_picture TEXT,
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
      custom_reason TEXT,
      expected_downtime TEXT,
      deposits_enabled BOOLEAN NOT NULL DEFAULT true,
      withdrawals_enabled BOOLEAN NOT NULL DEFAULT true,
      trading_enabled BOOLEAN NOT NULL DEFAULT true,
      login_enabled BOOLEAN NOT NULL DEFAULT true,
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

    CREATE TABLE IF NOT EXISTS social_posts (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      author_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      likes_count INTEGER NOT NULL DEFAULT 0,
      dislikes_count INTEGER NOT NULL DEFAULT 0,
      comments_count INTEGER NOT NULL DEFAULT 0,
      shares_count INTEGER NOT NULL DEFAULT 0,
      original_post_id VARCHAR REFERENCES social_posts(id),
      quote_text TEXT,
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS social_comments (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id VARCHAR NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
      author_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS social_likes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id VARCHAR NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS social_dislikes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id VARCHAR NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS social_mutes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      muted_by VARCHAR NOT NULL REFERENCES users(id),
      reason TEXT,
      expires_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS loader_ads (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      loader_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      asset_type TEXT NOT NULL,
      deal_amount NUMERIC(18, 2) NOT NULL,
      loading_terms TEXT,
      upfront_percentage INTEGER DEFAULT 0,
      countdown_time countdown_time NOT NULL DEFAULT '30min',
      payment_methods TEXT[] NOT NULL,
      frozen_commitment NUMERIC(18, 2) NOT NULL,
      loader_fee_reserve DECIMAL(20, 8) DEFAULT '0',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS loader_orders (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      ad_id VARCHAR NOT NULL REFERENCES loader_ads(id) ON DELETE CASCADE,
      loader_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deal_amount NUMERIC(18, 2) NOT NULL,
      loader_frozen_amount NUMERIC(18, 2) NOT NULL,
      loader_fee_reserve DECIMAL(20, 8) DEFAULT '0',
      receiver_frozen_amount NUMERIC(18, 2) DEFAULT 0,
      receiver_fee_reserve DECIMAL(20, 8) DEFAULT '0',
      status loader_order_status NOT NULL DEFAULT 'created',
      countdown_time countdown_time NOT NULL DEFAULT '30min',
      countdown_expires_at TIMESTAMP,
      countdown_stopped BOOLEAN NOT NULL DEFAULT false,
      loader_sent_payment_details BOOLEAN NOT NULL DEFAULT false,
      receiver_sent_payment_details BOOLEAN NOT NULL DEFAULT false,
      loader_marked_payment_sent BOOLEAN NOT NULL DEFAULT false,
      receiver_confirmed_payment BOOLEAN NOT NULL DEFAULT false,
      liability_type liability_type,
      receiver_liability_confirmed BOOLEAN NOT NULL DEFAULT false,
      loader_liability_confirmed BOOLEAN NOT NULL DEFAULT false,
      liability_locked_at TIMESTAMP,
      liability_deadline TIMESTAMP,
      cancelled_by VARCHAR REFERENCES users(id),
      cancel_reason TEXT,
      receiver_confirmed BOOLEAN NOT NULL DEFAULT false,
      loader_confirmed BOOLEAN NOT NULL DEFAULT false,
      loader_fee_deducted NUMERIC(18, 2) DEFAULT 0,
      receiver_fee_deducted NUMERIC(18, 2) DEFAULT 0,
      penalty_amount NUMERIC(18, 2) DEFAULT 0,
      penalty_paid_by VARCHAR REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      completed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS loader_order_messages (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id VARCHAR NOT NULL REFERENCES loader_orders(id) ON DELETE CASCADE,
      sender_id VARCHAR REFERENCES users(id),
      is_system BOOLEAN NOT NULL DEFAULT false,
      is_admin_message BOOLEAN NOT NULL DEFAULT false,
      content TEXT NOT NULL,
      file_url TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS loader_feedback (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id VARCHAR NOT NULL REFERENCES loader_orders(id) ON DELETE CASCADE,
      giver_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      feedback_type loader_feedback_type NOT NULL,
      comment TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS loader_stats (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      total_trades INTEGER NOT NULL DEFAULT 0,
      completed_trades INTEGER NOT NULL DEFAULT 0,
      cancelled_trades INTEGER NOT NULL DEFAULT 0,
      disputed_trades INTEGER NOT NULL DEFAULT 0,
      positive_feedback INTEGER NOT NULL DEFAULT 0,
      negative_feedback INTEGER NOT NULL DEFAULT 0,
      is_verified_vendor BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS loader_disputes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id VARCHAR NOT NULL REFERENCES loader_orders(id) ON DELETE CASCADE,
      opened_by VARCHAR NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      evidence_urls TEXT[] DEFAULT ARRAY[]::text[],
      status loader_dispute_status NOT NULL DEFAULT 'open',
      resolution TEXT,
      resolved_by VARCHAR REFERENCES users(id),
      winner_id VARCHAR REFERENCES users(id),
      loser_id VARCHAR REFERENCES users(id),
      admin_notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      resolved_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id),
      wallet_id VARCHAR NOT NULL REFERENCES wallets(id),
      amount NUMERIC(18, 8) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USDT',
      status TEXT NOT NULL DEFAULT 'pending',
      wallet_address TEXT,
      network TEXT,
      tx_hash TEXT,
      admin_notes TEXT,
      reviewed_by VARCHAR REFERENCES users(id),
      reviewed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `);
}

async function createBlockchainTables() {
  const blockchainEnums = [
    `DO $$ BEGIN CREATE TYPE deposit_status AS ENUM ('pending', 'confirming', 'confirmed', 'credited', 'sweep_pending', 'swept', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE sweep_status AS ENUM ('pending', 'processing', 'completed', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE withdrawal_status AS ENUM ('pending', 'approved', 'processing', 'sent', 'completed', 'rejected', 'failed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  ];

  for (const query of blockchainEnums) {
    await pool.query(query);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_index_counter (
      id VARCHAR PRIMARY KEY DEFAULT 'singleton',
      next_index INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    INSERT INTO wallet_index_counter (id, next_index, updated_at) 
    VALUES ('singleton', 0, now()) 
    ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS user_deposit_addresses (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      address TEXT NOT NULL UNIQUE,
      network TEXT NOT NULL DEFAULT 'BSC',
      derivation_index INTEGER NOT NULL,
      encrypted_private_key TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS blockchain_deposits (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id),
      deposit_address_id VARCHAR NOT NULL REFERENCES user_deposit_addresses(id),
      tx_hash TEXT NOT NULL UNIQUE,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      amount NUMERIC(18, 8) NOT NULL,
      token_contract TEXT NOT NULL,
      network TEXT NOT NULL DEFAULT 'BSC',
      block_number INTEGER NOT NULL,
      confirmations INTEGER NOT NULL DEFAULT 0,
      required_confirmations INTEGER NOT NULL DEFAULT 15,
      status deposit_status NOT NULL DEFAULT 'pending',
      credited_at TIMESTAMP,
      credited_transaction_id VARCHAR,
      detected_at TIMESTAMP NOT NULL DEFAULT now(),
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS deposit_sweeps (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      deposit_id VARCHAR NOT NULL REFERENCES blockchain_deposits(id),
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      amount NUMERIC(18, 8) NOT NULL,
      gas_fee NUMERIC(18, 8),
      tx_hash TEXT,
      status sweep_status NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TIMESTAMP,
      completed_at TIMESTAMP,
      error_message TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS platform_wallet_controls (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      withdrawals_enabled BOOLEAN NOT NULL DEFAULT true,
      deposits_enabled BOOLEAN NOT NULL DEFAULT true,
      sweeps_enabled BOOLEAN NOT NULL DEFAULT true,
      emergency_mode BOOLEAN NOT NULL DEFAULT false,
      hot_wallet_balance_cap NUMERIC(18, 8) NOT NULL DEFAULT 100000,
      per_user_daily_withdrawal_limit NUMERIC(18, 8) NOT NULL DEFAULT 10000,
      platform_daily_withdrawal_limit NUMERIC(18, 8) NOT NULL DEFAULT 100000,
      min_withdrawal_amount NUMERIC(18, 8) NOT NULL DEFAULT 10,
      withdrawal_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.1,
      withdrawal_fee_fixed NUMERIC(18, 8) NOT NULL DEFAULT 1,
      first_withdrawal_delay_minutes INTEGER NOT NULL DEFAULT 60,
      large_withdrawal_threshold NUMERIC(18, 8) NOT NULL DEFAULT 1000,
      large_withdrawal_delay_minutes INTEGER NOT NULL DEFAULT 120,
      required_confirmations INTEGER NOT NULL DEFAULT 15,
      wallet_unlocked BOOLEAN NOT NULL DEFAULT false,
      unlocked_at TIMESTAMP,
      unlocked_by VARCHAR REFERENCES users(id),
      updated_by VARCHAR REFERENCES users(id),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS blockchain_admin_actions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      admin_id VARCHAR NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id VARCHAR,
      previous_value JSONB,
      new_value JSONB,
      reason TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS user_withdrawal_limits (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      total_withdrawn NUMERIC(18, 8) NOT NULL DEFAULT 0,
      withdrawal_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS user_first_withdrawals (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      has_withdrawn BOOLEAN NOT NULL DEFAULT false,
      first_withdrawal_at TIMESTAMP,
      last_password_change_at TIMESTAMP,
      last_email_change_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `);

  const existingControls = await pool.query(`SELECT id FROM platform_wallet_controls LIMIT 1`);
  if (existingControls.rows.length === 0) {
    await pool.query(`INSERT INTO platform_wallet_controls DEFAULT VALUES`);
    console.log("Created default platform wallet controls");
  }
}

async function runMigrations() {
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT;`,
    `ALTER TABLE loader_ads ADD COLUMN IF NOT EXISTS loader_fee_reserve DECIMAL(20, 8) DEFAULT '0';`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS loader_fee_reserve DECIMAL(20, 8) DEFAULT '0';`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS receiver_fee_reserve DECIMAL(20, 8) DEFAULT '0';`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS countdown_time countdown_time NOT NULL DEFAULT '30min';`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS countdown_expires_at TIMESTAMP;`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS countdown_stopped BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS loader_sent_payment_details BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS receiver_sent_payment_details BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS loader_marked_payment_sent BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS receiver_confirmed_payment BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS receiver_liability_confirmed BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS loader_liability_confirmed BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS liability_locked_at TIMESTAMP;`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR;`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS penalty_amount NUMERIC(18, 2) DEFAULT 0;`,
    `ALTER TABLE loader_orders ADD COLUMN IF NOT EXISTS penalty_paid_by VARCHAR;`,
    `ALTER TABLE loader_order_messages ADD COLUMN IF NOT EXISTS is_admin_message BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE loader_order_messages ADD COLUMN IF NOT EXISTS file_url TEXT;`,
    `DO $$ BEGIN ALTER TYPE loader_order_status ADD VALUE IF NOT EXISTS 'awaiting_payment_details'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN ALTER TYPE loader_order_status ADD VALUE IF NOT EXISTS 'payment_details_sent'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN ALTER TYPE loader_order_status ADD VALUE IF NOT EXISTS 'payment_sent'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN ALTER TYPE loader_order_status ADD VALUE IF NOT EXISTS 'cancelled_auto'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN ALTER TYPE loader_order_status ADD VALUE IF NOT EXISTS 'cancelled_loader'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN ALTER TYPE loader_order_status ADD VALUE IF NOT EXISTS 'cancelled_receiver'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN ALTER TYPE loader_order_status ADD VALUE IF NOT EXISTS 'disputed'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN ALTER TYPE loader_order_status ADD VALUE IF NOT EXISTS 'resolved_loader_wins'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN ALTER TYPE loader_order_status ADD VALUE IF NOT EXISTS 'resolved_receiver_wins'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN ALTER TYPE loader_order_status ADD VALUE IF NOT EXISTS 'resolved_mutual'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `ALTER TABLE maintenance_settings ADD COLUMN IF NOT EXISTS custom_reason TEXT;`,
    `ALTER TABLE maintenance_settings ADD COLUMN IF NOT EXISTS expected_downtime TEXT;`,
    `ALTER TABLE maintenance_settings ADD COLUMN IF NOT EXISTS deposits_enabled BOOLEAN NOT NULL DEFAULT true;`,
    `ALTER TABLE maintenance_settings ADD COLUMN IF NOT EXISTS withdrawals_enabled BOOLEAN NOT NULL DEFAULT true;`,
    `ALTER TABLE maintenance_settings ADD COLUMN IF NOT EXISTS trading_enabled BOOLEAN NOT NULL DEFAULT true;`,
    `ALTER TABLE maintenance_settings ADD COLUMN IF NOT EXISTS login_enabled BOOLEAN NOT NULL DEFAULT true;`,
    `DO $$ BEGIN ALTER TYPE maintenance_mode ADD VALUE IF NOT EXISTS 'financial'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN ALTER TYPE maintenance_mode ADD VALUE IF NOT EXISTS 'trading'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN ALTER TYPE maintenance_mode ADD VALUE IF NOT EXISTS 'readonly'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  ];

  for (const migration of migrations) {
    try {
      await pool.query(migration);
    } catch (error: any) {
      if (error.code !== '42701') {
        console.error(`Migration error:`, error.message);
      }
    }
  }
}

async function createIndexesIfNotExist() {
  const indexQueries = [
    `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);`,
    `CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);`,
    `CREATE INDEX IF NOT EXISTS idx_kyc_user_id ON kyc(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc(status);`,
    `CREATE INDEX IF NOT EXISTS idx_vendor_profiles_user_id ON vendor_profiles(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_vendor_profiles_is_approved ON vendor_profiles(is_approved);`,
    `CREATE INDEX IF NOT EXISTS idx_vendor_profiles_country ON vendor_profiles(country);`,
    `CREATE INDEX IF NOT EXISTS idx_offers_vendor_id ON offers(vendor_id);`,
    `CREATE INDEX IF NOT EXISTS idx_offers_is_active ON offers(is_active);`,
    `CREATE INDEX IF NOT EXISTS idx_offers_currency ON offers(currency);`,
    `CREATE INDEX IF NOT EXISTS idx_offers_trade_intent ON offers(trade_intent);`,
    `CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);`,
    `CREATE INDEX IF NOT EXISTS idx_orders_vendor_id ON orders(vendor_id);`,
    `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`,
    `CREATE INDEX IF NOT EXISTS idx_orders_offer_id ON orders(offer_id);`,
    `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_order_id ON chat_messages(order_id);`,
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);`,
    `CREATE INDEX IF NOT EXISTS idx_disputes_order_id ON disputes(order_id);`,
    `CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);`,
    `CREATE INDEX IF NOT EXISTS idx_disputes_opened_by ON disputes(opened_by);`,
    `CREATE INDEX IF NOT EXISTS idx_dispute_chat_messages_dispute_id ON dispute_chat_messages(dispute_id);`,
    `CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_wallets_currency ON wallets(currency);`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_ratings_vendor_id ON ratings(vendor_id);`,
    `CREATE INDEX IF NOT EXISTS idx_ratings_order_id ON ratings(order_id);`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_exchanges_is_active ON exchanges(is_active);`,
    `CREATE INDEX IF NOT EXISTS idx_exchanges_sort_order ON exchanges(sort_order);`,
    `CREATE INDEX IF NOT EXISTS idx_social_posts_author_id ON social_posts(author_id);`,
    `CREATE INDEX IF NOT EXISTS idx_social_posts_created_at ON social_posts(created_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_social_posts_is_deleted ON social_posts(is_deleted);`,
    `CREATE INDEX IF NOT EXISTS idx_social_comments_post_id ON social_comments(post_id);`,
    `CREATE INDEX IF NOT EXISTS idx_social_comments_author_id ON social_comments(author_id);`,
    `CREATE INDEX IF NOT EXISTS idx_social_likes_post_id ON social_likes(post_id);`,
    `CREATE INDEX IF NOT EXISTS idx_social_likes_user_id ON social_likes(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_social_dislikes_post_id ON social_dislikes(post_id);`,
    `CREATE INDEX IF NOT EXISTS idx_social_dislikes_user_id ON social_dislikes(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_social_mutes_user_id ON social_mutes(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_loader_ads_loader_id ON loader_ads(loader_id);`,
    `CREATE INDEX IF NOT EXISTS idx_loader_ads_is_active ON loader_ads(is_active);`,
    `CREATE INDEX IF NOT EXISTS idx_loader_orders_ad_id ON loader_orders(ad_id);`,
    `CREATE INDEX IF NOT EXISTS idx_loader_orders_loader_id ON loader_orders(loader_id);`,
    `CREATE INDEX IF NOT EXISTS idx_loader_orders_receiver_id ON loader_orders(receiver_id);`,
    `CREATE INDEX IF NOT EXISTS idx_loader_orders_status ON loader_orders(status);`,
    `CREATE INDEX IF NOT EXISTS idx_loader_order_messages_order_id ON loader_order_messages(order_id);`,
  ];

  for (const query of indexQueries) {
    await pool.query(query);
  }
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

async function seedExchanges() {
  const defaultExchanges = [
    { name: "Tether USD", symbol: "USDT", description: "Tether stablecoin pegged to USD", sortOrder: 1 },
    { name: "USD Coin", symbol: "USDC", description: "USD Coin stablecoin", sortOrder: 2 },
    { name: "Bitcoin", symbol: "BTC", description: "Bitcoin cryptocurrency", sortOrder: 3 },
    { name: "Ethereum", symbol: "ETH", description: "Ethereum cryptocurrency", sortOrder: 4 },
    { name: "Binance USD", symbol: "BUSD", description: "Binance USD stablecoin", sortOrder: 5 },
  ];

  for (const exchange of defaultExchanges) {
    try {
      const existing = await pool.query(
        `SELECT id FROM exchanges WHERE symbol = $1`,
        [exchange.symbol]
      );
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO exchanges (name, symbol, description, sort_order, is_active) VALUES ($1, $2, $3, $4, true)`,
          [exchange.name, exchange.symbol, exchange.description, exchange.sortOrder]
        );
        console.log(`Exchange ${exchange.symbol} seeded.`);
      }
    } catch (error: any) {
      if (error.code !== '23505') {
        console.error(`Error seeding exchange ${exchange.symbol}:`, error.message);
      }
    }
  }
}


export async function initializeDatabase(): Promise<void> {
  console.log("Initializing database...");
  
  try {
    await createEnumsIfNotExist();
    console.log("Enums created/verified.");
    
    await createTablesIfNotExist();
    console.log("Tables created/verified.");
    
    await createBlockchainTables();
    console.log("Blockchain wallet tables created/verified.");
    
    await runMigrations();
    console.log("Migrations applied.");
    
    await createIndexesIfNotExist();
    console.log("Indexes created/verified.");
    
    await seedAdminUsers();
    console.log("Admin users seeded/verified.");
    
    await seedExchanges();
    console.log("Exchanges seeded/verified.");
    
    console.log("Database initialization complete!");
  } catch (error) {
    console.error("Database initialization failed:", error);
    throw error;
  }
}
