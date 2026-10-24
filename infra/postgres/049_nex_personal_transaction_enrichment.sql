-- Nex Personal transaction provenance: additive only, does not rewrite old financial history.
-- Automatic classification is a suggestion; user overrides win.
alter table nex_personal.transactions
  add column if not exists analysis_role text,
  add column if not exists analysis_confidence text,
  add column if not exists category_origin text,
  add column if not exists analysis_rule text;

alter table nex_personal.transactions
  add constraint personal_analysis_role_allowed check(analysis_role is null or analysis_role in ('expense','income','excluded_internal','review')),
  add constraint personal_analysis_confidence_allowed check(analysis_confidence is null or analysis_confidence in ('high','medium','low'));

comment on column nex_personal.transactions.analysis_role is 'expense, income, excluded_internal or review; NULL for legacy unreviewed rows.';
comment on column nex_personal.transactions.category_origin is 'rule or user; explicit user corrections must not be overwritten by auto-enrichment.';
comment on column nex_personal.transactions.analysis_rule is 'Brief explanation for auto categorization; no bank secrets.';
