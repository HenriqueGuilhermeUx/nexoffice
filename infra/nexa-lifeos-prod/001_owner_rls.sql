-- NEXA LIFE OS PF PRODUCTION ONLY: draft owner-isolation RLS.
-- NEVER apply to the preview or NexOffices PJ database.
-- Requires a NEW, empty, dedicated PF production database, a non-bypass-RLS
-- runtime DB role and per-request trusted actor context.
-- Not a complete rollout: app query/transaction actor-context wiring remains
-- a separate security gate. CI rehearses this SQL only on ephemeral Postgres.

create or replace function nex_personal.current_actor_id()
returns uuid
language sql stable
as $nexa$
 select nullif(pg_catalog.current_setting('nexa.actor_id',true),'')::uuid
$nexa$;

do $rls$
declare
  table_name text;
  observed integer;
  all_tables text[] := array[
    'profiles','consents','connections','accounts','transactions',
    'audit_events','budgets','goals','wealth_items','bills',
    'life_preferences','life_intents'
  ];
  owner_tables text[] := array[
    'consents','connections','accounts','transactions',
    'budgets','goals','wealth_items','bills',
    'life_preferences','life_intents'
  ];
begin
  select count(*) into observed from pg_catalog.pg_tables where schemaname='nex_personal';
  if observed <> array_length(all_tables,1) then
    raise exception 'Nexa PF RLS migration: unexpected table count % (expected %)',
      observed,array_length(all_tables,1);
  end if;
  foreach table_name in array all_tables loop
    if not exists (select 1 from pg_catalog.pg_tables
       where schemaname='nex_personal' and tablename=table_name) then
      raise exception 'Nexa PF RLS migration: missing expected table %',table_name;
    end if;
    -- Never silently extend an existing policy configuration. Requires
    -- explicit audit/review before upgrading a nonempty or unknown schema.
    if exists(select 1 from pg_catalog.pg_policies where schemaname='nex_personal'
       and tablename=table_name) then
      raise exception 'Nexa PF RLS migration: unexpected preexisting policies on %',table_name;
    end if;
    execute format('alter table nex_personal.%I enable row level security',table_name);
    execute format('alter table nex_personal.%I force row level security',table_name);
  end loop;
  -- Profiles key differs from the rest.
  execute 'create policy pf_actor_owner on nex_personal.profiles
    for all using (user_id=nex_personal.current_actor_id())
    with check (user_id=nex_personal.current_actor_id())';
  foreach table_name in array owner_tables loop
    execute format(
      'create policy pf_actor_owner on nex_personal.%I
        for all using (owner_user_id=nex_personal.current_actor_id())
        with check (owner_user_id=nex_personal.current_actor_id())',
      table_name);
  end loop;
  -- Audit rows remain append-only, even to their owner; every audit writer
  -- must record the same authenticated actor. Never allow update/delete.
  execute 'create policy pf_actor_read_audit on nex_personal.audit_events
    for select using (owner_user_id=nex_personal.current_actor_id())';
  execute 'create policy pf_actor_append_audit on nex_personal.audit_events
    for insert with check (
      owner_user_id=nex_personal.current_actor_id()
      and actor_user_id=nex_personal.current_actor_id()
    )';
end;
$rls$;
