-- NexOffice ERP Value Pack V1
-- Lightweight stock, purchasing and action lineage without turning the core into a heavy ERP.

alter table business_catalog_items
  add column if not exists track_inventory boolean not null default false;

alter table business_catalog_items
  add column if not exists reorder_point numeric(14,4) not null default 0 check (reorder_point >= 0);

alter table business_catalog_items
  add column if not exists preferred_supplier_id uuid references crm_contacts(id) on delete set null;

create table if not exists inventory_locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  code text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,name)
);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  catalog_item_id uuid not null references business_catalog_items(id) on delete cascade,
  location_id uuid references inventory_locations(id) on delete set null,
  movement_type text not null check (movement_type in ('opening','purchase','sale','adjustment_in','adjustment_out','transfer_in','transfer_out','return_in','return_out')),
  quantity numeric(14,4) not null check (quantity > 0),
  unit_cost_minor bigint check (unit_cost_minor is null or unit_cost_minor >= 0),
  reference_type text,
  reference_id uuid,
  note text,
  occurred_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_item_idx
  on inventory_movements(workspace_id,catalog_item_id,occurred_at desc);

create index if not exists inventory_movements_location_idx
  on inventory_movements(workspace_id,location_id,occurred_at desc)
  where location_id is not null;

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  supplier_contact_id uuid references crm_contacts(id) on delete set null,
  location_id uuid references inventory_locations(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','ordered','partial','received','cancelled')),
  expected_at timestamptz,
  currency char(3) not null default 'BRL',
  total_minor bigint not null default 0 check (total_minor >= 0),
  note text,
  created_by uuid references users(id) on delete set null,
  ordered_at timestamptz,
  received_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_orders_workspace_status_idx
  on purchase_orders(workspace_id,status,updated_at desc);

create table if not exists purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  catalog_item_id uuid not null references business_catalog_items(id) on delete restrict,
  quantity numeric(14,4) not null check (quantity > 0),
  received_quantity numeric(14,4) not null default 0 check (received_quantity >= 0),
  unit_cost_minor bigint not null default 0 check (unit_cost_minor >= 0),
  created_at timestamptz not null default now()
);

create index if not exists purchase_order_items_order_idx
  on purchase_order_items(workspace_id,purchase_order_id);

create index if not exists purchase_order_items_catalog_idx
  on purchase_order_items(workspace_id,catalog_item_id);

comment on table inventory_movements is
  'Append-only stock movements. Inventory balance is derived from movements; external purchasing/payment actions are never automatic.';

comment on table purchase_orders is
  'Internal purchase planning and receiving. Ordering suppliers remains an explicit human/external action.';

comment on column business_catalog_items.track_inventory is
  'Enables lightweight stock management only for physical products that need it.';
