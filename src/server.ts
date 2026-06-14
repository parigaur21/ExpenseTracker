// src/server.ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import authRouter from "./routes/auth";
import expenseRouter from "./routes/expense";
import balanceRouter from "./routes/balance";
import settlementRouter from "./routes/settlement";
import { verifyToken } from "./middleware/auth";
import { auditLog } from "./middleware/audit";

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());
app.use(verifyToken);
app.use(auditLog);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/expenses", expenseRouter);
app.use("/api/groups", balanceRouter);
app.use("/api/settlements", settlementRouter);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => console.log(`🚀 Server listening on http://localhost:${PORT}`));

export { app, prisma };
