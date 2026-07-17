import { EvaluationContext, FeatureFlagConfig, FlagDefinition, Ruleset } from './types.js';
import { InMemoryCache } from './cache.js';
import { Poller } from './poller.js';
import { evaluateFlag } from './evaluator.js';

/**
 * FeatureFlagClient is the main entry point for the @feature-flag/sdk package.
 * It provides zero-latency local flag evaluation, conditional ETag polling, and fail-open resilience.
 */
export class FeatureFlagClient {
    private cache: InMemoryCache;
    private poller: Poller;
    private initialized = false;

    constructor(private config: FeatureFlagConfig) {
        this.cache = new InMemoryCache();

        const baseUrl = config.baseUrl || 'http://localhost:3001';
        const interval = config.pollingInterval || 30000;
        const onError = config.onError || ((err: Error) => {
            console.error('[FeatureFlagClient] Error:', err.message);
        });

        this.poller = new Poller({
            baseUrl,
            apiKey: config.apiKey,
            interval,
            onUpdate: (ruleset: Ruleset) => {
                this.cache.setRuleset(ruleset);
            },
            onError
        });
    }

    /**
     * Bootstraps the SDK by performing an initial fetch of rulesets and starting the background polling loop.
     * Guaranteed fail-open: never throws an error if the initial network call fails.
     */
    public async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            await this.poller.fetchRuleset();
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (this.config.onError) {
                this.config.onError(err);
            } else {
                console.error('[FeatureFlagClient] Initialization failed (fail-open mode active):', err.message);
            }
        } finally {
            this.initialized = true;
            this.poller.start();
        }
    }

    /**
     * Evaluates a boolean feature flag from local memory in < 1ms.
     * If the flag is not found, checks defaultValues from config, and falls back to false.
     */
    public isEnabled(flagKey: string, context: EvaluationContext): boolean {
        const flag = this.cache.getFlag(flagKey);
        if (!flag) {
            const defaultVal = this.config.defaultValues?.[flagKey];
            return typeof defaultVal === 'boolean' ? defaultVal : false;
        }

        const val = evaluateFlag(flag, context);
        return Boolean(val);
    }

    /**
     * Evaluates a feature flag of any type (string, number, json, boolean) from local memory.
     * If the flag is not found, returns the configured default value or undefined.
     */
    public getValue(flagKey: string, context: EvaluationContext): unknown {
        const flag = this.cache.getFlag(flagKey);
        if (!flag) {
            return this.config.defaultValues?.[flagKey];
        }

        return evaluateFlag(flag, context);
    }

    /**
     * Returns a map of all currently cached flag definitions.
     */
    public getAllFlags(): Record<string, FlagDefinition> {
        const ruleset = this.cache.getRuleset();
        if (!ruleset || !ruleset.flags) return {};

        const map: Record<string, FlagDefinition> = {};
        for (const flag of ruleset.flags) {
            map[flag.key] = flag;
        }
        return map;
    }

    /**
     * Stops the polling loop and clears the cache. Should be called when shutting down the host application.
     */
    public destroy(): void {
        this.poller.stop();
        this.cache.setRuleset({ flags: [], etag: '' });
        this.initialized = false;
    }
}
