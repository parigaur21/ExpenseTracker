import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { ApiError } from './http.js';
import { query } from './db.js';

export type AuthUser = { id: string; display_name: string; email: string };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const secret = () => process.env.JWT_SECRET ?? 'change-me-to-a-long-production-secret';

export function issueToken(user: AuthUser) {
  return jwt.sign({ email: user.email, name: user.display_name }, secret(), { subject: user.id, expiresIn: '4h' });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) throw new ApiError(401, 'UNAUTHORIZED', 'Missing bearer token');
  try {
    const payload = jwt.verify(header.slice(7), secret());
    const userId = typeof payload === 'object' ? payload.sub : undefined;
    if (!userId) throw new Error('Missing subject');
    const { rows } = await query<AuthUser>('select id, display_name, email from users where id = $1', [userId]);
    if (!rows[0]) throw new Error('Unknown user');
    req.user = rows[0];
    next();
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired token');
  }
}

export const registerSchema = z.object({
  displayName: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function register(input: z.infer<typeof registerSchema>) {
  const existing = await query('select id from users where lower(email) = lower($1) or lower(username) = lower($2)', [input.email, input.username]);
  if (existing.rowCount) throw new ApiError(409, 'USER_EXISTS', 'Email or username is already registered');
  const hash = await bcrypt.hash(input.password, 12);
  const user = {
    id: randomUUID(),
    displayName: input.displayName.trim(),
    username: input.username.trim(),
    email: input.email.trim().toLowerCase()
  };
  await query(
    'insert into users (id, display_name, username, email, password_hash) values ($1, $2, $3, $4, $5)',
    [user.id, user.displayName, user.username, user.email, hash]
  );
  return { token: issueToken({ id: user.id, display_name: user.displayName, email: user.email }), userId: user.id, displayName: user.displayName, email: user.email };
}

export async function login(input: z.infer<typeof loginSchema>) {
  const { rows } = await query<{ id: string; display_name: string; email: string; password_hash: string }>(
    'select id, display_name, email, password_hash from users where lower(email) = lower($1)',
    [input.email]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    throw new ApiError(401, 'BAD_CREDENTIALS', 'Invalid email or password');
  }
  return { token: issueToken(user), userId: user.id, displayName: user.display_name, email: user.email };
}

