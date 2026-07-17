import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FeatureFlagClient } from '../src/client.js';
import { Ruleset } from '../src/types.js';

describe('FeatureFlagClient', () => {
    let mockFetch: any;

    beforeEach(() => {
        mockFetch = vi.fn();
        global.fetch = mockFetch;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should initialize, evaluate flags from cache, and destroy cleanly', async () => {
        const ruleset: Ruleset = {
            flags: [
                { key: 'new-feature', enabled: true, rolloutPct: 100, defaultValue: false, rules: [] },
                { key: 'max-items', enabled: true, rolloutPct: 100, defaultValue: 50, rules: [] }
            ],
            etag: 'W/"etag-1"'
        };

        mockFetch.mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: async () => ruleset
        });

        const client = new FeatureFlagClient({
            apiKey: 'test-api-key',
            baseUrl: 'http://localhost:3001'
        });

        await client.initialize();

        expect(client.isEnabled('new-feature', { userId: 'u1' })).toBe(true);
        expect(client.getValue('max-items', { userId: 'u1' })).toBe(50);
        expect(client.getAllFlags()).toHaveProperty('new-feature');

        client.destroy();
        expect(client.isEnabled('new-feature', { userId: 'u1' })).toBe(false);
    });

    it('should fall back to config defaultValues without throwing when initialize() network call fails', async () => {
        mockFetch.mockRejectedValueOnce(new Error('API server unreachable'));

        const onError = vi.fn();
        const client = new FeatureFlagClient({
            apiKey: 'test-api-key',
            baseUrl: 'http://localhost:3001',
            defaultValues: {
                'new-feature': false,
                'fallback-flag': true,
                'limit': 10
            },
            onError
        });

        await expect(client.initialize()).resolves.not.toThrow();
        expect(onError).toHaveBeenCalledWith(expect.any(Error));

        // Should use configured defaultValues
        expect(client.isEnabled('fallback-flag', { userId: 'u1' })).toBe(true);
        expect(client.isEnabled('new-feature', { userId: 'u1' })).toBe(false);
        expect(client.getValue('limit', { userId: 'u1' })).toBe(10);

        client.destroy();
    });
});
