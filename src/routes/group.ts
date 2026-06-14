// src/routes/group.ts
import { Router, Request, Response } from "express";
import { prisma } from "../server";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { v4 as uuidv4 } from "uuid";

const router = Router();
router.use(requireAuth);

// POST /api/groups - create a new group
router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, baseCurrency } = req.body;
  if (!name) return res.status(400).json({ error: "Group name required" });
  const creatorId = req.userId;
  const group = await prisma.groups.create({
    data: {
      id: uuidv4(),
      name,
      base_currency: baseCurrency || "INR",
      created_by: creatorId,
    },
  });
  // Add creator as member with ADMIN role
  await prisma.group_memberships.create({
    data: {
      id: uuidv4(),
      group_id: group.id,
      user_id: creatorId,
      joined_on: new Date(),
      role: "ADMIN",
    },
  });
  res.status(201).json({ group });
});

// GET /api/groups/:groupId/members - list members
router.get('/:groupId/members', async (req: AuthRequest, res: Response) => {
  const { groupId } = req.params;
  const members = await prisma.group_memberships.findMany({
    where: { group_id: groupId },
    include: { user: true },
  });
  res.json({ members });
});

// POST /api/groups/:groupId/members - add a member (expects userId)
router.post('/:groupId/members', async (req: AuthRequest, res: Response) => {
  const { groupId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  const membership = await prisma.group_memberships.create({
    data: {
      id: uuidv4(),
      group_id: groupId,
      user_id: userId,
      joined_on: new Date(),
      role: "MEMBER",
    },
  });
  res.status(201).json({ membership });
});

export default router;
