-- Isolated Nexa PF sandbox-only; no real Open Finance, Wallet or PJ data.
-- Old "verified_authorized" facts MUST NOT remain permanently usable after
-- revocation/expiry signals or beyond the short read-only verification window.
ALTER TABLE nex_personal.belvo_sandbox_verified_consents
 DROP CONSTRAINT IF EXISTS belvo_sandbox_verified_consents_verification_status_check;
ALTER TABLE nex_personal.belvo_sandbox_verified_consents
 ADD CONSTRAINT belvo_sandbox_verified_consents_verification_status_check
 CHECK (verification_status IN ('verified_authorized','needs_reverification'));
ALTER TABLE nex_personal.belvo_sandbox_verified_consents
 ADD COLUMN IF NOT EXISTS recheck_reason text
 CHECK (recheck_reason IS NULL OR length(recheck_reason) BETWEEN 1 AND 128),
 ADD COLUMN IF NOT EXISTS last_notice_at timestamptz,
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- Proof is only a short-lived demonstration read; revalidate on explicit user
-- request rather than treating a stored proof as permanent permission.
COMMENT ON COLUMN nex_personal.belvo_sandbox_verified_consents.verification_status IS
 'Sandbox demonstration ONLY. needs_reverification means webhook requires a new GET to Belvo; never authorize data from this stored row alone.';
