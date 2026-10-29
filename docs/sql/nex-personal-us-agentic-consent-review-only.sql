-- REVIEW ONLY: USA Agentics short-lived wallet read consent.
-- Apply only to a dedicated USA database AFTER wallet identity schema.
-- Never register in NexOffice/Nexa/Brazil automatic migrations.
BEGIN;
DO $npu_agentic_db_guard$
BEGIN
 IF current_database() !~ '^nex_personal_us(_[a-z0-9_]+)?$'
    OR to_regnamespace('nex_personal_us') IS NULL THEN
  RAISE EXCEPTION 'USA Agentics consent schema denied in database %',current_database();
 END IF;
END;
$npu_agentic_db_guard$;

CREATE TABLE IF NOT EXISTS nex_personal_us.wallet_agentic_read_consents(
 id uuid PRIMARY KEY,
 owner_profile_id uuid NOT NULL REFERENCES nex_personal_us.profiles(id),
 wallet_binding_id uuid NOT NULL REFERENCES nex_personal_us.wallet_bindings(id),
 approval_evidence_id uuid NOT NULL UNIQUE,
 capability varchar(80) NOT NULL DEFAULT 'wallet.read.polygon_usdc'
   CHECK (capability='wallet.read.polygon_usdc'),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (expires_at>issued_at AND expires_at<=issued_at+interval '15 minutes'),
 CHECK (revoked_at IS NULL OR revoked_at>=issued_at)
);
CREATE INDEX IF NOT EXISTS npu_agentic_consents_owner_idx
 ON nex_personal_us.wallet_agentic_read_consents
 (owner_profile_id,wallet_binding_id,expires_at DESC);
ALTER TABLE nex_personal_us.wallet_agentic_read_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE nex_personal_us.wallet_agentic_read_consents FORCE ROW LEVEL SECURITY;
-- Intentionally no broad policies/grants: deny user and anonymous roles by default.
COMMIT;
