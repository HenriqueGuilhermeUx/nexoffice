-- Synthetic fixtures inserted only as ephemeral Postgres CI owner.
INSERT INTO usa_lab.organizations(id,name)
VALUES ('11111111-1111-4111-8111-111111111111','USA QA Alpha'),
       ('22222222-2222-4222-8222-222222222222','USA QA Beta');
INSERT INTO usa_lab.memberships(org_id,subject)
VALUES ('11111111-1111-4111-8111-111111111111','fixture-alpha'),
       ('22222222-2222-4222-8222-222222222222','fixture-beta');
INSERT INTO usa_lab.tasks(id,org_id,title)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Alpha sample task'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Beta sample task');
