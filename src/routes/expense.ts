// src/routes/expense.ts
import { Router, Request, Response } from "express";
import { prisma } from "../server";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { upload } from "../middleware/upload";
import fastCsv from "fast-csv";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

const router = Router();
router.use(requireAuth);

/**
 * GET /api/expenses/:groupId
 * Returns all expenses for a group (already converted to group.base_currency).
 */
router.get('/:groupId', async (req: AuthRequest, res: Response) => {
  const { groupId } = req.params;
  const expenses = await prisma.expenses.findMany({
    where: { group_id: groupId },
    include: { expense_splits: true },
    orderBy: { expense_date: 'desc' },
  });
  res.json(expenses);
});

/**
 * POST /api/expenses/:groupId
 * Create a new expense (single split or equal split).
 */
router.post('/:groupId', async (req: AuthRequest, res: Response) => {
  const { groupId } = req.params;
  const { paidBy, description, amount, currency, expenseDate, splitType, splits } = req.body;
  if (!paidBy || !description || !amount || !currency || !expenseDate || !splitType) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  // Get exchange rate to group's base currency (assume INR for now)
  const group = await prisma.groups.findUnique({ where: { id: groupId } });
  const targetCurrency = group?.base_currency ?? "INR";
  const exchangeRate = currency === targetCurrency ? 1 : await fetchRate(currency, targetCurrency);
  const convertedAmount = Number(amount) * exchangeRate;

  const expense = await prisma.expenses.create({
    data: {
      id: uuidv4(),
      group_id: groupId,
      paid_by_user_id: paidBy,
      expense_date: new Date(expenseDate),
      description,
      original_amount: Number(amount),
      original_currency: currency,
      exchange_rate: exchangeRate,
      converted_amount: convertedAmount,
      split_type: splitType,
    },
  });

  // Handle splits (if splitType is "EQUAL" we create equal splits)
  if (splitType === "EQUAL" && Array.isArray(splits) && splits.length > 0) {
    const perUser = Number(convertedAmount) / splits.length;
    await Promise.all(
      splits.map((userId: string) =>
        prisma.expense_splits.create({
          data: {
            id: uuidv4(),
            expense_id: expense.id,
            user_id: userId,
            amount: perUser,
          },
        })
      )
    );
  }

  res.status(201).json({ expense });
});

/**
 * POST /api/expenses/:groupId/import
 * Accept a CSV file (multipart/form‑data, field name "file") and import rows.
 */
router.post('/:groupId/import', upload.single('file'), async (req: AuthRequest, res: Response) => {
  const { groupId } = req.params;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  // Create import record
  const importRec = await prisma.imports.create({
    data: {
      id: uuidv4(),
      group_id: groupId,
      file_name: file.originalname ?? file.filename,
      status: 'IN_PROGRESS',
      total_rows: 0,
      accepted_rows: 0,
      skipped_rows: 0,
      blocked_rows: 0,
      review_rows: 0,
      created_by: req.userId ?? null,
    },
  });

  const anomalies: any[] = [];
  let totalRows = 0;
  let accepted = 0;
  let blocked = 0;

  const parser = fastCsv.parse({ headers: true, ignoreEmpty: true })
    .on('error', (error) => anomalies.push({ type: 'PARSE_ERROR', message: error.message }))
    .on('data', async (row) => {
      totalRows++;
      try {
        const { date, description, amount, currency, paidBy, splitType, splitUsers, splitPercentages, splitUnits } = row;
        if (!date || !amount || !currency || !paidBy || !splitType) throw new Error('Missing required fields');
        const group = await prisma.groups.findUnique({ where: { id: groupId } });
        const targetCurrency = group?.base_currency ?? 'INR';
        const rate = currency === targetCurrency ? 1 : await fetchRate(currency, targetCurrency);
        const converted = Number(amount) * rate;

        const expense = await prisma.expenses.create({
          data: {
            id: uuidv4(),
            group_id: groupId,
            paid_by_user_id: paidBy,
            expense_date: new Date(date),
            description,
            original_amount: Number(amount),
            original_currency: currency,
            exchange_rate: rate,
            converted_amount: converted,
            split_type: splitType,
            source_import_id: importRec.id,
            source_row_number: totalRows,
          },
        });

        // Handle splits based on splitType
        if (splitType === 'EQUAL') {
          const users = splitUsers?.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (users && users.length > 0) {
            const per = converted / users.length;
            await Promise.all(users.map(u => prisma.expense_splits.create({
              data: { id: uuidv4(), expense_id: expense.id, user_id: u, amount: per },
            })));
          }
        } else if (splitType === 'PERCENTAGE') {
          const entries = splitPercentages?.split(';').map((e: string) => e.trim()).filter(Boolean);
          if (entries) {
            await Promise.all(entries.map(entry => {
              const [uid, percStr] = entry.split(':');
              const perc = Number(percStr);
              const amt = (perc / 100) * converted;
              return prisma.expense_splits.create({
                data: { id: uuidv4(), expense_id: expense.id, user_id: uid, amount: amt, percentage: perc },
              });
            }));
          }
        } else if (splitType === 'CUSTOM') {
          const entries = splitUnits?.split(';').map((e: string) => e.trim()).filter(Boolean);
          if (entries) {
            const unitObjs = entries.map(entry => {
              const [uid, unitStr] = entry.split(':');
              return { uid, units: Number(unitStr) };
            });
            const totalUnits = unitObjs.reduce((sum, u) => sum + u.units, 0);
            await Promise.all(unitObjs.map(u => {
              const amt = (u.units / totalUnits) * converted;
              return prisma.expense_splits.create({
                data: { id: uuidv4(), expense_id: expense.id, user_id: u.uid, amount: amt, share_units: u.units },
              });
            }));
          }
        }

        accepted++;
      } catch (e: any) {
        anomalies.push({ rowNumber: totalRows, type: 'VALIDATION', message: e.message, raw_row: JSON.stringify(row) });
        blocked++;
      }
    });

  // Pipe file stream into parser
  await new Promise<void>((resolve, reject) => {
    const fs = require('fs');
    const stream = fs.createReadStream(file.path);
    stream.pipe(parser).on('end', resolve).on('error', reject);
  });

  // Update import record with final counts
  await prisma.imports.update({
    where: { id: importRec.id },
    data: {
      status: 'COMPLETED',
      total_rows: totalRows,
      accepted_rows: accepted,
      blocked_rows: blocked,
      skipped_rows: 0,
      review_rows: 0,
    },
  });

  // Persist anomalies
  await Promise.all(anomalies.map(anom => prisma.anomalies.create({
    data: {
      id: uuidv4(),
      import_id: importRec.id,
      row_number: anom.rowNumber ?? 0,
      type: anom.type,
      severity: 'MEDIUM',
      action: 'REVIEW',
      message: anom.message,
      raw_row: anom.raw_row ?? '',
    },
  })));

  res.json({ importId: importRec.id, imported: accepted, anomalies });
});

/** Helper: fetch exchange rate */
async function fetchRate(from: string, to: string): Promise<number> {
  const resp = await axios.get('https://api.exchangerate.host/latest', { params: { base: from, symbols: to } });
  return Number(resp.data.rates[to]);
}

export default router;
