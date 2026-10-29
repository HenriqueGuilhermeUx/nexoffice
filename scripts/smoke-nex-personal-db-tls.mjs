import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {personalPgConnection} from '../apps/api/src/personal-preview-db-config.ts';

const database='postgresql://neon_user:pa%40ss%3Aword@ep-unit-test.neon.tech:5432/nex_personal_preview';
const preview={NEX_PERSONAL_PREVIEW:'true',CI:'false',NEX_PERSONAL_PREVIEW_CI:'false',DATABASE_SSL:'true'};
for(const mode of ['require','prefer','verify-ca','disable']){
 const raw=database+'?sslmode='+mode+'&channel_binding=require&uselibpqcompat=true&ssl=0&host=localhost';
 const x=personalPgConnection(raw,preview);
 const parsed=new URL(x.connectionString);
 assert.equal(parsed.searchParams.get('sslmode'),'verify-full','always verify host and CA');
 assert.equal(parsed.searchParams.get('channel_binding'),'require','keep channel binding');
 assert.equal(parsed.searchParams.has('uselibpqcompat'),false,'no weaker libpq alias');
 assert.equal(parsed.searchParams.has('ssl'),false,'cannot override SSL mode with ssl=0');
 assert.equal(parsed.searchParams.has('host'),false,'query cannot override verified hostname');
 assert.equal(parsed.password,'pa%40ss%3Aword');
 assert.equal(x.ssl,undefined,'never set rejectUnauthorized=false for Personal');
}
const defaultTls=personalPgConnection(database,{...preview,DATABASE_SSL:'false'});
assert.equal(new URL(defaultTls.connectionString).searchParams.get('sslmode'),'verify-full');
assert.equal(defaultTls.ssl,undefined);
for(const hostile of [
 'postgresql://user:pass@127.0.0.1/db?sslmode=disable',
 'postgresql://user:pass@localhost/db',
 'not-a-connection-string',
 'http://user:pass@ep.example.net/db'
])assert.throws(()=>personalPgConnection(hostile,preview),/requires|cannot/);
assert.throws(()=>personalPgConnection('',preview),/DATABASE_URL/);
const ci={...preview,CI:'true',NEX_PERSONAL_PREVIEW_CI:'true'};
const ciLocal='postgresql://ci:ci@127.0.0.1:5432/nex_personal_preview_ci';
const allowed=personalPgConnection(ciLocal,ci);
assert.equal(allowed.connectionString,ciLocal,'local disposable CI remains unchanged');
assert.equal(allowed.ssl,undefined);
const notCi=personalPgConnection(database,{NEX_PERSONAL_PREVIEW:'false',DATABASE_SSL:'true'});
assert.deepEqual(notCi,{connectionString:database,ssl:{rejectUnauthorized:false}},'legacy PJ behavior intentionally unchanged');
const db=readFileSync('apps/api/src/db.ts','utf8');
const migrations=readFileSync('apps/api/src/personal-preview-migrations.ts','utf8');
const server=readFileSync('apps/api/src/server-personal.ts','utf8');
assert.match(db,/personalPgConnection\(connectionString,process\.env\)/);
assert.match(migrations,/personalPgConnection\(url,process\.env\)/);
assert.doesNotMatch(migrations,/rejectUnauthorized:\s*false/);
assert.match(migrations,/connectionTimeoutMillis:30_000/);
assert.match(migrations,/query_timeout:30_000/);
assert.match(db,/NEX_PERSONAL_PREVIEW==='true'\?\{connectionTimeoutMillis:30_000\}:\{\}/);
assert.match(server,/personal_preview_migration_check_start/);
assert.match(server,/personal_preview_migration_check_complete/);

console.log('Nex Personal TLS: enforce verify-full and channel binding without modifying PJ or CI.');
