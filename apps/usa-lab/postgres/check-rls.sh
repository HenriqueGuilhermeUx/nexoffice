#!/usr/bin/env bash
set -euo pipefail
# This CI service database exists only for a GitHub test job.
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGDATABASE=us_lab_ci
psql -X -v ON_ERROR_STOP=1 -q -f apps/usa-lab/postgres/schema.sql
psql -X -v ON_ERROR_STOP=1 -q -f apps/usa-lab/postgres/fixtures.sql

sql() { psql -X -A -t -q -v ON_ERROR_STOP=1 -c "$1"; }
expect_count() {
 local expected="$1" query="$2" actual
 actual="$(sql "$query" | grep -E '^[0-9]+$' | tail -n 1)"
 if [[ "$actual" != "$expected" ]]; then
   echo "RLS expected $expected row(s), saw $actual" >&2; exit 1
 fi
}
tenantA="11111111-1111-4111-8111-111111111111"
tenantB="22222222-2222-4222-8222-222222222222"
asA="BEGIN; SET LOCAL ROLE usa_lab_app; SELECT set_config('usa_lab.org_id','$tenantA',true); SELECT set_config('usa_lab.subject','fixture-alpha',true);"
asB="BEGIN; SET LOCAL ROLE usa_lab_app; SELECT set_config('usa_lab.org_id','$tenantB',true); SELECT set_config('usa_lab.subject','fixture-beta',true);"
expect_count 0 "BEGIN; SET LOCAL ROLE usa_lab_app; SELECT count(*) FROM usa_lab.tasks; COMMIT;"
expect_count 1 "$asA SELECT count(*) FROM usa_lab.tasks; COMMIT;"
expect_count 1 "$asB SELECT count(*) FROM usa_lab.tasks; COMMIT;"
expect_count 0 "BEGIN; SET LOCAL ROLE usa_lab_app; SELECT set_config('usa_lab.org_id','$tenantA',true); SELECT set_config('usa_lab.subject','fixture-beta',true); SELECT count(*) FROM usa_lab.tasks; COMMIT;"
expect_count 1 "$asA SELECT count(*) FROM usa_lab.tasks WHERE title='Alpha sample task'; COMMIT;"
expect_count 0 "$asA SELECT count(*) FROM usa_lab.tasks WHERE title='Beta sample task'; COMMIT;"

if sql "$asA INSERT INTO usa_lab.tasks(id,org_id,title) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','$tenantB','Cross-tenant forgery'); COMMIT;" >/dev/null 2>&1; then
 echo "FAIL: cross-tenant INSERT was accepted" >&2; exit 1
fi
if sql "$asA UPDATE usa_lab.tasks SET org_id='$tenantB' WHERE title='Alpha sample task'; COMMIT;" >/dev/null 2>&1; then
 echo "FAIL: cross-tenant UPDATE was accepted" >&2; exit 1
fi
if sql "$asA INSERT INTO usa_lab.tasks(id,org_id,title,region_code) VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','$tenantA','Brazil injection','BR'); COMMIT;" >/dev/null 2>&1; then
 echo "FAIL: Brazilian-region INSERT was accepted" >&2; exit 1
fi
if sql "$asA DELETE FROM usa_lab.tasks WHERE title='Alpha sample task'; COMMIT;" >/dev/null 2>&1; then
 echo "FAIL: unauthorized task deletion was accepted" >&2; exit 1
fi
sql "$asA INSERT INTO usa_lab.tasks(id,org_id,title) VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','$tenantA','Authorized sample'); COMMIT;" >/dev/null
expect_count 2 "$asA SELECT count(*) FROM usa_lab.tasks; COMMIT;"
expect_count 1 "$asB SELECT count(*) FROM usa_lab.tasks; COMMIT;"
echo "PASS: US PostgreSQL RLS isolates organizations, membership, task writes and region"
