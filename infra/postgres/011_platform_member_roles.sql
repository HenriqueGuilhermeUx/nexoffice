-- Platform provisioning can establish the owner of an embedded NexOffice workspace.
-- Interactive member invitations remain restricted by API validation; only the trusted
-- server-to-server platform bridge can request an owner membership.

alter table workspace_invites drop constraint if exists workspace_invites_role_check;
alter table workspace_invites
  add constraint workspace_invites_role_check
  check(role in ('owner','admin','member','viewer'));
