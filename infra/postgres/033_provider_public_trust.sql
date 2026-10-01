-- Privacy-safe evidence aggregates for NexOffice Network providers.
-- No client identity, revenue amount, document content, fiscal data or raw outcome metrics are exposed.

create or replace view provider_public_trust_v1 as
with completed as (
  select provider_workspace_id,
         count(*)::int completed_engagements,
         count(distinct requester_workspace_id)::int distinct_clients,
         max(updated_at) last_completed_at
  from provider_requests
  where status='completed'
  group by provider_workspace_id
), repeats as (
  select provider_workspace_id,count(*)::int repeat_clients
  from (
    select provider_workspace_id,requester_workspace_id
    from provider_requests
    where status='completed'
    group by provider_workspace_id,requester_workspace_id
    having count(*)>=2
  ) x
  group by provider_workspace_id
), outcomes as (
  select r.provider_workspace_id,count(distinct o.request_id)::int outcome_records
  from provider_outcomes o
  join provider_requests r on r.id=o.request_id and r.status='completed'
  group by r.provider_workspace_id
), evidence as (
  select r.provider_workspace_id,count(distinct r.id)::int operational_evidence
  from provider_requests r
  join business_operations bo on bo.provider_request_id=r.id
    and bo.workspace_id=r.requester_workspace_id
    and bo.status='paid'
  where r.status='completed'
  group by r.provider_workspace_id
)
select p.workspace_id provider_workspace_id,
       coalesce(c.completed_engagements,0)::int completed_engagements,
       coalesce(c.distinct_clients,0)::int distinct_clients,
       coalesce(rep.repeat_clients,0)::int repeat_clients,
       coalesce(o.outcome_records,0)::int outcome_records,
       coalesce(e.operational_evidence,0)::int operational_evidence,
       case when coalesce(c.completed_engagements,0)>0
         then floor((coalesce(e.operational_evidence,0)::numeric/c.completed_engagements::numeric)*100)::int
         else 0 end evidence_coverage_pct,
       case when coalesce(c.completed_engagements,0)>0
         then floor((coalesce(o.outcome_records,0)::numeric/c.completed_engagements::numeric)*100)::int
         else 0 end outcome_coverage_pct,
       c.last_completed_at
from provider_profiles p
left join completed c on c.provider_workspace_id=p.workspace_id
left join repeats rep on rep.provider_workspace_id=p.workspace_id
left join outcomes o on o.provider_workspace_id=p.workspace_id
left join evidence e on e.provider_workspace_id=p.workspace_id;

comment on view provider_public_trust_v1 is
  'Public aggregate evidence only. operational_evidence means a completed provider request has a linked NexOffice business operation marked paid by the requester workspace; it is not a quality rating or independent payment audit.';
