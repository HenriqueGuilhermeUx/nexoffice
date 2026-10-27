-- NEXA LIFE OS PF / DRAFT RLS CANDIDATE. NOT A PRODUCTION MIGRATION.
-- This draft is executable ONLY in the disposable CI rehearsal database.
-- Do not stack with PR #100: it replaces that proposal's incompatible
-- actor setting and unspecified PUBLIC policy roles.
-- Does NOT create a production user, grant DB access, set up sessions,
-- implement resolve_api_session, or enable the public API.
DO $nexa_rls_preflight$
DECLARE
 expected_tables text[] := array['accounts','audit_events','bills','budgets','connections','consents','goals','life_intents','life_preferences','profiles','transactions','wealth_items'];
 actual_tables text[];
BEGIN
 IF current_database() <> 'nexa_lifeos_schema_rehearsal_ci' THEN
   RAISE EXCEPTION 'Nexa PF RLS draft: disposable rehearsal DB only';
 END IF;
 SELECT array_agg(tablename::text ORDER BY tablename) INTO actual_tables
   FROM pg_catalog.pg_tables WHERE schemaname='nex_personal';
 IF actual_tables IS DISTINCT FROM expected_tables THEN
   RAISE EXCEPTION 'Nexa PF RLS draft: unexpected PF tables';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_roles
   WHERE rolname='nexa_lifeos_app' AND NOT rolsuper AND NOT rolbypassrls
     AND NOT rolcreatedb AND NOT rolcreaterole
 ) THEN
   RAISE EXCEPTION 'Nexa PF RLS draft: app role missing or privileged';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies
   WHERE schemaname='nex_personal') THEN
   RAISE EXCEPTION 'Nexa PF RLS draft: unexpected existing policies';
 END IF;
END;
$nexa_rls_preflight$;

ALTER TABLE nex_personal.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.bills FORCE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.budgets FORCE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.connections FORCE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.consents FORCE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.goals FORCE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.life_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.life_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.life_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.life_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.wealth_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal.wealth_items FORCE ROW LEVEL SECURITY;

-- app.user_id MUST be bound after authentication by the server on the SAME
-- transaction client using set_config('app.user_id', valid_uuid, true).
-- NULL setting denies access by default. No untrusted client input may set it.

CREATE POLICY nexa_pf_owner_accounts ON nex_personal.accounts
  FOR ALL TO nexa_lifeos_app
  USING (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''))
  WITH CHECK (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''));

CREATE POLICY nexa_pf_owner_bills ON nex_personal.bills
  FOR ALL TO nexa_lifeos_app
  USING (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''))
  WITH CHECK (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''));

CREATE POLICY nexa_pf_owner_budgets ON nex_personal.budgets
  FOR ALL TO nexa_lifeos_app
  USING (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''))
  WITH CHECK (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''));

CREATE POLICY nexa_pf_owner_connections ON nex_personal.connections
  FOR ALL TO nexa_lifeos_app
  USING (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''))
  WITH CHECK (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''));

CREATE POLICY nexa_pf_owner_consents ON nex_personal.consents
  FOR ALL TO nexa_lifeos_app
  USING (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''))
  WITH CHECK (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''));

CREATE POLICY nexa_pf_owner_goals ON nex_personal.goals
  FOR ALL TO nexa_lifeos_app
  USING (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''))
  WITH CHECK (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''));

CREATE POLICY nexa_pf_owner_life_intents ON nex_personal.life_intents
  FOR ALL TO nexa_lifeos_app
  USING (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''))
  WITH CHECK (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''));

CREATE POLICY nexa_pf_owner_life_preferences ON nex_personal.life_preferences
  FOR ALL TO nexa_lifeos_app
  USING (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''))
  WITH CHECK (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''));

CREATE POLICY nexa_pf_owner_profiles ON nex_personal.profiles
  FOR ALL TO nexa_lifeos_app
  USING (user_id::text = NULLIF(current_setting('app.user_id',true),''))
  WITH CHECK (user_id::text = NULLIF(current_setting('app.user_id',true),''));

CREATE POLICY nexa_pf_owner_transactions ON nex_personal.transactions
  FOR ALL TO nexa_lifeos_app
  USING (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''))
  WITH CHECK (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''));

CREATE POLICY nexa_pf_owner_wealth_items ON nex_personal.wealth_items
  FOR ALL TO nexa_lifeos_app
  USING (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''))
  WITH CHECK (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''));

-- Audit access: SELECT by owner and INSERT only with authenticated actor;
-- no UPDATE/DELETE policy exists (append-only under RLS).
CREATE POLICY nexa_pf_read_audit ON nex_personal.audit_events
  FOR SELECT TO nexa_lifeos_app
  USING (owner_user_id::text = NULLIF(current_setting('app.user_id',true),''));
CREATE POLICY nexa_pf_append_audit ON nex_personal.audit_events
  FOR INSERT TO nexa_lifeos_app
  WITH CHECK (
    owner_user_id::text = NULLIF(current_setting('app.user_id',true),'')
    AND actor_user_id::text = NULLIF(current_setting('app.user_id',true),'')
  );
