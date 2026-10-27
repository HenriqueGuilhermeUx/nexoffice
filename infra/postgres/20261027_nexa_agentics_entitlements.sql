-- Entitlements must be provisioned by a trusted, independently verified billing flow.
-- No client API can grant or modify these records.
create table if not exists nex_personal.agentic_entitlements (
 owner_user_id uuid primary key references users(id) on delete cascade,
 plan_code text not null check (plan_code in ('premium_br','premium_global')),
 status text not null check (status in ('active','cancelled','expired')),
 verified_provider text not null check (length(verified_provider) > 0),
 verified_reference text not null check (length(verified_reference) > 0),
 valid_until timestamptz not null,
 verified_at timestamptz not null,
 updated_at timestamptz not null default now()
);
create index if not exists idx_agentic_entitlements_valid on nex_personal.agentic_entitlements(valid_until) where status='active';
