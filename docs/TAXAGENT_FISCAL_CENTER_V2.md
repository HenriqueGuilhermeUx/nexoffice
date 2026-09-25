# TaxAgent Fiscal Center V2

This branch integrates the existing TaxAgent Core into NexOffice as a customer-facing fiscal onboarding and operations surface.

Principles:
- one TaxAgent Core; no copied fiscal rules or shared fiscal database;
- workspace isolation;
- secret-safe handoff: NexOffice stores references/status, never raw A1/private keys/provider passwords in normal integration records;
- approval-first/idempotent external fiscal effects;
- onboarding/readiness may run automatically, emission never does;
- Nexa remains outside this fiscal/financial execution path for this phase.

Target flow:
workspace -> TaxAgent company mapping -> fiscal intake/readiness -> secure A1/provider credential handoff -> safe preflight -> HOMOLOGATION_READY -> prepare invoice -> human approval -> TaxAgent execution.
