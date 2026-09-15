-- AV products can provision the same NexOffice workspace idempotently.
create unique index if not exists workspace_origins_external_unique_idx
  on workspace_origins(source_product,external_workspace_ref)
  where external_workspace_ref is not null;

-- Add-on provisioning may invite the original business owner before a NexOffice user exists.
do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid='workspace_invites'::regclass and contype='c'
    and pg_get_constraintdef(oid) ilike '%role%';
  if constraint_name is not null then
    execute format('alter table workspace_invites drop constraint %I',constraint_name);
  end if;
end $$;

alter table workspace_invites
  add constraint workspace_invites_role_check
  check(role in ('owner','admin','member','viewer'));

create index if not exists external_identities_workspace_user_idx
  on external_identities(workspace_id,user_id,provider)
  where user_id is not null;
