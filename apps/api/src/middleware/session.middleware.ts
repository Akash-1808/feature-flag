import { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { pool } from '../db/pool.js';

// Add global Express type augmentation so TypeScript knows about req.orgId across all routes:
declare global {
  namespace Express {
    interface Request {
      session?: any;
      orgId?: string;
    }
  }
}

/**
 * Middleware: Ensures an active organization is selected and attaches req.orgId
 */
export const requireActiveOrg = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const session = req.session || (req as any).session;
  const orgId = session?.session?.activeOrganizationId;

  if (!orgId) {
    next(new UnauthorizedError('No active organization selected in session'));
    return;
  }

  req.orgId = orgId;
  try {
    if (session?.user?.id) {
      if (typeof auth.api?.getActiveMember === 'function') {
        const activeMember = await auth.api.getActiveMember({
          headers: fromNodeHeaders(req.headers),
        });
        if (activeMember) {
          session.member = activeMember;
        }
      }
      if (!session.member) {
        const result = await pool.query(`SELECT role FROM member WHERE organization_id = $1 AND user_id = $2`, [orgId, session.user.id]);
        if (result.rows[0]) {
          session.member = result.rows[0];
        }
      }
    }
    next();
  } catch (error) {
    next(error)
  }
};


export const requireSession = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      throw new UnauthorizedError('Authentication required');
    }

    (req as any).session = session;
    next();
  } catch (err) {
    next(err);
  }
};

export const requireOrgRole = (...allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const session = (req as any).session;

    if (!session || !session.member || !allowedRoles.includes(session.member.role)) {
      next(new ForbiddenError(`Required role: ${allowedRoles.join(' or ')}`));
      return;
    }

    next();
  };
};
