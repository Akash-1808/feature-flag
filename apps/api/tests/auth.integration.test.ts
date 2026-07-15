import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { seedDefaultEnvironments } from '../src/hooks/org-created.js';
import { requireSession, requireOrgRole } from '../src/middleware/session.middleware.js';
import { pool } from '../src/db/pool.js';
import { auth } from '../src/auth.js';
import { UnauthorizedError, ForbiddenError } from '../src/utils/errors.js';

vi.mock('../src/db/pool.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../src/auth.js', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

describe('Auth & Organization Integration Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('seedDefaultEnvironments', () => {
    it('should insert dev, staging, and prod environments for a new organization', async () => {
      vi.mocked(pool.query).mockResolvedValue({ rowCount: 1 } as any);

      const orgId = 'org_123';
      await seedDefaultEnvironments(orgId);

      expect(pool.query).toHaveBeenCalledTimes(3);
      expect(pool.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO environments'),
        ['Development', 'dev', orgId]
      );
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO environments'),
        ['Staging', 'staging', orgId]
      );
      expect(pool.query).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('INSERT INTO environments'),
        ['Production', 'prod', orgId]
      );
    });

    it('should throw and log an error if database query fails', async () => {
      vi.mocked(pool.query).mockRejectedValueOnce(new Error('DB connection error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(seedDefaultEnvironments('org_fail')).rejects.toThrow('DB connection error');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('requireSession middleware', () => {
    it('should call next with UnauthorizedError when session is null', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

      const req = { headers: {} } as Request;
      const res = {} as Response;
      const next = vi.fn() as NextFunction;

      await requireSession(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      expect(next.mock.calls[0]?.[0]?.statusCode).toBe(401);
    });

    it('should attach session to req and call next() when session exists', async () => {
      const mockSession = { user: { id: 'user_1' }, session: { id: 'sess_1' } };
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(mockSession as any);

      const req = { headers: {} } as any;
      const res = {} as Response;
      const next = vi.fn() as NextFunction;

      await requireSession(req, res, next);

      expect(req.session).toEqual(mockSession);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('requireOrgRole middleware', () => {
    it('should call next with ForbiddenError when user has insufficient role', () => {
      const middleware = requireOrgRole('admin', 'owner');
      const req = { session: { member: { role: 'member' } } } as any;
      const res = {} as Response;
      const next = vi.fn() as NextFunction;

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
      expect(next.mock.calls[0]?.[0]?.statusCode).toBe(403);
    });

    it('should call next() without errors when user has allowed role', () => {
      const middleware = requireOrgRole('admin', 'owner');
      const req = { session: { member: { role: 'admin' } } } as any;
      const res = {} as Response;
      const next = vi.fn() as NextFunction;

      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });
});
