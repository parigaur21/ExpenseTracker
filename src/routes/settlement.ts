import { Router, Response } from 'express';
import prisma from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { fetchRate } from '../services/currency';

const router = Router();
router.use(requireAuth);

// POST /api/settlements/:groupId
router.post('/:groupId', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const { paidBy, paidTo, amount, currency, settlementDate, notes } = req.body;
    if (!paidBy || !paidTo || !amount || !currency || !settlementDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const targetCurrency = group.base_currency;
    const rate = currency === targetCurrency ? 1 : await fetchRate(currency, targetCurrency);
    const converted = Number(amount) * rate;

    const settlement = await prisma.settlement.create({
      data: {
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/settlements/:groupId
router.get('/:groupId', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const settlements = await prisma.settlement.findMany({
      where: { group_id: groupId },
      include: {
        payer: { select: { id: true, display_name: true } },
        payee: { select: { id: true, display_name: true } },
      },
      orderBy: { settlement_date: 'desc' },
    });
    res.json({ settlements });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
