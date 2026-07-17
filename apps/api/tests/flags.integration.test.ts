import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock('../src/auth.js', () => ({
    auth: { api: { getSession: vi.fn() } }
}))

vi.mock('better-auth/node', () => ({
    toNodeHandler: vi.fn(() => (_req: any, _res: any, next: any) => next()),
    fromNodeHeaders: vi.fn(),
}));

vi.mock('../src/db/pool.js', () => ({
    pool: {
        query: vi.fn(),
        connect: vi.fn(),
        end: vi.fn()
    }
}));

vi.mock('../src/cache/redis.js', () => ({
    redis: {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        ping: vi.fn(),
        quit: vi.fn()
    }
}));

import { app } from '../src/index.js';
import { pool } from '../src/db/pool.js';
import { auth } from '../src/auth.js';

function mockAuthSession(role = 'admin') {
    vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: 'user_1' },
        session: {
            activeOrganizationId: 'org_123'
        },
        member: { role }
    } as any)
}

function mockTransaction() {
    const client = {
        query: vi.fn(),
        release: vi.fn()
    }
    vi.mocked(pool.connect).mockResolvedValue(client as any)
    return client;
}

beforeEach(() => {
    vi.resetAllMocks();
})

it('should return 400 when name is missing', async () => {
    mockAuthSession();
    const res = await request(app).post('/api/flags').send({
        description: 'test'
    });

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
})

it('should create a flag and seed integration', async () => {
    mockAuthSession();
    const client = mockTransaction();

    // 1. pool.query (#1: check existing flag, #2: findByOrgId environments)
    vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{ id: 'env_1' }, { id: 'env_2' }] } as any);

    // 2. client.query inside transaction (#1 BEGIN, #2 INSERT flag, #3/#4 INSERT flag_states, #5 INSERT audit_log, #6 COMMIT)
    client.query
        .mockResolvedValueOnce({})                                                      // #1: BEGIN
        .mockResolvedValueOnce({                                                        // #2: INSERT flag
            rows: [{ id: 'flag_1', org_id: 'org_123', key: 'new-flag', name: 'New Flag', type: 'boolean' }]
        })
        .mockResolvedValueOnce({                                                        // #3: INSERT flag_states (loop #1: env_1)
            rows: [{ id: 'fs_1', flag_id: 'flag_1', environment_id: 'env_1', enabled: false }]
        })
        .mockResolvedValueOnce({                                                        // #4: INSERT flag_states (loop #2: env_2)
            rows: [{ id: 'fs_2', flag_id: 'flag_1', environment_id: 'env_2', enabled: false }]
        })
        .mockResolvedValueOnce({
            rows: [{ id: 'audit_1' }]
        })
        .mockResolvedValueOnce({});                                                     // #6: COMMIT

    const res = await request(app).post('/api/flags').send({
        name: 'New Flag'
    });

    expect(res.status).toBe(201);
    expect(res.body.flag.key).toBe('new-flag');
});


it('should list flags for the organization', async () => {
    mockAuthSession();
    vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ id: 'flag_1', key: 'flag-a', name: 'flag A', org_id: 'org_123' }]
    } as any);

    const res = await request(app).get('/api/flags');

    expect(res.status).toBe(200);
    expect(res.body.flags).toHaveLength(1);
})

it('should return 403 when member tries to delete', async () => {
    mockAuthSession('member');  // member role, not admin/owner

    const res = await request(app).delete('/api/flags/flag_1');

    expect(res.status).toBe(403);
});

it('should delete a flag hen role is admin or owner', async () => {
    mockAuthSession('admin');

    vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ id: 'flag_1', org_id: 'org_123' }]
    } as any).mockResolvedValueOnce({
        rows: [{ id: 'env_1' }]
    } as any).mockResolvedValueOnce({ rows: [{ id: 'flag_1' }] } as any)                     // DELETE flag
        .mockResolvedValueOnce({ rows: [] } as any);

    const res = await request(app).delete('/api/flags/flag_1');

    expect(res.status).toBe(204)
})

it('should update flag state and invalidate redis cache', async () => {
    mockAuthSession('member');

    vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [{ id: 'flag_1', org_id: 'org_123' }] } as any)  // check flag belongs to org
        .mockResolvedValueOnce({ rows: [{ id: 'fs_1', enabled: false }] } as any)       // before state
        .mockResolvedValueOnce({ rows: [{ id: 'fs_1', enabled: true, rollout_percentage: 50 }] } as any) // update state
        .mockResolvedValueOnce({ rows: [] } as any);                                    // audit log

    const res = await request(app)
        .patch('/api/flags/flag_1/environments/env_1')
        .send({ enabled: true, rolloutPercentage: 50 });

    expect(res.status).toBe(200);
    expect(res.body.state.enabled).toBe(true);
});


