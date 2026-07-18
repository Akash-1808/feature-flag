import { FlagDefinition, Ruleset } from './types.js';

/**
 * In-memory store for flag definitions and ETag.
 * Replaces the entire cached ruleset atomically on updates.
 */
export class InMemoryCache {
    private ruleset: Ruleset | null = null;
    private flagMap: Map<string, FlagDefinition> = new Map();
    private lastUpdated: Date | null = null;

    /**
     * Checks if the cache has a valid state (has been initialized and not expired).
     */
    isStateValid(maxAge: number): boolean {
        if (!this.lastUpdated) return false;
        return (Date.now() - this.lastUpdated.getTime()) <= maxAge;
    }

    /**
     * Replaces the entire cached ruleset atomically and updates the internal lookup map.
     */
    public setRuleset(ruleset: Ruleset): void {
        this.ruleset = ruleset;
        this.lastUpdated = new Date();
        this.flagMap.clear();
        for (const flag of ruleset.flags) {
            this.flagMap.set(flag.key, flag);
        }
    }

    /**
     * Retrieves a flag definition by its key in O(1) time.
     */
    public getFlag(key: string): FlagDefinition | undefined {
        return this.flagMap.get(key);
    }

    /**
     * Retrieves the current ETag associated with the cached ruleset.
     */
    public getEtag(): string | null {
        return this.ruleset ? this.ruleset.etag : null;
    }

    /**
     * Retrieves the entire cached ruleset.
     */
    public getRuleset(): Ruleset | null {
        return this.ruleset;
    }
}
