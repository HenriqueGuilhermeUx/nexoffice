create table if not exists workspace_billing (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  provider text not null default 'woovi',
  plan_code text not null default 'pro',
  price_minor bigint not null default 19700 check(price_minor >= 0),
  currency char(3) not null default 'BRL',
  status text not null default 'trialing' check(status in ('trialing','pending_activation','active','past_due','cancelled','expired','exempt')),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '7 days'),
  provider_subscription_id text,
  provider_customer_id text,
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  activated_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_billing_status_idx on workspace_billing(status,trial_ends_at);
create unique index if not exists workspace_billing_provider_subscription_idx on workspace_billing(provider,provider_subscription_id) where provider_subscription_id is not null;

create table if not exists billing_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  provider text not null default 'woovi',
  event_type text not null,
  provider_event_id text,
  payload jsonb not null default '{}',
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists billing_events_provider_event_idx on billing_events(provider,provider_event_id) where provider_event_id is not null;
create index if not exists billing_events_workspace_idx on billing_events(workspace_id,created_at desc);

-- Preserve all workspaces that existed before billing was introduced.
insert into workspace_billing(workspace_id,status,trial_started_at,trial_ends_at,activated_at)
select id,'active',created_at,created_at,created_at
from workspaces
on conflict(workspace_id) do nothing;

create or replace function nexoffice_initialize_workspace_billing()
returns trigger language plpgsql as $$
begin
  insert into workspace_billing(workspace_id,status,trial_started_at,trial_ends_at)
  values(new.id,'trialing',now(),now() + interval '7 days')
  on conflict(workspace_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_nexoffice_initialize_workspace_billing on workspaces;
create trigger trg_nexoffice_initialize_workspace_billing
after insert on workspaces
for each row execute function nexoffice_initialize_workspace_billing();
