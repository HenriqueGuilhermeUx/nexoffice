-- Request-scoped, read-only delegated context for NexOffice Network providers.
-- This does NOT create workspace membership and never grants broad workspace access.

create table if not exists provider_delegations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references provider_requests(id) on delete cascade,
  requester_workspace_id uuid not null references workspaces(id) on delete cascade,
  provider_workspace_id uuid not null references workspaces(id) on delete cascade,
  granted_by uuid references users(id) on delete set null,
  scopes text[] not null default '{}',
  status text not null default 'active' check(status in ('active','revoked')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(requester_workspace_id<>provider_workspace_id),
  check(scopes <@ array[
    'contact_read',
    'deal_read',
    'operation_read',
    'document_status_read',
    'fiscal_status_read',
    'finance_status_read'
  ]::text[])
);

create index if not exists provider_delegations_requester_idx on provider_delegations(requester_workspace_id,status,expires_at);
create index if not exists provider_delegations_provider_idx on provider_delegations(provider_workspace_id,status,expires_at);

comment on table provider_delegations is
  'Read-only context delegation tied to one provider request. It does not add the provider to workspace_members and is ineffective after revocation, expiration or when the provider request is no longer accepted/in_progress.';
