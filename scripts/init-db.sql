-- L'applicazione NON deve collegarsi come superuser: i superuser ignorano la
-- Row Level Security e quindi l'isolamento tra tenant.
CREATE ROLE crm LOGIN PASSWORD 'crm' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE crm OWNER crm;
CREATE DATABASE crm_test OWNER crm;
