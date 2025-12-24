import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Enhanced database URL validation and debugging with SSL support
function getDatabaseUrl(): string {
  const dbUrl = process.env.DATABASE_URL;
  
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
  
  return dbUrl;
}

const connectionString = getDatabaseUrl();

// Create Pool with SSL required for Render PostgreSQL
const poolConfig: any = { 
  connectionString 
};

// Enable SSL for production (Render requires this)
if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL) {
  poolConfig.ssl = {
    rejectUnauthorized: false // Required for Render's managed PostgreSQL
  };
}

console.log("🔒 SSL/TLS:", process.env.NODE_ENV === "production" ? "ENABLED (required for Render)" : "DISABLED (dev mode)");

export const pool = new Pool(poolConfig);
export const db = drizzle(pool, { schema });
