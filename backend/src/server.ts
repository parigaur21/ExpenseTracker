import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { asyncHandler, errorHandler, ApiError } from './http.js';
import { login, loginSchema, register, registerSchema, requireAuth } from './auth.js';
import { query, tx } from './db.js';
import { audit, exchangeRate, insertExpense, requireActive, type SplitType } from './services.js';
import { converted, money } from './money.js';
import { importCsv } from './importer.js';
import { balanceSummary, balanceTrace } from './balances.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  res.json(await register(registerSchema.parse(req.body)));
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  res.json(await login(loginSchema.parse(req.body)));
}));

app.use('/api', requireAuth);

app.get('/api/groups', asyncHandler(async (_req, res) => {
  const { rows } = await query('select id, name, base_currency "baseCurrency" from groups order by created_at');
  res.json(rows);
}));

app.post('/api/groups', asyncHandler(async (req, res) => {
  const body = z.object({ name: z.string().min(1), baseCurrency: z.string().default('INR') }).parse(req.body);
  const id = randomUUID();
  await tx(async client => {
    await client.query('insert into groups (id, name, base_currency, created_by) values ($1,$2,$3,$4)', [id, body.name.trim(), body.baseCurrency, req.user!.id]);
    await audit(client, req.user!.id, id, 'CREATE_GROUP', 'GROUP', id, body.name);
  });
  res.status(201).json({ id, name: body.name.trim(), baseCurrency: body.baseCurrency });
}));

app.get('/api/groups/:groupId/memberships', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select gm.id, u.id "userId", u.display_name "displayName", gm.joined_on "joinedOn", gm.left_on "leftOn"
     from group_memberships gm join users u on u.id = gm.user_id
     where gm.group_id = $1 order by gm.joined_on, u.display_name`,
    [req.params.groupId]
  );
  res.json(rows);
}));

app.post('/api/groups/:groupId/memberships', asyncHandler(async (req, res) => {
  const body = z.object({ userId: z.string().uuid(), joinedOn: z.string(), leftOn: z.string().optional().nullable() }).parse(req.body);
  const id = randomUUID();
  await tx(async client => {
    await client.query(
      'insert into group_memberships (id, group_id, user_id, joined_on, left_on) values ($1,$2,$3,$4,$5)',
      [id, req.params.groupId, body.userId, body.joinedOn, body.leftOn ?? null]
    );
    await audit(client, req.user!.id, req.params.groupId, 'ADD_MEMBERSHIP', 'GROUP_MEMBERSHIP', id, body.userId);
  });
  res.status(201).json({ id, userId: body.userId, joinedOn: body.joinedOn, leftOn: body.leftOn });
}));

app.get('/api/groups/:groupId/expenses', asyncHandler(async (req, res) => {
  const expenses = await query<any>(
    `select e.id, e.expense_date "expenseDate", e.description, e.paid_by_user_id "paidByUserId", u.display_name "paidBy",
            e.original_amount "originalAmount", e.original_currency "originalCurrency", e.exchange_rate "exchangeRate",
            e.converted_amount "convertedAmount", e.split_type "splitType", e.source_row_number "sourceRowNumber"
     from expenses e join users u on u.id = e.paid_by_user_id
     where e.group_id = $1 order by e.expense_date`,
    [req.params.groupId]
  );
  const splits = await query<any>(
    `select es.expense_id, es.user_id "userId", u.display_name "displayName", es.amount, es.percentage, es.share_units "shareUnits"
     from expense_splits es join users u on u.id = es.user_id join expenses e on e.id = es.expense_id
     where e.group_id = $1`,
    [req.params.groupId]
  );
  res.json(expenses.rows.map(e => ({ ...e, splits: splits.rows.filter(s => s.expense_id === e.id).map(({ expense_id, ...s }) => s) })));
}));

app.post('/api/groups/:groupId/expenses', asyncHandler(async (req, res) => {
  const body = expenseSchema.parse(req.body);
  await requireActive(req.params.groupId, body.paidByUserId, body.expenseDate);
  for (const split of body.splits) await requireActive(req.params.groupId, split.userId, body.expenseDate);
  let id = '';
  await tx(async client => {
    id = await insertExpense(client, {
      groupId: req.params.groupId,
      paidByUserId: body.paidByUserId,
      expenseDate: body.expenseDate,
      description: body.description,
      originalAmount: body.originalAmount,
      originalCurrency: body.originalCurrency,
      exchangeRate: body.exchangeRate,
      splitType: body.splitType,
      splits: body.splits
    });
    await audit(client, req.user!.id, req.params.groupId, 'CREATE_EXPENSE', 'EXPENSE', id, body.description);
  });
  res.status(201).json({ id });
}));

app.get('/api/groups/:groupId/settlements', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select s.id, s.paid_by_user_id "paidByUserId", p.display_name "paidBy", s.paid_to_user_id "paidToUserId", t.display_name "paidTo",
            s.settlement_date "settlementDate", s.original_amount "originalAmount", s.original_currency "originalCurrency",
            s.converted_amount "convertedAmount", s.notes
     from settlements s join users p on p.id = s.paid_by_user_id join users t on t.id = s.paid_to_user_id
     where s.group_id = $1 order by s.settlement_date`,
    [req.params.groupId]
  );
  res.json(rows);
}));

app.post('/api/groups/:groupId/settlements', asyncHandler(async (req, res) => {
  const body = settlementSchema.parse(req.body);
  await requireActive(req.params.groupId, body.paidByUserId, body.settlementDate);
  await requireActive(req.params.groupId, body.paidToUserId, body.settlementDate);
  const id = randomUUID();
  const total = converted(body.originalAmount, body.exchangeRate);
  await tx(async client => {
    await client.query(
      `insert into settlements
       (id, group_id, paid_by_user_id, paid_to_user_id, settlement_date, original_amount, original_currency, exchange_rate, converted_amount, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, req.params.groupId, body.paidByUserId, body.paidToUserId, body.settlementDate, money(body.originalAmount), body.originalCurrency, body.exchangeRate, total, body.notes ?? null]
    );
    await audit(client, req.user!.id, req.params.groupId, 'CREATE_SETTLEMENT', 'SETTLEMENT', id, body.notes ?? '');
  });
  res.status(201).json({ id });
}));

app.post('/api/groups/:groupId/imports/csv', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'MISSING_FILE', 'CSV file is required');
  const report = await tx(client => importCsv(client, req.params.groupId, req.file!.originalname, req.file!.buffer, req.user!.id));
  res.json(report);
}));

app.get('/api/imports/:importId', asyncHandler(async (req, res) => {
  const imports = await query<any>('select * from imports where id = $1', [req.params.importId]);
  if (!imports.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Import not found');
  const anomalies = await query<any>(
    `select id, row_number "rowNumber", type, severity, action, message, raw_row "rawRow" from anomalies where import_id = $1 order by row_number`,
    [req.params.importId]
  );
  const item = imports.rows[0];
  res.json({
    id: item.id, fileName: item.file_name, status: item.status, totalRows: item.total_rows, acceptedRows: item.accepted_rows,
    skippedRows: item.skipped_rows, blockedRows: item.blocked_rows, reviewRows: item.review_rows, anomalies: anomalies.rows
  });
}));

app.get('/api/groups/:groupId/balances', asyncHandler(async (req, res) => {
  res.json(await balanceSummary(req.params.groupId));
}));

app.get('/api/groups/:groupId/balances/trace', asyncHandler(async (req, res) => {
  const fromUserId = z.string().uuid().parse(req.query.fromUserId);
  const toUserId = z.string().uuid().parse(req.query.toUserId);
  res.json(await balanceTrace(req.params.groupId, fromUserId, toUserId));
}));

app.get('/api/groups/:groupId/audit-logs', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select al.id, coalesce(u.display_name, 'system') actor, al.action, al.entity_type "entityType", al.entity_id "entityId", al.details, al.created_at "createdAt"
     from audit_logs al left join users u on u.id = al.actor_user_id
     where al.group_id = $1 order by al.created_at desc`,
    [req.params.groupId]
  );
  res.json(rows);
}));

app.use(errorHandler);

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => console.log(`Node API listening on http://localhost:${port}`));

const expenseSchema = z.object({
  paidByUserId: z.string().uuid(),
  expenseDate: z.string(),
  description: z.string().min(1),
  originalAmount: z.coerce.number().positive(),
  originalCurrency: z.enum(['INR', 'USD']),
  exchangeRate: z.coerce.number().positive().optional(),
  splitType: z.enum(['EQUAL', 'EXACT', 'PERCENTAGE', 'SHARE']),
  splits: z.array(z.object({
    userId: z.string().uuid(),
    amount: z.coerce.number().optional(),
    percentage: z.coerce.number().optional(),
    shareUnits: z.coerce.number().optional()
  })).min(1)
}).transform(value => ({ ...value, exchangeRate: value.exchangeRate ?? exchangeRate(value.originalCurrency), splitType: value.splitType as SplitType }));

const settlementSchema = z.object({
  paidByUserId: z.string().uuid(),
  paidToUserId: z.string().uuid(),
  settlementDate: z.string(),
  originalAmount: z.coerce.number().positive(),
  originalCurrency: z.enum(['INR', 'USD']),
  exchangeRate: z.coerce.number().positive().optional(),
  notes: z.string().optional()
}).transform(value => ({ ...value, exchangeRate: value.exchangeRate ?? exchangeRate(value.originalCurrency) }));

