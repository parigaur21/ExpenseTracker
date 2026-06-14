import prisma from '../prisma';

/**
 * Computes net balance for each user in a group.
 * Positive amount means the user is owed money, negative means they owe.
 */
export async function computeGroupBalances(groupId: string) {
  // Fetch all expenses and splits for the group
  const expenses = await prisma.expense.findMany({
    where: { group_id: groupId },
    include: { splits: true },
  });

  // Map userId -> balance (number)
  const balances: Record<string, number> = {};

  for (const exp of expenses) {
    const payerId = exp.paid_by_user_id;
    if (!balances[payerId]) balances[payerId] = 0;
    // Add total expense amount to payer (they are owed this amount)
    balances[payerId] += Number(exp.converted_amount);

    // Subtract each split amount from the corresponding user
    for (const split of exp.splits) {
      const userId = split.user_id;
      if (!balances[userId]) balances[userId] = 0;
      balances[userId] -= Number(split.amount);
    }
  }

  // Apply settlements to reduce balances
  const settlements = await prisma.settlement.findMany({
    where: { group_id: groupId },
  });
  for (const s of settlements) {
    const payer = s.paid_by_user_id;
    const payee = s.paid_to_user_id;
    const amt = Number(s.converted_amount);
    if (!balances[payer]) balances[payer] = 0;
    if (!balances[payee]) balances[payee] = 0;
    // payer gave money -> their net credit increases (they are owed more)
    balances[payer] += amt;
    // payee received money -> their net credit decreases (less owed to them)
    balances[payee] -= amt;
  }

  // Resolve user display names
  const userIds = Object.keys(balances);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, display_name: true, username: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  return userIds.map(userId => ({
    userId,
    displayName: userMap.get(userId)?.display_name ?? 'Unknown',
    username: userMap.get(userId)?.username ?? 'unknown',
    balance: Number(balances[userId].toFixed(2)),
  }));
}

/**
 * Compute simplified settlements: minimal set of transfers
 * to settle all debts in the group.
 */
export async function computeSimplifiedSettlements(groupId: string) {
  const balances = await computeGroupBalances(groupId);
  
  const debtors = balances.filter(b => b.balance < 0).map(b => ({ ...b, amount: Math.abs(b.balance) }));
  const creditors = balances.filter(b => b.balance > 0).map(b => ({ ...b, amount: b.balance }));
  
  // Sort by amount descending for greedy matching
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  
  const transfers: Array<{
    from: string;
    fromName: string;
    to: string;
    toName: string;
    amount: number;
  }> = [];
  
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0.01) {
      transfers.push({
        from: debtors[i].userId,
        fromName: debtors[i].displayName,
        to: creditors[j].userId,
        toName: creditors[j].displayName,
        amount: Number(amount.toFixed(2)),
      });
    }
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }
  
  return transfers;
}
