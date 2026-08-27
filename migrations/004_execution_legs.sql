ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS legs jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS executions_reconciliation_idx
  ON executions(status, updated_at)
  WHERE status = 'SUBMITTED';
