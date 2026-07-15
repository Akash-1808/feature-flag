import { pool } from '../db/pool.js';
import { PoolClient } from 'pg';

export interface AuditLogEntry {
  id: string;
  org_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_state: any;
  after_state: any;
  metadata: any;
  created_at: Date;
}

const AUDIT_COLUMNS = 'id, org_id, actor_id, action, entity_type, entity_id, before_state, after_state, metadata, created_at';

export const auditRepository = {
  async create(
    orgId: string,
    actorId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    beforeState?: any,
    afterState?: any,
    metadata?: any,
    txClient?: PoolClient
  ): Promise<AuditLogEntry> {
    const db = txClient || pool;
    const query = `
      INSERT INTO audit_log (
        org_id, actor_id, action, entity_type, entity_id,
        before_state, after_state, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING ${AUDIT_COLUMNS};
    `;
    const result = await db.query<AuditLogEntry>(query, [
      orgId,
      actorId || null,
      action,
      entityType,
      entityId,
      beforeState ? JSON.stringify(beforeState) : null,
      afterState ? JSON.stringify(afterState) : null,
      metadata ? JSON.stringify(metadata) : null,
    ]);
    return result.rows[0]!;
  },

  async listByOrgId(orgId: string, limit = 50, offset = 0): Promise<AuditLogEntry[]> {
    const query = `
      SELECT ${AUDIT_COLUMNS}
      FROM audit_log
      WHERE org_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    const result = await pool.query<AuditLogEntry>(query, [orgId, limit, offset]);
    return result.rows;
  },
};
