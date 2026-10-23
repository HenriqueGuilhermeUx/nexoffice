import assert from 'node:assert/strict';
import pg from 'pg';

const url='http://127.0.0.1:'+String(process.env.PORT||4000);
const email=process.env.NEX_PERSONAL_PREVIEW_ALLOWED_EMAILS?.split(',')[0];
const invite=process.env.NEX_PERSONAL_PREVIEW_TEST_INVITE;
if(!email||!invite||!process.env.DATABASE_URL)throw Error('Test preview credentials and disposable CI database required');

const db=new pg.Client({connectionString:process.env.DATABASE_URL});
await db.connect();
let createdId;
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
 assert.equal(snapshot.headers.get('cache-control'),'no-store');
 const ignored=await req('/v1/personal/privacy/export?ownerId=00000000-0000-4000-8000-000000000001',{headers});
 assert.equal(ignored.data.owner.id,createdId,'user cannot select an export owner');
 const text=JSON.stringify(snapshot.data);
 for(const excluded of ['password_hash','token_hash','secret_key','public.workspaces']){
  assert.ok(!text.includes(excluded),'private export must not contain '+excluded);
 }
 const logs=await db.query("select action from nex_personal.audit_events where owner_user_id=$1 and action='privacy.export_requested'",[createdId]);
 assert.ok(logs.rowCount>0,'export should be auditable');
 console.log('Nex Personal privacy: login, owner-bound export, defaults, audit, no secrets OK');
}finally{
 if(createdId)await db.query('delete from public.users where id=$1',[createdId]);
 await db.end();
}
