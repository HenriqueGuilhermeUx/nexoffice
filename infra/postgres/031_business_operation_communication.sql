-- Governed communication lineage for commercial operations.
-- Stores only references to approval/action; Pix secrets remain encrypted in workspace_payment_profiles.

alter table business_operations
  add column if not exists communication_action_id uuid references command_actions(id) on delete set null;

create index if not exists business_operations_communication_idx
  on business_operations(workspace_id,communication_action_id)
  where communication_action_id is not null;

comment on column business_operations.communication_action_id is
  'Approval-governed SmartBots communication action. Payment secrets are hydrated in memory at execution time and are never persisted here.';
