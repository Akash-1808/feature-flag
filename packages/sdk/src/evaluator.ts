import { EvaluationContext, FlagRule, FlagDefinition } from "./types.js";

/**
 * Fast, pure-TypeScript FNV-1a 32-bit hash function.
 * Zero external dependencies — works identically in Node.js and Browser SDKs.
 */
function fnv1aHash(str: string): number {
    let hash = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        // Multiply by FNV prime (0x01000193) using bit shifts to maintain 32-bit integer arithmetic
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return hash >>> 0; // Ensure unsigned 32-bit integer
}

/**
 * Deterministic rollout bucketing according to claude.md §7:
 * bucket = hash(flag_key + user_id) % 100 -> returns stable value in [0, 99]
 */
export function hashBucket(flagKey: string, userId: string): number {
    const combined = `${flagKey}:${userId}`;
    const hashValue = fnv1aHash(combined);
    return hashValue % 100;
}

/**
 * Evaluates whether a user falls within the rollout percentage [0, 100]
 */
export function isUserInRollout(flagKey: string, userId: string, rolloutPct: number): boolean {
    if (rolloutPct <= 0) return false;
    if (rolloutPct >= 100) return true;

    const bucket = hashBucket(flagKey, userId);
    return bucket < rolloutPct;
}

// ─── Targeting Rule Evaluation ──────────────────────────────────────────────

export interface TargetingConditions {
    [attribute: string]: unknown;
}

export interface TargetingRuleInput {
    priority: number;
    conditions: TargetingConditions;
    value: unknown;
}

/**
 * Evaluates a single condition value against a user's attribute value.
 *
 * Supported formats:
 *   - Exact match:  { "plan": "enterprise" }
 *   - Operators:    { "age": { "$gte": 18 } }
 *
 * Supported operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin
 */
function matchConditionValue(userValue: unknown, conditionValue: unknown): boolean {
    // Operator object: { "$gte": 18, "$lt": 65 }
    if (conditionValue !== null && typeof conditionValue === 'object' && !Array.isArray(conditionValue)) {
        const ops = conditionValue as Record<string, unknown>;
        const keys = Object.keys(ops);

        // Only treat as operator object if all keys start with $
        if (keys.length > 0 && keys.every(k => k.startsWith('$'))) {
            return keys.every(op => {
                const operand = ops[op];
                switch (op) {
                    case '$eq':
                        return userValue === operand;
                    case '$ne':
                        return userValue !== operand;
                    case '$gt':
                        return typeof userValue === 'number' && typeof operand === 'number' && userValue > operand;
                    case '$gte':
                        return typeof userValue === 'number' && typeof operand === 'number' && userValue >= operand;
                    case '$lt':
                        return typeof userValue === 'number' && typeof operand === 'number' && userValue < operand;
                    case '$lte':
                        return typeof userValue === 'number' && typeof operand === 'number' && userValue <= operand;
                    case '$in':
                        return Array.isArray(operand) && operand.includes(userValue);
                    case '$nin':
                        return Array.isArray(operand) && !operand.includes(userValue);
                    default:
                        return false; // Unknown operator = no match
                }
            });
        }
    }

    // Exact match (string, number, boolean, null)
    return userValue === conditionValue;
}

/**
 * Checks whether a user's attributes satisfy ALL conditions in a rule.
 * A rule matches only if every condition key matches the user's corresponding attribute.
 */
export function matchesConditions(
    conditions: TargetingConditions,
    attributes: Record<string, unknown>
): boolean {
    for (const [key, conditionValue] of Object.entries(conditions)) {
        const userValue = attributes[key];

        // If user doesn't have the attribute, the condition cannot match
        if (userValue === undefined) return false;

        if (!matchConditionValue(userValue, conditionValue)) return false;
    }
    return true;
}

/**
 * Evaluates targeting rules in priority order against user attributes.
 * Returns the value of the first matching rule, or undefined if no rule matches.
 *
 * Rules must be sorted by priority ASC (lowest number = highest priority).
 */
export function evaluateRules(
    rules: TargetingRuleInput[],
    attributes: Record<string, unknown>
): unknown | undefined {
    for (const rule of rules) {
        if (matchesConditions(rule.conditions, attributes)) {
            return rule.value;
        }
    }
    return undefined;
}

export function evaluateFlags(rules: FlagRule[], context: EvaluationContext) {
    const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);
    return evaluateRules(sortedRules, context.attributes || {});
}

/**
 * Evaluates a complete FlagDefinition against an EvaluationContext.
 * Order:
 * 1. If !flag.enabled -> return flag.defaultValue
 * 2. Check targeting rules in priority order. If match -> return rule.value
 * 3. Check rollout bucketing: if user is in rollout -> return true (or active value); otherwise flag.defaultValue
 */
export function evaluateFlag(flag: FlagDefinition, context: EvaluationContext): unknown {
    if (!flag.enabled) {
        return flag.defaultValue;
    }

    if (flag.rules && flag.rules.length > 0) {
        const sortedRules = [...flag.rules].sort((a, b) => a.priority - b.priority);
        const ruleValue = evaluateRules(sortedRules, context.attributes || {});
        if (ruleValue !== undefined) {
            return ruleValue;
        }
    }

    const inRollout = isUserInRollout(flag.key, context.userId, flag.rolloutPct);
    if (!inRollout) {
        return flag.defaultValue;
    }

    return typeof flag.defaultValue === 'boolean' ? true : flag.defaultValue;
}
