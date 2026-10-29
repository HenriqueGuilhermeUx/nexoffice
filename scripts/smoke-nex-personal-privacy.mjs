import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

const url='http://127.0.0.1:'+String(process.env.PORT||4000);
const email=process.env.NEX_PERSONAL_PREVIEW_ALLOWED_EMAILS?.split(',')[0];
const invite=process.env.NEX_PERSONAL_PREVIEW_TEST_INVITE;
if(!email||!invite||!process.env.DATABASE_URL)throw Error('Test preview credentials and disposable CI database required');

const db=new pg.Client({connectionString:process.env.DATABASE_URL});
await db.connect();
let createdId,otherId;
let probeColumnCreated=false;
async function req(path,options={}){
 const r=await fetch(url+path,options);
 const json=await r.json().catch(()=>({}));
 return {status:r.status,data:json,headers:r.headers};
}
try{
 const first=await req('/v1/personal/privacy/export');
 assert.equal(first.status,401,'anonymous data export must fail');
 const registration=await req('/v1/personal/auth/register',{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({email,password:'PrivateSmoke-123!',name:'Privacy CI',previewInviteCode:invite})
 });
 assert.equal(registration.status,200,JSON.stringify(registration.data));
 const token=registration.data.token;
 createdId=registration.data.user.id;
 // Disposable CI database only: add a simulated future connection-secret
 // column to prove that export projections remain fail-closed under schema
 // expansion. Never create this field in the live Neon database.
 await db.query('alter table nex_personal.connections add column token_for_privacy_probe text');
 probeColumnCreated=true;
 await db.query(
  "insert into nex_personal.connections(owner_user_id,provider,external_connection_ref,institution_name,token_for_privacy_probe) values($1,'stub','PROVIDER_CONNECTION_PRIVATE','Banco Homologação','DO_NOT_EXPORT_PROVIDER_SECRET')",
  [createdId]
 );
 // Second owner with unrelated personal data must be excluded entirely.
 otherId=randomUUID();
 await db.query("insert into public.users(id,name,email,password_hash) values($1,$2,$3,$4)",
  [otherId,'Outro Titular','isolated-owner-'+otherId+'@example.invalid','unusable-in-test']);
 await db.query('insert into nex_personal.profiles(user_id) values($1)',[otherId]);
 await db.query("insert into nex_personal.connections(owner_user_id,provider,external_connection_ref,institution_name,token_for_privacy_probe) values($1,'stub','OTHER_ACCOUNT_HIDDEN','Outro Banco','OTHER_OWNER_SECRET')",[otherId]);

 const headers={authorization:'Bearer '+token};
 const status=await req('/v1/personal/privacy/status',{headers});
 assert.equal(status.status,200,JSON.stringify(status.data));
 assert.equal(status.data.marketingPersonalization,false);
 assert.equal(status.data.externalDataSharing,false);
 assert.equal(status.data.backgroundAgentActions,false);
 assert.equal(status.data.serasaConnected,false);
 assert.ok(status.data.browserOnlyTools.includes('legal_support'));
 const snapshot=await req('/v1/personal/privacy/export',{headers});
 assert.equal(snapshot.status,200,JSON.stringify(snapshot.data));
 assert.equal(snapshot.data.owner.id,createdId);
 assert.equal(snapshot.data.complete,true);
 assert.equal(snapshot.data.format,'nex_personal_owner_snapshot_v1');
 assert.ok(Array.isArray(snapshot.data.data.audit_events),'Audit metadata must be included in owner export');
 assert.ok(snapshot.data.data.audit_events.some(x=>x.action==='profile.created'),
  'User can receive metadata about their own profile creation');
 assert.equal(snapshot.data.data.connections.length,1);
 assert.equal(snapshot.data.data.connections[0].institution_name,'Banco Homologação');
 assert.equal(snapshot.data.data.connections[0].external_connection_ref,undefined,
  'Do not expose opaque provider reference');
 assert.equal(snapshot.data.data.connections[0].token_for_privacy_probe,undefined,
  'Schema additions are not implicitly included in the export');

 assert.equal(snapshot.headers.get('cache-control'),'no-store');
 const ignored=await req('/v1/personal/privacy/export?ownerId=00000000-0000-4000-8000-000000000001',{headers});
 assert.equal(ignored.data.owner.id,createdId,'user cannot select an export owner');
 const text=JSON.stringify(snapshot.data);
 for(const excluded of ['password_hash','token_hash','secret_key','public.workspaces','DO_NOT_EXPORT_PROVIDER_SECRET','PROVIDER_CONNECTION_PRIVATE','OTHER_OWNER_SECRET','OTHER_ACCOUNT_HIDDEN',otherId]){
  assert.ok(!text.includes(excluded),'private export must not contain '+excluded);
 }
 const source=readFileSync('apps/api/src/routes-nex-personal-privacy.ts','utf8');
 assert.doesNotMatch(source,/select\s+\*\s+from\s+nex_personal\./i,
  'Owner export must never select wildcard tables that may later contain secrets');
 assert.match(source,/const EXPORT_FIELDS=\{/);
 assert.match(source,/audit_events:'id,action,subject_type,subject_id,created_at'/);
 const logs=await db.query("select action from nex_personal.audit_events where owner_user_id=$1 and action='privacy.export_requested'",[createdId]);
 assert.ok(logs.rowCount>0,'export should be auditable');
 console.log('Nex Personal privacy: login, owner-bound export, defaults, audit, no secrets OK');
}finally{
 if(otherId)await db.query('delete from public.users where id=$1',[otherId]);
 if(createdId)await db.query('delete from public.users where id=$1',[createdId]);
 if(probeColumnCreated)await db.query('alter table nex_personal.connections drop column if exists token_for_privacy_probe');
 await db.end();
}
