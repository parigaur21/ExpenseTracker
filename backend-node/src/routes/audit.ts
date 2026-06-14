import { Router, Response } from 'express';
import prisma from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// GET /api/audit - list recent audit logs (supports pagination)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const logs = await prisma.auditLog.findMany({
      take: limit,
      skip: offset,
      orderBy: { created_at: 'desc' },
      include: {
        actor: { select: { id: true, display_name: true, username: true } },
        group: { select: { id: true, name: true } },
      },
    });

    const total = await prisma.auditLog.count();

    res.json({ logs, total, limit, offset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/audit/group/:groupId - audit logs for a specific group
router.get('/group/:groupId', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const logs = await prisma.auditLog.findMany({
      where: { group_id: groupId },
      take: limit,
      skip: offset,
      orderBy: { created_at: 'desc' },
      include: {
        actor: { select: { id: true, display_name: true, username: true } },
      },
    });

    res.json({ logs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
