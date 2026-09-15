const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='';let workspace='';
const call=async(path,{method='GET',body,auth=true}={})=>{const headers={'content-type':'application/json'};if(auth&&token)headers.authorization=`Bearer ${token}`;if(auth&&workspace)headers['x-workspace-id']=workspace;const r=await fetch(base+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});const payload=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(payload)}`);return payload};
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};

const register=await call('/v1/auth/register',{method:'POST',auth:false,body:{name:'Vertical Smoke Owner',email:'vertical-smoke@nexoffice.test',password:'SmokePass123!',businessName:'Legal Smoke',vertical:'legal'}});
token=register.token;workspace=register.workspace.id;
const initial=await call('/v1/workspace/vertical-pack');
assert(initial.pack.id==='legal','legal vertical resolved');
assert(initial.workspace.modules.includes('legal-pack'),'legal workspace born with legal pack marker');
assert(initial.pack.domainOwner==='nexjud','legal domain stays owned by NexJud');

const applied=await call('/v1/workspace/vertical-pack',{method:'PUT',body:{packId:'health'}});
assert(applied.pack.id==='health','health pack applied');
assert(applied.workspace.vertical==='health','workspace vertical updated');
assert(applied.workspace.modules.includes('health-pack'),'health marker applied');
assert(!applied.workspace.modules.includes('legal-pack'),'old vertical marker removed by pack application');
assert(applied.pack.privacy.forbidRawHealthData===true,'health pack blocks raw health data');
assert(applied.pack.domainOwner==='mydatamed','clinical domain remains in MyDataMed');

const packs=await call('/v1/vertical-packs');
assert(packs.length===5,'five vertical packs available');
assert(packs.some(x=>x.id==='commerce'&&x.plannedCapabilities.includes('orders')),'commerce roadmap exposed');

console.log(JSON.stringify({ok:true,workspace,initial:'legal',applied:'health',packs:packs.map(x=>x.id)},null,2));
