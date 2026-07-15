CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS environments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    org_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT uq_environments_org_key UNIQUE (org_id, key)
);

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    key_prefix VARCHAR(16) NOT NULL,
    type VARCHAR(16) NOT NULL CHECK (type IN ('client', 'server')),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(32) NOT NULL CHECK (type IN ('boolean', 'string', 'number', 'json')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_flags_org_key UNIQUE (org_id, key)
);
CREATE TABLE IF NOT EXISTS flag_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_id UUID NOT NULL REFERENCES flags(id) ON DELETE CASCADE,
    environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    rollout_pct INTEGER NOT NULL DEFAULT 0 CHECK (rollout_pct >= 0 AND rollout_pct <= 100),
    default_value JSONB,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_flag_states_flag_env UNIQUE (flag_id, environment_id)
);

CREATE TABLE IF NOT EXISTS targeting_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_state_id UUID NOT NULL REFERENCES flag_states(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL,
    conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id TEXT NOT NULL,
    actor_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
    action VARCHAR(128) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    before_state JSONB,
    after_state JSONB,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- SDK hot-path query index
CREATE INDEX IF NOT EXISTS idx_flag_states_env_id ON flag_states(environment_id);

-- Targeting rule evaluation order index
CREATE INDEX IF NOT EXISTS idx_targeting_rules_order ON targeting_rules(flag_state_id, priority);

-- Dashboard audit log pagination index
CREATE INDEX IF NOT EXISTS idx_audit_log_org_time ON audit_log(org_id, created_at DESC);

-- Flag lookups by key
CREATE INDEX IF NOT EXISTS idx_flags_org_key ON flags(org_id, key);

-- Fast API key authentication lookup
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
