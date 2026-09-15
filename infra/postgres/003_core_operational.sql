-- NexOffice V1 operational core: local auth, RBAC, invitations and ERP recurrence.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password_hash text not null,
  status text not null default 'active' check(status in ('active','invited','disabled')),
  locale text not null default 'pt-BR',
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists users_email_unique_idx on users(lower(email));

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists auth_sessions_user_idx on auth_sessions(user_id,expires_at desc);
create index if not exists auth_sessions_expiry_idx on auth_sessions(expires_at);

create table if not exists workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member' check(role in ('admin','member','viewer')),
  permissions text[] not null default '{}',
  token_hash text not null unique,
  status text not null default 'pending' check(status in ('pending','accepted','revoked','expired')),
  invited_by uuid references users(id) on delete set null,
  accepted_by uuid references users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists workspace_invites_lookup_idx on workspace_invites(workspace_id,lower(email),status);

-- Link workspace membership to NexOffice users once the users table exists.
do $$
begin
  if not exists (select 1 from pg_constraint where conname='workspace_members_user_fk') then
    alter table workspace_members
      add constraint workspace_members_user_fk foreign key(user_id) references users(id) on delete cascade;
  end if;
end $$;

create table if not exists finance_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  kind text not null default 'bank' check(kind in ('cash','bank','wallet','receivable','payable','other')),
  opening_balance_minor bigint not null default 0,
  currency char(3) not null default 'BRL',
  active boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,name)
);

alter table ledger_entries add column if not exists account_id uuid references finance_accounts(id) on delete set null;
create index if not exists ledger_account_idx on ledger_entries(workspace_id,account_id,due_at);

create table if not exists recurring_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  account_id uuid references finance_accounts(id) on delete set null,
  direction ledger_direction not null,
  category text not null,
  description text not null,
  amount_minor bigint not null check(amount_minor >= 0),
  currency char(3) not null default 'BRL',
  frequency text not null check(frequency in ('weekly','monthly','yearly')),
  interval_count int not null default 1 check(interval_count > 0),
  next_run_at timestamptz not null,
  ends_at timestamptz,
  active boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recurring_rules_due_idx on recurring_rules(workspace_id,active,next_run_at);

-- Helpful policies for operational signals. These create inbox items without asking for approval
-- merely because an informational event occurred. Risky downstream actions remain approval-gated.
insert into autonomy_policies(workspace_id,action_type,mode)
select id,'lead.created','notify'::autonomy_mode from workspaces
on conflict(workspace_id,action_type) do nothing;
insert into autonomy_policies(workspace_id,action_type,mode)
select id,'appointment.cancelled','notify'::autonomy_mode from workspaces
on conflict(workspace_id,action_type) do nothing;
insert into autonomy_policies(workspace_id,action_type,mode)
select id,'payment.received','notify'::autonomy_mode from workspaces
on conflict(workspace_id,action_type) do nothing;
insert into autonomy_policies(workspace_id,action_type,mode)
select id,'document.signed','notify'::autonomy_mode from workspaces
on conflict(workspace_id,action_type) do nothing;

-- Add the same defaults to workspaces created after this migration.
create or replace function seed_workspace_policies() returns trigger language plpgsql as $$
begin
  insert into autonomy_policies(workspace_id,action_type,mode) values
    (new.id,'appointment.confirm*','notify'),
    (new.id,'appointment.cancelled','notify'),
    (new.id,'reminder.*','notify'),
    (new.id,'message.send*','notify'),
    (new.id,'lead.created','notify'),
    (new.id,'payment.received','notify'),
    (new.id,'document.signed','notify'),
    (new.id,'payment.discount*','approval_required'),
    (new.id,'payment.refund*','approval_required'),
    (new.id,'campaign.budget.*','approval_required'),
    (new.id,'document.sign_on_behalf*','approval_required')
  on conflict(workspace_id,action_type) do nothing;
  return new;
end $$;
