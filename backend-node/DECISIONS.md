# Decision Log

## Importer Does Not Auto-Correct Data

Options considered:

- Normalize and import messy rows automatically.
- Reject the whole file on the first error.
- Import clean rows and produce an explicit anomaly report for every questionable row.

Decision: import clean rows and report every anomaly. This satisfies the assignment requirement that the CSV is uploaded as-is while avoiding silent guesses.

## INR as Settlement Currency

Options considered:

- Calculate balances separately per currency.
- Convert every expense to INR while storing original currency and rate.

Decision: convert to INR for balances, while preserving original amount, currency, exchange rate, and converted amount. This keeps Aisha's "one number" requirement simple and Priya's USD concern traceable.

## Timeline Memberships

Options considered:

- Store only current group members.
- Store join and leave dates per group/user.

Decision: use `group_memberships.joined_on` and `left_on`. Expenses validate every payer and participant against the active membership date.

## Balance Traceability

Options considered:

- Store only computed user totals.
- Compute ledger entries from expenses and settlements each time.

Decision: compute from source records. The trace endpoint returns the exact expenses and settlements that created a balance.

## Duplicate Policy

Options considered:

- Delete duplicates automatically.
- Keep all rows.
- Skip exact duplicates and block conflicting duplicates.

Decision: exact duplicates are skipped with an anomaly; conflicting duplicates are blocked. Meera's requirement explicitly asks for approval before deletion or changes.

## Rounding

Amounts are rounded to two decimals using `HALF_UP`. Any split remainder caused by equal division is assigned one paise at a time to participants in request order, and the trace records the final split amounts.

