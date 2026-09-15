-- Vertical packs are configuration overlays, never forks of the NexOffice core.
create or replace function nexoffice_vertical_pack_label(p_vertical text) returns text language sql immutable as $$
  select case p_vertical
    when 'legal' then 'NexOffice Legal'
    when 'health' then 'NexOffice Health'
    when 'condo' then 'NexOffice Condo'
    when 'commerce' then 'NexOffice Commerce'
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
    else null
  end;

  if pack_module is not null and not (pack_module = any(coalesce(new.modules,'{}'::text[]))) then
    new.modules := array_append(coalesce(new.modules,'{}'::text[]),pack_module);
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

drop trigger if exists workspaces_apply_vertical_pack on workspaces;
create trigger workspaces_apply_vertical_pack
before insert or update of vertical on workspaces
for each row execute function apply_workspace_vertical_pack();

-- Backfill workspaces created before this migration.
update workspaces
set vertical=vertical,
    updated_at=updated_at;
