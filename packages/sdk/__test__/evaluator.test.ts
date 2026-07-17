import { describe, it, expect } from 'vitest';
import { hashBucket, isUserInRollout, matchesConditions, evaluateRules } from '../src/evaluator.js';
import type { TargetingRuleInput } from '../src/evaluator.js';

// ─── hashBucket ─────────────────────────────────────────────────────────────

describe('hashBucket', () => {
    it('should return a number in [0, 99]', () => {
        for (let i = 0; i < 200; i++) {
            const bucket = hashBucket('flag', `user_${i}`);
            expect(bucket).toBeGreaterThanOrEqual(0);
            expect(bucket).toBeLessThan(100);
        }
    });

    it('should be deterministic — same inputs always produce same bucket', () => {
        const bucket1 = hashBucket('checkout-v2', 'user_abc');
        const bucket2 = hashBucket('checkout-v2', 'user_abc');
        expect(bucket1).toBe(bucket2);
    });

    it('should produce different buckets for different users', () => {
        const bucket1 = hashBucket('my-flag', 'user_1');
        const bucket2 = hashBucket('my-flag', 'user_2');
        // Not guaranteed by hash, but overwhelmingly likely for distinct inputs
        expect(bucket1).not.toBe(bucket2);
    });

    it('should produce different buckets for different flags', () => {
        const bucket1 = hashBucket('flag-a', 'same_user');
        const bucket2 = hashBucket('flag-b', 'same_user');
        expect(bucket1).not.toBe(bucket2);
    });
});

// ─── isUserInRollout ────────────────────────────────────────────────────────

describe('isUserInRollout', () => {
    it('should always return false when rolloutPct is 0', () => {
        for (let i = 0; i < 100; i++) {
            expect(isUserInRollout('flag', `user_${i}`, 0)).toBe(false);
        }
    });

    it('should always return true when rolloutPct is 100', () => {
        for (let i = 0; i < 100; i++) {
            expect(isUserInRollout('flag', `user_${i}`, 100)).toBe(true);
        }
    });

    it('should be deterministic for the same user', () => {
        const result1 = isUserInRollout('checkout-v2', 'user_42', 50);
        const result2 = isUserInRollout('checkout-v2', 'user_42', 50);
        expect(result1).toBe(result2);
    });

    it('should produce a roughly expected distribution for 50% rollout', () => {
        let included = 0;
        const total = 10_000;
        for (let i = 0; i < total; i++) {
            if (isUserInRollout('distribution-test', `user_${i}`, 50)) {
                included++;
            }
        }
        const ratio = included / total;
        // Allow ±5% tolerance
        expect(ratio).toBeGreaterThan(0.45);
        expect(ratio).toBeLessThan(0.55);
    });

    it('should guarantee monotonic rollout — increasing pct only adds users, never removes', () => {
        const users = Array.from({ length: 500 }, (_, i) => `user_${i}`);
        const flagKey = 'monotonic-test';

        // Users included at 20%
        const includedAt20 = new Set(users.filter(u => isUserInRollout(flagKey, u, 20)));
        // Users included at 50%
        const includedAt50 = new Set(users.filter(u => isUserInRollout(flagKey, u, 50)));

        // Every user in the 20% cohort must also be in the 50% cohort
        for (const user of includedAt20) {
            expect(includedAt50.has(user)).toBe(true);
        }
        // 50% cohort should be strictly larger
        expect(includedAt50.size).toBeGreaterThan(includedAt20.size);
    });

    it('should return false for negative rolloutPct', () => {
        expect(isUserInRollout('flag', 'user', -10)).toBe(false);
    });

    it('should return true for rolloutPct > 100', () => {
        expect(isUserInRollout('flag', 'user', 150)).toBe(true);
    });
});

// ─── matchesConditions ──────────────────────────────────────────────────────

describe('matchesConditions', () => {
    it('should match exact string equality', () => {
        expect(matchesConditions(
            { plan: 'enterprise' },
            { plan: 'enterprise' }
        )).toBe(true);
    });

    it('should not match when value differs', () => {
        expect(matchesConditions(
            { plan: 'enterprise' },
            { plan: 'free' }
        )).toBe(false);
    });

    it('should not match when attribute is missing', () => {
        expect(matchesConditions(
            { plan: 'enterprise' },
            { country: 'US' }
        )).toBe(false);
    });

    it('should match when all conditions are satisfied (AND logic)', () => {
        expect(matchesConditions(
            { plan: 'enterprise', country: 'US' },
            { plan: 'enterprise', country: 'US', age: 30 }
        )).toBe(true);
    });

    it('should not match when one condition fails (AND logic)', () => {
        expect(matchesConditions(
            { plan: 'enterprise', country: 'US' },
            { plan: 'enterprise', country: 'CA' }
        )).toBe(false);
    });

    it('should match empty conditions against any attributes', () => {
        expect(matchesConditions({}, { plan: 'free' })).toBe(true);
    });

    // ─── Operator tests ─────────────────────────────────────────────────

    it('should match $eq operator', () => {
        expect(matchesConditions(
            { plan: { $eq: 'enterprise' } },
            { plan: 'enterprise' }
        )).toBe(true);
    });

    it('should match $ne operator', () => {
        expect(matchesConditions(
            { plan: { $ne: 'free' } },
            { plan: 'enterprise' }
        )).toBe(true);
    });

    it('should not match $ne when values are equal', () => {
        expect(matchesConditions(
            { plan: { $ne: 'free' } },
            { plan: 'free' }
        )).toBe(false);
    });

    it('should match $gt operator', () => {
        expect(matchesConditions(
            { age: { $gt: 18 } },
            { age: 25 }
        )).toBe(true);
    });

    it('should not match $gt when equal', () => {
        expect(matchesConditions(
            { age: { $gt: 18 } },
            { age: 18 }
        )).toBe(false);
    });

    it('should match $gte operator when equal', () => {
        expect(matchesConditions(
            { age: { $gte: 18 } },
            { age: 18 }
        )).toBe(true);
    });

    it('should match $lt operator', () => {
        expect(matchesConditions(
            { age: { $lt: 65 } },
            { age: 30 }
        )).toBe(true);
    });

    it('should match $lte operator when equal', () => {
        expect(matchesConditions(
            { age: { $lte: 65 } },
            { age: 65 }
        )).toBe(true);
    });

    it('should match $in operator', () => {
        expect(matchesConditions(
            { country: { $in: ['US', 'CA', 'UK'] } },
            { country: 'CA' }
        )).toBe(true);
    });

    it('should not match $in when value not in list', () => {
        expect(matchesConditions(
            { country: { $in: ['US', 'CA', 'UK'] } },
            { country: 'JP' }
        )).toBe(false);
    });

    it('should match $nin operator', () => {
        expect(matchesConditions(
            { country: { $nin: ['CN', 'RU'] } },
            { country: 'US' }
        )).toBe(true);
    });

    it('should not match $nin when value is in exclusion list', () => {
        expect(matchesConditions(
            { country: { $nin: ['CN', 'RU'] } },
            { country: 'CN' }
        )).toBe(false);
    });

    it('should match combined operators (range)', () => {
        expect(matchesConditions(
            { age: { $gte: 18, $lt: 65 } },
            { age: 30 }
        )).toBe(true);
    });

    it('should not match combined operators when one fails', () => {
        expect(matchesConditions(
            { age: { $gte: 18, $lt: 65 } },
            { age: 70 }
        )).toBe(false);
    });

    it('should not match numeric operators against non-numeric values', () => {
        expect(matchesConditions(
            { age: { $gt: 18 } },
            { age: 'old' }
        )).toBe(false);
    });

    it('should not match unknown operators', () => {
        expect(matchesConditions(
            { plan: { $regex: 'enter.*' } as any },
            { plan: 'enterprise' }
        )).toBe(false);
    });

    it('should match boolean exact equality', () => {
        expect(matchesConditions(
            { beta: true },
            { beta: true }
        )).toBe(true);
    });

    it('should match null exact equality', () => {
        expect(matchesConditions(
            { deleted: null },
            { deleted: null }
        )).toBe(true);
    });
});

// ─── evaluateRules ──────────────────────────────────────────────────────────

describe('evaluateRules', () => {
    const rules: TargetingRuleInput[] = [
        {
            priority: 1,
            conditions: { plan: 'enterprise', country: 'US' },
            value: 'variant-a',
        },
        {
            priority: 2,
            conditions: { plan: 'enterprise' },
            value: 'variant-b',
        },
        {
            priority: 3,
            conditions: { beta: true },
            value: 'variant-c',
        },
    ];

    it('should return the value of the first matching rule', () => {
        // Matches rule 1 (enterprise + US)
        const result = evaluateRules(rules, { plan: 'enterprise', country: 'US' });
        expect(result).toBe('variant-a');
    });

    it('should fall through to lower priority rules when higher ones do not match', () => {
        // Does not match rule 1 (country != US), matches rule 2
        const result = evaluateRules(rules, { plan: 'enterprise', country: 'CA' });
        expect(result).toBe('variant-b');
    });

    it('should match the third rule when first two do not match', () => {
        const result = evaluateRules(rules, { plan: 'free', beta: true });
        expect(result).toBe('variant-c');
    });

    it('should return undefined when no rules match', () => {
        const result = evaluateRules(rules, { plan: 'free', country: 'JP' });
        expect(result).toBeUndefined();
    });

    it('should return undefined for empty rules array', () => {
        const result = evaluateRules([], { plan: 'enterprise' });
        expect(result).toBeUndefined();
    });

    it('should return undefined for empty attributes when rules have conditions', () => {
        const result = evaluateRules(rules, {});
        expect(result).toBeUndefined();
    });

    it('should support non-boolean rule values (objects, numbers)', () => {
        const configRules: TargetingRuleInput[] = [
            {
                priority: 1,
                conditions: { plan: 'enterprise' },
                value: { theme: 'dark', maxSeats: 100 },
            },
        ];
        const result = evaluateRules(configRules, { plan: 'enterprise' });
        expect(result).toEqual({ theme: 'dark', maxSeats: 100 });
    });
});
