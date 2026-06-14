# Scope, Anomaly Log, and Schema

## Implemented

- Authentication with JWT on Node/Express
- Group and timeline membership management
- Expense CRUD with equal, exact amount, percentage, and share split support
- Settlement recording
- Balance engine with simplified settlements
- Balance traceability by expense contribution
- CSV import with anomaly detection and import reports
- Audit logging
- PostgreSQL schema

## Known Assignment Timeline

- Aisha, Rohan, Priya, and Meera are active from 2026-02-01.
- Dev is treated as a trip participant for 2026-02-08 through 2026-03-14.
- Meera leaves on 2026-03-31.
- Sam joins on 2026-04-10.

## CSV Anomalies Detected

The importer detects the following categories:

- Duplicate expenses: same normalized date, description, payer, amount, currency, split type, and participants.
- Conflicting duplicates: similar normalized date/description/participants but different amount or payer.
- Missing values: required cells such as paid_by, amount, currency, split_type, or split_with are blank.
- Invalid dates: date cannot be parsed into a valid calendar date.
- Ambiguous dates: date can be read as both DD-MM-YYYY and MM-DD-YYYY, or uses formats such as `Mar-14`.
- Negative amounts/refunds: amount is below zero.
- Missing currency: currency column is blank.
- Invalid participants: payer or participant is not a known group member alias.
- Membership violations: participant was not active on the expense date.
- Settlement recorded as expense: description/notes indicate payback, settlement, refund, or deposit transfer.
- Inconsistent usernames: casing, trailing spaces, or aliases such as `Priya S`.
- Invalid split totals: exact splits do not sum to amount or percentages do not sum to 100.
- Zero amount expenses.
- Unsupported split types.
- Split type/detail mismatch.

## Handling Policies

- `ACCEPT`: clean expense is imported.
- `SKIP`: exact duplicate is not imported and is reported.
- `REVIEW`: anomaly is safe to inspect but not silently changed, such as refund rows.
- `BLOCK`: row is not imported until the user fixes or explicitly resolves the issue.

## PostgreSQL Schema

See [database/schema.sql](database/schema.sql). Tables:

- `users`
- `groups`
- `group_memberships`
- `expenses`
- `expense_splits`
- `settlements`
- `imports`
- `anomalies`
- `audit_logs`
