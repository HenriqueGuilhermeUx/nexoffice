-- Nex Personal P0: isolated, read-only Open Finance projection.
-- No company workspaces or business ledger rows are created/modified.
-- Apply only to an isolated staging database until the rollout is approved.
create schema if not exists nex_personal;

create table if not exists nex_personal.profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists nex_personal.consents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references nex_personal.profiles(user_id) on delete cascade,
  purpose text not null check (purpose in ('open_finance_data','personalization','partner_share')),
  status text not null default 'pending' check (status in ('pending','granted','revoked','expired')),
  provider text,
  provider_consent_ref text,
  partner_ref text,
  data_scopes text[] not null default '{}',
  granted_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint personal_consent_granted_requires_date check (status <> 'granted' or granted_at is not null),
  unique (owner_user_id,id)
);
create index if not exists personal_consents_owner_idx on nex_personal.consents(owner_user_id,purpose,status,created_at desc);

create table if not exists nex_personal.connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references nex_personal.profiles(user_id) on delete cascade,
  consent_id uuid,
  provider text not null,
  external_connection_ref text not null,
  institution_name text not null,
  status text not null default 'pending' check (status in ('pending','active','revoked','error')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id,provider,external_connection_ref),
  unique (owner_user_id,id),
  foreign key (owner_user_id,consent_id) references nex_personal.consents(owner_user_id,id) on delete set null (consent_id)
);
create index if not exists personal_connections_owner_idx on nex_personal.connections(owner_user_id,status,created_at desc);

create table if not exists nex_personal.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references nex_personal.profiles(user_id) on delete cascade,
  connection_id uuid,
  provider text not null,
  provider_account_ref text not null,
  institution_name text not null,
  name text not null,
  account_type text not null default 'checking',
  currency char(3) not null default 'BRL',
  current_minor bigint,
  available_minor bigint,
  balance_as_of timestamptz,
  last_synced_at timestamptz,
  status text not null default 'active' check (status in ('active','stale','disconnected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id,provider,provider_account_ref),
  unique(owner_user_id,id),
  foreign key(owner_user_id,connection_id) references nex_personal.connections(owner_user_id,id) on delete set null (connection_id)
);
create index if not exists personal_accounts_owner_idx on nex_personal.accounts(owner_user_id,status,balance_as_of desc);

create table if not exists nex_personal.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references nex_personal.profiles(user_id) on delete cascade,
  account_id uuid not null,
  provider_transaction_ref text not null,
  description text not null,
  amount_minor bigint not null,
  currency char(3) not null default 'BRL',
  category text,
  booked_at timestamptz not null,
  imported_at timestamptz not null default now(),
  unique(owner_user_id,account_id,provider_transaction_ref),
  foreign key(owner_user_id,account_id) references nex_personal.accounts(owner_user_id,id) on delete cascade
);
create index if not exists personal_transactions_owner_date_idx on nex_personal.transactions(owner_user_id,booked_at desc);

create table if not exists nex_personal.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references nex_personal.profiles(user_id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  subject_type text not null,
  subject_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists personal_audit_owner_idx on nex_personal.audit_events(owner_user_id,created_at desc);

comment on schema nex_personal is 'Nex Personal user-scoped financial read models; not a banking ledger.';
comment on table nex_personal.accounts is 'Balances are provider snapshots, not Nex-custodied funds; stale balances must never be presented as live.';
comment on table nex_personal.connections is 'Only sanitized connection identifiers; credentials/tokens remain in an encrypted provider secret store, not here.';
