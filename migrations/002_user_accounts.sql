CREATE TABLE user_accounts (
  privy_user_id text PRIMARY KEY,
  canonical_solana_wallet text NOT NULL
    CHECK (canonical_solana_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  timezone text NOT NULL DEFAULT 'UTC',
  onboarding_version integer NOT NULL DEFAULT 0 CHECK (onboarding_version >= 0),
  onboarding_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO user_accounts (
  privy_user_id,
  canonical_solana_wallet,
  timezone,
  onboarding_version,
  onboarding_completed_at,
  created_at,
  updated_at
)
SELECT
  owner_id,
  wallet,
  'UTC',
  1,
  created_at,
  created_at,
  updated_at
FROM user_preferences
ON CONFLICT (privy_user_id) DO NOTHING;
