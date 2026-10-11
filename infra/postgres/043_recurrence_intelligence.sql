alter table recurring_rules
  add column if not exists source_operation_id uuid references business_operations(id) on delete set null;

alter table recurring_rules
  add column if not exists catalog_item_id uuid references business_catalog_items(id) on delete set null;

create unique index if not exists recurring_rules_source_operation_uidx
  on recurring_rules(workspace_id,source_operation_id)
  where source_operation_id is not null;

create index if not exists recurring_rules_catalog_contact_idx
  on recurring_rules(workspace_id,catalog_item_id,contact_id,active,next_run_at)
  where catalog_item_id is not null;

comment on column recurring_rules.source_operation_id is
  'Commercial operation that activated this recurring income rule. Recurrence activation is explicit and never retroactive.';

comment on column recurring_rules.catalog_item_id is
  'Catalog offer associated with the recurring rule for intelligence, renewal and profitability context.';
