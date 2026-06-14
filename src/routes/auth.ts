// src/routes/auth.ts
import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../server";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

router.post("/signup", async (req: Request, res: Response) => {
  const { displayName, username, email, password } = req.body;
  if (!displayName || !username || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.users.create({
    data: {
      display_name: displayName,
      username,
      email,
      password_hash: hash,
    },
    select: { id: true, email: true, username: true, display_name: true },
  });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user });
});

router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  const user = await prisma.users.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user.id, email: user.email, username: user.username, display_name: user.display_name } });
});

export default router;
