create table if not exists nex_personal.agentic_missions (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references users(id) on delete cascade,
 title text not null check (length(title) between 1 and 160),
 description text not null default '',
 status text not null default 'draft' check (status in ('draft','cancelled')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_agentic_missions_owner on nex_personal.agentic_missions(owner_user_id,created_at desc);
