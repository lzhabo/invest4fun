CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE weekly_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  wallet text NOT NULL CHECK (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  epoch_id text NOT NULL,
  chain text NOT NULL DEFAULT 'SOLANA' CHECK (chain = 'SOLANA'),
  execution_provider text NOT NULL DEFAULT 'JUPITER'
    CHECK (execution_provider = 'JUPITER'),
  feed_ranking_provider text NOT NULL DEFAULT 'DETERMINISTIC'
    CHECK (feed_ranking_provider = 'DETERMINISTIC'),
  status text NOT NULL DEFAULT 'OPEN' CHECK (
    status IN (
      'OPEN', 'SWIPING', 'REVIEW', 'AWAITING_SIGNATURE',
      'SUBMITTED', 'SETTLED', 'PARTIAL', 'FAILED', 'CLOSED'
    )
  ),
  execution_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wallet, epoch_id, chain, execution_provider, feed_ranking_provider)
);

CREATE TABLE executions (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL UNIQUE REFERENCES weekly_sessions(id),
  authorized_plan_hash text NOT NULL UNIQUE
    CHECK (authorized_plan_hash ~ '^sha256:[a-f0-9]{64}$'),
  execution_provider text NOT NULL DEFAULT 'JUPITER'
    CHECK (execution_provider = 'JUPITER'),
  plan jsonb NOT NULL,
  status text NOT NULL CHECK (
    status IN ('PREPARED', 'SUBMITTED', 'SETTLED', 'PARTIAL', 'FAILED')
  ),
  transaction_hashes text[] NOT NULL DEFAULT '{}',
  submission_mode text NOT NULL DEFAULT 'SEQUENTIAL'
    CHECK (submission_mode IN ('SEQUENTIAL', 'BATCH')),
  settled_outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE weekly_sessions
  ADD CONSTRAINT weekly_sessions_execution_id_fkey
  FOREIGN KEY (execution_id) REFERENCES executions(id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX executions_status_idx ON executions(status);
CREATE INDEX weekly_sessions_owner_idx ON weekly_sessions(owner_id);

CREATE TABLE user_preferences (
  owner_id text PRIMARY KEY,
  wallet text NOT NULL CHECK (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  execution_provider text NOT NULL DEFAULT 'JUPITER'
    CHECK (execution_provider = 'JUPITER'),
  preferences jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE asset_metadata_cache (
  cache_key text PRIMARY KEY,
  provider text NOT NULL,
  snapshot jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX asset_metadata_cache_expiry_idx
  ON asset_metadata_cache(expires_at);
