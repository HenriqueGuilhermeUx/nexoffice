-- NexOffice Network V1 + owner-controlled Pix payment profile.
-- No custody, BaaS account, payment execution or Nexa dependency is introduced here.

create table if not exists provider_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references workspaces(id) on delete cascade,
  display_name text not null,
  headline text,
  bio text,
  categories text[] not null default '{}',
  specialties text[] not null default '{}',
  service_regions text[] not null default '{}',
  remote_available boolean not null default true,
  status text not null default 'draft' check(status in ('draft','published','paused')),
  metadata jsonb not null default '{}',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists provider_profiles_directory_idx on provider_profiles(status,updated_at desc);
create index if not exists provider_profiles_categories_idx on provider_profiles using gin(categories);
create index if not exists provider_profiles_specialties_idx on provider_profiles using gin(specialties);

create table if not exists provider_services (
  id uuid primary key default gen_random_uuid(),
  provider_workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  category text not null,
  description text not null,
  pricing_model text not null default 'quote' check(pricing_model in ('quote','fixed','monthly','hourly')),
  starting_price_minor bigint check(starting_price_minor is null or starting_price_minor >= 0),
  currency char(3) not null default 'BRL',
  capabilities text[] not null default '{}',
  active boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists provider_services_workspace_idx on provider_services(provider_workspace_id,active,created_at desc);
create index if not exists provider_services_category_idx on provider_services(category,active);

create table if not exists provider_portfolio_items (
  id uuid primary key default gen_random_uuid(),
  provider_workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  summary text not null,
  outcome_summary text,
  reference_url text,
  sort_order int not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists provider_portfolio_workspace_idx on provider_portfolio_items(provider_workspace_id,active,sort_order,created_at desc);

create table if not exists provider_requests (
  id uuid primary key default gen_random_uuid(),
  requester_workspace_id uuid not null references workspaces(id) on delete cascade,
  provider_workspace_id uuid not null references workspaces(id) on delete cascade,
  service_id uuid references provider_services(id) on delete set null,
  contact_id uuid references crm_contacts(id) on delete set null,
  requested_by uuid references users(id) on delete set null,
  title text not null,
  need_summary text not null,
  budget_minor bigint check(budget_minor is null or budget_minor >= 0),
  currency char(3) not null default 'BRL',
  status text not null default 'requested' check(status in ('requested','accepted','declined','in_progress','completed','cancelled')),
  document_ref_id uuid references document_refs(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(requester_workspace_id <> provider_workspace_id)
);
create index if not exists provider_requests_requester_idx on provider_requests(requester_workspace_id,status,created_at desc);
create index if not exists provider_requests_provider_idx on provider_requests(provider_workspace_id,status,created_at desc);

create table if not exists provider_outcomes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references provider_requests(id) on delete cascade,
  recorded_by_workspace_id uuid not null references workspaces(id) on delete cascade,
  summary text not null,
  metrics jsonb not null default '{}',
  verified_by_platform boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists provider_outcomes_request_idx on provider_outcomes(request_id,created_at desc);

create table if not exists workspace_payment_profiles (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  method text not null default 'pix' check(method='pix'),
  pix_key_type text not null check(pix_key_type in ('cpf','cnpj','email','phone','random')),
  pix_key_ciphertext text not null,
  pix_key_iv text not null,
  pix_key_tag text not null,
  beneficiary_name text not null,
  document_label text,
  instructions text,
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table provider_profiles is 'Only explicitly published provider fields are visible across NexOffice workspaces.';
comment on table provider_requests is 'Service requests between workspaces. No payment or contract content is stored here.';
comment on column provider_requests.document_ref_id is 'Optional DocWallet-backed document reference; raw contract content remains in DocWallet.';
comment on table workspace_payment_profiles is 'Owner-controlled Pix instructions. Pix keys are encrypted at application level; NexOffice does not custody or move funds.';
