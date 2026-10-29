-- Nex Personal preview identity only. No workspace, ledger, billing or PJ tables.
-- Applied exclusively by runPersonalPreviewMigrations on an isolated database.
create extension if not exists pgcrypto;
create table if not exists public.users (
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
create unique index if not exists users_email_unique_idx on public.users(lower(email));
create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists auth_sessions_user_idx on public.auth_sessions(user_id,expires_at desc);
create index if not exists auth_sessions_expiry_idx on public.auth_sessions(expires_at);
