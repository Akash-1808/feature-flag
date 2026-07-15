import { pool } from "../db/pool.js";

export interface Environment {
    id: string;
    name: string;
    org_id: string;
    key: string;
    created_at: Date;
}

export const environmentRepository = {
    async findByOrgId(orgId: string): Promise<Environment[]> {
        const query = `SELECT e.id,e.name,e.org_id , e.key, e.created_at FROM environments AS e WHERE e.org_id = $1 ORDER BY e.created_at ASC;`;
        const result = await pool.query<Environment>(query, [orgId])
        return result.rows;
    },

    async findById(id: string): Promise<Environment | null> {
        const query = `SELECT e.id,e.name,e.org_id , e.key, e.created_at FROM environments AS e WHERE e.id = $1;`;
        const result = await pool.query<Environment>(query, [id]);
        return result.rows[0] || null;
    },

    async create(orgId: string, name: string, key: string): Promise<Environment> {
        const query = `INSERT INTO environments (org_id, name, key) VALUES ($1, $2, $3) RETURNING id,name,org_id,key,created_at;`;
        const result = await pool.query<Environment>(query, [orgId, name, key]);
        return result.rows[0]!;
    },

    async delete(id: string): Promise<Environment | null> {
        const query = `DELETE FROM environments AS e WHERE e.id = $1 RETURNING id,name,org_id,key,created_at;`;
        const result = await pool.query<Environment>(query, [id]);
        return result.rows[0] || null;
    }
}