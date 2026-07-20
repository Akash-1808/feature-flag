import client from 'prom-client';

export const register = new client.Registry();

client.collectDefaultMetrics({
    register,
    prefix: 'vanguard_api_',
});

export const flagEvaluationTotal = new client.Counter({
    name: 'flag_evaluation_total',
    help: 'Total number of feature flag evaluations',
    labelNames: ['flag_key', 'environment_id', 'outcome'] as const,
    registers: [register]
})

export const sdkPollTotal = new client.Counter({
    name: 'sdk_poll_total',
    help: 'Total number of SDK poll requests',
    labelNames: ['environment_id', 'status'] as const,
    registers: [register]
})

export const autoRollbackTotal = new client.Counter({
    name: 'auto_rollback_total',
    help: 'Total number of auto-rollbacks triggered',
    labelNames: ['environment_id', 'flag_key', 'reason'] as const,
    registers: [register]
})

export const flagErrorRateGauge = new client.Gauge({
    name: 'flag_error_rate',
    help: 'Current rolling error  rate percentage (0.0 to 1.0) for a feature flag in an environment',
    labelNames: ['flag_key', 'environment_id'] as const,
    registers: [register]
})
