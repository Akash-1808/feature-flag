import { describe, it, expect } from 'vitest';
import { evaluateFlag } from '../src/evaluator.js';
import { FlagDefinition } from '../src/types.js';

describe('evaluateFlag', () => {
    it('should return defaultValue when flag is disabled regardless of rules and rollout', () => {
        const flag: FlagDefinition = {
            key: 'disabled-flag',
            enabled: false,
            rolloutPct: 100,
            defaultValue: false,
            rules: [
                { priority: 1, conditions: { role: { $eq: 'admin' } }, value: true }
            ]
        };

        const res = evaluateFlag(flag, { userId: 'user-1', attributes: { role: 'admin' } });
        expect(res).toBe(false);
    });

    it('should return rule value when a targeting rule matches', () => {
        const flag: FlagDefinition = {
            key: 'targeted-flag',
            enabled: true,
            rolloutPct: 0,
            defaultValue: false,
            rules: [
                { priority: 1, conditions: { plan: { $eq: 'enterprise' } }, value: true }
            ]
        };

        const res = evaluateFlag(flag, { userId: 'user-1', attributes: { plan: 'enterprise' } });
        expect(res).toBe(true);
    });

    it('should obey priority ordering when multiple targeting rules match', () => {
        const flag: FlagDefinition = {
            key: 'priority-flag',
            enabled: true,
            rolloutPct: 0,
            defaultValue: 'default-theme',
            rules: [
                { priority: 2, conditions: { country: { $eq: 'US' } }, value: 'us-theme' },
                { priority: 1, conditions: { vip: { $eq: true } }, value: 'vip-theme' }
            ]
        };

        // User matches both rules -> lowest priority number (1) wins
        const res = evaluateFlag(flag, { userId: 'user-1', attributes: { country: 'US', vip: true } });
        expect(res).toBe('vip-theme');
    });

    it('should fall through to rollout bucketing when no rules match', () => {
        const flagOff: FlagDefinition = {
            key: 'rollout-flag',
            enabled: true,
            rolloutPct: 0, // 0% rollout
            defaultValue: false,
            rules: []
        };
        expect(evaluateFlag(flagOff, { userId: 'user-any' })).toBe(false);

        const flagOn: FlagDefinition = {
            key: 'rollout-flag-on',
            enabled: true,
            rolloutPct: 100, // 100% rollout
            defaultValue: false,
            rules: []
        };
        expect(evaluateFlag(flagOn, { userId: 'user-any' })).toBe(true);
    });
});
