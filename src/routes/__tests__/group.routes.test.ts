/**
 * Integration tests for group routes.
 */
import request from 'supertest';
import { app } from '../../server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';

jest.mock('../../prisma', () => ({
  __esModule: true,
  default: {
    groupMembership: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    group: {
      create: jest.fn(),
    },
  },
}));

import prisma from '../../prisma';

const mockGroupMembershipFindMany = prisma.groupMembership.findMany as jest.Mock;
const mockGroupMembershipCreate = prisma.groupMembership.create as jest.Mock;
const mockGroupCreate = prisma.group.create as jest.Mock;

function makeToken(userId: string = 'user-1') {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

describe('GET /api/groups', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/groups');
    expect(res.status).toBe(401);
  });

  it('returns groups the user belongs to', async () => {
    mockGroupMembershipFindMany.mockResolvedValue([
      { group: { id: 'g1', name: 'Trip', base_currency: 'INR' } },
      { group: { id: 'g2', name: 'Rent', base_currency: 'USD' } },
    ]);

    const res = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(2);
    expect(res.body.groups[0].name).toBe('Trip');
  });
});

describe('POST /api/groups', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('creates a group and adds creator as ADMIN member', async () => {
    const createdGroup = { id: 'g-new', name: 'Vacation', base_currency: 'INR', created_by: 'user-1' };
    mockGroupCreate.mockResolvedValue(createdGroup);
    mockGroupMembershipCreate.mockResolvedValue({ id: 'mem-1' });

    const res = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Vacation' });

    expect(res.status).toBe(201);
    expect(res.body.group.name).toBe('Vacation');
    expect(mockGroupMembershipCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'ADMIN' }),
      })
    );
  });
});

describe('GET /api/groups/:groupId/members', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns members of a group', async () => {
    mockGroupMembershipFindMany.mockResolvedValue([
      { user: { id: 'u1', display_name: 'Alice', username: 'alice', email: 'a@test.com' }, role: 'ADMIN' },
      { user: { id: 'u2', display_name: 'Bob', username: 'bob', email: 'b@test.com' }, role: 'MEMBER' },
    ]);

    const res = await request(app)
      .get('/api/groups/g1/members')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(2);
  });
});

describe('POST /api/groups/:groupId/members', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when userId is missing', async () => {
    const res = await request(app)
      .post('/api/groups/g1/members')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('adds a member to the group', async () => {
    mockGroupMembershipCreate.mockResolvedValue({ id: 'mem-2', group_id: 'g1', user_id: 'u2', role: 'MEMBER' });

    const res = await request(app)
      .post('/api/groups/g1/members')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ userId: 'u2' });

    expect(res.status).toBe(201);
    expect(res.body.membership.role).toBe('MEMBER');
  });
});
