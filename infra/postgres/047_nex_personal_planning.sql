-- Nex Personal P1: user-entered finance, planning and immutable import provenance.
-- No business ledger data is accessed or changed. Additive and reversible in staging.
alter table nex_personal.transactions
  add column if not exists source text not null default 'provider',
  add column if not exists fingerprint text;
create unique index if not exists personal_transaction_fingerprint_idx
  on nex_personal.transactions(owner_user_id,account_id,fingerprint)
  where fingerprint is not null;
comment on column nex_personal.transactions.source is 'provider, manual or csv; never misrepresent self-reported data as bank verified.';

create table if not exists nex_personal.budgets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references nex_personal.profiles(user_id) on delete cascade,
  month date not null,
  category text not null check(length(category) between 2 and 70),
  limit_minor bigint not null check(limit_minor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id,month,category)
);
create index if not exists personal_budgets_owner_idx on nex_personal.budgets(owner_user_id,month);

create table if not exists nex_personal.goals (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references nex_personal.profiles(user_id) on delete cascade,
  name text not null check(length(name) between 2 and 120),
  target_minor bigint not null check(target_minor>0),
  saved_minor bigint not null default 0 check(saved_minor>=0),
  due_on date,
  status text not null default 'active' check(status in ('active','completed','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_goals_owner_idx on nex_personal.goals(owner_user_id,status);

create table if not exists nex_personal.wealth_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references nex_personal.profiles(user_id) on delete cascade,
  name text not null check(length(name) between 2 and 120),
  kind text not null check(kind in ('asset','liability')),
  category text not null check(length(category) between 2 and 60),
  amount_minor bigint not null check(amount_minor>=0),
  currency char(3) not null default 'BRL',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists personal_wealth_owner_idx on nex_personal.wealth_items(owner_user_id,kind);

create table if not exists nex_personal.bills (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references nex_personal.profiles(user_id) on delete cascade,
  name text not null check(length(name) between 2 and 120),
  amount_minor bigint not null check(amount_minor>0),
  category text not null default 'Contas',
  next_due_on date not null,
  interval_months integer not null default 1 check(interval_months between 0 and 12),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists personal_bills_due_idx on nex_personal.bills(owner_user_id,active,next_due_on);

comment on table nex_personal.budgets is 'Per-user, manually entered personal budget; never inferred as an approved banking limit.';
comment on table nex_personal.wealth_items is 'Declared assets and liabilities, not verified balances or investment positions.';
comment on table nex_personal.bills is 'Calendar projections only; not a Pix instruction or payment mandate.';
