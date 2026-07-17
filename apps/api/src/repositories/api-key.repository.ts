import { pool } from "../db/pool.js";
import { PoolClient } from "pg";

export type ApiKeyType = 'client' | 'server';

export interface ApiKey {
    id: string;
    environment_id: string;
    key_hash: string;
    key_prefix: string;
    type: ApiKeyType;
    name: string;
    created_at: Date;
    last_used_at: Date | null;
    revoked_at: Date | null;
}

const API_KEY_COLUMNS = 'id, environment_id, key_hash, key_prefix, type, name, created_at, last_used_at, revoked_at';

export const apiKeyRepository = {
    async create(
        envId: string,
        type: ApiKeyType,
        name: string,
        keyHash: string,
        keyPrefix: string,
        txClient?: PoolClient
    ): Promise<ApiKey> {
        const db = txClient || pool;
        const query = `
            INSERT INTO api_keys (environment_id, type, name, key_hash, key_prefix)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING ${API_KEY_COLUMNS};
        `;
        const result = await db.query<ApiKey>(query, [envId, type, name, keyHash, keyPrefix]);
        return result.rows[0]!;
    },

    async findById(id: string): Promise<ApiKey | null> {
        const query = `
            SELECT ${API_KEY_COLUMNS}
            FROM api_keys
            WHERE id = $1;
        `;
        const result = await pool.query<ApiKey>(query, [id]);
        return result.rows[0] || null;
    },

    async findByHash(hash: string): Promise<ApiKey | null> {
        const query = `
            SELECT ${API_KEY_COLUMNS}
            FROM api_keys
            WHERE key_hash = $1
              AND revoked_at IS NULL;
        `;
        const result = await pool.query<ApiKey>(query, [hash]);
        return result.rows[0] || null;
    },

    async findByEnvId(envId: string): Promise<ApiKey[]> {
        const query = `
            SELECT ${API_KEY_COLUMNS}
            FROM api_keys
            WHERE environment_id = $1
            ORDER BY created_at DESC;
        `;
        const result = await pool.query<ApiKey>(query, [envId]);
        return result.rows;
    },

    async revoke(id: string): Promise<ApiKey | null> {
        const query = `
            UPDATE api_keys
            SET revoked_at = NOW()
            WHERE id = $1 AND revoked_at IS NULL
            RETURNING ${API_KEY_COLUMNS};
        `;
        const result = await pool.query<ApiKey>(query, [id]);
        return result.rows[0] || null;
    },

    async updateLastUsed(id: string): Promise<void> {
        const query = `
            UPDATE api_keys
            SET last_used_at = NOW()
            WHERE id = $1;
        `;
        await pool.query(query, [id]);
    }
};
