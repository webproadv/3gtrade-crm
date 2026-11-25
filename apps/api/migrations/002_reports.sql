-- Rapporti salvati: definizione (colonne, filtri, raggruppamento, totali, grafico) in JSONB.
CREATE TABLE reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  module      text NOT NULL,
  config      jsonb NOT NULL,
  -- true: visibile a tutti gli utenti dell'azienda (i dati restano filtrati dai permessi di chi lo apre)
  shared      boolean NOT NULL DEFAULT false,
  owner_id    uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_tenant_idx ON reports (tenant_id, lower(name));

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reports
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- quando sono stati creati i rapporti di esempio (NULL: ancora da creare, all'avvio)
ALTER TABLE tenants ADD COLUMN default_reports_at timestamptz;
