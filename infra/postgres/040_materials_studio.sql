create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  contact_id uuid references crm_contacts(id) on delete set null,
  deal_id uuid references crm_deals(id) on delete set null,
  kind text not null check (kind in ('presentation','proposal','report','onepage','image')),
  theme text not null default 'executive' check (theme in ('executive','bold','light')),
  title text not null,
  subtitle text,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  public_token uuid not null default gen_random_uuid(),
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists materials_public_token_uidx on materials(public_token);
create index if not exists materials_workspace_updated_idx on materials(workspace_id,updated_at desc);
create index if not exists materials_workspace_status_idx on materials(workspace_id,status,updated_at desc);
