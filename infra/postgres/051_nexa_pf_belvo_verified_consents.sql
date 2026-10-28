-- Nexa PF invite-only SANDBOX. Keep provider proofs separate from
-- untrusted inbound webhook metadata and from actual customer balances.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='nex_personal'
  AND table_name='belvo_sandbox_attempts') THEN
  RAISE EXCEPTION 'Isolated Nexa PF Belvo sandbox attempts schema required';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS nex_personal.belvo_sandbox_verified_consents (
 attempt_id uuid PRIMARY KEY REFERENCES nex_personal.belvo_sandbox_attempts(id) ON DELETE CASCADE,
 owner_user_id uuid NOT NULL REFERENCES nex_personal.profiles(user_id) ON DELETE CASCADE,
 provider_link_ref uuid NOT NULL,
 provider_consent_ref uuid NOT NULL,
 institution text NOT NULL CHECK (institution='ofmockbank_br_retail'),
 verification_status text NOT NULL DEFAULT 'verified_authorized'
  CHECK (verification_status='verified_authorized'),
 verified_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_user_id,provider_link_ref)
);
CREATE INDEX IF NOT EXISTS belvo_sb_verified_consents_owner_idx
 ON nex_personal.belvo_sandbox_verified_consents(owner_user_id,verified_at DESC);
COMMENT ON TABLE nex_personal.belvo_sandbox_verified_consents IS
 'Belvo sandbox-only verified link and active consent. Not a real bank account or balance. Never trust webhook alone.';
