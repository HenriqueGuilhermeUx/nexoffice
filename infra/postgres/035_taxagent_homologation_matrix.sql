-- TaxAgent fiscal homologation matrix.
-- Planning/evidence only: test environment, no fiscal execution is performed by this table or its API.

create table if not exists taxagent_homologation_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  operation_id uuid references business_operations(id) on delete set null,
  municipality_name text not null,
  municipality_ibge varchar(7) not null check(municipality_ibge ~ '^[0-9]{7}$'),
  provider_hint text,
  municipal_registration_context text not null default 'unknown' check(municipal_registration_context in ('available','not_applicable','unavailable','unknown')),
  integration_path text,
  scenario_label text not null,
  status text not null default 'planned' check(status in ('planned','ready','blocked','passed','failed','skipped')),
  environment text not null default 'test' check(environment='test'),
  result_code text,
  result_message text,
  safe_references jsonb not null default '{}',
  evidence jsonb not null default '{}',
  notes text,
  recorded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists taxagent_homologation_workspace_idx on taxagent_homologation_cases(workspace_id,status,created_at desc);
create index if not exists taxagent_homologation_municipality_idx on taxagent_homologation_cases(workspace_id,municipality_ibge,status);

comment on table taxagent_homologation_cases is 'Test-only fiscal homologation planning and evidence. Does not issue invoices or enable production TaxAgent actions.';
comment on column taxagent_homologation_cases.municipal_registration_context is 'Descriptive context only. NexOffice does not infer that municipal registration is universally required.';
comment on column taxagent_homologation_cases.safe_references is 'Only safe, non-secret TaxAgent references may be recorded; no credentials, raw fiscal payloads or Pix data.';
