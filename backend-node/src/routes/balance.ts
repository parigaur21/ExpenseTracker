import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { computeGroupBalances } from '../services/balanceEngine';

const router = Router();
router.use(requireAuth);

// GET /api/balance/:groupId
router.get('/:groupId', async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const balances = await computeGroupBalances(groupId);
    res.json({ balances });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
