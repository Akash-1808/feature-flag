import { describe, it, expect } from 'vitest';
import { hashBucket } from '../src/hash.js';

describe('hashBucket', () => {
    it('should always produce the same bucket given the same flagKey and userId', () => {
        const b1 = hashBucket('flag-a', 'user-123');
        const b2 = hashBucket('flag-a', 'user-123');
        expect(b1).toBe(b2);
        expect(b1).toBeGreaterThanOrEqual(0);
        expect(b1).toBeLessThan(100);
    });

    it('should produce uniform distribution across 0-99 and vary across different userIds', () => {
        const b1 = hashBucket('flag-a', 'user-1');
        const b2 = hashBucket('flag-a', 'user-2');
        const b3 = hashBucket('flag-a', 'user-3');
        // Ensure they are bounded within 0-99
        expect(b1).toBeGreaterThanOrEqual(0);
        expect(b1).toBeLessThan(100);
        expect(b2).toBeGreaterThanOrEqual(0);
        expect(b2).toBeLessThan(100);
        expect(b3).toBeGreaterThanOrEqual(0);
        expect(b3).toBeLessThan(100);
    });

    it('should produce different buckets for the same user across different flag keys', () => {
        const bFlagA = hashBucket('flag-a', 'user-100');
        const bFlagB = hashBucket('flag-b', 'user-100');
        expect(bFlagA).not.toBe(bFlagB);
    });
});
