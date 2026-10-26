-- REVIEW ONLY. Dedicated Nex Personal USA database exclusively.
-- This file is NOT loaded by migrations, startup, production, or Nexa Brasil.
-- Apply after wallet-identity-review-only.sql and agentic-consent-review-only.sql.
--
-- SECURITY MODEL: NOLOGIN role for a *trusted, isolated US backend service*.
-- The role is NOT a customer/user role and may SELECT all rows in the USA
-- database to enforce ownership through authenticated server-side queries.
-- A customer, browser, LLM, compromised web token, or agent MUST NEVER assume
-- this role or connect using a credential that inherits it.
-- An independently reviewed US identity service must provision profiles.
-- Not production tenancy policies. No automatic activation.
BEGIN;
DO $npu_service_guard$
BEGIN
 IF current_database() !~ '^nex_personal_us(_[a-z0-9_]+)?$'
 OR to_regclass('nex_personal_us.profiles') IS NULL
 OR to_regclass('nex_personal_us.wallet_agentic_read_consents') IS NULL THEN
  RAISE EXCEPTION 'USA service role DDL denied in database %',current_database();
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='npu_us_wallet_service') THEN
  RAISE EXCEPTION 'USA service role already exists: manual security review required';
 END IF;
END;
$npu_service_guard$;

CREATE ROLE npu_us_wallet_service
 NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
 NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA nex_personal_us TO npu_us_wallet_service;
-- Explicit, minimal SQL privileges. Never grant ALL, DELETE, TRUNCATE, or
-- default table privileges; profile creation and status change are separate.
GRANT SELECT ON nex_personal_us.profiles TO npu_us_wallet_service;
GRANT SELECT,INSERT ON nex_personal_us.wallet_ownership_challenges TO npu_us_wallet_service;
GRANT UPDATE (consumed_at) ON nex_personal_us.wallet_ownership_challenges TO npu_us_wallet_service;
GRANT SELECT,INSERT ON nex_personal_us.wallet_bindings TO npu_us_wallet_service;
GRANT UPDATE (revoked_at) ON nex_personal_us.wallet_bindings TO npu_us_wallet_service;
GRANT INSERT ON nex_personal_us.wallet_security_events TO npu_us_wallet_service;
GRANT SELECT,INSERT ON nex_personal_us.wallet_agentic_read_consents TO npu_us_wallet_service;
GRANT UPDATE (revoked_at) ON nex_personal_us.wallet_agentic_read_consents TO npu_us_wallet_service;

-- The role is server-wide within the *physically isolated USA database*,
-- not scoped to a customer. Enforce identity/owner binding in the API layer.
-- FORCE RLS remains enabled; without these role-specific policies all
-- queries would be denied, even to an explicitly granted non-bypass service.
CREATE POLICY npu_us_svc_profiles_select
 ON nex_personal_us.profiles FOR SELECT TO npu_us_wallet_service USING (true);

CREATE POLICY npu_us_svc_challenge_select
 ON nex_personal_us.wallet_ownership_challenges
 FOR SELECT TO npu_us_wallet_service USING (true);
CREATE POLICY npu_us_svc_challenge_insert
 ON nex_personal_us.wallet_ownership_challenges
 FOR INSERT TO npu_us_wallet_service WITH CHECK (true);
CREATE POLICY npu_us_svc_challenge_consume
 ON nex_personal_us.wallet_ownership_challenges
 FOR UPDATE TO npu_us_wallet_service USING (true) WITH CHECK (true);

CREATE POLICY npu_us_svc_binding_select
 ON nex_personal_us.wallet_bindings
 FOR SELECT TO npu_us_wallet_service USING (true);
CREATE POLICY npu_us_svc_binding_insert
 ON nex_personal_us.wallet_bindings
 FOR INSERT TO npu_us_wallet_service WITH CHECK (true);
CREATE POLICY npu_us_svc_binding_revoke
 ON nex_personal_us.wallet_bindings
 FOR UPDATE TO npu_us_wallet_service USING (true) WITH CHECK (true);

CREATE POLICY npu_us_svc_audit_insert
 ON nex_personal_us.wallet_security_events
 FOR INSERT TO npu_us_wallet_service WITH CHECK (true);

CREATE POLICY npu_us_svc_consent_select
 ON nex_personal_us.wallet_agentic_read_consents
 FOR SELECT TO npu_us_wallet_service USING (true);
CREATE POLICY npu_us_svc_consent_insert
 ON nex_personal_us.wallet_agentic_read_consents
 FOR INSERT TO npu_us_wallet_service WITH CHECK (true);
CREATE POLICY npu_us_svc_consent_revoke
 ON nex_personal_us.wallet_agentic_read_consents
 FOR UPDATE TO npu_us_wallet_service USING (true) WITH CHECK (true);

-- Absolutely NO privileges to PUBLIC or client-facing roles.
-- No service credentials or role memberships are provisioned.
COMMIT;
