ALTER TABLE executions
  DROP CONSTRAINT IF EXISTS executions_session_id_key;

CREATE INDEX IF NOT EXISTS executions_session_id_idx
  ON executions(session_id);
