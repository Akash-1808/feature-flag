import { pool } from "../db/pool.js";

export interface TargetingRule {
    id: string;
    flag_state_id: string;
    priority: number;
    conditions: any;
    value: any;
    created_at: Date;
}

export const targetingRuleRepository = {

    async listByFlagStateId(flagStateId: string): Promise<TargetingRule[]> {
        const query = `SELECT id, flag_state_id, priority, conditions, value, created_at FROM targeting_rules WHERE flag_state_id = $1 ORDER BY priority ASC;`;
        const result = await pool.query<TargetingRule>(query, [flagStateId]);
        return result.rows;
    },

    async findById(id: string): Promise<TargetingRule | null> {
        const query = `SELECT id, flag_state_id, priority, conditions, value, created_at FROM targeting_rules WHERE id = $1;`;
        const result = await pool.query<TargetingRule>(query, [id]);
        return result.rows[0] || null;
    },

    async create(flagStateId: string, priority: number, conditions: any, value: any): Promise<TargetingRule> {
        const query = `INSERT INTO targeting_rules (flag_state_id, priority, conditions, value) VALUES ($1, $2, $3, $4) RETURNING id, flag_state_id, priority, conditions, value, created_at;`;
        const result = await pool.query<TargetingRule>(query, [flagStateId, priority, JSON.stringify(conditions), JSON.stringify(value)]);
        return result.rows[0]!;
    },

    async update(id: string, conditions?: any, value?: any): Promise<TargetingRule | null> {
        const query = `UPDATE targeting_rules SET conditions = COALESCE($2, conditions), value = COALESCE($3, value), created_at = NOW()
            WHERE id = $1
            RETURNING id, flag_state_id, conditions, value, created_at;`;
        const result = await pool.query<TargetingRule>(query, [id, conditions ? JSON.stringify(conditions) : null, value ? JSON.stringify(value) : null]);
        return result.rows[0] || null;
    },

    async delete(id: string): Promise<TargetingRule | null> {
        const query = `DELETE FROM targeting_rules WHERE id = $1 RETURNING id, flag_state_id, priority, conditions, value, created_at;`;
        const result = await pool.query<TargetingRule>(query, [id]);
        return result.rows[0] || null;
    },

    async deleteByFlagStateId(flagStateId: string): Promise<number> {
        const query = `DELETE FROM targeting_rules WHERE flag_state_id = $1;`;
        const result = await pool.query(query, [flagStateId]);
        return result.rowCount || 0;
    },

    async reorder(flagStateId: string, ruleIds: string[]): Promise<TargetingRule[]> {
        const query = `UPDATE targeting_rules SET priority = array_position($1, id)
            WHERE flag_state_id = $2 AND id = ANY($1)
            RETURNING id, flag_state_id, priority, conditions, value, created_at;`;
        const result = await pool.query<TargetingRule>(query, [ruleIds, flagStateId]);
        return result.rows;
    }
}
