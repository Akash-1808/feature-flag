import { pool } from "../db/pool.js";
import { PoolClient } from "pg";

export interface FlagState {
    id: string;
    flag_id: string;
    env_id: string;
    enabled: boolean;
    rollout_percentage: number;
    updated_at: Date;
}

const FLAG_STATE_COLUMNS = 'id, flag_id, environment_id AS env_id, enabled, rollout_pct AS rollout_percentage, updated_at';

export const flagStateRepository = {

    async findByFlagId(flagId: string): Promise<FlagState[]> {
        const query = `SELECT ${FLAG_STATE_COLUMNS} FROM flag_states WHERE flag_id = $1 ORDER BY environment_id;`;
        const result = await pool.query<FlagState>(query, [flagId]);
        return result.rows;
    },

    async findAllByEnvId(envId: string): Promise<FlagState[]> {
        const query = `SELECT ${FLAG_STATE_COLUMNS} FROM flag_states WHERE environment_id = $1;`;
        const result = await pool.query<FlagState>(query, [envId]);
        return result.rows;
    },

    async findByFlagAndEnv(flagId: string, envId: string): Promise<FlagState | null> {
        const query = `SELECT ${FLAG_STATE_COLUMNS} FROM flag_states WHERE flag_id = $1 AND environment_id = $2;`;
        const result = await pool.query<FlagState>(query, [flagId, envId]);
        return result.rows[0] || null;
    },

    async createStateForFlag(flagId: string, envIds: string[], txClient?: PoolClient): Promise<FlagState[]> {
        const db = txClient || pool;
        const states: FlagState[] = [];
        for (const envId of envIds) {
            const query = `INSERT INTO flag_states (flag_id, environment_id, enabled, rollout_pct) 
            VALUES ($1, $2, $3, $4)
            RETURNING ${FLAG_STATE_COLUMNS};`;
            const result = await db.query<FlagState>(query, [flagId, envId, false, 0]);
            states.push(result.rows[0]!);
        }
        return states;
    },

    async findStaleFlags(orgId: string, thresholdDays: number) {
        const query = `SELECT fs.id, fs.flag_id, fs.environment_id AS env_id, fs.enabled, fs.rollout_pct AS rollout_percentage, fs.updated_at
        FROM flag_states fs
        INNER JOIN flags f ON fs.flag_id = f.id
        WHERE f.org_id = $1
        AND (fs.rollout_pct = 0 OR fs.rollout_pct = 100)
        AND fs.updated_at < NOW() - ($2 * INTERVAL '1 day')`
        const result = await pool.query<FlagState>(query, [orgId, thresholdDays])
        return result.rows;
    },

    async update(flagId: string, envId: string, enabled?: boolean, rolloutPercentage?: number): Promise<FlagState | null> {
        const query = `UPDATE flag_states SET enabled = COALESCE($3, enabled), rollout_pct = COALESCE($4, rollout_pct), updated_at = NOW()
            WHERE flag_id = $1 AND environment_id = $2
            RETURNING ${FLAG_STATE_COLUMNS}`;

        const result = await pool.query<FlagState>(query, [flagId, envId, enabled ?? null, rolloutPercentage ?? null]);
        return result.rows[0] || null;
    },

    async findAllorgIds(): Promise<string[]> {
        const query = `SELECT DISTINCT id FROM organization`;
        const result = await pool.query<{ id: string }>(query);
        return result.rows.map(r => r.id);
    }

}
