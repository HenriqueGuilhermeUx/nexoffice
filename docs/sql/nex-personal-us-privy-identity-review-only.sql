-- REVIEW ONLY — privilege-separated Nex Personal USA Privy DID ownership mapping.
-- AFTER identity, consent, and US service-role review-only SQL on a disposable
-- USA-specific database. NOT an automatic migration or production permission.
BEGIN;
DO $guard$
BEGIN
  IF current_database() !~ '^nex_personal_us(_[a-z0-9_]+)?$'
    OR to_regclass('nex_personal_us.profiles') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='npu_us_wallet_service')
  THEN RAISE EXCEPTION 'USA Privy identity DDL denied for database %',current_database();
  END IF;
END;
$guard$;

CREATE TABLE IF NOT EXISTS nex_personal_us.privy_identity_links(
 id uuid PRIMARY KEY,
 owner_profile_id uuid NOT NULL REFERENCES nex_personal_us.profiles(id),
 privy_app_id varchar(128) NOT NULL CHECK(length(privy_app_id)>=8),
 privy_user_id varchar(255) NOT NULL
  CHECK(privy_user_id ~ '^did:privy:[a-zA-Z0-9:_-]{3,200}$'),
 linked_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 -- Reserved for row locking only. NOT evidence of successful authentication.
 lock_checked_at timestamptz,
 CHECK(revoked_at IS NULL OR revoked_at>=linked_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS npu_privy_owner_app_active
 ON nex_personal_us.privy_identity_links(owner_profile_id,privy_app_id)
 WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS npu_privy_user_app_active
 ON nex_personal_us.privy_identity_links(privy_app_id,privy_user_id)
 WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS npu_privy_identity_owner_idx
 ON nex_personal_us.privy_identity_links(owner_profile_id,revoked_at);
ALTER TABLE nex_personal_us.privy_identity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal_us.privy_identity_links FORCE ROW LEVEL SECURITY;

-- The isolated US backend can look up a server-established link but cannot
-- INSERT, DELETE, revoke, reassign, change app IDs or change Privy DIDs.
-- Lock-compatible column permission supports SELECT FOR SHARE in PG16.
GRANT SELECT ON nex_personal_us.privy_identity_links TO npu_us_wallet_service;
GRANT UPDATE(lock_checked_at) ON nex_personal_us.privy_identity_links TO npu_us_wallet_service;
CREATE POLICY npu_us_service_privy_identity_read
 ON nex_personal_us.privy_identity_links FOR SELECT TO npu_us_wallet_service
 USING (true);
CREATE POLICY npu_us_service_privy_identity_lock
 ON nex_personal_us.privy_identity_links FOR UPDATE TO npu_us_wallet_service
 USING (true) WITH CHECK (true);
-- No permissions for browsers, customers, bots, external services or PUBLIC.
-- Trusted US identity provisioning/revocation remains OUT OF SCOPE.
COMMIT;
