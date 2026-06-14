# Shared Expenses Management App

Full-stack Splitwise-like expense manager built for the Spreetail assignment.

## Stack

- Frontend: React, TypeScript, Vite, TailwindCSS
- Backend: Node.js, Express, TypeScript, JWT
- Database: PostgreSQL

## Quick Start

### Database

```bash
docker compose up -d db
```

### Backend

```bash
cd backend
npm install
npm run seed
npm run dev
```

The API starts on `http://localhost:8080`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The UI starts on `http://localhost:5173`.

## Default Flow

1. Register or login.
2. Create a group.
3. Add memberships with effective join/leave dates.
4. Upload `Expenses Export.csv` through Import CSV.
5. Review anomalies in the generated import report.
6. Open Balance Summary and click any balance to see the expense-level explanation.

## Important Policies

- The importer never edits CSV values silently.
- Rows with structural errors, invalid dates, invalid users, missing currency, zero amounts, invalid split totals, or membership violations are blocked.
- Negative amounts are treated as refunds and require review before posting.
- Duplicate rows are flagged. Exact duplicates are skipped by default. Conflicting duplicates are blocked for manual review.
- Settlements found in the expense CSV are recorded as anomalies and can be re-entered through the settlement flow.
- USD expenses store the original amount, original currency, exchange rate, and converted INR amount.

## API Overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/groups`
- `POST /api/groups`
- `POST /api/groups/{groupId}/memberships`
- `GET /api/groups/{groupId}/expenses`
- `POST /api/groups/{groupId}/expenses`
- `GET /api/groups/{groupId}/settlements`
- `POST /api/groups/{groupId}/settlements`
- `POST /api/groups/{groupId}/imports/csv`
- `GET /api/imports/{importId}`
- `GET /api/groups/{groupId}/balances`
- `GET /api/groups/{groupId}/balances/trace?fromUserId=&toUserId=`
- `GET /api/groups/{groupId}/audit-logs`

## AI Usage

See [AI_USAGE.md](AI_USAGE.md).
