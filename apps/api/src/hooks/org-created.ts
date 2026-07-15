import { pool } from '../db/pool.js'

export interface DefautlEnvironment {
    name: string;
    key: string;
}

const DEFAULT_ENVIRONMENT: DefautlEnvironment[] = [
    { name: 'Development', key: 'dev' },
    { name: 'Staging', key: 'staging' },
    { name: 'Production', key: 'prod' },
];

export async function seedDefaultEnvironments(orgId: string): Promise<void> {
    const query = `
    INSERT INTO environments (name, key, org_id) VALUES ($1, $2, $3) ON CONFLICT (org_id, key) DO NOTHING;
    `;

    try {
        for (const env of DEFAULT_ENVIRONMENT) {
            await pool.query(query, [env.name, env.key, orgId]);
        }
    } catch (error) {
        console.error(`Failed to seed default environments for organization ${orgId}`, error);
        throw error;
    }
}