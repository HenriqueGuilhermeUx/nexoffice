import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { USLabStore } from '../src/store.mjs';
import { startUSLab } from '../src/server.mjs';

const password='Fixtures-Only-Password-2026';
function setup(){const dir=mkdtempSync(join(tmpdir(),'nexoffices-us-lab-'));return {dbFile:join(dir,'us-lab.sqlite'),cleanup:()=>rmSync(dir,{recursive:true,force:true})};}
async function json(origin,path,method='GET',body,session,headers={}){
  const res=await fetch(origin+path,{method,headers:{...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{}),...(session?{Cookie:session}:{}),...headers},body:method==='GET'?undefined:JSON.stringify(body??{})});
  return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
test('US lab fails closed: opt-in, loopback, nonproduction and US-only region',async()=>{
  const tmp=setup(),prev=process.env.USA_LAB_ENABLED;
  try{
    delete process.env.USA_LAB_ENABLED;
    await assert.rejects(()=>startUSLab({enabled:true,dbFile:tmp.dbFile}),/disabled/);
    process.env.USA_LAB_ENABLED='1';
    await assert.rejects(()=>startUSLab({enabled:true,dbFile:tmp.dbFile,host:'0.0.0.0'}),/loopback/);
    await assert.rejects(()=>startUSLab({enabled:true,dbFile:tmp.dbFile,nodeEnv:'production'}),/production/);
    await assert.rejects(()=>startUSLab({enabled:true,dbFile:'/var/lib/nexoffice/live.sqlite'}),/temporary directory/);
    const store=new USLabStore(tmp.dbFile);
    assert.throws(()=>store.provisionOrganization('Brazil Fixture','BR'),/Only US/);
    const org=store.provisionOrganization('US Sandbox Corp');
    assert.throws(()=>store.provisionUser({orgId:org.id,email:'br@example.test',password,region:'BR'}),/Only US/);
    assert.throws(()=>store.db.prepare('INSERT INTO organizations(id,name,region_code,created_at) VALUES(?,?,?,?)').run('br-id','Reject', 'BR',new Date().toISOString()),/constraint/i);
    store.close();
  }finally{if(prev===undefined)delete process.env.USA_LAB_ENABLED;else process.env.USA_LAB_ENABLED=prev;tmp.cleanup();}
});
test('US auth + persistent tenant tasks remain isolated through restarts',async()=>{
  const tmp=setup(),prev=process.env.USA_LAB_ENABLED;process.env.USA_LAB_ENABLED='1';let lab;
  try{
    lab=await startUSLab({enabled:true,dbFile:tmp.dbFile});
    const acme=lab.store.provisionOrganization('US Acme Example'),beta=lab.store.provisionOrganization('US Beta Example');
    lab.store.provisionUser({orgId:acme.id,email:'alice@acme.example',password});
    lab.store.provisionUser({orgId:beta.id,email:'bob@beta.example',password});
    assert.equal((await json(lab.origin,'/healthz')).data.region,'US');
    assert.equal((await json(lab.origin,'/lab/me')).status,401);
    assert.equal((await json(lab.origin,'/lab/login','POST',{orgId:acme.id,email:'alice@acme.example',password,region:'BR'})).status,400);
    assert.equal((await json(lab.origin,'/lab/login','POST',{orgId:beta.id,email:'alice@acme.example',password})).status,401);
    assert.equal((await json(lab.origin,'/lab/login','POST',{orgId:acme.id,email:'alice@acme.example',password:'invalid'})).status,401);
    assert.equal((await json(lab.origin,'/lab/login','POST',{orgId:acme.id,email:'alice@acme.example',password},null,{Origin:'https://example.com'})).status,403);
    const a=await json(lab.origin,'/lab/login','POST',{orgId:acme.id,email:'alice@acme.example',password});
    assert.equal(a.status,200);assert.match(a.cookie,/^us_lab_session=/);
    const me=await json(lab.origin,'/lab/me','GET',undefined,a.cookie);assert.equal(me.data.orgId,acme.id);assert.equal(me.data.region,'US');
    assert.equal((await json(lab.origin,'/lab/tasks','POST',{title:'Forgery',orgId:beta.id},a.cookie)).status,400);
    assert.equal((await json(lab.origin,'/lab/tasks','POST',{title:'Forgery',region:'BR'},a.cookie)).status,400);
    const task=await json(lab.origin,'/lab/tasks','POST',{title:'Fictional US follow-up'},a.cookie);
    assert.equal(task.status,201);
    const taskId=task.data.task.id;
    const b=await json(lab.origin,'/lab/login','POST',{orgId:beta.id,email:'bob@beta.example',password});
    assert.equal(b.status,200);
    assert.equal((await json(lab.origin,'/lab/tasks','GET',undefined,b.cookie)).data.tasks.length,0);
    assert.equal((await json(lab.origin,'/lab/tasks/'+taskId+'/complete','POST',{},b.cookie)).status,404);
    assert.equal((await json(lab.origin,'/lab/tasks?org_id='+acme.id,'GET',undefined,b.cookie)).status,400);
    assert.equal((await json(lab.origin,'/lab/tasks/'+taskId+'/complete','POST',{},a.cookie)).status,200);
    await lab.close();lab=undefined;
    lab=await startUSLab({enabled:true,dbFile:tmp.dbFile});
    const persistent=await json(lab.origin,'/lab/tasks','GET',undefined,a.cookie);
    assert.equal(persistent.status,200);assert.equal(persistent.data.tasks.length,1);assert.equal(persistent.data.tasks[0].status,'completed');
    assert.equal((await json(lab.origin,'/lab/logout','POST',{},a.cookie)).status,200);
    assert.equal((await json(lab.origin,'/lab/me','GET',undefined,a.cookie)).status,401);
    assert.equal((await json(lab.origin,'/lab/tasks','GET',undefined,b.cookie)).data.tasks.length,0);
  }finally{if(lab)await lab.close();if(prev===undefined)delete process.env.USA_LAB_ENABLED;else process.env.USA_LAB_ENABLED=prev;tmp.cleanup();}
});
test('no public registration endpoint, forwarded proxy, CORS, or leaked responses',async()=>{
  const tmp=setup(),prev=process.env.USA_LAB_ENABLED;process.env.USA_LAB_ENABLED='1';let lab;
  try{
    lab=await startUSLab({enabled:true,dbFile:tmp.dbFile});
    assert.equal((await json(lab.origin,'/lab/register','POST',{email:'invalid@example.test'})).status,401);
    assert.equal((await json(lab.origin,'/healthz','GET',null,null,{'X-Forwarded-Host':'example.com'})).status,403);
    const response=await fetch(lab.origin+'/healthz',{headers:{Origin:'https://example.com'}});
    assert.equal(response.headers.get('access-control-allow-origin'),null);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }finally{if(lab)await lab.close();if(prev===undefined)delete process.env.USA_LAB_ENABLED;else process.env.USA_LAB_ENABLED=prev;tmp.cleanup();}
});
