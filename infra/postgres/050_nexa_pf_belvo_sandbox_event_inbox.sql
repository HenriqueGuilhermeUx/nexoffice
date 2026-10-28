-- NEXA PF ONLY / INVITATION-ONLY SANDBOX.
-- Never deploy on main NexOffices, Wallet, or PF production.
-- This stores ONLY opaque demo attempt IDs and webhook metadata. It does
-- NOT store real CPF, client financial records, Belvo secrets or refresh tokens.
DO $guard$
BEGIN
 IF current_setting('application_name',true) IS NULL THEN
  -- Real isolation is enforced by server-personal preview DB connection gates.
  NULL;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.tables
  WHERE table_schema='nex_personal' AND table_name='profiles') THEN
  RAISE EXCEPTION 'Belvo sandbox migration requires Nexa PF isolated preview schema';
 END IF;
END $guard$;
CREATE TABLE IF NOT EXISTS nex_personal.belvo_sandbox_attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL REFERENCES nex_personal.profiles(user_id) ON DELETE CASCADE,
 external_id text NOT NULL UNIQUE CHECK(external_id ~ '^nexa_pf_sb_[0-9a-f]{32}$'),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','widget_ready','failed','expired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '10 minutes'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS belvo_sb_attempts_owner ON nex_personal.belvo_sandbox_attempts(owner_user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS nex_personal.belvo_sandbox_events(
 webhook_id text PRIMARY KEY CHECK(length(webhook_id) BETWEEN 1 AND 128),
 attempt_id uuid NOT NULL REFERENCES nex_personal.belvo_sandbox_attempts(id) ON DELETE CASCADE,
 resource text NOT NULL CHECK(length(resource) BETWEEN 1 AND 128),
 event_code text NOT NULL CHECK(length(event_code) BETWEEN 1 AND 128),
 link_id text CHECK(length(link_id) BETWEEN 1 AND 128),
 -- Receipt NEVER authorizes a link or bank balance.
 verification_state text NOT NULL DEFAULT 'pending_provider_verification'
  CHECK(verification_state='pending_provider_verification'),
 received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS belvo_sb_event_attempt ON nex_personal.belvo_sandbox_events(attempt_id,received_at DESC);
COMMENT ON TABLE nex_personal.belvo_sandbox_events IS
 'Mockbank sandbox event metadata only, untrusted until server-to-server provider verification; no PII or account balances.';
