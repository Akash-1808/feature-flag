import { pool } from '../db/pool.js';
import { redis } from '../cache/redis.js';
import { Flag, flagRepository, FlagType } from '../repositories/flag.repository.js';
import { FlagState, flagStateRepository } from '../repositories/flag-state.repository.js';
import { targetingRuleRepository, TargetingRule } from '../repositories/targeting-rule.repository.js';
import { environmentRepository } from '../repositories/environment.repository.js';
import { auditService } from './audit.service.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface EvaluatedRule extends TargetingRule { }

export interface EvaluatedFlagPayload {
  key: string;
  type: FlagType;
  enabled: boolean;
  rolloutPercentage: number;
  rules: EvaluatedRule[];
}

export interface EnvironmentRulesetPayload {
  environmentId: string;
  flags: EvaluatedFlagPayload[];
  cachedAt: string;
}

export const flagService = {
  /**
   * List all flags for an organization
   */
  async listByOrgId(orgId: string): Promise<Flag[]> {
    return await flagRepository.listByOrgId(orgId);
  },

  /**
   * Get flag by ID with org scoping
   */
  async getByIdAndOrg(id: string, orgId: string): Promise<Flag> {
    const flag = await flagRepository.findById(id);
    if (!flag || flag.org_id !== orgId) {
      throw new NotFoundError('Flag not found');
    }
    return flag;
  },

  /**
   * Create flag + automatically seed initial flag_states for all org environments inside a transaction
   */
  async create(
    orgId: string,
    name: string,
    keyInput?: string,
    description: string | null = null,
    type: FlagType = 'boolean',
    actorId: string | null = null
  ): Promise<{ flag: Flag; states: FlagState[] }> {
    if (!name || !name.trim()) {
      throw new ValidationError('Flag name is required');
    }

    const key = keyInput && keyInput.trim() ? slugify(keyInput) : slugify(name);
    if (!key) {
      throw new ValidationError('Flag key is invalid');
    }

    // Check unique key constraint before starting transaction
    const existing = await flagRepository.findKeyAndOrg(key, orgId);
    if (existing) {
      throw new ConflictError(`Flag with key "${key}" already exists in this organization`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Create flag inside transaction using flagRepository
      const flag = await flagRepository.create(orgId, key, name.trim(), description, type, client);

      // 2. Get all environments for this org
      const envs = await environmentRepository.findByOrgId(orgId);
      const envIds = envs.map((e) => e.id);

      // 3. Seed initial flag states for all environments inside the transaction
      const states = await flagStateRepository.createStateForFlag(flag.id, envIds, client);

      // 4. Audit log inside transaction before commit
      await auditService.log(orgId, actorId, 'CREATE_FLAG', 'flag', flag.id, null, { flag, states }, client);
      await client.query('COMMIT');
      for (const envId of envIds) {
        await redis.del(`ruleset:${envId}`);
      }

      return { flag, states };
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error.code === '23505') {
        throw new ConflictError(`Flag with key "${key}" already exists in this organization`);
      }
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Update flag metadata (name, description)
   */
  async update(
    id: string,
    orgId: string,
    name: string,
    description: string | null,
    actorId: string | null = null
  ): Promise<Flag> {
    const before = await this.getByIdAndOrg(id, orgId);
    const updated = await flagRepository.update(before.id, name.trim(), description);
    if (!updated) {
      throw new NotFoundError('Flag not found');
    }

    await auditService.log(orgId, actorId, 'UPDATE_FLAG', 'flag', updated.id, before, updated);
    return updated;
  },

  /**
   * Delete flag (cascade deletes states & targeting rules)
   */
  async delete(id: string, orgId: string, actorId: string | null = null): Promise<Flag> {
    const flag = await this.getByIdAndOrg(id, orgId);

    // Get environments to invalidate their ruleset cache
    const envs = await environmentRepository.findByOrgId(orgId);

    const deleted = await flagRepository.delete(flag.id);
    if (!deleted) {
      throw new NotFoundError('Flag not found');
    }

    await auditService.log(orgId, actorId, 'DELETE_FLAG', 'flag', deleted.id, deleted, null);
    for (const env of envs) {
      await redis.del(`ruleset:${env.id}`);
    }

    return deleted;
  },

  /**
   * Update a specific flag's state inside an environment and invalidate Redis ruleset cache
   */
  async updateFlagState(
    flagId: string,
    envId: string,
    orgId: string,
    enabled?: boolean,
    rolloutPercentage?: number,
    actorId: string | null = null
  ): Promise<FlagState> {
    // Verify the flag belongs to this organization
    await this.getByIdAndOrg(flagId, orgId);

    const before = await flagStateRepository.findByFlagAndEnv(flagId, envId);
    if (!before) {
      throw new NotFoundError('Flag state not found for this environment');
    }

    const updated = await flagStateRepository.update(flagId, envId, enabled, rolloutPercentage);
    if (!updated) {
      throw new NotFoundError('Failed to update flag state');
    }

    await auditService.log(
      orgId,
      actorId,
      'UPDATE_FLAG_STATE',
      'flag_state',
      updated.id,
      before,
      updated
    );

    // Invalidate the ruleset cache for this environment so SDKs get fresh evaluation immediately!
    await redis.del(`ruleset:${envId}`);

    return updated;
  },

  /**
   * SDK Hot-Path: Get evaluated ruleset payload for an environment (with Redis caching)
   */
  async getRulesetForEnvironment(envId: string): Promise<EnvironmentRulesetPayload> {
    const cacheKey = `ruleset:${envId}`;

    // 1. Check Redis cache first
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as EnvironmentRulesetPayload;
      }
    } catch (cacheErr) {
      console.warn('Redis cache read error during ruleset evaluation:', cacheErr);
    }

    // 2. Fetch all flag states for this environment
    const states = await flagStateRepository.findAllByEnvId(envId);

    // 3. For each state, load flag metadata and targeting rules
    const flagsPayload: EvaluatedFlagPayload[] = [];
    for (const state of states) {
      const flag = await flagRepository.findById(state.flag_id);
      if (!flag) continue;

      const rules = await targetingRuleRepository.listByFlagStateId(state.id);

      flagsPayload.push({
        key: flag.key,
        type: flag.type,
        enabled: state.enabled,
        rolloutPercentage: state.rollout_percentage,
        rules: rules,
      });
    }

    const payload: EnvironmentRulesetPayload = {
      environmentId: envId,
      flags: flagsPayload,
      cachedAt: new Date().toISOString(),
    };

    // 4. Store in Redis cache (TTL 60 seconds or until invalidated)
    try {
      await redis.set(cacheKey, JSON.stringify(payload), 'EX', 60);
    } catch (cacheErr) {
      console.warn('Redis cache write error during ruleset evaluation:', cacheErr);
    }

    return payload;
  },

  async createTargetingRule(flagId: string,
    envId: string,
    orgId: string,
    conditions: any,
    variation: any,
    actorId: string | null = null,
    priorityInput?: number): Promise<TargetingRule> {

    await this.getByIdAndOrg(flagId, orgId);

    const state = await flagStateRepository.findByFlagAndEnv(flagId, envId)

    if (!state) {
      throw new NotFoundError('Flag state not found for this environment')
    }
    let priority = priorityInput;
    if (priority === undefined || priority === null) {
      const existingRules = await targetingRuleRepository.listByFlagStateId(state.id)
      priority = existingRules.length + 1;
    }

    const rule = await targetingRuleRepository.create(state.id, priority, conditions, variation);

    await auditService.log(
      orgId,
      actorId,
      'CREATE TARGETING RULE',
      'targeting_rule',
      rule.id,
      rule
    )

    await redis.del(`ruleset:${envId}`)

    return rule;
  },

  async updateTargetingRule(
    flagId: string,
    envId: string,
    ruleId: string,
    orgId: string,
    conditions: any,
    variation: any,
    actorId: string | null = null,
  ): Promise<TargetingRule | null> {
    await this.getByIdAndOrg(flagId, orgId);

    const state = await flagStateRepository.findByFlagAndEnv(flagId, envId)

    if (!state) {
      throw new NotFoundError('Flag state not found for this environment')
    }

    const rule = await targetingRuleRepository.update(ruleId, conditions, variation);

    await auditService.log(
      orgId,
      actorId,
      'UPDATE TARGETING RULE',
      'targeting_rule',
      ruleId,
      rule
    )

    await redis.del(`ruleset:${envId}`)

    return rule;
  },

  async deleteTargetingRule(flagId: string, envId: string, ruleId: string, orgId: string, actorId: string | null = null): Promise<TargetingRule | null> {
    await this.getByIdAndOrg(flagId, orgId);

    const state = await flagStateRepository.findByFlagAndEnv(flagId, envId)

    if (!state) {
      throw new NotFoundError('Flag state not found for this environment')
    }

    const rule = await targetingRuleRepository.delete(ruleId);

    await auditService.log(
      orgId,
      actorId,
      'DELETE TARGETING RULE',
      'targeting_rule',
      ruleId,
      rule
    )

    await redis.del(`ruleset:${envId}`)

    return rule;
  },

  async reorderingTargetingRules(flagId: string, envId: string, ruleIds: string[], orgId: string, actorId: string | null = null): Promise<TargetingRule[]> {
    await this.getByIdAndOrg(flagId, orgId);

    const state = await flagStateRepository.findByFlagAndEnv(flagId, envId)

    if (!state) {
      throw new NotFoundError('Flag state not found for this environment')
    }

    const rules = await targetingRuleRepository.reorder(state.id, ruleIds);

    await auditService.log(
      orgId,
      actorId,
      'REORDER TARGETING RULES',
      'targeting_rule',
      state.id,
      ruleIds
    )

    await redis.del(`ruleset:${envId}`)

    return rules;
  }
};
