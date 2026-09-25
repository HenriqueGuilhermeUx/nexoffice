-- First-party NexOffice ecosystem offers.
-- These records capture interest only. They do not provision products,
-- create financial accounts or perform any external action.

create table if not exists ecosystem_interests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  offer_key text not null check(offer_key in ('av_studio','nexa')),
  requested_by uuid references users(id) on delete set null,
  message text,
  context jsonb not null default '{}',
  status text not null default 'new' check(status in ('new','contacted','qualified','closed','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ecosystem_interests_workspace_idx on ecosystem_interests(workspace_id,offer_key,status,created_at desc);

comment on table ecosystem_interests is 'Opt-in interest in first-party ecosystem offers. No provisioning or financial side effect occurs here.';
comment on column ecosystem_interests.offer_key is 'av_studio is a custom-development service; nexa is informational/future while BaaS remains unavailable.';
