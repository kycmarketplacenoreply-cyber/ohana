import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Enhanced database URL validation with SSL support for Render
function getDatabaseConfig() {
  let dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error("❌ CRITICAL ERROR: DATABASE_URL not set!");
    throw new Error(
      "DATABASE_URL must be set. Configure it in Render environment variables with key 'DATABASE_URL'"
    );
  }
  
  // Validate it looks like a postgres URL
  if (!dbUrl.includes("postgresql://") && !dbUrl.includes("postgres://")) {
    console.error("❌ ERROR: DATABASE_URL doesn't look like a PostgreSQL connection string");
    throw new Error("Invalid DATABASE_URL format");
  }
  
  // Extract and log hostname for debugging
  const match = dbUrl.match(/@([^:/]+)/);
  if (match) {
    console.log("✅ Connecting to database at:", match[1]);
  }
  
  // Add SSL parameters to URL for Render PostgreSQL
  // Render requires ?sslmode=require for secure connections
  if (!dbUrl.includes("sslmode")) {
    if (dbUrl.includes("?")) {
      dbUrl += "&sslmode=require";
    } else {
      dbUrl += "?sslmode=require";
    }
    console.log("🔒 Added sslmode=require to connection string");
  }
  
  // Create pool config with both URL params AND pool-level SSL
  const poolConfig: any = { 
    connectionString: dbUrl
  };
  
  // SSL configuration at the pool level. Prefer a provided CA certificate
  // via the `PG_SSL_ROOT_CERT` env var. This enables full verification
  // of the Postgres server certificate and is the recommended production
  // configuration for Render or any managed Postgres.
  if (process.env.PG_SSL_ROOT_CERT) {
    poolConfig.ssl = { ca: process.env.PG_SSL_ROOT_CERT, rejectUnauthorized: true } as any;
    console.log('🔒 Using PG_SSL_ROOT_CERT for DB TLS verification (rejectUnauthorized=true)');
  } else if (process.env.ALLOW_INSECURE_DB_TLS === 'true') {
    // Explicit emergency override (not recommended). Only enable if you
    // understand the risks. This will allow connections to servers using
    // self-signed certs without requiring a CA.
    poolConfig.ssl = { rejectUnauthorized: false } as any;
    // Some underlying TLS consumers (or older libraries) still consult
    // the global `NODE_TLS_REJECT_UNAUTHORIZED`. In emergency mode set it
    // so all TLS checks are relaxed to avoid DEPTH_ZERO_SELF_SIGNED_CERT
    // failures while you restore a proper CA certificate.
    try {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    } catch (e) {
      /* ignore */
    }
    console.warn('⚠️ ALLOW_INSECURE_DB_TLS=true — DB TLS verification DISABLED (emergency mode)');
  } else if (process.env.NODE_ENV === 'production') {
    // In production we require an explicit CA or an explicit emergency flag.
    console.error('❌ Missing PG_SSL_ROOT_CERT in production. Aborting startup.');
    console.error('Set PG_SSL_ROOT_CERT (PEM) in Render environment variables, or set ALLOW_INSECURE_DB_TLS=true as a temporary emergency workaround.');
    throw new Error('PG_SSL_ROOT_CERT is required in production for secure DB TLS verification');
  } else {
    // Development fallback: allow permissive TLS so local dev environments
    // without a CA don't break. This branch keeps developer experience
    // convenient while production remains strict.
    poolConfig.ssl = { rejectUnauthorized: false } as any;
    console.warn('⚠️ No PG_SSL_ROOT_CERT provided; running with DB TLS verification disabled (development fallback)');
  }

  console.log('✅ SSL/TLS: configured for Postgres connection');
  
  return poolConfig;
}

const poolConfig = getDatabaseConfig();
export const pool = new Pool(poolConfig);
export const db = drizzle(pool, { schema });
