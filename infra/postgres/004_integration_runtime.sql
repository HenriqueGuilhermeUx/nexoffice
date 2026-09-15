-- NexOffice integration runtime hardening.

-- Recurring rules may be retried concurrently; recurrence_key is the idempotency key.
create unique index if not exists ledger_recurrence_key_unique_idx
  on ledger_entries(workspace_id,recurrence_key) where recurrence_key is not null;

-- Integration health is operational state only. Secrets remain in runtime secret stores.
alter table integrations add column if not exists last_health_at timestamptz;
alter table integrations add column if not exists last_health_status text;
alter table integrations add column if not exists last_error text;

-- Agent runs need an explicit execution key so approved actions cannot execute twice.
alter table agent_runs add column if not exists execution_key text;
create unique index if not exists agent_runs_execution_key_idx
  on agent_runs(workspace_id,execution_key) where execution_key is not null;

-- Helpful informational events should not create unnecessary approval requests.
insert into autonomy_policies(workspace_id,action_type,mode)
select id,'deal.stage_changed','notify'::autonomy_mode from workspaces
on conflict(workspace_id,action_type) do nothing;
insert into autonomy_policies(workspace_id,action_type,mode)
select id,'deal.won','notify'::autonomy_mode from workspaces
on conflict(workspace_id,action_type) do nothing;
insert into autonomy_policies(workspace_id,action_type,mode)
select id,'task.completed','notify'::autonomy_mode from workspaces
on conflict(workspace_id,action_type) do nothing;

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
    (new.id,'payment.discount*','approval_required'),
    (new.id,'payment.refund*','approval_required'),
    (new.id,'campaign.budget.*','approval_required'),
    (new.id,'document.sign_on_behalf*','approval_required')
  on conflict(workspace_id,action_type) do nothing;
  return new;
end $$;
