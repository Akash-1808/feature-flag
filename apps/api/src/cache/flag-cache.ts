import { redis } from "./redis.js";
import type { EnvironmentRulesetPayload } from "../services/flag.service.js";

const RULES_KEY = (envId: string) => `ruleset:${envId}`;
const DEFAULT_TTL_SECONDS = 60;

export const flagCache = {

    async getRuleset(envId: string): Promise<EnvironmentRulesetPayload | null> {
        if (redis.status !== 'ready') return null;

        try {
            const cachedRuleset = await redis.get(RULES_KEY(envId));
            if (!cachedRuleset) {
                return null;
            }
            return JSON.parse(cachedRuleset) as EnvironmentRulesetPayload;
        } catch (error) {
            console.warn(`[FlagCache] Redis unavailable during getRuleset for ${envId}. Falling back to Postgres.`);
            return null;
        }
    },

    async invalidateRuleset(envId: string): Promise<void> {
        if (redis.status !== 'ready') return;

        try {
            await redis.del(RULES_KEY(envId));
        } catch (error) {
            console.warn(`[FlagCache] Redis unavailable during invalidateRuleset for ${envId}. Skipping cache delete.`);
        }
    },

    async setCachedRuleset(envId: string, data: EnvironmentRulesetPayload, ttl: number = DEFAULT_TTL_SECONDS): Promise<void> {
        if (redis.status !== 'ready') return;

        try {
            await redis.set(RULES_KEY(envId), JSON.stringify(data), 'EX', ttl);
        } catch (error) {
            console.warn(`[FlagCache] Redis unavailable during setCachedRuleset for ${envId}. Skipping cache write.`);
        }
    }
}