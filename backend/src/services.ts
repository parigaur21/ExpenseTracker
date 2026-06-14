import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { ApiError } from './http.js';
import { converted, money, reconcile, splitEqual } from './money.js';
import { query } from './db.js';

export type SplitType = 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'SHARE';

export function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function activeUsers(groupId: string, date: string, client?: pg.PoolClient) {
  const executor = client ?? { query };
  const result = await executor.query<{
    id: string; display_name: string; username: string;
  }>(
    `select u.id, u.display_name, u.username
     from group_memberships gm join users u on u.id = gm.user_id
     where gm.group_id = $1 and gm.joined_on <= $2 and (gm.left_on is null or gm.left_on >= $2)`,
    [groupId, date]
  );
  const map = new Map<string, { id: string; display_name: string; username: string }>();
  for (const user of result.rows) {
    map.set(normalizeName(user.display_name), user);
    map.set(normalizeName(user.username), user);
  }
  return map;
}

export async function requireActive(groupId: string, userId: string, date: string) {
  const result = await query(
    `select 1 from group_memberships
     where group_id = $1 and user_id = $2 and joined_on <= $3 and (left_on is null or left_on >= $3)`,
    [groupId, userId, date]
  );
  if (!result.rowCount) throw new ApiError(400, 'MEMBERSHIP_VIOLATION', `User is not active in the group on ${date}`);
}

export function exchangeRate(currency: string) {
  if (currency.toUpperCase() === 'INR') return 1;
  if (currency.toUpperCase() === 'USD') return 83;
  throw new ApiError(400, 'UNSUPPORTED_CURRENCY', 'Only INR and USD are supported');
}

export async function insertExpense(client: pg.PoolClient, input: {
  groupId: string;
  paidByUserId: string;
  expenseDate: string;
  description: string;
  originalAmount: number;
  originalCurrency: string;
  exchangeRate: number;
  splitType: SplitType;
  splits: { userId: string; amount?: number; percentage?: number; shareUnits?: number }[];
  sourceImportId?: string;
  sourceRowNumber?: number;
}) {
  const total = converted(input.originalAmount, input.exchangeRate);
  const expenseId = randomUUID();
  await client.query(
    `insert into expenses
     (id, group_id, paid_by_user_id, expense_date, description, original_amount, original_currency, exchange_rate,
      converted_amount, split_type, source_import_id, source_row_number)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [expenseId, input.groupId, input.paidByUserId, input.expenseDate, input.description, money(input.originalAmount),
      input.originalCurrency.toUpperCase(), input.exchangeRate, total, input.splitType, input.sourceImportId ?? null, input.sourceRowNumber ?? null]
  );
  const amounts = calculateSplitAmounts(total, input.splitType, input.splits);
  for (let i = 0; i < input.splits.length; i++) {
    const split = input.splits[i];
    await client.query(
      `insert into expense_splits (id, expense_id, user_id, amount, percentage, share_units)
       values ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), expenseId, split.userId, amounts[i], split.percentage ?? null, split.shareUnits ?? null]
    );
  }
  return expenseId;
}

export function calculateSplitAmounts(total: number, splitType: SplitType, splits: { amount?: number; percentage?: number; shareUnits?: number }[]) {
  if (splitType === 'EQUAL') return splitEqual(total, splits.length);
  if (splitType === 'EXACT') {
    const values = splits.map(split => money(split.amount ?? 0));
    const sum = money(values.reduce((a, b) => a + b, 0));
    if (sum !== money(total)) throw new ApiError(400, 'INVALID_SPLIT_TOTAL', 'Exact splits must equal the expense amount');
    return values;
  }
  if (splitType === 'PERCENTAGE') {
    const pct = splits.reduce((sum, split) => sum + Number(split.percentage ?? 0), 0);
    if (money(pct) !== 100) throw new ApiError(400, 'INVALID_SPLIT_TOTAL', 'Percentages must total 100');
    return reconcile(total, splits.map(split => money(total * Number(split.percentage ?? 0) / 100)));
  }
  const shareSum = splits.reduce((sum, split) => sum + Number(split.shareUnits ?? 0), 0);
  if (shareSum <= 0) throw new ApiError(400, 'INVALID_SPLIT_TOTAL', 'Share units must be positive');
  return reconcile(total, splits.map(split => money(total * Number(split.shareUnits ?? 0) / shareSum)));
}

export async function audit(client: pg.PoolClient, actorId: string | null, groupId: string | null, action: string, entityType: string, entityId: string | null, details: string) {
  await client.query(
    `insert into audit_logs (id, actor_user_id, group_id, action, entity_type, entity_id, details)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [randomUUID(), actorId, groupId, action, entityType, entityId, details]
  );
}

