import assert from 'node:assert/strict';
import {
 MAYA_LOCAL_PREVIEW_TTL_MS,
 MAYA_LOCAL_OBSERVATION_MAX_AGE_MS,
 createMayaLocalPreviewGrant,
 activeMayaLocalPreviewGrant
} from '../apps/web/src/nex-personal-us-maya-local-session.ts';

// This smoke covers a browser-memory preview contract, not a cryptographic
// Privy consent, server session, database write, or production agent grant.
const t=new Date('2026-10-28T13:00:00.000Z');
const wallet='0x8888888888888888888888888888888888888888';
const observation={address:wallet,chainId:137,rawBalance:'8500000',
 observedAt:new Date(t.getTime()-10_000).toISOString()};
const g=createMayaLocalPreviewGrant(observation,t);
assert.equal(g.scope,'browser_memory_read_only');
assert.equal(MAYA_LOCAL_PREVIEW_TTL_MS,600_000);
assert.equal(MAYA_LOCAL_OBSERVATION_MAX_AGE_MS,300_000);
assert.equal(g.expiresAt,'2026-10-28T13:10:00.000Z');
assert.deepEqual(activeMayaLocalPreviewGrant(g,t),g);
assert.deepEqual(activeMayaLocalPreviewGrant(g,new Date(t.getTime()+599_999)),g);
assert.equal(activeMayaLocalPreviewGrant(g,new Date(t.getTime()+600_000)),null);
assert.equal(activeMayaLocalPreviewGrant(null,t),null);
assert.equal(activeMayaLocalPreviewGrant({...g,scope:'not_server_trusted'},t),null);
assert.equal(activeMayaLocalPreviewGrant({...g,expiresAt:new Date(t.getTime()+604_000).toISOString()},t),null);
assert.equal(activeMayaLocalPreviewGrant({...g,chainId:1},t),null);
assert.equal(activeMayaLocalPreviewGrant({...g,address:'invalid'},t),null);
assert.equal(activeMayaLocalPreviewGrant({...g,rawBalance:'-1'},t),null);
assert.equal(activeMayaLocalPreviewGrant({...g,rawBalance:'1e7'},t),null);
assert.equal(activeMayaLocalPreviewGrant({...g,rawBalance:(2n**256n).toString()},t),null);
assert.equal(activeMayaLocalPreviewGrant({...g,observedAt:'bad'},t),null);
assert.equal(activeMayaLocalPreviewGrant({...g,sharedAt:'garbled'},t),null);
assert.equal(activeMayaLocalPreviewGrant(g,new Date(t.getTime()-1)),null);
assert.throws(()=>createMayaLocalPreviewGrant({...observation,chainId:1},t),/INVALID/);
assert.throws(()=>createMayaLocalPreviewGrant({...observation,address:'0x123'},t),/INVALID/);
assert.throws(()=>createMayaLocalPreviewGrant({...observation,rawBalance:'01'},t),/INVALID/);
assert.throws(()=>createMayaLocalPreviewGrant({...observation,rawBalance:(2n**256n).toString()},t),/INVALID/);
assert.throws(()=>createMayaLocalPreviewGrant({...observation,observedAt:new Date(t.getTime()+1000).toISOString()},t),/STALE/);
assert.throws(()=>createMayaLocalPreviewGrant({...observation,observedAt:new Date(t.getTime()-300_001).toISOString()},t),/STALE/);
assert.equal(createMayaLocalPreviewGrant({...observation,rawBalance:'0'},t).rawBalance,'0');
console.log('PASS: USA Maya local-only 10-minute snapshot, revocation/expiry boundaries, stale-data fail-closed contract');
