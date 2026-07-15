import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth.js', () => ({
  auth: {},
}));

vi.mock('better-auth/node', () => ({
  toNodeHandler: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

vi.mock('../src/db/pool.js', () => ({
  pool: {
    query: vi.fn(),
    end: vi.fn(),
  },
}));

vi.mock('../src/cache/redis.js', () => ({
  redis: {
    ping: vi.fn(),
    quit: vi.fn(),
  },
}));

import { app } from '../src/index.js';
import { pool } from '../src/db/pool.js';
import { redis } from '../src/cache/redis.js';


describe('Health Check Integration Tests (GET /health)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return 200 ok when both database and redis are up', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ ok: 1 }] } as any);
    vi.mocked(redis.ping).mockResolvedValueOnce('PONG');

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      services: {
        database: 'up',
        redis: 'up',
      },
      timestamp: expect.any(String),
    });
  });

  it('should return 503 degraded when database is down', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('DB Connection Refused'));
    vi.mocked(redis.ping).mockResolvedValueOnce('PONG');

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services.database).toBe('error');
    expect(res.body.services.redis).toBe('up');
  });

  it('should return 503 degraded when redis is down', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ ok: 1 }] } as any);
    vi.mocked(redis.ping).mockRejectedValueOnce(new Error('Redis Connection Refused'));

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services.database).toBe('up');
    expect(res.body.services.redis).toBe('error');
  });
});
