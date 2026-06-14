# AI Usage

AI assistant used: Codex in the local Codex desktop app.

## Key Prompts

- Build a full-stack Splitwise-like Shared Expenses Management Application using React, TypeScript, TailwindCSS, JWT, and PostgreSQL.
- Replace the Java/Spring backend with a Node.js backend.
- Prioritize CSV import and anomaly detection, balance calculation, membership timeline handling, and traceability.
- Include README, SCOPE, DECISIONS, and AI_USAGE documentation.

## Human Review Notes

The engineer remains responsible for every file. The important assignment logic is intentionally concentrated in:

- `backend/src/importer.ts`
- `backend/src/balances.ts`
- `backend/src/services.ts`

## AI Mistakes Caught and Corrected

1. Initial PDF extraction used an unavailable library. I switched to the bundled `pypdf` package.
2. A naive balance design would have stored only totals. I changed it to compute balances from source expenses and settlements so Rohan's traceability requirement is met.
3. A tempting importer behavior was to normalize `priya`, `rohan `, and `Priya S` silently. I changed this to report `INCONSISTENT_USERNAME` while still mapping only known aliases through an explicit alias table.
