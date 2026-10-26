import assert from 'node:assert/strict';
import test from 'node:test';
import {lifeosProductionPgConnection} from '../apps/api/src/nexa-lifeos-prod-db.ts';

const database='postgresql://lifeos_admin:ci-only@ep-dedicated.us-east-2.aws.neon.tech/nexa_lifeos_prod?sslmode=verify-full&channel_binding=require';
const env={NEXA_LIFEOS_ENV:'production',NEXA_LIFEOS_DB_TLS_STRICT:'true',
 NEXA_LIFEOS_DB_HOST:'ep-dedicated.us-east-2.aws.neon.tech'};

test('PF production database constructor requires strict verified hostname TLS',()=>{
 const obj=lifeosProductionPgConnection(database,env);
 const url=new URL(obj.connectionString);
 assert.equal(url.searchParams.get('sslmode'),'verify-full');
 assert.equal(url.searchParams.get('channel_binding'),'require');
 assert.equal(obj.connectionTimeoutMillis,15000);
 assert.equal(Object.prototype.hasOwnProperty.call(obj,'ssl'),false);
});
for(const [label,url,override] of [
 ['preview flag',database,{NEXA_LIFEOS_ENV:'preview'}],
 ['no strict flag',database,{NEXA_LIFEOS_DB_TLS_STRICT:'false'}],
 ['Wallet database',database.replace('/nexa_lifeos_prod','/wallet'),{}],
 ['wrong DB host',database.replace('ep-dedicated','ep-preview'),{}],
 ['TLS downgrade',database.replace('verify-full','require'),{}],
 ['host override',database+'&host=localhost',{}],
 ['no hostname validation',database.replace('ep-dedicated.us-east-2.aws.neon.tech','localhost'),{}]
])test('reject '+label,()=>{
 assert.throws(()=>lifeosProductionPgConnection(url,{...env,...override}));
});
