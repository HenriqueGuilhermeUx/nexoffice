/** Prevent the US laboratory from importing Brazil code or entering public product builds. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const server=read('apps/usa-lab/src/server.mjs'),store=read('apps/usa-lab/src/store.mjs');
const entry=read('apps/web/usa-preview/main.tsx'),root=JSON.parse(read('package.json'));
const ci=read('.github/workflows/usa-identity-lab.yml');
assert.equal(root.workspaces.some(x=>x.includes('usa-lab')),false,'Lab cannot join production workspaces');
assert.ok(!entry.includes('usa-lab'),'Public US preview cannot import lab');
for(const source of [server,store]){
  assert.ok(!/from ["'](?:\.\.\/\.\.\/|@nexoffice\/)/.test(source),'Lab cannot import Brazil code');
  assert.ok(!/supabase\.co|onrender\.com|DATABASE_URL|NEXOFFICE_API|TRYNEXA/i.test(source),'Lab cannot access Brazil infra');
}
assert.ok(server.includes("host!=='127.0.0.1'"),'Lab must refuse public bind');
assert.ok(server.includes("nodeEnv==='production'"),'Lab must reject production');
assert.ok(server.includes("process.env.USA_LAB_ENABLED!=='1'"),'Lab must default disabled');
assert.ok(store.includes("CHECK(region_code='US')"),'SQLite must enforce US-only region');
assert.ok(ci.includes('node --test apps/usa-lab/test/isolation.test.mjs'),'PR CI must run isolation tests');
console.log('PASS: US identity lab isolated, fail-closed, never included in production web');
