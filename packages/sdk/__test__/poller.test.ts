import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Poller } from '../src/poller.js';
import { Ruleset } from '../src/types.js';

describe('Poller', () => {
    let mockFetch: any;

    beforeEach(() => {
        mockFetch = vi.fn();
        global.fetch = mockFetch;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should fetch ruleset, update ETag, and call onUpdate when response is 200 OK', async () => {
        const ruleset: Ruleset = {
            flags: [{ key: 'flag-a', enabled: true, rolloutPct: 100, defaultValue: false, rules: [] }],
            etag: 'W/"abc-123"'
        };

        mockFetch.mockResolvedValueOnce({
            status: 200,
            ok: true,
            json: async () => ruleset
        });

        const onUpdate = vi.fn();
        const onError = vi.fn();

        const poller = new Poller({
            baseUrl: 'http://localhost:3001',
            apiKey: 'test-key',
            interval: 1000,
            onUpdate,
            onError
        });

        await poller.fetchRuleset();

        expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/sdk/flags', {
            method: 'GET',
            headers: {
                'X-API-Key': 'test-key',
                'Accept': 'application/json'
            }
        });
        expect(onUpdate).toHaveBeenCalledWith(ruleset);
        expect(onError).not.toHaveBeenCalled();
    });

    it('should be a no-op when response is 304 Not Modified', async () => {
        mockFetch.mockResolvedValueOnce({
            status: 304,
            ok: true
        });

        const onUpdate = vi.fn();
        const onError = vi.fn();

        const poller = new Poller({
            baseUrl: 'http://localhost:3001',
            apiKey: 'test-key',
            interval: 1000,
            onUpdate,
            onError
        });

        await poller.fetchRuleset('W/"abc-123"');

        expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/sdk/flags', expect.objectContaining({
            headers: expect.objectContaining({
                'If-None-Match': 'W/"abc-123"'
            })
        }));
        expect(onUpdate).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
    });

    it('should call onError without throwing when a network or HTTP error occurs', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const onUpdate = vi.fn();
        const onError = vi.fn();

        const poller = new Poller({
            baseUrl: 'http://localhost:3001',
            apiKey: 'test-key',
            interval: 1000,
            onUpdate,
            onError
        });

        await expect(poller.fetchRuleset()).resolves.not.toThrow();
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('should start and stop interval cleanly', () => {
        vi.useFakeTimers();
        const poller = new Poller({
            baseUrl: 'http://localhost:3001',
            apiKey: 'test-key',
            interval: 1000,
            onUpdate: vi.fn(),
            onError: vi.fn()
        });

        poller.start();
        expect(vi.getTimerCount()).toBe(1);

        poller.stop();
        expect(vi.getTimerCount()).toBe(0);
        vi.useRealTimers();
    });
});
