/**
 * Integration tests for settlement routes.
 */
import request from 'supertest';
import { app } from '../../server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

jest.mock('../../prisma', () => ({
  __esModule: true,
  default: {
    group: { findUnique: jest.fn() },
    settlement: { create: jest.fn(), findMany: jest.fn() },
  },
}));

jest.mock('../../services/currency', () => ({
  fetchRate: jest.fn().mockResolvedValue(1),
}));

import prisma from '../../prisma';

const mockGroupFindUnique = prisma.group.findUnique as jest.Mock;
const mockSettlementCreate = prisma.settlement.create as jest.Mock;
const mockSettlementFindMany = prisma.settlement.findMany as jest.Mock;

function makeToken(userId: string = 'user-1') {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

describe('POST /api/settlements/:groupId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/settlements/g1').send({});
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/settlements/g1')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ paidBy: 'u1' });

    expect(res.status).toBe(400);
  });

  it('returns 404 when group does not exist', async () => {
    mockGroupFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/settlements/g-nonexistent')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        paidBy: 'u1', paidTo: 'u2', amount: 50, currency: 'INR', settlementDate: '2024-01-01',
      });

    expect(res.status).toBe(404);
  });

  it('creates a settlement successfully', async () => {
    mockGroupFindUnique.mockResolvedValue({ id: 'g1', base_currency: 'INR' });
    mockSettlementCreate.mockResolvedValue({
      id: 's1', group_id: 'g1', paid_by_user_id: 'u1', paid_to_user_id: 'u2',
      original_amount: 50, converted_amount: 50,
    });

    const res = await request(app)
      .post('/api/settlements/g1')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({
        paidBy: 'u1', paidTo: 'u2', amount: 50, currency: 'INR', settlementDate: '2024-01-01',
      });

    expect(res.status).toBe(201);
    expect(res.body.settlement.id).toBe('s1');
  });
});

describe('GET /api/settlements/:groupId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns settlements for a group', async () => {
    mockSettlementFindMany.mockResolvedValue([
      {
        id: 's1', converted_amount: 50,
        payer: { id: 'u1', display_name: 'Alice' },
        payee: { id: 'u2', display_name: 'Bob' },
      },
    ]);

    const res = await request(app)
      .get('/api/settlements/g1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.settlements).toHaveLength(1);
  });
});
