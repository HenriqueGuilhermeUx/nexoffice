import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateLifeosSchema} from './audit-nexa-lifeos-prod-schema.mjs';
const pfNames=['profiles','accounts','transactions','consents','life_preferences'];
const mk=(name,schema='nex_personal',extras={})=>({
 name,schema,rls:true,forceRls:true,owner:'schema_owner',...extras
});
const good={
 role:{rolname:'nexa_lifeos_app',rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false},
 tables:[mk('users','public'),mk('auth_sessions','public'),...pfNames.map(n=>mk(n))],
 policies:pfNames.map(n=>({schema:'nex_personal',name:n,roles:['nexa_lifeos_app'],qual:"owner_user_id::text = current_setting('app.user_id', true)"}))
};
test('accepts only catalog evidence; explicitly not a production approval',()=>{
 const d=evaluateLifeosSchema(good);
 assert.equal(d.productionReady,false);
 assert.equal(d.pfTableCount,pfNames.length);
});
test('blocks missing catalog evidence',()=>{
 assert.throws(()=>evaluateLifeosSchema({tables:null,policies:[],role:null}));
});
for(const [description,value] of [
 ['no enforced RLS',{tables:good.tables.map(t=>t.name==='accounts'?{...t,forceRls:false}:t)}],
 ['no row security enabled',{tables:good.tables.map(t=>t.name==='transactions'?{...t,rls:false}:t)}],
 ['identity session unprotected',{tables:good.tables.map(t=>t.name==='auth_sessions'?{...t,forceRls:false}:t)}],
 ['missing policy',{policies:good.policies.filter(p=>p.name!=='accounts')}],
 ['unsafe allow-all policy',{policies:[...good.policies,{schema:'nex_personal',name:'accounts',roles:['public'],qual:'true'}]}],
 ['missing PF table',{tables:good.tables.filter(t=>t.name!=='transactions')}],
 ['unexpected PJ table',{tables:[...good.tables,mk('workspaces','public')]}],
 ['role owns table',{tables:good.tables.map(t=>t.name==='accounts'?{...t,owner:'nexa_lifeos_app'}:t)}],
 ['superuser',{role:{...good.role,rolsuper:true}}],
 ['bypass RLS',{role:{...good.role,rolbypassrls:true}}],
 ['role create privilege',{role:{...good.role,rolcreaterole:true}}],
])test('fail closed: '+description,()=>{
 assert.throws(()=>evaluateLifeosSchema({...good,...value}),Error);
});
