// Centralized configuration validation for production safety.
// This module enforces presence and minimal validation of critical secrets
// and configuration values. It throws early to prevent the app from
// starting in an insecure state.

export function validateConfig() {
  const missing: string[] = [];

  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");
  if (!process.env.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");
  if (!process.env.ADMIN_KAI_PASSWORD) missing.push("ADMIN_KAI_PASSWORD");
  if (!process.env.ADMIN_TURBO_PASSWORD) missing.push("ADMIN_TURBO_PASSWORD");
  if (!process.env.CS_PASSWORD) missing.push("CS_PASSWORD");
  if (!process.env.FINANCE_MANAGER_PASSWORD) missing.push("FINANCE_MANAGER_PASSWORD");

  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 characters for AES-256-GCM");
  }

  if (missing.length > 0) {
    console.error("❌ CRITICAL: Missing required environment variables:", missing.join(", "));
    throw new Error("Missing required environment variables: " + missing.join(", "));
  }

  // Warn about high-risk secrets that should be rotated immediately if found
  if (process.env.MASTER_WALLET_PRIVATE_KEY) {
    console.warn("⚠️ MASTER_WALLET_PRIVATE_KEY is set — ensure this key was rotated if previously committed");
  }
}

export function redactObjectForLogs(obj: any) {
  const SENSITIVE_KEYS = [
    "password",
    "pwd",
    "secret",
    "token",
    "jwt",
    "privateKey",
    "master_wallet_private_key",
    "encrypted_private_key",
    "hd_seed",
    "mnemonic",
    "twoFactorSecret",
    "otp",
    "authorization",
  ];

  function redact(value: any, key?: string): any {
    if (key && SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) return "[REDACTED]";
    if (typeof value === 'string') {
      // redact likely JWTs or long hex/private keys
      if (/^[A-Za-z0-9-_]{20,}$/.test(value) && (value.includes('.') || value.length > 40)) return "[REDACTED]";
      return value;
    }
    if (Array.isArray(value)) return value.map(v => redact(v));
    if (value && typeof value === 'object') {
      const out: any = {};
      for (const k of Object.keys(value)) {
        try {
          out[k] = redact(value[k], k);
        } catch (err) {
          out[k] = "[REDACTED]";
        }
      }
      return out;
    }
    return value;
  }

  return redact(obj);
}

export default { validateConfig, redactObjectForLogs };
