/**
 * Integration tests for /api/auth routes.
 * We mock Prisma to avoid needing a real database.
 */
import request from 'supertest';
import { app } from '../../server';
import bcrypt from 'bcrypt';

jest.mock('../../prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import prisma from '../../prisma';

const mockUserFindFirst = prisma.user.findFirst as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserCreate = prisma.user.create as jest.Mock;

describe('POST /api/auth/register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ display_name: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing');
  });

  it('returns 409 when user already exists', async () => {
    mockUserFindFirst.mockResolvedValue({ id: 'existing' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        display_name: 'Test User',
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(409);
  });

  it('creates a user and returns 201', async () => {
    mockUserFindFirst.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({
      id: 'new-user-id',
      username: 'newuser',
      email: 'new@example.com',
      display_name: 'New User',
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        display_name: 'New User',
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-user-id');
    expect(res.body.username).toBe('newuser');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when credentials are missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 401 for non-existent user', async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'pass' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong password', async () => {
    const hash = await bcrypt.hash('correct-pass', 10);
    mockUserFindUnique.mockResolvedValue({
      id: 'u1',
      username: 'testuser',
      password_hash: hash,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'wrong-pass' });

    expect(res.status).toBe(401);
  });

  it('returns token on successful login', async () => {
    const hash = await bcrypt.hash('correct-pass', 10);
    mockUserFindUnique.mockResolvedValue({
      id: 'u1',
      username: 'testuser',
      email: 'test@example.com',
      display_name: 'Test User',
      password_hash: hash,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'correct-pass' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('testuser');
  });
});

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
