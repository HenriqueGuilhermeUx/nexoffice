alter table business_operations
  add column if not exists unit_cost_minor bigint check (unit_cost_minor is null or unit_cost_minor >= 0);

comment on column business_operations.unit_cost_minor is
  'Cost snapshot captured when the operation is created from the business catalog. Null means cost was not known at creation time.';
