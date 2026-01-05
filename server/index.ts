import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initializeDatabase } from "./init-db";
import { validateConfig, redactObjectForLogs } from "./config";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { startDepositScanner } from "./services/depositScanner";
import { restoreMasterWalletState } from "./services/blockchain";

const app = express();
app.set('trust proxy', 1);

app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(express.json({
  limit: process.env.REQUEST_SIZE_LIMIT || '100kb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

app.use(express.urlencoded({ extended: false }));
app.use(express.urlencoded({ extended: false, limit: process.env.REQUEST_SIZE_LIMIT || '100kb' }));

// Security headers
app.use(helmet());

// CORS - restrict to a configured origin in production
const allowedOrigin = process.env.FRONTEND_ORIGIN || '';
if (process.env.NODE_ENV === 'production') {
  if (!allowedOrigin) {
    console.warn('⚠️ FRONTEND_ORIGIN not set; CORS is restrictive by default.');
  }
  app.use(cors({ origin: allowedOrigin || false }));
} else {
  app.use(cors());
}

// Basic rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Serve uploaded files statically (for chat attachments, profile pics, KYC docs)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        try {
          const safe = redactObjectForLogs(capturedJsonResponse);
          logLine += ` :: ${JSON.stringify(safe)}`;
        } catch (err) {
          logLine += ` :: [REDACTED RESPONSE]`;
        }
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Validate critical configuration before startup (fail-fast)
  validateConfig();

  await initializeDatabase();
  await registerRoutes(httpServer, app);
  
  // Restore master wallet lock state from database
  await restoreMasterWalletState();

  // Auto-delete posts older than 24 hours - run on startup and every hour
  const cleanupOldPosts = async () => {
    try {
      const deletedCount = await storage.deleteOldPosts();
      if (deletedCount > 0) {
        log(`Auto-deleted ${deletedCount} posts older than 24 hours`);
      }
    } catch (error) {
      console.error("Failed to cleanup old posts:", error);
    }
  };
  
  // Run cleanup on startup
  await cleanupOldPosts();
  
  // Run cleanup every hour
  setInterval(cleanupOldPosts, 60 * 60 * 1000);

  // Start deposit scanner - runs every 60 seconds to detect and credit deposits
  startDepositScanner(60000);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
