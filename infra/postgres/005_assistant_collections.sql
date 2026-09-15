-- NexOffice operational assistants, document sync state and collections.

create table if not exists assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  agent_role agent_role,
  title text not null default 'Conversa NexOffice',
  status text not null default 'active' check(status in ('active','archived')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistant_conversations_workspace_idx on assistant_conversations(workspace_id,updated_at desc);

create table if not exists assistant_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  conversation_id uuid not null references assistant_conversations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  role text not null check(role in ('user','assistant','system','agent')),
  agent_role agent_role,
  content text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_thread_idx on assistant_messages(conversation_id,created_at);

alter table document_refs add column if not exists intelligence_status text not null default 'not_requested';
alter table document_refs add column if not exists signature_status text not null default 'not_requested';
alter table document_refs add column if not exists last_synced_at timestamptz;
alter table document_refs add column if not exists sync_error text;

create table if not exists collection_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null default 'Régua padrão',
  active boolean not null default true,
  days_after_due int[] not null default '{1,3,7,15}',
  channels text[] not null default '{whatsapp,email}',
  require_approval boolean not null default true,
  message_template text not null default 'Olá {{name}}, identificamos um pagamento de {{amount}} vencido em {{due_date}}. Posso te enviar os dados atualizados para pagamento?',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,name)
);

create table if not exists collection_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  ledger_entry_id uuid not null references ledger_entries(id) on delete cascade,
  rule_id uuid references collection_rules(id) on delete set null,
  step_day int not null,
  channel text not null,
  status text not null default 'planned' check(status in ('planned','queued','sent','failed','cancelled','paid')),
  command_action_id uuid references command_actions(id) on delete set null,
  outbox_id uuid references outbox_messages(id) on delete set null,
  attempted_at timestamptz,
  sent_at timestamptz,
  error text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,ledger_entry_id,step_day,channel)
);
create index if not exists collection_attempts_status_idx on collection_attempts(workspace_id,status,created_at desc);

-- Existing workspaces receive a sensible, approval-first default collection rule.
insert into collection_rules(workspace_id,name)
select id,'Régua padrão' from workspaces
on conflict(workspace_id,name) do nothing;

-- New workspaces receive the same collection rule.
create or replace function seed_workspace_collection_rule() returns trigger language plpgsql as $$
begin
  insert into collection_rules(workspace_id,name) values(new.id,'Régua padrão') on conflict do nothing;
  return new;
end $$;

drop trigger if exists workspaces_seed_collection_rule on workspaces;
create trigger workspaces_seed_collection_rule after insert on workspaces for each row execute function seed_workspace_collection_rule();

-- Apply new autonomy policies to existing workspaces.
insert into autonomy_policies(workspace_id,action_type,mode)
select id,'collection.reminder.send','approval_required'::autonomy_mode from workspaces
on conflict(workspace_id,action_type) do nothing;
insert into autonomy_policies(workspace_id,action_type,mode)
select id,'document.analyze','notify'::autonomy_mode from workspaces
on conflict(workspace_id,action_type) do nothing;
insert into autonomy_policies(workspace_id,action_type,mode)
select id,'document.signature_request','approval_required'::autonomy_mode from workspaces
on conflict(workspace_id,action_type) do nothing;

-- 004 owns the workspace policy trigger. Extend its function so workspaces created after
-- this migration receive every operational default as well.
create or replace function seed_workspace_policies() returns trigger language plpgsql as $$
begin
  insert into autonomy_policies(workspace_id,action_type,mode) values
    (new.id,'appointment.confirm*','notify'),
    (new.id,'appointment.cancelled','notify'),
    (new.id,'reminder.*','notify'),
    (new.id,'message.send*','notify'),
    (new.id,'lead.created','notify'),
    (new.id,'deal.stage_changed','notify'),
    (new.id,'deal.won','notify'),
    (new.id,'task.completed','notify'),
    (new.id,'payment.received','notify'),
    (new.id,'document.signed','notify'),
    (new.id,'document.analyze','notify'),
    (new.id,'collection.reminder.send','approval_required'),
    (new.id,'document.signature_request','approval_required'),
    (new.id,'payment.discount*','approval_required'),
    (new.id,'payment.refund*','approval_required'),
    (new.id,'campaign.budget.*','approval_required'),
    (new.id,'document.sign_on_behalf*','approval_required')
  on conflict(workspace_id,action_type) do nothing;
  return new;
end $$;
