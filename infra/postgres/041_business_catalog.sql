create table if not exists business_catalog_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_by uuid references users(id) on delete set null,
  kind text not null check (kind in ('product','service')),
  name text not null,
  description text,
  sku text,
  unit text not null default 'unidade',
  price_minor bigint not null default 0 check (price_minor >= 0),
  cost_minor bigint check (cost_minor is null or cost_minor >= 0),
  currency text not null default 'BRL' check (char_length(currency)=3),
  billing_cycle text not null default 'one_time' check (billing_cycle in ('one_time','weekly','monthly','quarterly','yearly','custom')),
  fiscal_code text,
  nbs text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_catalog_workspace_active_idx
  on business_catalog_items(workspace_id,active,updated_at desc);

create unique index if not exists business_catalog_workspace_name_active_uidx
  on business_catalog_items(workspace_id,lower(name))
  where active=true;

create unique index if not exists business_catalog_workspace_sku_active_uidx
  on business_catalog_items(workspace_id,lower(sku))
  where active=true and sku is not null and btrim(sku)<>'';

alter table business_operations
  add column if not exists catalog_item_id uuid references business_catalog_items(id) on delete set null;

alter table business_operations
  add column if not exists quantity numeric(14,4) not null default 1 check (quantity > 0);

alter table business_operations
  add column if not exists unit_price_minor bigint check (unit_price_minor is null or unit_price_minor >= 0);

create index if not exists business_operations_catalog_item_idx
  on business_operations(workspace_id,catalog_item_id,updated_at desc)
  where catalog_item_id is not null;
