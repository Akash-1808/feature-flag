export interface FeatureFlagConfig {
    apiKey: string;
    baseUrl?: string;
    pollingInterval?: number;
    defaultValues?: Record<string, unknown>;
    onError?: (error: Error) => void;
}

export interface FlagRule {
    priority: number;
    conditions: Record<string, unknown>;
    value: unknown;
}

export interface FlagDefinition {
    key: string;
    enabled: boolean;
    rolloutPct: number;
    defaultValue: unknown;
    rules: FlagRule[];
}

export interface EvaluationContext {
    userId: string;
    attributes?: Record<string, unknown>;
}

export interface Ruleset {
    flags: FlagDefinition[];
    etag: string;
}