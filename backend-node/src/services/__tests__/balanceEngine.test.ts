/**
 * Unit tests for balanceEngine.ts
 *
 * We mock the Prisma client so these tests run without a database.
 */
import { computeGroupBalances, computeSimplifiedSettlements } from '../balanceEngine';

// Mock the prisma module
jest.mock('../../prisma', () => ({
  __esModule: true,
  default: {
    expense: { findMany: jest.fn() },
    settlement: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  },
}));

import prisma from '../../prisma';

const mockExpenseFindMany = prisma.expense.findMany as jest.Mock;
const mockSettlementFindMany = prisma.settlement.findMany as jest.Mock;
const mockUserFindMany = prisma.user.findMany as jest.Mock;

describe('computeGroupBalances', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when no expenses or settlements exist', async () => {
    mockExpenseFindMany.mockResolvedValue([]);
    mockSettlementFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([]);

    const result = await computeGroupBalances('group-1');
    expect(result).toEqual([]);
  });

  it('computes balances for a simple equal split between 2 users', async () => {
    // Alice paid 100, split equally with Bob
    mockExpenseFindMany.mockResolvedValue([
      {
        id: 'exp-1',
        paid_by_user_id: 'alice',
        converted_amount: 100,
        splits: [
          { user_id: 'alice', amount: 50 },
          { user_id: 'bob', amount: 50 },
        ],
      },
    ]);
    mockSettlementFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([
      { id: 'alice', display_name: 'Alice', username: 'alice' },
      { id: 'bob', display_name: 'Bob', username: 'bob' },
    ]);

    const result = await computeGroupBalances('group-1');

    const alice = result.find(b => b.userId === 'alice');
    const bob = result.find(b => b.userId === 'bob');

    // Alice paid 100, owes 50 => net +50 (she is owed 50)
    expect(alice?.balance).toBe(50);
    // Bob paid 0, owes 50 => net -50 (he owes 50)
    expect(bob?.balance).toBe(-50);
  });

  it('accounts for settlements reducing balances', async () => {
    mockExpenseFindMany.mockResolvedValue([
      {
        id: 'exp-1',
        paid_by_user_id: 'alice',
        converted_amount: 100,
        splits: [
          { user_id: 'alice', amount: 50 },
          { user_id: 'bob', amount: 50 },
        ],
      },
    ]);
    // Bob pays Alice 30
    mockSettlementFindMany.mockResolvedValue([
      {
        paid_by_user_id: 'bob',
        paid_to_user_id: 'alice',
        converted_amount: 30,
      },
    ]);
    mockUserFindMany.mockResolvedValue([
      { id: 'alice', display_name: 'Alice', username: 'alice' },
      { id: 'bob', display_name: 'Bob', username: 'bob' },
    ]);

    const result = await computeGroupBalances('group-1');

    const alice = result.find(b => b.userId === 'alice');
    const bob = result.find(b => b.userId === 'bob');

    // Before settlement: Alice +50 (owed), Bob -50 (owes)
    // Bob pays Alice 30:
    //   balances[bob] += 30  => bob = -50 + 30 = -20
    //   balances[alice] -= 30 => alice = 50 - 30 = 20
    // Settlement correctly reduces the imbalance
    expect(alice?.balance).toBe(20);
    expect(bob?.balance).toBe(-20);
  });

  it('handles multiple expenses and multiple payers', async () => {
    mockExpenseFindMany.mockResolvedValue([
      {
        id: 'exp-1',
        paid_by_user_id: 'alice',
        converted_amount: 300,
        splits: [
          { user_id: 'alice', amount: 100 },
          { user_id: 'bob', amount: 100 },
          { user_id: 'charlie', amount: 100 },
        ],
      },
      {
        id: 'exp-2',
        paid_by_user_id: 'bob',
        converted_amount: 150,
        splits: [
          { user_id: 'alice', amount: 75 },
          { user_id: 'bob', amount: 75 },
        ],
      },
    ]);
    mockSettlementFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([
      { id: 'alice', display_name: 'Alice', username: 'alice' },
      { id: 'bob', display_name: 'Bob', username: 'bob' },
      { id: 'charlie', display_name: 'Charlie', username: 'charlie' },
    ]);

    const result = await computeGroupBalances('group-1');

    const alice = result.find(b => b.userId === 'alice');
    const bob = result.find(b => b.userId === 'bob');
    const charlie = result.find(b => b.userId === 'charlie');

    // Alice: +300 -100 -75 = +125
    expect(alice?.balance).toBe(125);
    // Bob: +150 -100 -75 = -25
    expect(bob?.balance).toBe(-25);
    // Charlie: -100
    expect(charlie?.balance).toBe(-100);
  });

  it('resolves display names correctly', async () => {
    mockExpenseFindMany.mockResolvedValue([
      {
        id: 'exp-1',
        paid_by_user_id: 'u1',
        converted_amount: 50,
        splits: [{ user_id: 'u1', amount: 50 }],
      },
    ]);
    mockSettlementFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([
      { id: 'u1', display_name: 'John Doe', username: 'johnd' },
    ]);

    const result = await computeGroupBalances('group-1');
    expect(result[0].displayName).toBe('John Doe');
    expect(result[0].username).toBe('johnd');
    expect(result[0].balance).toBe(0); // paid 50, split 50 => net 0
  });
});

describe('computeSimplifiedSettlements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty when all balances are zero', async () => {
    mockExpenseFindMany.mockResolvedValue([
      {
        id: 'exp-1',
        paid_by_user_id: 'alice',
        converted_amount: 100,
        splits: [{ user_id: 'alice', amount: 100 }],
      },
    ]);
    mockSettlementFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([
      { id: 'alice', display_name: 'Alice', username: 'alice' },
    ]);

    const transfers = await computeSimplifiedSettlements('group-1');
    expect(transfers).toEqual([]);
  });

  it('computes a single transfer for 2-person imbalance', async () => {
    mockExpenseFindMany.mockResolvedValue([
      {
        id: 'exp-1',
        paid_by_user_id: 'alice',
        converted_amount: 100,
        splits: [
          { user_id: 'alice', amount: 50 },
          { user_id: 'bob', amount: 50 },
        ],
      },
    ]);
    mockSettlementFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([
      { id: 'alice', display_name: 'Alice', username: 'alice' },
      { id: 'bob', display_name: 'Bob', username: 'bob' },
    ]);

    const transfers = await computeSimplifiedSettlements('group-1');

    expect(transfers).toHaveLength(1);
    expect(transfers[0].from).toBe('bob');
    expect(transfers[0].to).toBe('alice');
    expect(transfers[0].amount).toBe(50);
  });

  it('minimizes transfers for 3-person scenario', async () => {
    // Alice paid 300, split 3 ways => alice +200, bob -100, charlie -100
    mockExpenseFindMany.mockResolvedValue([
      {
        id: 'exp-1',
        paid_by_user_id: 'alice',
        converted_amount: 300,
        splits: [
          { user_id: 'alice', amount: 100 },
          { user_id: 'bob', amount: 100 },
          { user_id: 'charlie', amount: 100 },
        ],
      },
    ]);
    mockSettlementFindMany.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([
      { id: 'alice', display_name: 'Alice', username: 'alice' },
      { id: 'bob', display_name: 'Bob', username: 'bob' },
      { id: 'charlie', display_name: 'Charlie', username: 'charlie' },
    ]);

    const transfers = await computeSimplifiedSettlements('group-1');

    // Should produce 2 transfers: bob->alice 100, charlie->alice 100
    expect(transfers).toHaveLength(2);
    const totalTransferred = transfers.reduce((s, t) => s + t.amount, 0);
    expect(totalTransferred).toBe(200);
  });
});
