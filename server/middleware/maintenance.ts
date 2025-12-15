import { Response, NextFunction } from "express";
import { storage } from "../storage";
import { AuthRequest } from "./auth";

const AUTH_WHITELIST = [
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/me",
];

const READONLY_ALLOWED_METHODS = ["GET", "HEAD", "OPTIONS"];

function isWhitelistedAuthRoute(path: string): boolean {
  return AUTH_WHITELIST.some(route => path === route || path.startsWith(route + "/"));
}

function isReadOnlyMethod(method: string): boolean {
  return READONLY_ALLOWED_METHODS.includes(method.toUpperCase());
}

export async function checkMaintenanceMode(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
  requiredFeature?: "deposits" | "withdrawals" | "trading" | "login"
): Promise<void> {
  try {
    const settings = await storage.getMaintenanceSettings();
    
    if (!settings || settings.mode === "none") {
      return next();
    }

    const userRole = req.user?.role;
    const isAdmin = userRole === "admin";
    const isStaff = ["admin", "support", "finance_manager", "dispute_admin"].includes(userRole || "");
    const requestPath = req.path;
    const requestMethod = req.method;

    if (isAdmin) {
      return next();
    }

    if (settings.mode === "full") {
      res.status(503).json({ 
        message: "Platform is under full maintenance. Please try again later.",
        maintenanceMode: settings.mode
      });
      return;
    }

    if (settings.mode === "readonly") {
      if (isWhitelistedAuthRoute(requestPath)) {
        return next();
      }
      
      if (isReadOnlyMethod(requestMethod)) {
        return next();
      }
      
      if (isStaff) {
        return next();
      }
      
      res.status(503).json({ 
        message: "Platform is in read-only mode. Write operations are temporarily disabled.",
        maintenanceMode: settings.mode
      });
      return;
    }

    if (settings.mode === "trading") {
      if (isWhitelistedAuthRoute(requestPath)) {
        return next();
      }
      
      if (requiredFeature === "trading" && !settings.tradingEnabled) {
        res.status(503).json({ 
          message: "Trading/Order creation is temporarily disabled for maintenance.",
          maintenanceMode: settings.mode
        });
        return;
      }
      
      if (requiredFeature === "deposits" && !settings.depositsEnabled) {
        res.status(503).json({ 
          message: "Deposits are temporarily disabled for maintenance.",
          maintenanceMode: settings.mode
        });
        return;
      }
      
      if (requiredFeature === "withdrawals" && !settings.withdrawalsEnabled) {
        res.status(503).json({ 
          message: "Withdrawals are temporarily disabled for maintenance.",
          maintenanceMode: settings.mode
        });
        return;
      }
      
      return next();
    }

    if (settings.mode === "financial") {
      if (isWhitelistedAuthRoute(requestPath)) {
        return next();
      }
      
      if (requiredFeature === "deposits" && !settings.depositsEnabled) {
        res.status(503).json({ 
          message: "Deposits are temporarily disabled for maintenance.",
          maintenanceMode: settings.mode
        });
        return;
      }
      
      if (requiredFeature === "withdrawals" && !settings.withdrawalsEnabled) {
        res.status(503).json({ 
          message: "Withdrawals are temporarily disabled for maintenance.",
          maintenanceMode: settings.mode
        });
        return;
      }
      
      return next();
    }

    if (requiredFeature) {
      if (requiredFeature === "deposits" && !settings.depositsEnabled) {
        res.status(503).json({ 
          message: "Deposits are temporarily disabled for maintenance.",
          maintenanceMode: settings.mode
        });
        return;
      }

      if (requiredFeature === "withdrawals" && !settings.withdrawalsEnabled) {
        res.status(503).json({ 
          message: "Withdrawals are temporarily disabled for maintenance.",
          maintenanceMode: settings.mode
        });
        return;
      }

      if (requiredFeature === "trading" && !settings.tradingEnabled) {
        res.status(503).json({ 
          message: "Trading/Order creation is temporarily disabled for maintenance.",
          maintenanceMode: settings.mode
        });
        return;
      }

      if (requiredFeature === "login" && !settings.loginEnabled) {
        res.status(503).json({ 
          message: "Login is temporarily disabled for maintenance.",
          maintenanceMode: settings.mode
        });
        return;
      }
    }

    next();
  } catch (error) {
    next();
  }
}

export function requireDepositsEnabled(req: AuthRequest, res: Response, next: NextFunction) {
  return checkMaintenanceMode(req, res, next, "deposits");
}

export function requireWithdrawalsEnabled(req: AuthRequest, res: Response, next: NextFunction) {
  return checkMaintenanceMode(req, res, next, "withdrawals");
}

export function requireTradingEnabled(req: AuthRequest, res: Response, next: NextFunction) {
  return checkMaintenanceMode(req, res, next, "trading");
}

export function requireLoginEnabled(req: AuthRequest, res: Response, next: NextFunction) {
  return checkMaintenanceMode(req, res, next, "login");
}
