import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth.js', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('better-auth/node', () => ({
  fromNodeHeaders: vi.fn(),
  toNodeHandler: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

vi.mock('../src/db/pool.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('../src/cache/redis.js', () => ({
  redis: {
    status: 'ready',
    incr: vi.fn(),
    pexpire: vi.fn(),
    pttl: vi.fn(),
  },
}));

import { app } from '../src/index.js';
import { auth } from '../src/auth.js';
import { pool } from '../src/db/pool.js';
import { redis } from '../src/cache/redis.js';

describe('Week 6 Security Hardening Integration Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('6.1 API Key Scoping Enforcement', () => {
    it('should allow client or server API key on GET /sdk/flags', async () => {
      // Mock valid client API key
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          {
            id: 'key_client_1',
            org_id: 'org_1',
            environment_id: 'env_dev',
            key_hash: 'hashed',
            type: 'client',
            revoked: false,
          },
        ],
      } as any).mockResolvedValueOnce({ rows: [] } as any) // update lastUsed
      .mockResolvedValueOnce({ rows: [] } as any); // getRuleset flags

      const res = await request(app)
        .get('/sdk/flags')
        .set('x-api-key', 'ff_client_dev_secret');

      expect(res.status).toBe(200);
    });

    it('should reject client API key on POST /sdk/evaluate with 403 Forbidden', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          {
            id: 'key_client_1',
            org_id: 'org_1',
            environment_id: 'env_dev',
            key_hash: 'hashed',
            type: 'client',
            revoked: false,
          },
        ],
      } as any).mockResolvedValueOnce({ rows: [] } as any);

      const res = await request(app)
        .post('/sdk/evaluate')
        .set('x-api-key', 'ff_client_dev_secret')
        .send({ flagKey: 'test-flag', userId: 'user-1' });

      expect(res.status).toBe(403);
      expect(res.body.error?.message || res.body.message).toContain('Forbidden');
    });

    it('should reject dev API key when querying prod environment with 403 Forbidden', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          {
            id: 'key_dev_1',
            org_id: 'org_1',
            environment_id: 'env_dev',
            key_hash: 'hashed',
            type: 'server',
            revoked: false,
          },
        ],
      } as any);

      const res = await request(app)
        .get('/sdk/flags?envId=env_prod')
        .set('x-api-key', 'ff_server_dev_secret');

      expect(res.status).toBe(403);
      expect(res.body.error?.message || res.body.message).toContain('scoped to environment');
    });
  });

  describe('6.2 RBAC Enforcement', () => {
    it('should reject member when attempting to delete targeting rules (requires admin/owner)', async () => {
      vi.mocked(auth.api.getSession as any).mockResolvedValue({
        session: { activeOrganizationId: 'org_1' },
        user: { id: 'u_1' },
        member: { role: 'member' },
      });

      const resDelete = await request(app)
        .delete('/api/flags/f_1/environments/e_1/rules/r_1')
        .set('Cookie', 'session=123');

      expect(resDelete.status).toBe(403);
    });

    it('should reject member when attempting to delete API keys (requires admin/owner)', async () => {
      vi.mocked(auth.api.getSession as any).mockResolvedValue({
        session: { activeOrganizationId: 'org_1' },
        user: { id: 'u_1' },
        member: { role: 'member' },
      });

      const res = await request(app)
        .delete('/api/api-keys/key_1')
        .set('Cookie', 'session=123');

      expect(res.status).toBe(403);
    });
  });

  describe('6.3 Rate Limiting', () => {
    it('should return 429 Too Many Requests when rate limit is exceeded', async () => {
      vi.mocked(redis.incr).mockResolvedValue(121); // SDK limit is 120
      vi.mocked(redis.pttl).mockResolvedValue(45000);

      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          {
            id: 'key_server_1',
            org_id: 'org_1',
            environment_id: 'env_dev',
            key_hash: 'hashed',
            type: 'server',
            revoked: false,
          },
        ],
      } as any);

      const res = await request(app)
        .get('/sdk/flags')
        .set('x-api-key', 'ff_server_dev_secret');

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too many requests');
    });
  });
});
