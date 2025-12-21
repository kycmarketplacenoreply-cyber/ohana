-- Add auto_withdrawal_enabled and kyc_required columns to maintenance_settings table
-- These columns enable automatic withdrawals without admin approval and require KYC for posting ads

ALTER TABLE maintenance_settings 
ADD COLUMN IF NOT EXISTS auto_withdrawal_enabled BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN IF NOT EXISTS kyc_required BOOLEAN DEFAULT FALSE NOT NULL;
