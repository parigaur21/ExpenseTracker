export type User = { id: string; displayName: string; email: string };
export type Group = { id: string; name: string; baseCurrency: string };
export type Membership = { id: string; userId: string; displayName: string; joinedOn: string; leftOn?: string };
export type Split = { userId: string; displayName: string; amount: string; percentage?: string; shareUnits?: string };
export type Expense = {
  id: string; expenseDate: string; description: string; paidByUserId: string; paidBy: string;
  originalAmount: string; originalCurrency: string; exchangeRate: string; convertedAmount: string;
  splitType: string; sourceRowNumber?: number; splits: Split[];
};
export type Settlement = {
  id: string; paidByUserId: string; paidBy: string; paidToUserId: string; paidTo: string;
  settlementDate: string; originalAmount: string; originalCurrency: string; convertedAmount: string; notes?: string;
};
export type ImportReport = {
  id: string; fileName: string; status: string; totalRows: number; acceptedRows: number; skippedRows: number;
  blockedRows: number; reviewRows: number; anomalies: Anomaly[];
};
export type Anomaly = { id: string; rowNumber: number; type: string; severity: string; action: string; message: string; rawRow: string };
export type BalanceSummary = {
  balances: { userId: string; displayName: string; netAmount: string }[];
  settlements: { fromUserId: string; fromUser: string; toUserId: string; toUser: string; amount: string }[];
};
export type BalanceTrace = {
  fromUserId: string; toUserId: string; netAmount: string;
  lines: { sourceId: string; sourceType: string; date: string; description: string; amount: string; reason: string }[];
};

