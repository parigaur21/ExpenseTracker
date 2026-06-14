import { parse } from 'csv-parse/sync';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { activeUsers, audit, exchangeRate, insertExpense, normalizeName, type SplitType } from './services.js';
import { money } from './money.js';

type CsvRow = Record<string, string> & { rowNumber: number; raw: string };
type RowAnomaly = { type: string; severity: 'INFO' | 'WARNING' | 'ERROR'; action: 'SKIP' | 'REVIEW' | 'BLOCK'; message: string };

const settlementWords = /(paid .* back|settlement|deposit share|paid aisha)/i;

export async function importCsv(client: pg.PoolClient, groupId: string, fileName: string, buffer: Buffer, actorId: string) {
  const records = parse(buffer, { columns: true, skip_empty_lines: true, trim: false }) as Record<string, string>[];
  const importId = randomUUID();
  let accepted = 0, skipped = 0, blocked = 0, review = 0;
  const seenExact = new Set<string>();
  const seenSimilar = new Map<string, string>();
  const allAnomalies: (RowAnomaly & { rowNumber: number; raw: string; id: string })[] = [];

  await client.query(
    `insert into imports (id, group_id, file_name, status, total_rows, accepted_rows, skipped_rows, blocked_rows, review_rows, created_by)
     values ($1,$2,$3,$4,$5,0,0,0,0,$6)`,
    [importId, groupId, fileName, 'COMPLETED_WITH_ANOMALIES', records.length, actorId]
  );

  for (let index = 0; index < records.length; index++) {
    const row = { ...records[index], rowNumber: index + 2, raw: JSON.stringify(records[index]) };
    const anomalies = await analyzeRow(groupId, row, seenExact, seenSimilar);
    for (const anomaly of anomalies) {
      const id = randomUUID();
      allAnomalies.push({ ...anomaly, rowNumber: row.rowNumber, raw: row.raw, id });
      await client.query(
        `insert into anomalies (id, import_id, row_number, type, severity, action, message, raw_row)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, importId, row.rowNumber, anomaly.type, anomaly.severity, anomaly.action, anomaly.message, row.raw]
      );
    }
    const action = strongest(anomalies);
    if (action === 'BLOCK') blocked++;
    else if (action === 'REVIEW') review++;
    else if (action === 'SKIP') skipped++;
    else {
      await persistCsvExpense(client, groupId, importId, row);
      accepted++;
    }
  }

  await client.query(
    `update imports set status = $2, accepted_rows = $3, skipped_rows = $4, blocked_rows = $5, review_rows = $6 where id = $1`,
    [importId, allAnomalies.length ? 'COMPLETED_WITH_ANOMALIES' : 'COMPLETED', accepted, skipped, blocked, review]
  );
  await audit(client, actorId, groupId, 'IMPORT_CSV', 'IMPORT', importId, fileName);
  return {
    id: importId, fileName, status: allAnomalies.length ? 'COMPLETED_WITH_ANOMALIES' : 'COMPLETED',
    totalRows: records.length, acceptedRows: accepted, skippedRows: skipped, blockedRows: blocked, reviewRows: review,
    anomalies: allAnomalies.map(a => ({ id: a.id, rowNumber: a.rowNumber, type: a.type, severity: a.severity, action: a.action, message: a.message, rawRow: a.raw }))
  };
}

async function analyzeRow(groupId: string, row: CsvRow, seenExact: Set<string>, seenSimilar: Map<string, string>) {
  const anomalies: RowAnomaly[] = [];
  for (const key of ['date', 'description', 'paid_by', 'amount', 'currency', 'split_type', 'split_with']) {
    if (!row[key]?.trim()) anomalies.push(block('MISSING_VALUE', `Missing required value: ${key}`));
  }
  const date = parseDate(row.date, anomalies);
  const amount = parseAmount(row.amount, anomalies);
  if (amount === 0) anomalies.push(block('ZERO_AMOUNT', 'Zero amount expenses are not imported'));
  if (amount !== null && amount < 0) anomalies.push(review('NEGATIVE_AMOUNT_REFUND', 'Negative amount appears to be a refund and needs explicit approval'));
  if (row.currency?.trim() && !['INR', 'USD'].includes(row.currency.trim().toUpperCase())) anomalies.push(block('UNSUPPORTED_CURRENCY', 'Only INR and USD are supported'));
  if (settlementWords.test(`${row.description} ${row.notes}`)) anomalies.push(block('SETTLEMENT_RECORDED_AS_EXPENSE', 'This row looks like a settlement/payment, not an expense'));
  if (date && row.notes?.toLowerCase().includes('format')) anomalies.push(review('AMBIGUOUS_DATE', `Date is called out by source notes as ambiguous: ${row.date}`));
  if (date) await validatePeople(groupId, date, row, anomalies);
  validateSplit(row, amount, anomalies);
  detectDuplicates(row, seenExact, seenSimilar, anomalies);
  return anomalies;
}

async function validatePeople(groupId: string, date: string, row: CsvRow, anomalies: RowAnomaly[]) {
  const active = await activeUsers(groupId, date);
  if (!resolveName(row.paid_by, active, anomalies)) anomalies.push(block('INVALID_PARTICIPANT', `Payer is not an active known member: ${row.paid_by}`));
  for (const name of names(row.split_with)) {
    if (!resolveName(name, active, anomalies)) anomalies.push(block('MEMBERSHIP_VIOLATION', `${name} is not active in the group on ${date}`));
  }
}

function validateSplit(row: CsvRow, amount: number | null, anomalies: RowAnomaly[]) {
  if (amount === null || amount <= 0) return;
  const splitType = normalizeSplitType(row.split_type);
  if (!splitType) {
    anomalies.push(block('UNSUPPORTED_SPLIT_TYPE', `Unsupported split type: ${row.split_type}`));
    return;
  }
  if (splitType === 'EQUAL' && row.split_details?.trim()) anomalies.push(review('SPLIT_TYPE_DETAIL_MISMATCH', 'Equal split row contains split_details and needs review'));
  if (splitType === 'PERCENTAGE') {
    const sum = detailNumbers(row.split_details).reduce((a, b) => a + b, 0);
    if (money(sum) !== 100) anomalies.push(block('INVALID_SPLIT_TOTAL', `Percentages total ${sum} instead of 100`));
  }
  if (splitType === 'EXACT') {
    const sum = detailNumbers(row.split_details).reduce((a, b) => a + b, 0);
    if (money(sum) !== money(amount)) anomalies.push(block('INVALID_SPLIT_TOTAL', `Exact splits total ${sum} instead of ${amount}`));
  }
}

function detectDuplicates(row: CsvRow, seenExact: Set<string>, seenSimilar: Map<string, string>, anomalies: RowAnomaly[]) {
  const exact = normalizedKey(row.date, row.description, row.paid_by, row.amount, row.currency, row.split_type, row.split_with);
  const similar = normalizedKey(row.date, row.description.replace(/dinner|at|-/gi, ''), row.currency, row.split_type, row.split_with);
  if (!seenExact.add(exact)) anomalies.push(skip('DUPLICATE_EXPENSE', 'Exact duplicate row skipped'));
  const fingerprint = `${row.amount}|${normalizeName(row.paid_by ?? '')}`;
  const previous = seenSimilar.get(similar);
  if (previous) {
    anomalies.push(previous === fingerprint ? skip('DUPLICATE_EXPENSE', 'Similar duplicate row skipped') : block('CONFLICTING_DUPLICATE', 'Similar expense exists with a different payer or amount'));
  } else {
    seenSimilar.set(similar, fingerprint);
  }
}

async function persistCsvExpense(client: pg.PoolClient, groupId: string, importId: string, row: CsvRow) {
  const date = parseDate(row.date, []);
  const originalAmount = parseAmount(row.amount, []);
  if (!date || originalAmount === null) return;
  const active = await activeUsers(groupId, date, client);
  const payer = resolveName(row.paid_by, active, []);
  if (!payer) return;
  const splitType = normalizeSplitType(row.split_type);
  if (!splitType) return;
  await insertExpense(client, {
    groupId,
    paidByUserId: payer.id,
    expenseDate: date,
    description: row.description.trim(),
    originalAmount,
    originalCurrency: row.currency.trim().toUpperCase(),
    exchangeRate: exchangeRate(row.currency),
    splitType,
    sourceImportId: importId,
    sourceRowNumber: row.rowNumber,
    splits: buildSplits(row, active, splitType)
  });
}

function buildSplits(row: CsvRow, active: Map<string, { id: string; display_name: string }>, splitType: SplitType) {
  const details = detailMap(row.split_details);
  return names(row.split_with).map(name => {
    const user = resolveName(name, active, []);
    const value = details.get(normalizeName(name));
    if (!user) throw new Error(`Unresolved user ${name}`);
    if (splitType === 'EXACT') return { userId: user.id, amount: value ?? 0 };
    if (splitType === 'PERCENTAGE') return { userId: user.id, percentage: value ?? 0 };
    if (splitType === 'SHARE') return { userId: user.id, shareUnits: value ?? 0 };
    return { userId: user.id };
  });
}

function resolveName(raw: string, active: Map<string, { id: string; display_name: string }>, anomalies: RowAnomaly[]) {
  const normalized = normalizeName(raw ?? '');
  const aliases = new Map([['priya s', 'priya']]);
  if (raw && raw !== raw.trim()) anomalies.push(review('INCONSISTENT_USERNAME', `Name has extra whitespace: ${raw}`));
  if (raw && raw.trim() !== title(raw)) anomalies.push(review('INCONSISTENT_USERNAME', `Name formatting differs from canonical member name: ${raw}`));
  return active.get(aliases.get(normalized) ?? normalized);
}

function normalizeSplitType(raw: string): SplitType | null {
  const value = raw?.trim().toLowerCase();
  if (value === 'equal') return 'EQUAL';
  if (value === 'unequal' || value === 'exact') return 'EXACT';
  if (value === 'percentage') return 'PERCENTAGE';
  if (value === 'share') return 'SHARE';
  return null;
}

function parseDate(raw: string, anomalies: RowAnomaly[]) {
  if (!raw?.trim()) return null;
  const match = raw.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) {
    anomalies.push(block('INVALID_DATE', `Date is not a supported DD-MM-YYYY value: ${raw}`));
    return null;
  }
  const [, dd, mm, yyyy] = match;
  const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(dd) || date.getUTCMonth() + 1 !== Number(mm)) {
    anomalies.push(block('INVALID_DATE', `Date is not a valid calendar date: ${raw}`));
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

function parseAmount(raw: string, anomalies: RowAnomaly[]) {
  if (!raw?.trim()) return null;
  const value = Number(raw.replace(/,/g, '').trim());
  if (Number.isNaN(value)) {
    anomalies.push(block('INVALID_AMOUNT', `Amount is not numeric: ${raw}`));
    return null;
  }
  return value;
}

function detailMap(raw: string) {
  const map = new Map<string, number>();
  for (const part of (raw ?? '').split(';')) {
    const cleaned = part.trim().replace('%', '');
    const pieces = cleaned.split(/\s+/);
    const value = Number(pieces.at(-1));
    if (pieces[0] && !Number.isNaN(value)) map.set(normalizeName(pieces[0]), value);
  }
  return map;
}

function detailNumbers(raw: string) {
  return [...detailMap(raw).values()];
}

function names(raw: string) {
  return (raw ?? '').split(';').map(x => x.trim()).filter(Boolean);
}

function strongest(anomalies: RowAnomaly[]) {
  if (anomalies.some(a => a.action === 'BLOCK')) return 'BLOCK';
  if (anomalies.some(a => a.action === 'REVIEW')) return 'REVIEW';
  if (anomalies.some(a => a.action === 'SKIP')) return 'SKIP';
  return 'ACCEPT';
}

function normalizedKey(...values: string[]) {
  return values.join('|').toLowerCase().replace(/[^a-z0-9|;]/g, '');
}

function title(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase() : trimmed;
}

function block(type: string, message: string): RowAnomaly { return { type, severity: 'ERROR', action: 'BLOCK', message }; }
function review(type: string, message: string): RowAnomaly { return { type, severity: 'WARNING', action: 'REVIEW', message }; }
function skip(type: string, message: string): RowAnomaly { return { type, severity: 'INFO', action: 'SKIP', message }; }

