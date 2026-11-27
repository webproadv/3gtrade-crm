-- Workflow configurabili come in vtenext: quando (evento o scadenza), se (condizioni), allora (azioni).
CREATE TABLE workflows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  module      text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  trigger     jsonb NOT NULL,
  conditions  jsonb NOT NULL DEFAULT '[]',
  actions     jsonb NOT NULL DEFAULT '[]',
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, module) REFERENCES modules(tenant_id, name) ON DELETE CASCADE
);
CREATE INDEX workflows_module_idx ON workflows (tenant_id, module) WHERE active;

-- Registro delle esecuzioni. "anchor" evita di ripetere un workflow già eseguito per lo stesso
-- record (prima volta che le condizioni sono vere, scadenze), le altre esecuzioni hanno anchor NULL.
CREATE TABLE workflow_runs (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  record_id   uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  anchor      text,
  status      text NOT NULL DEFAULT 'ok',
  message     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX workflow_runs_once_idx ON workflow_runs (workflow_id, record_id, anchor) WHERE anchor IS NOT NULL;
CREATE INDEX workflow_runs_wf_idx ON workflow_runs (workflow_id, created_at DESC);

-- Email collegate ai record. Quelle per i clienti nascono come bozza ("draft") e partono solo
-- quando un utente preme Invia; quelle interne (agli utenti del CRM) vengono messe in coda ("queued").
CREATE TABLE record_emails (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id    uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  workflow_id  uuid REFERENCES workflows(id) ON DELETE SET NULL,
  to_address   text NOT NULL DEFAULT '',
  subject      text NOT NULL DEFAULT '',
  body         text NOT NULL DEFAULT '',
  to_customer  boolean NOT NULL DEFAULT true,
  status       text NOT NULL DEFAULT 'draft',
  error        text,
  created_by   uuid REFERENCES users(id),
  sent_by      uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz
);
CREATE INDEX record_emails_record_idx ON record_emails (record_id, created_at DESC);
CREATE INDEX record_emails_queued_idx ON record_emails (created_at) WHERE status = 'queued';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['workflows','workflow_runs','record_emails']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) '
      'WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;

-- l'invio delle email in coda avviene nel worker, su tutti i tenant
CREATE POLICY email_worker ON record_emails
  USING (current_setting('app.worker', true) = 'on')
  WITH CHECK (current_setting('app.worker', true) = 'on');

ALTER TABLE tenants ADD COLUMN default_workflows_at timestamptz;
