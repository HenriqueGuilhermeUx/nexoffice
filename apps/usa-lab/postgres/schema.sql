-- QA ONLY. Ephemeral US-only PostgreSQL database; never apply to Brazilian databases.
-- Do NOT add this schema to the regular migration or production deploy pipeline.
CREATE ROLE usa_lab_app NOLOGIN NOBYPASSRLS;
CREATE SCHEMA usa_lab;
REVOKE ALL ON SCHEMA usa_lab FROM PUBLIC;
GRANT USAGE ON SCHEMA usa_lab TO usa_lab_app;

CREATE TABLE usa_lab.organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  region_code text NOT NULL DEFAULT 'US' CHECK (region_code='US')
);
CREATE TABLE usa_lab.memberships (
  org_id uuid NOT NULL REFERENCES usa_lab.organizations(id),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 255),
  region_code text NOT NULL DEFAULT 'US' CHECK (region_code='US'),
  PRIMARY KEY (org_id,subject)
);
CREATE TABLE usa_lab.tasks (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES usa_lab.organizations(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed')),
  region_code text NOT NULL DEFAULT 'US' CHECK (region_code='US')
);

ALTER TABLE usa_lab.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE usa_lab.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE usa_lab.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE usa_lab.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE usa_lab.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE usa_lab.tasks FORCE ROW LEVEL SECURITY;

GRANT SELECT ON usa_lab.memberships TO usa_lab_app;
GRANT SELECT,INSERT,UPDATE ON usa_lab.tasks TO usa_lab_app;
-- No grants on organizations, membership mutation or task deletion to app role.

CREATE POLICY usa_lab_membership_read ON usa_lab.memberships
FOR SELECT TO usa_lab_app
USING (region_code='US' AND org_id::text=current_setting('usa_lab.org_id',true)
       AND subject=current_setting('usa_lab.subject',true));

CREATE POLICY usa_lab_task_read ON usa_lab.tasks
FOR SELECT TO usa_lab_app
USING (region_code='US' AND org_id::text=current_setting('usa_lab.org_id',true)
  AND EXISTS (SELECT 1 FROM usa_lab.memberships m WHERE m.org_id=tasks.org_id
    AND m.subject=current_setting('usa_lab.subject',true) AND m.region_code='US'));

CREATE POLICY usa_lab_task_create ON usa_lab.tasks
FOR INSERT TO usa_lab_app
WITH CHECK (region_code='US' AND org_id::text=current_setting('usa_lab.org_id',true)
  AND EXISTS (SELECT 1 FROM usa_lab.memberships m WHERE m.org_id=tasks.org_id
    AND m.subject=current_setting('usa_lab.subject',true) AND m.region_code='US'));

CREATE POLICY usa_lab_task_update ON usa_lab.tasks
FOR UPDATE TO usa_lab_app
USING (region_code='US' AND org_id::text=current_setting('usa_lab.org_id',true)
  AND EXISTS (SELECT 1 FROM usa_lab.memberships m WHERE m.org_id=tasks.org_id
    AND m.subject=current_setting('usa_lab.subject',true) AND m.region_code='US'))
WITH CHECK (region_code='US' AND org_id::text=current_setting('usa_lab.org_id',true)
  AND EXISTS (SELECT 1 FROM usa_lab.memberships m WHERE m.org_id=tasks.org_id
    AND m.subject=current_setting('usa_lab.subject',true) AND m.region_code='US'));
