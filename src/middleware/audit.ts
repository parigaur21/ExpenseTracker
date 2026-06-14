// src/middleware/audit.ts
import { Request, Response, NextFunction } from "express";
import { prisma } from "../server";

export const auditLog = async (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const originalJson = res.json.bind(res);
  // Capture response body after handler
  res.json = async (body: any) => {
    const duration = Date.now() - start;
    const userId = (req as any).userId || null;
    const groupId = (req as any).groupId || null;
    const method = req.method;
    const path = req.path;
    const action = `${method} ${path}`;
    const entityType = body?.entity?.type || null;
    const entityId = body?.entity?.id || null;
    await prisma.audit_logs.create({
      data: {
        actor_user_id: userId,
        group_id: groupId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        details: JSON.stringify(body),
      },
    });
    return originalJson(body);
  };
  next();
};
