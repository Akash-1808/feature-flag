import { Router } from 'express';
import { requireSession } from '../middleware/session.middleware.js';
import { pool } from '../db/pool.js';
import { auth } from '../auth.js';
import { fromNodeHeaders } from 'better-auth/node';

const router = Router();

// 1. Fetch organizations for the current user
router.get('/', requireSession, async (req, res, next) => {
  try {
    const session = (req as any).session;
    const userId = session.user.id;

    const result = await pool.query(
      `SELECT o.id, o.name, o.slug, o.logo 
       FROM organization o
       JOIN member m ON o.id = m."organizationId"
       WHERE m."userId" = $1
       ORDER BY o."createdAt" ASC`,
      [userId]
    );

    res.json({ organizations: result.rows });
  } catch (err) {
    next(err);
  }
});

// 2. Explicitly set active organization in Better Auth session
router.post('/set-active', requireSession, async (req, res, next) => {
  try {
    const { organizationId } = req.body;
    
    if (!organizationId) {
      res.status(400).json({ error: 'organizationId is required' });
      return;
    }

    // Verify user is actually a member of this org
    const session = (req as any).session;
    const userId = session.user.id;
    
    const membership = await pool.query(
      `SELECT 1 FROM member WHERE "userId" = $1 AND "organizationId" = $2`,
      [userId, organizationId]
    );

    if (membership.rowCount === 0) {
      res.status(403).json({ error: 'You do not have access to this organization' });
      return;
    }

    // Call Better Auth to update the session securely
    await auth.api.setActiveOrganization({
      headers: fromNodeHeaders(req.headers),
      body: { organizationId }
    });

    res.json({ success: true, activeOrganizationId: organizationId });
  } catch (err) {
    next(err);
  }
});

export default router;
