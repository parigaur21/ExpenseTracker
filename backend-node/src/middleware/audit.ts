import { Request, Response, NextFunction } from 'express';
import prisma from '../prisma';
import { AuthRequest } from './auth';

export const auditLog = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  // Fire-and-forget audit log
  const userId = req.userId || null;
  const method = req.method;
  const path = req.originalUrl;
  const action = `${method} ${path}`;

  try {
    await prisma.auditLog.create({
      data: {
        actor_user_id: userId,
        action,
        entity_type: 'request',
        details: JSON.stringify({ method, path, body: req.body }),
      },
    });
  } catch (e) {
    console.error('Audit log failed:', e);
  }
  next();
};
