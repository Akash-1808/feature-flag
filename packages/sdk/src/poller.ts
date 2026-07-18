import { Ruleset } from './types.js';

export interface PollerConfig {
    baseUrl: string;
    apiKey: string;
    interval: number;
    onUpdate: (ruleset: Ruleset) => void;
    onError: (error: Error) => void;
    onFetchSuccess?: () => void;
    onFetchError?: () => void;
}

/**
 * Conditional polling loop for fetching rulesets using ETag / 304 Not Modified.
 * Uses the native `fetch` API.
 */
export class Poller {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private currentEtag: string | null = null;
    private isPolling = false;
    private failureCount = 0;
    private _lastError: Error | null = null;

    constructor(private config: PollerConfig) { }

    public get lastError(): Error | null {
        return this._lastError;
    }

    /**
     * Begins the periodic polling loop.
     */
    public start(): void {
        if (this.isPolling) return;
        this.isPolling = true;
        this.scheduleNext(this.config.interval);
    }

    /**
     * Stops the polling loop.
     */
    public stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.isPolling = false;
    }

    private scheduleNext(delay: number): void {
        if (!this.isPolling) return;

        this.timer = setTimeout(async () => {
            await this.fetchRuleset(this.currentEtag);
            if (this.isPolling) {
                const nextDelay = this.failureCount === 0 ? this.config.interval : (Math.min(this.config.interval * Math.pow(2, this.failureCount), 300000))
                this.scheduleNext(nextDelay);
            }
        }, delay)
    }

    /**
     * Fetches the latest ruleset from the API server using conditional polling (`If-None-Match`).
     * - 200: Parses ruleset, updates current ETag, and calls `onUpdate`.
     * - 304: No-op.
     * - Error: Catches error, calls `onError`, and never throws to ensure fail-open resilience.
     */
    public async fetchRuleset(etag?: string | null): Promise<void> {
        try {
            const headers: Record<string, string> = {
                'X-API-Key': this.config.apiKey,
                'Accept': 'application/json'
            };

            const targetEtag = etag !== undefined ? etag : this.currentEtag;
            if (targetEtag) {
                headers['If-None-Match'] = targetEtag;
            }

            const url = `${this.config.baseUrl.replace(/\/$/, '')}/sdk/flags`;
            const response = await fetch(url, {
                method: 'GET',
                headers
            });

            if (response.status === 304) {
                this.onFetchSuccess();
                return;
            }

            if (!response.ok) {
                throw new Error(`Failed to fetch flags: HTTP ${response.status} ${response.statusText}`);
            }

            const data = (await response.json()) as Ruleset;
            this.onFetchSuccess();
            this.currentEtag = data.etag;
            this.config.onUpdate(data);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this._lastError = err;
            this.onFetchError();
            this.config.onError(err);
        }
    }
    onFetchSuccess() {
        this.failureCount = 0;
        this._lastError = null;
        this.config.onFetchSuccess?.();
    }
    onFetchError() {
        this.failureCount++;
        this.config.onFetchError?.();
    }
}
