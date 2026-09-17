-- Flexible Modules are horizontal capabilities available to every NexOffice workspace.
-- Creator is a configuration overlay, not a fork of the core.

alter type workspace_vertical add value if not exists 'creator';

create table if not exists flexible_modules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  key text not null,
  name text not null,
  singular_label text not null default 'Registro',
  plural_label text not null default 'Registros',
  description text,
  icon text,
  active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,key)
);
create index if not exists flexible_modules_workspace_idx on flexible_modules(workspace_id,active,updated_at desc);

create table if not exists flexible_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  module_id uuid not null references flexible_modules(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  title text not null,
  status text not null default 'active',
  occurred_at timestamptz,
  data jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flexible_records_module_idx on flexible_records(workspace_id,module_id,updated_at desc);
create index if not exists flexible_records_contact_idx on flexible_records(workspace_id,contact_id,occurred_at desc nulls last,created_at desc);
create index if not exists flexible_records_data_gin on flexible_records using gin(data);

create or replace function nexoffice_vertical_pack_label(p_vertical text) returns text language sql immutable as $$
  select case p_vertical
    when 'legal' then 'NexOffice Legal'
    when 'health' then 'NexOffice Health'
    when 'condo' then 'NexOffice Condo'
    when 'commerce' then 'NexOffice Commerce'
    when 'creator' then 'NexOffice Creator'
    else 'NexOffice'
  end
$$;

create or replace function apply_workspace_vertical_pack() returns trigger language plpgsql as $$
declare
  pack_module text;
begin
  pack_module := case new.vertical::text
    when 'legal' then 'legal-pack'
    when 'health' then 'health-pack'
    when 'condo' then 'condo-pack'
    when 'commerce' then 'commerce-pack'
    when 'creator' then 'creator-pack'
    else null
  end;

  if pack_module is not null and not (pack_module = any(coalesce(new.modules,'{}'::text[]))) then
    new.modules := array_append(coalesce(new.modules,'{}'::text[]),pack_module);
  end if;
  if not ('flexible-modules' = any(coalesce(new.modules,'{}'::text[]))) then
    new.modules := array_append(coalesce(new.modules,'{}'::text[]),'flexible-modules');
  end if;

  new.settings := coalesce(new.settings,'{}'::jsonb) || jsonb_build_object(
    'verticalPack',
    coalesce(new.settings->'verticalPack','{}'::jsonb) || jsonb_build_object(
      'id',new.vertical::text,
      'label',nexoffice_vertical_pack_label(new.vertical::text)
    )
  );
  return new;
end $$;

-- Flexible Modules are part of the platform for all existing workspaces.
update workspaces
set modules = case when 'flexible-modules'=any(coalesce(modules,'{}'::text[])) then modules else array_append(coalesce(modules,'{}'::text[]),'flexible-modules') end,
    updated_at = updated_at;
