-- REVIEW ONLY. Never apply to Nexa Brasil, NexOffices or Nex Personal Brazil.
-- Dedicated USA database only; not an automatic migration.
-- All tables have FORCE RLS and no policies/grants (deny by default).
BEGIN;
DO $us_wallet_database_guard$
BEGIN
  IF current_database() !~ '^nex_personal_us(_[a-z0-9_]+)?$' THEN
    RAISE EXCEPTION 'US wallet migration denied: database % is not nex_personal_us',current_database();
  END IF;
END;
$us_wallet_database_guard$;
CREATE SCHEMA IF NOT EXISTS nex_personal_us;

CREATE TABLE IF NOT EXISTS nex_personal_us.profiles (
 id uuid PRIMARY KEY,
 auth_subject varchar(150) NOT NULL UNIQUE,
 status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','blocked','deleted')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nex_personal_us.wallet_ownership_challenges (
 id uuid PRIMARY KEY,
 owner_profile_id uuid NOT NULL REFERENCES nex_personal_us.profiles(id),
 chain_id integer NOT NULL CHECK(chain_id=137),
 wallet_address varchar(42) NOT NULL CHECK(wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
 trusted_origin text NOT NULL CHECK(trusted_origin ~ '^https://'),
 nonce_sha256 char(64) NOT NULL UNIQUE CHECK(nonce_sha256 ~ '^[0-9a-f]{64}$'),
 message_sha256 char(64) NOT NULL CHECK(message_sha256 ~ '^[0-9a-f]{64}$'),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '5 minutes'),
 CHECK(consumed_at IS NULL OR consumed_at>=issued_at)
);
CREATE INDEX IF NOT EXISTS npu_wallet_challenge_owner_idx
 ON nex_personal_us.wallet_ownership_challenges(owner_profile_id,expires_at);

CREATE TABLE IF NOT EXISTS nex_personal_us.wallet_bindings (
 id uuid PRIMARY KEY,
 owner_profile_id uuid NOT NULL REFERENCES nex_personal_us.profiles(id),
 source varchar(20) NOT NULL CHECK(source IN ('external','privy')),
 wallet_address varchar(42) NOT NULL CHECK(wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
 wallet_address_normalized varchar(42) GENERATED ALWAYS AS (lower(wallet_address)) STORED,
 chain_id integer NOT NULL CHECK(chain_id=137),
 privy_project_id varchar(128),
 privy_user_id varchar(255),
 privy_wallet_id varchar(255),
 proof_challenge_id uuid UNIQUE REFERENCES nex_personal_us.wallet_ownership_challenges(id),
 verified_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((source='external' AND proof_challenge_id IS NOT NULL AND privy_project_id IS NULL AND privy_user_id IS NULL AND privy_wallet_id IS NULL)
        OR (source='privy' AND proof_challenge_id IS NULL AND privy_project_id IS NOT NULL AND privy_user_id IS NOT NULL AND privy_wallet_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS npu_one_active_binding_per_chain_address
 ON nex_personal_us.wallet_bindings(chain_id,wallet_address_normalized)
 WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS npu_one_active_embedded_wallet_per_owner
 ON nex_personal_us.wallet_bindings(owner_profile_id)
 WHERE source='privy' AND revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS npu_one_privy_wallet_id
 ON nex_personal_us.wallet_bindings(privy_project_id,privy_wallet_id)
 WHERE source='privy';
CREATE INDEX IF NOT EXISTS npu_wallet_bindings_owner_idx
 ON nex_personal_us.wallet_bindings(owner_profile_id,revoked_at);

CREATE TABLE IF NOT EXISTS nex_personal_us.wallet_security_events (
 id uuid PRIMARY KEY,
 owner_profile_id uuid NOT NULL REFERENCES nex_personal_us.profiles(id),
 event_type varchar(80) NOT NULL CHECK(event_type IN (
  'challenge.issued','challenge.rejected','challenge.consumed',
  'binding.created','binding.revoked','privy.binding.rejected',
  'agentic.read.authorized','agentic.read.revoked')),
 subject_wallet_address varchar(42),
 evidence_digest_sha256 char(64) CHECK(evidence_digest_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS npu_wallet_security_events_owner_idx
 ON nex_personal_us.wallet_security_events(owner_profile_id,created_at DESC);

ALTER TABLE nex_personal_us.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal_us.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE nex_personal_us.wallet_ownership_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal_us.wallet_ownership_challenges FORCE ROW LEVEL SECURITY;
ALTER TABLE nex_personal_us.wallet_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal_us.wallet_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE nex_personal_us.wallet_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal_us.wallet_security_events FORCE ROW LEVEL SECURITY;

-- NO policies and NO grants in this draft; migration author must explicitly
-- define audited least-privilege roles, RLS policies, crypto verifier and
-- atomic consumed_at update before any real wallet linking.
COMMIT;
