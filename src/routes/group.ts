import { Router, Response } from 'express';
import prisma from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// GET /api/groups - list groups the authenticated user belongs to
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const memberships = await prisma.groupMembership.findMany({
      where: { user_id: req.userId },
      include: { group: true },
    });
    const groups = memberships.map(m => m.group);
    res.json({ groups });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/groups - create a new group
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, baseCurrency } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name required' });
    const creatorId = req.userId!;
    const group = await prisma.group.create({
      data: {
        name,
        base_currency: baseCurrency || 'INR',
        created_by: creatorId,
      },
    });
    // Add creator as member with ADMIN role
    await prisma.groupMembership.create({
      data: {
        group_id: group.id,
        user_id: creatorId,
        joined_on: new Date(),
        role: 'ADMIN',
      },
    });
    res.status(201).json({ group });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/groups/:groupId/members - list members
router.get('/:groupId/members', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const members = await prisma.groupMembership.findMany({
      where: { group_id: groupId },
      include: { user: { select: { id: true, display_name: true, username: true, email: true } } },
    });
    res.json({ members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/groups/:groupId/members - add a member
router.post('/:groupId/members', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const membership = await prisma.groupMembership.create({
      data: {
        group_id: groupId,
        user_id: userId,
        joined_on: new Date(),
        role: 'MEMBER',
      },
    });
    res.status(201).json({ membership });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
