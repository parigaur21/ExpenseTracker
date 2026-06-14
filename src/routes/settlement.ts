// src/routes/settlement.ts
import { Router, Request, Response } from "express";
import { prisma } from "../server";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";

const router = Router();
router.use(requireAuth);

/**
 * POST /api/settlements/:groupId
 * Create a settlement record between two users.
 * Request body: { paidBy, paidTo, amount, currency, settlementDate, notes }
 */
router.post('/:groupId', async (req: AuthRequest, res: Response) => {
  const { groupId } = req.params;
  const { paidBy, paidTo, amount, currency, settlementDate, notes } = req.body;
  if (!paidBy || !paidTo || !amount || !currency || !settlementDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  // Get exchange rate to group's base currency (default INR)
  const group = await prisma.groups.findUnique({ where: { id: groupId } });
  const targetCurrency = group?.base_currency ?? 'INR';
  const rate = currency === targetCurrency ? 1 : await fetchRate(currency, targetCurrency);
  const converted = Number(amount) * rate;

  const settlement = await prisma.settlements.create({
    data: {
      id: uuidv4(),
      group_id: groupId,
      paid_by_user_id: paidBy,
      paid_to_user_id: paidTo,
      settlement_date: new Date(settlementDate),
      original_amount: Number(amount),
      original_currency: currency,
      exchange_rate: rate,
      converted_amount: converted,
      notes,
    },
  });

  res.status(201).json({ settlement });
});

/** Helper to fetch exchange rate (reuse same implementation) */
async function fetchRate(from: string, to: string): Promise<number> {
  const axios = require('axios');
  const resp = await axios.get('https://api.exchangerate.host/latest', { params: { base: from, symbols: to } });
  return Number(resp.data.rates[to]);
}

export default router;
