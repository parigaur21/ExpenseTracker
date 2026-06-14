/**
 * Unit tests for auth middleware (verifyToken & requireAuth)
 */
import { verifyToken, requireAuth, AuthRequest } from '../auth';
import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

function mockReq(headers: Record<string, string> = {}): AuthRequest {
  return { headers } as AuthRequest;
}

function mockRes(): Response {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
}

describe('verifyToken', () => {
  it('attaches userId when a valid Bearer token is present', () => {
    const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: '1h' });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    const next: NextFunction = jest.fn();

    verifyToken(req, res, next);

    expect(req.userId).toBe('user-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next without userId when no Authorization header is present', () => {
    const req = mockReq();
    const res = mockRes();
    const next: NextFunction = jest.fn();

    verifyToken(req, res, next);

    expect(req.userId).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next without userId when the token is invalid', () => {
    const req = mockReq({ authorization: 'Bearer invalid-token' });
    const res = mockRes();
    const next: NextFunction = jest.fn();

    verifyToken(req, res, next);

    expect(req.userId).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next without userId when authorization is not Bearer scheme', () => {
    const req = mockReq({ authorization: 'Basic abc123' });
    const res = mockRes();
    const next: NextFunction = jest.fn();

    verifyToken(req, res, next);

    expect(req.userId).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('handles expired tokens gracefully', () => {
    const token = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: '-1s' });
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    const next: NextFunction = jest.fn();

    verifyToken(req, res, next);

    expect(req.userId).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('requireAuth', () => {
  it('calls next when userId is present', () => {
    const req = mockReq();
    req.userId = 'user-123';
    const res = mockRes();
    const next: NextFunction = jest.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when userId is missing', () => {
    const req = mockReq();
    const res = mockRes();
    const next: NextFunction = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });
});
