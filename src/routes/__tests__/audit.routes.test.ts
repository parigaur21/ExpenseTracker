/**
 * Integration tests for audit routes.
 */
import request from 'supertest';
import { app } from '../../server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

jest.mock('../../prisma', () => ({
  __esModule: true,
  default: {
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import prisma from '../../prisma';

const mockAuditLogFindMany = prisma.auditLog.findMany as jest.Mock;
const mockAuditLogCount = prisma.auditLog.count as jest.Mock;

function makeToken(userId: string = 'user-1') {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

describe('GET /api/audit', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/audit');
    expect(res.status).toBe(401);
  });

  it('returns paginated audit logs', async () => {
    mockAuditLogFindMany.mockResolvedValue([
      { id: 'a1', action: 'POST /api/groups', entity_type: 'request', actor: { id: 'u1', display_name: 'Alice', username: 'alice' }, group: null },
    ]);
    mockAuditLogCount.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('respects limit and offset query params', async () => {
    mockAuditLogFindMany.mockResolvedValue([]);
    mockAuditLogCount.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/audit?limit=10&offset=5')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(10);
    expect(res.body.offset).toBe(5);
  });

  it('caps limit at 200', async () => {
    mockAuditLogFindMany.mockResolvedValue([]);
    mockAuditLogCount.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/audit?limit=999')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(200);
  });
});

describe('GET /api/audit/group/:groupId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns audit logs for a specific group', async () => {
    mockAuditLogFindMany.mockResolvedValue([
      { id: 'a2', action: 'POST /api/expenses/g1', entity_type: 'request', actor: { id: 'u1', display_name: 'Alice', username: 'alice' } },
    ]);

    const res = await request(app)
      .get('/api/audit/group/g1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
  });
});
