import { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../utils/jwt";

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "No token provided" });
      return;
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    
    req.user = payload;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: "Insufficient permissions" });
      return;
    }

    next();
  };
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  return requireRole("admin", "support")(req, res, next);
}

export function requireDisputeAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  return requireRole("admin", "dispute_admin")(req, res, next);
}
