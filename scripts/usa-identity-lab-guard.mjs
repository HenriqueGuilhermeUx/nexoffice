/** Prevent the US laboratory from importing Brazil code or entering public product builds. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const server=read('apps/usa-lab/src/server.mjs'),store=read('apps/usa-lab/src/store.mjs');
const oidc=read('apps/usa-lab/src/oidc.mjs');
const flow=read('apps/usa-lab/src/auth-flow.mjs');
const bff=read('apps/usa-lab/src/bff.mjs');
const entry=read('apps/web/usa-preview/main.tsx'),root=JSON.parse(read('package.json'));
const ci=read('.github/workflows/usa-identity-lab.yml');
assert.equal(root.workspaces.some(x=>x.includes('usa-lab')),false,'Lab cannot join production workspaces');
assert.ok(!entry.includes('usa-lab'),'Public US preview cannot import lab');
for(const source of [server,store,oidc,flow,bff]){
  assert.ok(!/from ["'](?:\.\.\/\.\.\/|@nexoffice\/)/.test(source),'Lab cannot import Brazil code');
  assert.ok(!/supabase\.co|onrender\.com|DATABASE_URL|NEXOFFICE_API|TRYNEXA/i.test(source),'Lab cannot access Brazil infra');
}
assert.ok(server.includes("host!=='127.0.0.1'"),'Lab must refuse public bind');
assert.ok(server.includes("nodeEnv==='production'"),'Lab must reject production');
assert.ok(server.includes("process.env.USA_LAB_ENABLED!=='1'"),'Lab must default disabled');
assert.ok(store.includes("CHECK(region_code='US')"),'SQLite must enforce US-only region');
assert.ok(store.includes("basename(dbFile) !== 'us-lab.sqlite'"),'USA store must only access explicitly named disposable fixture database');
assert.ok(ci.includes('node --test apps/usa-lab/test/*.test.mjs'),'PR CI must run all isolation and token tests');
assert.ok(oidc.includes("header.alg !== 'RS256'") && oidc.includes('verify('),'OIDC adapter must pin RS256 signatures');
assert.ok(!oidc.includes('fetch('),'OIDC fixture adapter must never fetch remote JWKS');
assert.ok(flow.includes("process.env.USA_LAB_ENABLED !== '1'"),'US OIDC flow must remain disabled by default');
assert.ok(flow.includes("code_challenge_method','S256'"),'US OIDC flow must mandate PKCE S256');
assert.ok(flow.includes("expectedNonce:saved.nonce"),'US OIDC callback must verify nonce');
assert.ok(flow.includes("saved.expiresAt <= clock()"),'US OIDC callback must expire state');
assert.ok(flow.includes("pending.delete(state)"),'US OIDC flow must consume state once');
assert.ok(!flow.includes('fetch(') && !flow.includes('createServer('),'US OIDC contract cannot open network or HTTP endpoints');
assert.ok(oidc.includes("expectedNonce"),'US token verifier must allow nonce enforcement');

assert.ok(bff.includes("host!=='127.0.0.1'"),'OIDC HTTP contract must bind loopback');
assert.ok(bff.includes("process.env.USA_LAB_ENABLED!=='1'"),'OIDC HTTP contract must be disabled by default');
assert.ok(bff.includes("SameSite=Lax") && bff.includes("SameSite=Strict"),'OIDC cookie policies required');
assert.ok(bff.includes("HttpOnly"),'OIDC session and browser binding cookies must be HttpOnly');
assert.ok(bff.includes("bindingCookie('',0)"),'OIDC callback must clear temporary browser binding');
assert.ok(bff.includes("req.headers.origin!==origin"),'OIDC start/logout must check browser origin');
assert.ok(bff.includes("issueOIDCSession"),'OIDC callback can issue a session only after member validation');
assert.ok(!bff.includes('fetch('),'Mock OIDC BFF may not make outbound network requests');
assert.ok(!entry.includes('bff') && !entry.includes('oidc'),'Public USA static preview may not import the identity BFF');
console.log('PASS: US identity lab isolated, fail-closed, never included in production web');
