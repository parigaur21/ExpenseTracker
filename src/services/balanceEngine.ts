// src/services/balanceEngine.ts
import { prisma } from "../server";
import { Decimal } from "@prisma/client/runtime";

/**
 * Computes net balance for each user in a group.
 * Positive amount means the user is owed money, negative means they owe.
 */
export const computeGroupBalances = async (groupId: string) => {
  // Fetch all expenses and splits for the group
  const expenses = await prisma.expenses.findMany({
    where: { group_id: groupId },
    include: { expense_splits: true },
  });

  // Map userId -> Decimal balance
  const balances: Record<string, Decimal> = {};

  for (const exp of expenses) {
    const payerId = exp.paid_by_user_id;
    // Ensure payer entry
    if (!balances[payerId]) balances[payerId] = new Decimal(0);
    // Add total expense amount to payer (they are owed this amount)
    balances[payerId] = balances[payerId].add(new Decimal(exp.converted_amount));

    // Subtract each split amount from the corresponding user
    for (const split of exp.expense_splits) {
      const userId = split.user_id;
      if (!balances[userId]) balances[userId] = new Decimal(0);
      balances[userId] = balances[userId].sub(new Decimal(split.amount));
    }
  }

  // Apply settlements to reduce balances
  const settlements = await prisma.settlements.findMany({
    where: { group_id: groupId },
  });
  for (const set of settlements) {
    const payer = set.paid_by_user_id;
    const payee = set.paid_to_user_id;
    const amt = new Decimal(set.converted_amount);
    if (!balances[payer]) balances[payer] = new Decimal(0);
    if (!balances[payee]) balances[payee] = new Decimal(0);
    // payer gave money => decrease their balance
    balances[payer] = balances[payer].sub(amt);
    // payee receives money => increase their balance
    balances[payee] = balances[payee].add(amt);
  }

  // Convert to plain numbers for API response
  return Object.entries(balances).map(([userId, bal]) => ({
    userId,
    balance: Number(bal.toFixed(2)),
  }));
};
