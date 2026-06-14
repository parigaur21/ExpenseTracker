// src/routes/balance.ts
import { Router, Request, Response } from "express";
import { prisma } from "../server";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";

const router = Router();
router.use(requireAuth);

/**
 * GET /api/groups/:groupId/balance
 * Returns each member's net balance within the group.
 * Positive balance => the user is owed money.
 * Negative balance => the user owes money.
 */
router.get('/:groupId/balance', async (req: AuthRequest, res: Response) => {
  const { groupId } = req.params;

  // Fetch all users in the group (members + creator)
  const members = await prisma.group_memberships.findMany({
    where: { group_id: groupId },
    select: { user_id: true },
  });
  const creator = await prisma.groups.findUnique({
    where: { id: groupId },
    select: { created_by: true },
  });
  const memberIds = members.map(m => m.user_id);
  if (creator?.created_by) memberIds.push(creator.created_by);

  // Aggregate total paid per user (converted_amount of expenses they paid)
  const paidAgg = await prisma.expenses.groupBy({
    by: ["paid_by_user_id"],
    where: { group_id: groupId },
    _sum: { converted_amount: true },
  });

  // Aggregate total owed per user (sum of expense_splits.amount)
  const owedAgg = await prisma.expense_splits.groupBy({
    by: ["user_id"],
    where: { expense: { group_id: groupId } },
    _sum: { amount: true },
  });

  const balances = memberIds.map(userId => {
    const paid = paidAgg.find(p => p.paid_by_user_id === userId)?._sum?.converted_amount ?? 0;
    const owed = owedAgg.find(o => o.user_id === userId)?._sum?.amount ?? 0;
    return { userId, balance: Number(paid) - Number(owed) };
  });

  res.json({ balances });
});

export default router;
