-- Righe dei documenti (PDA/ordini): prodotto o servizio, quantità, prezzo, sconto, IVA e importi calcolati.
CREATE TABLE record_lines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id    uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  position     int NOT NULL,
  product_id   uuid REFERENCES records(id),
  description  text NOT NULL,
  quantity     numeric(14, 3) NOT NULL,
  unit_price   numeric(14, 4) NOT NULL,
  discount     numeric(5, 2) NOT NULL DEFAULT 0,
  vat_rate     numeric(5, 2) NOT NULL DEFAULT 0,
  net_amount   numeric(14, 2) NOT NULL,
  vat_amount   numeric(14, 2) NOT NULL,
  total_amount numeric(14, 2) NOT NULL
);
CREATE INDEX record_lines_record_idx ON record_lines (record_id, position);
CREATE INDEX record_lines_product_idx ON record_lines (product_id) WHERE product_id IS NOT NULL;

-- Contatori della numerazione automatica, per modulo e anno
CREATE TABLE record_counters (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module     text NOT NULL,
  year       int NOT NULL,
  last_value int NOT NULL,
  PRIMARY KEY (tenant_id, module, year)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['record_lines', 'record_counters']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) '
      'WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;
