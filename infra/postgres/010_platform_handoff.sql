-- One-time, short-lived browser handoff from trusted AV products into NexOffice.
-- The source product never exposes a long-lived NexOffice bearer token in the URL.

create table if not exists platform_handoffs (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  source_product text not null,
  external_workspace_ref text,
  expires_at timestamptz not null default now() + interval '2 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists platform_handoffs_expiry_idx
  on platform_handoffs(expires_at)
  where consumed_at is null;

create index if not exists platform_handoffs_user_idx
  on platform_handoffs(user_id,workspace_id,created_at desc);

comment on table platform_handoffs is 'Single-use short-lived SSO handoff codes from trusted AV products. Only code hashes are persisted.';
