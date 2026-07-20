import { flagStateRepository } from "../repositories/flag-state.repository";
import { flagRepository, Flag } from "../repositories/flag.repository";

export interface StaleFlagCandidate {
    flagId: string;
    flagKey: string;
    flagName: string;
    environment: string;
    enabled: boolean;
    rolloutPercentage: number;
    lastUpdated: Date;
    daysStale: number;
}

export class StaleFlagDetector {
    private timer: ReturnType<typeof setInterval> | null = null;

    async detectStaleFlags(orgId: string, thresholdDays: number): Promise<StaleFlagCandidate[]> {
        const staleStates = await flagStateRepository.findStaleFlags(orgId, thresholdDays);

        if (staleStates.length === 0)
            return [];

        const orgFlags = await flagRepository.listByOrgId(orgId);
        const flagMap = new Map<string, Flag>();
        for (const f of orgFlags) {
            flagMap.set(f.id, f);
        }
        const now = Date.now();
        const candidates: StaleFlagCandidate[] = [];
        for (const state of staleStates) {
            const flag = flagMap.get(state.flag_id);
            if (!flag) continue;
            const lastUpdatedTime = new Date(state.updated_at).getTime();
            const daysStale = Math.floor((now - lastUpdatedTime) / (1000 * 60 * 60 * 24));

            candidates.push({
                flagId: state.flag_id,
                flagKey: flag.key,
                flagName: flag.name,
                environment: state.env_id,
                enabled: state.enabled,
                rolloutPercentage: state.rollout_percentage,
                lastUpdated: state.updated_at,
                daysStale
            });
        }
        return candidates;
    }

    startPreiodicScan(intervalMs: number = 86400000, thresholdDays: number = 30): void {
        if (this.timer) return;
        console.log(`[StaleFlagDetector] Started scanning for stale flags every ${intervalMs / 1000}s`);
        this.timer = setInterval(async () => {
            try {
                const orgIds = await flagStateRepository.findAllorgIds();
                for (const orgId of orgIds) {
                    const stale = await this.detectStaleFlags(orgId, thresholdDays);
                    if (stale.length > 0) {
                        console.warn(`[StaleFlagDetector] Org ${orgId} has ${stale.length} stale flag states (> ${thresholdDays} days unchanged).`);
                    }
                }
            } catch (error) {
                console.error('[StaleFlagDetector] Periodic scan failed:', error);
            }
        }, intervalMs)
    }

    stopPeriodicScan(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}

export const staleFlagDetector = new StaleFlagDetector();