import { Router, Response } from 'express';
import prisma from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/trace/:groupId/:userId
 * Returns a trace of all transactions that contribute to a user's balance.
 * Shows every expense where they paid or were split-assigned, plus settlements.
 */
router.get('/:groupId/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId, userId } = req.params;

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Expenses they paid
    const expensesPaid = await prisma.expense.findMany({
      where: { group_id: groupId, paid_by_user_id: userId },
      include: { splits: true },
      orderBy: { expense_date: 'asc' },
    });

    // Expense splits assigned to them (where they owe)
    const splitsOwed = await prisma.expenseSplit.findMany({
      where: {
        user_id: userId,
        expense: { group_id: groupId },
      },
      include: {
        expense: {
          select: {
            id: true,
            description: true,
            expense_date: true,
            paid_by_user_id: true,
            converted_amount: true,
            payer: { select: { id: true, display_name: true } },
          },
        },
      },
    });

    // Settlements where they paid
    const settlementsPaid = await prisma.settlement.findMany({
      where: { group_id: groupId, paid_by_user_id: userId },
      include: { payee: { select: { id: true, display_name: true } } },
      orderBy: { settlement_date: 'asc' },
    });

    // Settlements where they received
    const settlementsReceived = await prisma.settlement.findMany({
      where: { group_id: groupId, paid_to_user_id: userId },
      include: { payer: { select: { id: true, display_name: true } } },
      orderBy: { settlement_date: 'asc' },
    });

    // Build trace
    const trace: Array<{
      type: string;
      date: string;
      description: string;
      amount: number;
      effect: 'credit' | 'debit';
      counterparty?: string;
    }> = [];

    // Money they paid for group expenses (they are owed)
    for (const exp of expensesPaid) {
      trace.push({
        type: 'expense_paid',
        date: exp.expense_date.toISOString(),
        description: exp.description,
        amount: Number(exp.converted_amount),
        effect: 'credit',
      });
    }

    // Money they owe (their splits in others' expenses)
    for (const split of splitsOwed) {
      trace.push({
        type: 'expense_split',
        date: split.expense.expense_date.toISOString(),
        description: `Split of: ${split.expense.description}`,
        amount: Number(split.amount),
        effect: 'debit',
        counterparty: split.expense.payer.display_name,
      });
    }

    // Settlements paid (reduces what they owe)
    for (const s of settlementsPaid) {
      trace.push({
        type: 'settlement_paid',
        date: s.settlement_date.toISOString(),
        description: `Settlement to ${s.payee.display_name}`,
        amount: Number(s.converted_amount),
        effect: 'debit',
        counterparty: s.payee.display_name,
      });
    }

    // Settlements received (reduces what others owe them)
    for (const s of settlementsReceived) {
      trace.push({
        type: 'settlement_received',
        date: s.settlement_date.toISOString(),
        description: `Settlement from ${s.payer.display_name}`,
        amount: Number(s.converted_amount),
        effect: 'credit',
        counterparty: s.payer.display_name,
      });
    }

    // Sort by date
    trace.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Compute running balance
    let runningBalance = 0;
    const traceWithBalance = trace.map((t) => {
      if (t.effect === 'credit') {
        runningBalance += t.amount;
      } else {
        runningBalance -= t.amount;
      }
      return { ...t, runningBalance: Number(runningBalance.toFixed(2)) };
    });

    res.json({
      userId,
      userName: user.display_name,
      groupId,
      finalBalance: Number(runningBalance.toFixed(2)),
      trace: traceWithBalance,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
