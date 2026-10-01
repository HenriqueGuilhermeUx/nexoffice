-- DocWallet signature modality tracking for NexOffice.
-- Pricing/allowance remains document-based: one document sent = one monthly usage,
-- regardless of electronic vs ICP-Brasil mode or number of signers.

alter table docwallet_signature_usage
  add column if not exists signature_mode text not null default 'electronic';

alter table docwallet_signature_usage
  add column if not exists icp_status text;

alter table docwallet_signature_usage
  drop constraint if exists docwallet_signature_usage_signature_mode_check;

alter table docwallet_signature_usage
  add constraint docwallet_signature_usage_signature_mode_check
  check(signature_mode in ('electronic','icp_brasil'));

create index if not exists docwallet_signature_usage_mode_idx
  on docwallet_signature_usage(workspace_id,signature_mode,period_start,created_at desc);

comment on column docwallet_signature_usage.signature_mode is 'electronic = DocWallet electronic evidence flow; icp_brasil = PAdES/ICP-Brasil flow orchestrated by DocWallet through its configured secure provider.';
comment on column docwallet_signature_usage.icp_status is 'Sanitized ICP workflow state only. Provider redirect URLs, certificate identity, private keys, passwords and raw evidence are never stored here.';
