import { auditRepository, AuditLogEntry } from '../repositories/audit.repository.js';
import { PoolClient } from 'pg';

export type { AuditLogEntry };

export const auditService = {
  /**
   * Logs an audit event for any state-changing action inside an organization
   */
  async log(
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
    return await auditRepository.create(
      orgId,
      actorId,
      action,
      entityType,
      entityId,
      beforeState,
      afterState,
      metadata,
      txClient
    );
  },

  /**
   * Lists recent audit log entries for an organization with pagination
   */
  async listByOrgId(orgId: string, limit = 50, offset = 0): Promise<AuditLogEntry[]> {
    return await auditRepository.listByOrgId(orgId, limit, offset);
  },
};
