import { redis } from '../cache/redis.js';
import { flagRepository } from '../repositories/flag.repository';
import { flagStateRepository } from '../repositories/flag-state.repository';
import { auditService } from '../services/audit.service.js';
import { flagCache } from '../cache/flag-cache.js';
import { success } from 'better-auth';
import { error } from 'console';
import { environmentRepository } from '../repositories/environment.repository.js';
import { autoRollbackTotal, flagErrorRateGauge, flagEvaluationTotal } from '../metrics/prometheus.js';
export const METRICS_WATCHER_INTERVAL = 5 * 60 * 1000; // 5 minutes

export interface FlagCohortMetrics {
    envId: string;
    flagKey: string;
    successCount: number;
    errorCount: number;
    errorRate: number;
}

export class MetricsWatcher {
    private timer: ReturnType<typeof setInterval> | null = null;
    private readonly ERROR_RATE_THRESHOLD = 0.05;
    private readonly MIN_SAMPLE_SIZE = 20;

    async recordMetric(envId: string, flagKey: string, isError: boolean): Promise<void> {
        const outcome = isError ? 'error' : 'success';
        const redisKey = `metrics:${envId}:${flagKey}:${outcome}`;

        if (redis.status === "ready") {
            await redis.incr(redisKey);
            await redis.expire(redisKey, 3600)
        }
    }

    async getMetrics(envId: string, flagKey: string): Promise<FlagCohortMetrics> {
        let successCount = 0;
        let errorCount = 0;

        if (redis.status === 'ready') {
            const [successStr, errorStr] = await Promise.all([
                redis.get(`metrics:${envId}:${flagKey}:success`),
                redis.get(`metrics:${envId}:${flagKey}:error`)
            ]);
            successCount = successStr ? parseInt(successStr) : 0;
            errorCount = errorStr ? parseInt(errorStr) : 0;
        }

        const total = successCount + errorCount;
        const errorRate = total > 0 ? (errorCount / total) : 0;

        flagErrorRateGauge.set({
            flag_key: flagKey,
            environment_id: envId,
        }, errorRate)

        return {
            envId,
            flagKey,
            successCount,
            errorCount,
            errorRate
        }
    }

    async resetMetrics(envId: string, flagKey: string): Promise<void> {
        if (redis.status === 'ready') {
            await redis.del(`metrics:${envId}:${flagKey}:success`);
            await redis.del(`metrics:${envId}:${flagKey}:error`);
        }
    }

    async checkAndRollbackEnvironment(envId: string): Promise<string[]> {
        const rolledBackFlagsKeys: string[] = [];
        const activeStates = await flagStateRepository.findAllByEnvId(envId);
        for (const state of activeStates) {
            if (!state.enabled) continue;
            const flag = await flagRepository.findById(state.flag_id);
            if (!flag) continue;

            const metrics = await this.getMetrics(envId, flag.key);
            const totalRequests = metrics.successCount + metrics.errorCount;

            if (totalRequests >= this.MIN_SAMPLE_SIZE && metrics.errorRate > this.ERROR_RATE_THRESHOLD) {
                console.warn(`[MetricsWatcher] High error rate(${(metrics.errorRate * 100).toFixed(1)}%) detected for flag ${flag.key} in env ${envId}. Triggering auto-rollback`);
                autoRollbackTotal.inc({
                    flag_key: flag.key,
                    environment_id: envId,
                    reason: 'error_rate_spike'
                });
                await flagStateRepository.update(flag.id, envId, false, state.rollout_percentage);

                await auditService.log(
                    flag.org_id,
                    null,
                    'AUTO_ROLLBACK',
                    'flag',
                    flag.id,
                    state,
                    { ...state, enabled: false },
                    {
                        reason: "error_rate_threshold_exceeded",
                        errorRate: metrics.errorRate,
                        success: metrics.successCount,
                        errorCount: metrics.errorCount,
                        threshold: this.ERROR_RATE_THRESHOLD,
                    }
                );

                await flagCache.invalidateRuleset(envId);
                await this.resetMetrics(envId, flag.key);
                rolledBackFlagsKeys.push(flag.key);
            }
        }
        return rolledBackFlagsKeys;
    }

    startPeriodicWatch(intervalMs: number = 30000): void {
        if (this.timer) return;
        console.log(`[MetricsWatcher] Started monitoring error rates every ${intervalMs / 1000}s`);
        this.timer = setInterval(async () => {
            try {
                const orgIds = await flagStateRepository.findAllorgIds();
                for (const orgId of orgIds) {
                    const envs = await environmentRepository.findByOrgId(orgId);
                    for (const env of envs) {
                        await this.checkAndRollbackEnvironment(env.id);
                    }
                }
            } catch (error) {
                console.error("[MetricsWatcher]: Error during scan:", error);
            }
        }, intervalMs);
    }

    stopPeriodicWatch(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            console.log("[MetricsWatcher] Stopped periodic watch")
        }
    }
}

export const metricsWatcher = new MetricsWatcher();