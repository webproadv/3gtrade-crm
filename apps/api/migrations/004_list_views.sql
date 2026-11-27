-- Viste salvate delle liste (filtri, colonne e ordinamento), personali o pubbliche, come in vtenext.
CREATE TABLE list_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module      text NOT NULL,
  name        text NOT NULL,
  config      jsonb NOT NULL,
  -- true: visibile a tutti gli utenti dell'azienda (i record restano filtrati dai permessi di chi la apre)
  shared      boolean NOT NULL DEFAULT false,
  owner_id    uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX list_views_module_idx ON list_views (tenant_id, module, lower(name));

ALTER TABLE list_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_views FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON list_views
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
