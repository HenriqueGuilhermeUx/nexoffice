create extension if not exists pgcrypto;

create type workspace_vertical as enum ('general','legal','health','condo','commerce');
create type workspace_status as enum ('trial','active','past_due','suspended','cancelled');
create type deal_stage as enum ('lead','qualified','meeting','proposal','won','lost');
create type ledger_direction as enum ('income','expense');
create type ledger_status as enum ('planned','open','paid','cancelled','overdue');
create type autonomy_mode as enum ('automatic','notify','approval_required');
create type approval_status as enum ('pending','approved','rejected','expired','cancelled');
create type command_action_status as enum ('open','approved','rejected','executing','done','failed','dismissed');
create type agent_role as enum ('secretary','service','crm','erp','collections','controller','documents','growth');

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  vertical workspace_vertical not null default 'general',
  plan text not null default 'starter',
  status workspace_status not null default 'trial',
  timezone text not null default 'America/Sao_Paulo',
  currency char(3) not null default 'BRL',
  modules text[] not null default '{}',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  permissions text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(workspace_id,user_id)
);

create table crm_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null default 'person' check (kind in ('person','company')),
  name text not null,
  email text,
  phone text,
  company_name text,
  document_number text,
  source text,
  tags text[] not null default '{}',
  custom_fields jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_contacts_workspace_idx on crm_contacts(workspace_id,updated_at desc);
create index crm_contacts_email_idx on crm_contacts(workspace_id,lower(email)) where email is not null;
create index crm_contacts_phone_idx on crm_contacts(workspace_id,phone) where phone is not null;

create table crm_deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  title text not null,
  stage deal_stage not null default 'lead',
  value_minor bigint not null default 0,
  currency char(3) not null default 'BRL',
  owner_id uuid,
  source text,
  next_action text,
  expected_close_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_deals_workspace_stage_idx on crm_deals(workspace_id,stage,updated_at desc);

create table crm_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete cascade,
  deal_id uuid references crm_deals(id) on delete cascade,
  type text not null,
  direction text,
  subject text,
  body text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);
create index crm_activities_timeline_idx on crm_activities(workspace_id,contact_id,occurred_at desc);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  deal_id uuid references crm_deals(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text not null default 'normal',
  assigned_to uuid,
  due_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_due_idx on tasks(workspace_id,status,due_at);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'scheduled',
  assigned_to uuid,
  external_ref text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appointments_calendar_idx on appointments(workspace_id,starts_at,status);

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  direction ledger_direction not null,
  category text not null,
  description text not null,
  amount_minor bigint not null check(amount_minor >= 0),
  currency char(3) not null default 'BRL',
  status ledger_status not null default 'open',
  due_at timestamptz,
  paid_at timestamptz,
  recurrence_key text,
  external_ref text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ledger_workspace_status_idx on ledger_entries(workspace_id,status,due_at);

create table document_refs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  provider text not null default 'docwallet',
  external_ref text not null,
  title text not null,
  status text not null default 'draft',
  document_type text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,provider,external_ref)
);

create table business_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type text not null,
  source text not null,
  subject_type text,
  subject_id uuid,
  payload jsonb not null default '{}',
  correlation_id text,
  causation_id text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index business_events_workspace_idx on business_events(workspace_id,occurred_at desc);
create index business_events_type_idx on business_events(workspace_id,type,occurred_at desc);

create table autonomy_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  action_type text not null,
  mode autonomy_mode not null default 'approval_required',
  max_amount_minor bigint,
  allowed_channels text[],
  conditions jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,action_type)
);

create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  action_type text not null,
  title text not null,
  description text,
  status approval_status not null default 'pending',
  requested_by_agent agent_role,
  subject_type text,
  subject_id uuid,
  proposed_payload jsonb not null default '{}',
  decided_by uuid,
  decided_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index approval_requests_pending_idx on approval_requests(workspace_id,status,created_at desc);

create table command_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  agent_role agent_role not null,
  title text not null,
  summary text not null,
  priority text not null default 'normal',
  status command_action_status not null default 'open',
  autonomy autonomy_mode not null default 'approval_required',
  event_id uuid references business_events(id) on delete set null,
  approval_id uuid references approval_requests(id) on delete set null,
  subject_type text,
  subject_id uuid,
  primary_action jsonb,
  secondary_actions jsonb not null default '[]',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index command_actions_inbox_idx on command_actions(workspace_id,status,priority,created_at desc);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  agent_role agent_role not null,
  action_id uuid references command_actions(id) on delete set null,
  status text not null default 'queued',
  input jsonb not null default '{}',
  output jsonb,
  provider text,
  model text,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,
  status text not null default 'disconnected',
  external_account_ref text,
  capabilities text[] not null default '{}',
  config jsonb not null default '{}',
  secret_ref text,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(workspace_id,provider)
);

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  capability text not null,
  operation text not null,
  units numeric(18,6) not null default 0,
  unit_name text not null,
  provider text,
  cost_minor_estimate bigint,
  currency char(3) not null default 'BRL',
  metadata jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
create index usage_events_billing_idx on usage_events(workspace_id,occurred_at,capability);

-- Default safe posture: anything not explicitly configured requires approval.
create or replace function seed_workspace_policies() returns trigger language plpgsql as $$
begin
  insert into autonomy_policies(workspace_id,action_type,mode) values
    (new.id,'appointment.confirm*','notify'),
    (new.id,'reminder.*','notify'),
    (new.id,'message.send*','notify'),
    (new.id,'payment.discount*','approval_required'),
    (new.id,'payment.refund*','approval_required'),
    (new.id,'campaign.budget.*','approval_required'),
    (new.id,'document.sign_on_behalf*','approval_required');
  return new;
end $$;

create trigger workspaces_seed_policies after insert on workspaces for each row execute function seed_workspace_policies();
