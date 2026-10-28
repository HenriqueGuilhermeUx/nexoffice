-- NEXA PF — PRIVATE IDENTITY RLS EXPERIMENT, DISPOSABLE GITHUB CI ONLY.
-- This is NOT a production migration. It cannot run on Neon, Render, customer
-- databases or the beta. The required production identity model is still NO-GO.
DO $nexa_ci_identity$
BEGIN
 IF current_database() <> 'nexa_lifeos_schema_rehearsal_ci' THEN
  RAISE EXCEPTION 'Nexa PF identity RLS experiment forbidden outside disposable CI';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_roles
   WHERE rolname='nexa_lifeos_ci_session_owner'
     AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcanlogin
 ) THEN
  RAISE EXCEPTION 'Missing least-privilege, non-login resolver owner';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_roles
   WHERE rolname='nexa_lifeos_app' AND NOT rolsuper AND NOT rolbypassrls
 ) THEN
  RAISE EXCEPTION 'Missing non-bypass PF app role';
 END IF;
END;
$nexa_ci_identity$;

-- Identity tables always enforce RLS, including for their ordinary owners.
-- Only the isolated NOLOGIN resolver owner may read the minimum columns it was
-- explicitly granted by 002_ci_only_session_resolver.sql.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY nexa_ci_identity_resolver_users
 ON public.users FOR SELECT TO nexa_lifeos_ci_session_owner
 USING (true);
CREATE POLICY nexa_ci_identity_resolver_sessions
 ON public.auth_sessions FOR SELECT TO nexa_lifeos_ci_session_owner
 USING (true);

-- No identity policy or direct table privilege is granted to nexa_lifeos_app.
-- No INSERT/UPDATE/DELETE policy is granted to the resolver owner.
-- PUBLIC has neither a RLS policy nor EXECUTE on resolve_api_session().
