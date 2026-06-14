import { query } from './db.js';
import { money } from './money.js';

export async function balanceSummary(groupId: string) {
  const expenses = await expensesWithSplits(groupId);
  const settlements = await query<any>(
    `select s.*, p.display_name paid_by_name, t.display_name paid_to_name
     from settlements s join users p on p.id = s.paid_by_user_id join users t on t.id = s.paid_to_user_id
     where s.group_id = $1 order by s.settlement_date`,
    [groupId]
  );
  const net = new Map<string, { userId: string; displayName: string; netAmount: number }>();
  const add = (id: string, name: string, amount: number) => {
    const current = net.get(id) ?? { userId: id, displayName: name, netAmount: 0 };
    current.netAmount = money(current.netAmount + amount);
    net.set(id, current);
  };
  for (const expense of expenses) {
    add(expense.paid_by_user_id, expense.paid_by, Number(expense.converted_amount));
    for (const split of expense.splits) add(split.user_id, split.display_name, -Number(split.amount));
  }
  for (const settlement of settlements.rows) {
    add(settlement.paid_by_user_id, settlement.paid_by_name, Number(settlement.converted_amount));
    add(settlement.paid_to_user_id, settlement.paid_to_name, -Number(settlement.converted_amount));
  }
  return {
    balances: [...net.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    settlements: simplify([...net.values()])
  };
}

export async function balanceTrace(groupId: string, fromUserId: string, toUserId: string) {
  const expenses = await expensesWithSplits(groupId);
  const lines: any[] = [];
  let netAmount = 0;
  for (const expense of expenses) {
    if (expense.paid_by_user_id === toUserId) {
      for (const split of expense.splits.filter((s: any) => s.user_id === fromUserId)) {
        netAmount = money(netAmount + Number(split.amount));
        lines.push({ sourceId: expense.id, sourceType: 'EXPENSE', date: expense.expense_date, description: expense.description, amount: split.amount, reason: `${split.display_name} share owed to payer ${expense.paid_by}` });
      }
    }
    if (expense.paid_by_user_id === fromUserId) {
      for (const split of expense.splits.filter((s: any) => s.user_id === toUserId)) {
        netAmount = money(netAmount - Number(split.amount));
        lines.push({ sourceId: expense.id, sourceType: 'EXPENSE', date: expense.expense_date, description: expense.description, amount: -Number(split.amount), reason: 'Reverse contribution because payer already covered the other member' });
      }
    }
  }
  return { fromUserId, toUserId, netAmount, lines };
}

async function expensesWithSplits(groupId: string) {
  const expenses = await query<any>(
    `select e.*, u.display_name paid_by
     from expenses e join users u on u.id = e.paid_by_user_id
     where e.group_id = $1 order by e.expense_date`,
    [groupId]
  );
  const splits = await query<any>(
    `select es.*, u.display_name
     from expense_splits es join expenses e on e.id = es.expense_id join users u on u.id = es.user_id
     where e.group_id = $1`,
    [groupId]
  );
  return expenses.rows.map(expense => ({ ...expense, splits: splits.rows.filter(split => split.expense_id === expense.id) }));
}

function simplify(balances: { userId: string; displayName: string; netAmount: number }[]) {
  const debtors = balances.filter(b => b.netAmount < 0).map(b => ({ ...b, amount: Math.abs(b.netAmount) }));
  const creditors = balances.filter(b => b.netAmount > 0).map(b => ({ ...b, amount: b.netAmount }));
  const settlements = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = money(Math.min(debtors[i].amount, creditors[j].amount));
    settlements.push({ fromUserId: debtors[i].userId, fromUser: debtors[i].displayName, toUserId: creditors[j].userId, toUser: creditors[j].displayName, amount });
    debtors[i].amount = money(debtors[i].amount - amount);
    creditors[j].amount = money(creditors[j].amount - amount);
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return settlements;
}

