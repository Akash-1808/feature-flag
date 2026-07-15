import { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

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
export const requireActiveOrg = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const session = req.session || (req as any).session;
  const orgId = session?.session?.activeOrganizationId;

  if (!orgId) {
    next(new UnauthorizedError('No active organization selected in session'));
    return;
  }

  req.orgId = orgId;
  next();
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
