-- One lightweight checkpoint per active workspace/day. The actual snapshot remains in finance_snapshots.
create table if not exists finance_daily_state (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  last_snapshot_at timestamptz
);
