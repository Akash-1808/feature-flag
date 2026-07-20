import { EvaluationContext, FeatureFlagConfig, FlagDefinition, Ruleset } from './types.js';
import { InMemoryCache } from './cache.js';
import { Poller } from './poller.js';
import { evaluateFlag } from './evaluator.js';

/**
 * FeatureFlagClient is the main entry point for the flagcraft package.
 * It provides zero-latency local flag evaluation, conditional ETag polling, and fail-open resilience.
 */
export class FeatureFlagClient {
    private cache: InMemoryCache;
    private poller: Poller;
    private initialized = false;
    private lastSuccessfulFetch: Date | null = null;
    private connectionStatus: 'connected' | 'degraded' | 'disconnected' = 'disconnected';
    private consicutiveFailure = 0;
    private metricsQueue: Array<{ flagKey: string, isError: boolean }> = [];
    private flushTimer: ReturnType<typeof setInterval> | null = null;


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
            onError,
            onFetchSuccess: () => {
                this.lastSuccessfulFetch = new Date();
                this.consicutiveFailure = 0;
                this.updateStatus('connected');
            },
            onFetchError: () => {
                this.consicutiveFailure++;
                this.updateStatus(this.consicutiveFailure < 3 ? 'degraded' : 'disconnected');
            }
        });
        this.flushTimer = setInterval(() => {
            this.flushMetrics();
        }, 5000);
    }

    private async flushMetrics(): Promise<void> {
        if (this.metricsQueue.length === 0) return;

        const batch = this.metricsQueue.splice(0, this.metricsQueue.length);
        const baseUrl = this.config.baseUrl || 'http://localhost:3001';
        try {
            const url = `${baseUrl}/sdk/metrics`;
            const payload = JSON.stringify({ metrics: batch });

            await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.config.apiKey,
                },
                keepalive: true,
                body: payload
            })
        }
        catch (error) {
            if (this.config.onError) {
                this.config.onError(error instanceof Error ? error : new Error('Failed to flush metrics'))
            }
        }
    }

    trackMetrics(flagKey: string, isError: boolean): void {
        this.metricsQueue.push({
            flagKey, isError
        });
        if (this.metricsQueue.length >= 100) {
            this.flushMetrics();
        }
    }

    private updateStatus(newStatus: 'connected' | 'degraded' | 'disconnected'): void {
        if (this.connectionStatus !== newStatus) {
            this.connectionStatus = newStatus;

            if (this.config.onConnectionStatusChange) {
                this.config.onConnectionStatusChange(newStatus);
            }
        }
    }

    public getConnectionStatus(): 'connected' | 'degraded' | 'disconnected' {
        return this.connectionStatus;
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
        this.trackMetrics(flagKey, false);
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

        const val = evaluateFlag(flag, context);
        this.trackMetrics(flagKey, false);
        return val;
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
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        this.poller.stop();
        this.cache.setRuleset({ flags: [], etag: '' });
        this.initialized = false;
    }

}
