import { redis } from "./redis.js";
import type { EnvironmentRulesetPayload } from "../services/flag.service.js";

const RULES_KEY = (envId: string) => `ruleset:${envId}`;
const DEFAULT_TTL_SECONDS = 60;

export const flagCache = {

    async getRuleset(envId: string): Promise<EnvironmentRulesetPayload | null> {
        const cachedRuleset = await redis.get(RULES_KEY(envId));
        if (!cachedRuleset) {
            return null;
        }
        try {
            return JSON.parse(cachedRuleset) as EnvironmentRulesetPayload;
        } catch (error) {
            console.warn(`Failed to parse cached ruleset for env ${envId}:`, error);
            return null;
        }
    },

    async invalidateRuleset(envId: string): Promise<void> {
        await redis.del(RULES_KEY(envId));
    },

    async setCachedRuleset(envId: string, data: EnvironmentRulesetPayload, ttl: number = DEFAULT_TTL_SECONDS): Promise<void> {
        await redis.set(RULES_KEY(envId), JSON.stringify(data), 'EX', ttl);
    }
}