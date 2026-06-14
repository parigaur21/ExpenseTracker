import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import authRouter from './routes/auth';
import groupRouter from './routes/group';
import expenseRouter from './routes/expense';
import balanceRouter from './routes/balance';
import settlementRouter from './routes/settlement';
import traceRouter from './routes/trace';
import auditRouter from './routes/audit';
import { verifyToken } from './middleware/auth';

const app = express();

app.use(cors());
app.use(express.json());

// Health check (public)
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Auth routes (public - no token required)
app.use('/api/auth', authRouter);

// Protected routes - apply verifyToken
app.use(verifyToken);
app.use('/api/groups', groupRouter);
app.use('/api/expenses', expenseRouter);
app.use('/api/balance', balanceRouter);
app.use('/api/settlements', settlementRouter);
app.use('/api/trace', traceRouter);
app.use('/api/audit', auditRouter);

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT ?? 4000;

if (require.main === module) {
  app.listen(PORT, () => console.log(`🚀 Server listening on http://localhost:${PORT}`));
}

export { app };
