# USA regional PostgreSQL RLS proof — ephemeral CI only

These files are intentionally located under apps/usa-lab/postgres, **not** under the existing production migration directory. The CI job spins up a disposable PostgreSQL 16 container, applies synthetic US-only tables and confirms deny-by-default row-level security.

- Each organization has region_code='US'; memberships and tasks also enforce this with CHECK.
- The non-login, non-BYPASSRLS role usa_lab_app has narrowly scoped SELECT/INSERT/UPDATE grants.
- FORCE ROW LEVEL SECURITY is applied to all three tables. A task is visible/writable only when the current transaction has a US organization and matching subject membership.
- The test attempts missing identity context, another member in the same org, cross-tenant reads/inserts/updates, BR-region writes and unauthorized DELETE.
- The service-side application **must** validate identity with a trusted provider and set transaction-local scope with SET LOCAL or set_config(..., true) on a pooled connection. Never pass raw SQL, database credentials or untrusted user-defined session attributes to clients. This schema is not proof against a compromised DB role or an SQL-injection vulnerability.
- Before use with real US customers: separately provisioned US Postgres, non-owner application account, validated OIDC flow, connection pooling audit, explicit migrations/rollbacks, owner privileges review, backups, encryption and tenant-permission tests.

Do not execute this proof against Brazilian or live US databases; do not merge it into production migrations or deploy it to Render.
