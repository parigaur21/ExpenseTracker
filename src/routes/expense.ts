import { Router, Response } from 'express';
import prisma from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import * as fastCsv from 'fast-csv';
import { fetchRate } from '../services/currency';
import { Readable } from 'stream';

const router = Router();
router.use(requireAuth);

// GET /api/expenses/:groupId
router.get('/:groupId', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const expenses = await prisma.expense.findMany({
      where: { group_id: groupId },
      include: {
        splits: { include: { user: { select: { id: true, display_name: true } } } },
        payer: { select: { id: true, display_name: true } },
      },
      orderBy: { expense_date: 'desc' },
    });
    res.json({ expenses });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/expenses/:groupId
router.post('/:groupId', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const { paidBy, description, amount, currency, expenseDate, splitType, splits } = req.body;
    if (!paidBy || !description || !amount || !currency || !expenseDate || !splitType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const targetCurrency = group.base_currency;
    const exchangeRate = currency === targetCurrency ? 1 : await fetchRate(currency, targetCurrency);
    const convertedAmount = Number(amount) * exchangeRate;

    const expense = await prisma.expense.create({
      data: {
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

    // Create splits based on type
    if (Array.isArray(splits) && splits.length > 0) {
      if (splitType === 'EQUAL') {
        const perUser = convertedAmount / splits.length;
        await Promise.all(
          splits.map((userId: string) =>
            prisma.expenseSplit.create({
              data: { expense_id: expense.id, user_id: userId, amount: perUser },
            })
          )
        );
      } else if (splitType === 'EXACT') {
        // splits = [{ userId, amount }]
        await Promise.all(
          splits.map((s: { userId: string; amount: number }) =>
            prisma.expenseSplit.create({
              data: { expense_id: expense.id, user_id: s.userId, amount: s.amount },
            })
          )
        );
      } else if (splitType === 'PERCENTAGE') {
        // splits = [{ userId, percentage }]
        await Promise.all(
          splits.map((s: { userId: string; percentage: number }) =>
            prisma.expenseSplit.create({
              data: {
                expense_id: expense.id,
                user_id: s.userId,
                amount: (s.percentage / 100) * convertedAmount,
                percentage: s.percentage,
              },
            })
          )
        );
      } else if (splitType === 'SHARE') {
        // splits = [{ userId, shares }]
        const totalShares = splits.reduce((sum: number, s: any) => sum + Number(s.shares), 0);
        await Promise.all(
          splits.map((s: { userId: string; shares: number }) =>
            prisma.expenseSplit.create({
              data: {
                expense_id: expense.id,
                user_id: s.userId,
                amount: (Number(s.shares) / totalShares) * convertedAmount,
                share_units: Number(s.shares),
              },
            })
          )
        );
      }
    }

    const result = await prisma.expense.findUnique({
      where: { id: expense.id },
      include: { splits: true },
    });
    res.status(201).json({ expense: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/expenses/:groupId/import
router.post('/:groupId/import', upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const importRec = await prisma.import.create({
      data: {
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

    const anomalies: Array<{ rowNumber: number; type: string; message: string; raw_row: string }> = [];
    let totalRows = 0;
    let accepted = 0;
    let blocked = 0;

    const rows: any[] = [];
    const fs = await import('fs');

    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(file.path)
        .pipe(fastCsv.parse({ headers: true, ignoreEmpty: true }))
        .on('error', (error: Error) => {
          anomalies.push({ rowNumber: 0, type: 'PARSE_ERROR', message: error.message, raw_row: '' });
          reject(error);
        })
        .on('data', (row: any) => rows.push(row))
        .on('end', () => resolve());
    });

    // Process rows sequentially
    for (const row of rows) {
      totalRows++;
      try {
        const { date, description, amount, currency, paidBy, splitType, splitUsers } = row;
        if (!date || !amount || !currency || !paidBy || !splitType) {
          throw new Error('Missing required fields');
        }
        const group = await prisma.group.findUnique({ where: { id: groupId } });
        const targetCurrency = group?.base_currency ?? 'INR';
        const rate = currency === targetCurrency ? 1 : await fetchRate(currency, targetCurrency);
        const converted = Number(amount) * rate;

        const expense = await prisma.expense.create({
          data: {
            group_id: groupId,
            paid_by_user_id: paidBy,
            expense_date: new Date(date),
            description: description || 'Imported expense',
            original_amount: Number(amount),
            original_currency: currency,
            exchange_rate: rate,
            converted_amount: converted,
            split_type: splitType,
            source_import_id: importRec.id,
            source_row_number: totalRows,
          },
        });

        if (splitType === 'EQUAL' && splitUsers) {
          const users = splitUsers.split(',').map((s: string) => s.trim()).filter(Boolean);
          if (users.length > 0) {
            const per = converted / users.length;
            await Promise.all(
              users.map((u: string) =>
                prisma.expenseSplit.create({
                  data: { expense_id: expense.id, user_id: u, amount: per },
                })
              )
            );
          }
        }
        accepted++;
      } catch (e: any) {
        anomalies.push({
          rowNumber: totalRows,
          type: 'VALIDATION',
          message: e.message,
          raw_row: JSON.stringify(row),
        });
        blocked++;
      }
    }

    // Update import record
    await prisma.import.update({
      where: { id: importRec.id },
      data: {
        status: 'COMPLETED',
        total_rows: totalRows,
        accepted_rows: accepted,
        blocked_rows: blocked,
      },
    });

    // Persist anomalies
    if (anomalies.length > 0) {
      await Promise.all(
        anomalies.map((anom) =>
          prisma.anomaly.create({
            data: {
              import_id: importRec.id,
              row_number: anom.rowNumber,
              type: anom.type,
              severity: 'MEDIUM',
              action: 'REVIEW',
              message: anom.message,
              raw_row: anom.raw_row,
            },
          })
        )
      );
    }

    // Clean up temp file
    fs.unlinkSync(file.path);

    res.json({
      importId: importRec.id,
      totalRows,
      accepted,
      blocked,
      anomalies: anomalies.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
