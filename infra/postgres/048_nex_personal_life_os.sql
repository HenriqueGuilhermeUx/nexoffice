-- Nex Personal P2: minimally scoped life operating system context.
-- Independent PF-only metadata. No PJ workspaces, health records or minors' data.
-- Preferences default to no proactivity and no partner sharing.
create table if not exists nex_personal.life_preferences (
  owner_user_id uuid primary key references nex_personal.profiles(user_id) on delete cascade,
  focus_areas text[] not null default '{}',
  proactive_mode text not null default 'off' check (proactive_mode in ('off','on_open')),
  updated_at timestamptz not null default now(),
  constraint personal_focus_area_limit check (cardinality(focus_areas)<=6)
);
comment on table nex_personal.life_preferences is 'User-selected area preferences only. No health, child, behavioral ad profiling or partner sharing.';

create table if not exists nex_personal.life_intents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references nex_personal.profiles(user_id) on delete cascade,
  kind text not null check (kind in ('buy_car','trip','email','family_study','health_organize','investment_review','publish','documents','buy_phone','family_planning')),
  status text not null default 'planned' check (status in ('planned','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_life_intents_owner_idx on nex_personal.life_intents(owner_user_id,created_at desc);
comment on table nex_personal.life_intents is 'Life task labels only, without names, diagnoses, child records, payment instructions or linked app credentials.';
