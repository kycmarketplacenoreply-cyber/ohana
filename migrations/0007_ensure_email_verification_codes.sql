-- Ensure email_verification_codes table exists
-- This migration ensures the table is created if it doesn't exist

CREATE TABLE IF NOT EXISTS "email_verification_codes" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "email_verification_codes_user_id_idx" ON "email_verification_codes"("user_id");
CREATE INDEX IF NOT EXISTS "email_verification_codes_expires_at_idx" ON "email_verification_codes"("expires_at");
