-- Commenti sui record ("Conversazioni" di vtenext): note brevi dei colleghi sulla scheda.
CREATE TABLE record_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id   uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX record_comments_record_idx ON record_comments (record_id, created_at);

ALTER TABLE record_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON record_comments
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
