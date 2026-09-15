-- Trusted AV products can create NexOffice users without a local password.
-- These users authenticate only through the server-to-server platform session exchange.

alter table users
  alter column password_hash drop not null;

alter table users
  add column if not exists auth_mode text not null default 'local';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='users'::regclass
      and conname='users_auth_mode_check'
  ) then
    alter table users
      add constraint users_auth_mode_check
      check(auth_mode in ('local','federated'));
  end if;
end $$;

update users set auth_mode='local' where auth_mode is null;

create index if not exists users_auth_mode_idx on users(auth_mode,status);

comment on column users.auth_mode is 'local users sign in with password; federated users receive sessions only through a trusted platform bridge.';
