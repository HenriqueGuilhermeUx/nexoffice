-- NexOffice Smart Playbooks V1
-- Guided, auditable business orchestration on top of the Business Action Engine.

create table if not exists business_playbook_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  template_key text not null,
  title text not null,
  objective text,
  status text not null default 'active' check (status in ('active','waiting_human','completed','cancelled')),
  subject_type text,
  subject_id uuid,
  contact_id uuid references crm_contacts(id) on delete set null,
  deal_id uuid references crm_deals(id) on delete set null,
  operation_id uuid references business_operations(id) on delete set null,
  catalog_item_id uuid references business_catalog_items(id) on delete set null,
  current_step integer not null default 1 check (current_step >= 1),
  created_by uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_playbook_runs_workspace_status_idx
  on business_playbook_runs(workspace_id,status,updated_at desc);

create index if not exists business_playbook_runs_subject_idx
  on business_playbook_runs(workspace_id,subject_type,subject_id)
  where subject_id is not null;

create table if not exists business_playbook_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  run_id uuid not null references business_playbook_runs(id) on delete cascade,
  position integer not null check (position >= 1),
  action_id text not null,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending','ready','executing','waiting_human','completed','skipped','blocked')),
  execution_mode text not null check (execution_mode in ('safe_internal','handoff','human_confirmation','dedicated_external_flow')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id,position)
);

create index if not exists business_playbook_steps_run_idx
  on business_playbook_steps(workspace_id,run_id,position);

comment on table business_playbook_runs is
  'Guided business playbook runs. Playbooks orchestrate existing NexOffice actions and never bypass action risk/approval rules.';

comment on table business_playbook_steps is
  'Ordered playbook steps with explicit execution mode. External or sensitive actions stay human-controlled.';
