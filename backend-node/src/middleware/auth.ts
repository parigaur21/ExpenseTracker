// src/middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * verifyToken parses the JWT if present and attaches req.userId.
 * It does **not** block the request – use requireAuth for protected routes.
 */
export const verifyToken = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
      req.userId = payload.userId;
    } catch (e) {
      // silently ignore – route can decide
    }
  }
  next();
};

/**
 * requireAuth ensures a valid JWT is present. Use after verifyToken.
 */
export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
};
