-- 3Gtrade CRM: schema di base
-- Multi-tenant con Row Level Security: ogni tabella di dominio ha tenant_id e
-- una policy che filtra su current_setting('app.tenant_id'). Se la variabile
-- non è impostata la policy non restituisce righe (default sicuro).

CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Gerarchia ruoli (come vtenext): path = 'id1::id2::id3'.
-- Un utente vede i record posseduti dagli utenti dei ruoli sottostanti.
CREATE TABLE roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  parent_id   uuid REFERENCES roles(id) ON DELETE RESTRICT,
  path        text NOT NULL,
  UNIQUE (tenant_id, name)
);

-- Profili: insiemi di permessi su moduli e campi. Un ruolo ha uno o più profili.
CREATE TABLE profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  UNIQUE (tenant_id, name)
);

CREATE TABLE role_profiles (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, profile_id)
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         text NOT NULL,
  password_hash text NOT NULL,
  first_name    text NOT NULL DEFAULT '',
  last_name     text NOT NULL DEFAULT '',
  role_id       uuid NOT NULL REFERENCES roles(id),
  is_admin      boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

-- Metadati dei moduli (equivalente di vtiger_tab)
CREATE TABLE modules (
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            text NOT NULL,
  label           text NOT NULL,
  label_singular  text NOT NULL,
  icon            text,
  is_custom       boolean NOT NULL DEFAULT false,
  sort_order      int NOT NULL DEFAULT 0,
  -- campo usato come "nome" del record nelle liste e nelle relazioni
  label_fields    text[] NOT NULL DEFAULT '{}',
  -- accesso di default a livello organizzazione: private | public_read | public_readwrite
  sharing         text NOT NULL DEFAULT 'private'
                  CHECK (sharing IN ('private', 'public_read', 'public_readwrite')),
  PRIMARY KEY (tenant_id, name)
);

-- Metadati dei campi (equivalente di vtiger_field). I valori stanno in records.data (JSONB).
CREATE TABLE fields (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module      text NOT NULL,
  name        text NOT NULL,
  label       text NOT NULL,
  type        text NOT NULL,
  block       text NOT NULL DEFAULT 'Informazioni',
  required    boolean NOT NULL DEFAULT false,
  is_custom   boolean NOT NULL DEFAULT false,
  in_list     boolean NOT NULL DEFAULT false,
  sort_order  int NOT NULL DEFAULT 0,
  -- picklist: {"values": [...]}; relation: {"module": "Accounts"}
  options     jsonb NOT NULL DEFAULT '{}',
  UNIQUE (tenant_id, module, name),
  FOREIGN KEY (tenant_id, module) REFERENCES modules(tenant_id, name) ON DELETE CASCADE
);

CREATE TABLE profile_module_permissions (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module      text NOT NULL,
  can_view    boolean NOT NULL DEFAULT false,
  can_create  boolean NOT NULL DEFAULT false,
  can_edit    boolean NOT NULL DEFAULT false,
  can_delete  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (profile_id, module)
);

-- Permessi di campo: in assenza di riga il campo è visibile e modificabile.
CREATE TABLE profile_field_permissions (
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  field_id    uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  visible     boolean NOT NULL DEFAULT true,
  editable    boolean NOT NULL DEFAULT true,
  PRIMARY KEY (profile_id, field_id)
);

-- Tabella unica dei record (equivalente di vtiger_crmentity + tabelle modulo).
CREATE TABLE records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module      text NOT NULL,
  label       text NOT NULL DEFAULT '',
  owner_id    uuid NOT NULL REFERENCES users(id),
  data        jsonb NOT NULL DEFAULT '{}',
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  FOREIGN KEY (tenant_id, module) REFERENCES modules(tenant_id, name)
);
CREATE INDEX records_module_idx ON records (tenant_id, module, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX records_owner_idx ON records (tenant_id, owner_id);
CREATE INDEX records_data_gin ON records USING gin (data jsonb_path_ops);
CREATE INDEX records_label_idx ON records (tenant_id, module, lower(label));

-- Storico modifiche (equivalente di ModTracker)
CREATE TABLE record_history (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id   uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id),
  action      text NOT NULL,
  changes     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX record_history_record_idx ON record_history (record_id, created_at DESC);

-- Outbox transazionale: gli eventi vengono scritti nella stessa transazione
-- del dato e processati in background (base per workflow e BPM).
CREATE TABLE outbox_events (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type          text NOT NULL,
  payload       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  attempts      int NOT NULL DEFAULT 0,
  last_error    text
);
CREATE INDEX outbox_pending_idx ON outbox_events (id) WHERE processed_at IS NULL;

-- Row Level Security su tutte le tabelle di dominio
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['roles','profiles','role_profiles','users','modules','fields',
                           'profile_module_permissions','profile_field_permissions',
                           'records','record_history','outbox_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) '
      'WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;

-- Il worker dell'outbox lavora su tutti i tenant: può leggere gli eventi quando app.worker = 'on'.
CREATE POLICY outbox_worker ON outbox_events
  USING (current_setting('app.worker', true) = 'on')
  WITH CHECK (current_setting('app.worker', true) = 'on');
