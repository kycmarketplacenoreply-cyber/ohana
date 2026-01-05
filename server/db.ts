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
  // via the `PG_SSL_ROOT_CERT` env var. This allows verify-full style
  // verification without disabling TLS checks globally.
  poolConfig.ssl = {
    rejectUnauthorized: true
  } as any;

  // If the deploy environment supplies a PEM-encoded CA certificate in
  // `PG_SSL_ROOT_CERT`, use it to verify the DB server's certificate.
  if (process.env.PG_SSL_ROOT_CERT) {
    poolConfig.ssl.ca = process.env.PG_SSL_ROOT_CERT;
    console.log('🔒 Using PG_SSL_ROOT_CERT for DB TLS verification');
  } else {
    // No CA provided: fall back to an permissive mode so the app can start.
    // This is less secure — prefer setting `PG_SSL_ROOT_CERT` in Render.
    poolConfig.ssl.rejectUnauthorized = false;
    console.warn('⚠️ No PG_SSL_ROOT_CERT provided; TLS verification disabled for DB connection');

    // As a last resort, set Node's global TLS reject flag so third-party
    // libraries also accept self-signed certs in environments where that
    // is required. Keep this inside a try/catch to avoid accidental failures.
    try {
      if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        console.warn('⚠️ NODE_TLS_REJECT_UNAUTHORIZED set to 0 to allow self-signed DB certs');
      }
    } catch (err) {
      // Non-fatal.
    }
  }
  
  console.log("✅ SSL/TLS: ENABLED for Render PostgreSQL");
  
  return poolConfig;
}

const poolConfig = getDatabaseConfig();
export const pool = new Pool(poolConfig);
export const db = drizzle(pool, { schema });
