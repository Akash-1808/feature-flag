import { pool } from "../db/pool.js";
import { PoolClient } from "pg";

export type FlagType = 'boolean' | 'string' | 'number' | 'json';

export interface Flag {
    id: string;
    org_id: string;
    key: string;
    name: string;
    description: string | null;
    type: FlagType;
    created_at: Date;
    updated_at: Date;
}

const FLAG_COLUMNS = 'id, org_id, key, name, description, type, created_at, updated_at';

export const flagRepository = {

    async listByOrgId(orgId: string): Promise<Flag[]> {
        const query = `SELECT ${FLAG_COLUMNS} FROM flags WHERE org_id = $1 ORDER BY created_at DESC`;
        const result = await pool.query<Flag>(query, [orgId]);
        return result.rows;
    },

    async findById(id: string): Promise<Flag | null> {
        const query = `SELECT ${FLAG_COLUMNS} FROM flags WHERE id = $1;`;
        const result = await pool.query<Flag>(query, [id]);
        return result.rows[0] || null;
    },

    async findKeyAndOrg(key: string, orgId: string): Promise<Flag | null> {
        const query = `SELECT ${FLAG_COLUMNS} FROM flags WHERE key = $1 AND org_id = $2;`;
        const result = await pool.query<Flag>(query, [key, orgId]);
        return result.rows[0] || null;
    },

    async create(
        orgId: string,
        key: string,
        name: string,
        description: string | null,
        type: FlagType = 'boolean',
        txClient?: PoolClient
    ): Promise<Flag> {
        const db = txClient || pool;
        const query = `INSERT INTO flags (org_id, key, name, description, type) VALUES ($1, $2, $3, $4, $5) RETURNING ${FLAG_COLUMNS};`;
        const result = await db.query<Flag>(query, [orgId, key, name, description, type]);
        return result.rows[0]!;
    },

    async update(id: string, name: string, description: string | null): Promise<Flag | null> {
        const query = `UPDATE flags SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING ${FLAG_COLUMNS};`;
        const result = await pool.query<Flag>(query, [name, description, id]);
        return result.rows[0] || null;
    },

    async delete(id: string): Promise<Flag | null> {
        const query = `DELETE FROM flags WHERE id = $1 RETURNING ${FLAG_COLUMNS};`;
        const result = await pool.query<Flag>(query, [id]);
        return result.rows[0] || null;
    }
}