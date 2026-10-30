-- NexOffice Executive Decision Workspace V1
-- Records explicit human executive choices without executing any external action.

create table if not exists executive_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  priority_code text not null,
  priority_level text not null check(priority_level in ('info','attention','critical')),
  priority_title text not null,
  priority_detail text not null,
  selected_path_id text not null,
  selected_posture text not null check(selected_posture in ('conservative','balanced','active')),
  selected_label text not null,
  suggested_action_family text,
  rationale text not null,
  evidence_snapshot jsonb not null default '[]'::jsonb,
  comparable_cases_snapshot jsonb not null default '[]'::jsonb,
  tradeoffs_snapshot jsonb not null default '[]'::jsonb,
  risks_snapshot jsonb not null default '[]'::jsonb,
  confidence text not null check(confidence in ('low','medium','high')),
  status text not null default 'recorded' check(status in ('recorded','superseded','cancelled')),
  chosen_by uuid not null references users(id) on delete restrict,
  chosen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists executive_decisions_workspace_chosen_idx
  on executive_decisions(workspace_id,chosen_at desc);

create index if not exists executive_decisions_priority_idx
  on executive_decisions(workspace_id,priority_code,status,chosen_at desc);

comment on table executive_decisions is
  'Human executive choices from Maya recommendation paths. Recording a choice never executes an action or changes autonomy.';
