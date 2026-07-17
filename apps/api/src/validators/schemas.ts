import { z } from 'zod';

// ─── Flag Schemas ───────────────────────────────────────────────────────────

export const createFlagSchema = z.object({
  name: z.string().min(1, 'Flag name is required').max(100),
  key: z.string().max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  type: z.enum(['boolean', 'string', 'number', 'json']).optional().default('boolean'),
});

export const updateFlagSchema = z.object({
  name: z.string().min(1, 'Flag name is required').max(100),
  description: z.string().max(500).nullable().optional(),
});

export const updateFlagStateSchema = z.object({
  enabled: z.boolean().optional(),
  rolloutPercentage: z.number().min(0).max(100).optional(),
}).refine(data => data.enabled !== undefined || data.rolloutPercentage !== undefined, {
  message: 'At least one of enabled or rolloutPercentage must be provided',
});

// ─── Targeting Rule Schemas ─────────────────────────────────────────────────

export const createTargetingRuleSchema = z.object({
  conditions: z.record(z.unknown()).refine(val => Object.keys(val).length > 0, {
    message: 'Conditions must be a non-empty object',
  }),
  variation: z.unknown(),
  priority: z.number().int().positive().optional(),
});

export const updateTargetingRuleSchema = z.object({
  conditions: z.record(z.unknown()).refine(val => Object.keys(val).length > 0, {
    message: 'Conditions must be a non-empty object',
  }),
  variation: z.unknown(),
});

export const reorderRulesSchema = z.object({
  ruleIds: z.array(z.string().uuid()).min(1, 'At least one rule ID is required'),
});

// ─── Environment Schemas ────────────────────────────────────────────────────

export const createEnvironmentSchema = z.object({
  name: z.string().min(1, 'Environment name is required').max(50),
  key: z.string().min(1, 'Environment key is required').max(50),
});

// ─── API Key Schemas ────────────────────────────────────────────────────────

export const createApiKeySchema = z.object({
  environmentId: z.string().uuid('Invalid environment ID'),
  type: z.enum(['client', 'server']),
  name: z.string().min(1, 'API key name is required').max(100),
});

export const listApiKeysQuerySchema = z.object({
  environmentId: z.string().uuid('Invalid environment ID'),
});

// ─── SDK Schemas ────────────────────────────────────────────────────────────

export const evaluateFlagSchema = z.object({
  flagKey: z.string().min(1, 'Flag key is required'),
  userId: z.string().min(1, 'User ID is required'),
  attributes: z.record(z.unknown()).optional(),
});

// ─── Audit Log Schemas ──────────────────────────────────────────────────────

export const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().min(1).optional(),
});
