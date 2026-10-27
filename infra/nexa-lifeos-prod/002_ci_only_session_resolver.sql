-- NEXA LIFE OS: CI-ONLY authenticated-session resolver proof.
-- NOT A PRODUCTION MIGRATION; do not apply on Neon or any customer DB.
-- This exercise DOES NOT implement the required production RLS on
-- public.users/auth_sessions, nor certify SECURITY DEFINER readiness.
DO $nexa_ci_only$
BEGIN
 IF current_database() <> 'nexa_lifeos_schema_rehearsal_ci' THEN
   RAISE EXCEPTION 'Session resolver is forbidden outside disposable CI database';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='nexa_lifeos_app'
    AND NOT rolsuper AND NOT rolbypassrls) THEN
   RAISE EXCEPTION 'CI-only non-bypass PF app role missing';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_tables
    WHERE schemaname='public' AND tablename='auth_sessions') THEN
   RAISE EXCEPTION 'PF session table missing';
 END IF;
END;
$nexa_ci_only$;

-- SECURITY DEFINER must never be owned by the superuser running CI.
-- This non-login role can only read the two necessary columns of the
-- disposable users/session tables and cannot bypass RLS.
CREATE ROLE nexa_lifeos_ci_session_owner NOLOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA nex_personal TO nexa_lifeos_ci_session_owner;
GRANT SELECT (id,status) ON public.users TO nexa_lifeos_ci_session_owner;
GRANT SELECT (user_id,token_hash,expires_at) ON public.auth_sessions
  TO nexa_lifeos_ci_session_owner;

-- Fully-qualified identifiers and a fixed search_path prevent object
-- shadowing inside the test-only privileged function.
CREATE FUNCTION nex_personal.resolve_api_session(p_token_hash text)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $nexa_resolve$
 SELECT u.id
 FROM public.auth_sessions AS s
 JOIN public.users AS u ON u.id=s.user_id
 WHERE p_token_hash ~ '^[0-9a-f]{64}$'
   AND s.token_hash=p_token_hash
   AND s.expires_at > statement_timestamp()
   AND u.status='active'
 LIMIT 1
$nexa_resolve$;

-- New function owner needs transient CREATE permission on its schema,
-- then loses it immediately after ownership transfer.
GRANT CREATE ON SCHEMA nex_personal TO nexa_lifeos_ci_session_owner;
ALTER FUNCTION nex_personal.resolve_api_session(text)
  OWNER TO nexa_lifeos_ci_session_owner;
REVOKE CREATE ON SCHEMA nex_personal FROM nexa_lifeos_ci_session_owner;

-- EXECUTE defaults to PUBLIC in PostgreSQL; revoke explicitly.
REVOKE ALL ON FUNCTION nex_personal.resolve_api_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nex_personal.resolve_api_session(text) TO nexa_lifeos_app;
