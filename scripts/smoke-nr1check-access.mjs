const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const password=process.env.SMOKE_USER_PASSWORD;if(!password)throw new Error('SMOKE_USER_PASSWORD required');
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};
async function api(path,{method='GET',body,token,workspace,expect}={}){const headers={'content-type':'application/json'};if(token)headers.authorization=`Bearer ${token}`;if(workspace)headers['x-workspace-id']=workspace;const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const payload=await r.json().catch(()=>({}));if(expect!==undefined){assert(r.status===expect,`${method} ${path} expected ${expect}, got ${r.status}: ${JSON.stringify(payload)}`);return payload}if(!r.ok)throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(payload)}`);return payload}
async function register(label){const result=await api('/v1/auth/register',{method:'POST',body:{name:`Owner ${label}`,email:`nr1-access-${label}-${Date.now()}@nexoffice.test`,password,businessName:`Empresa ${label}`,vertical:'general'}});return{token:result.token,workspace:result.workspace.id}}
const a=await register('A'),b=await register('B');
const info=await api('/v1/ecosystem/nr1check',{...a});
assert(info.product==='NR1Check'&&info.suite==='MindCompliance','product identity');
assert(info.access?.sso===false&&info.access?.cnpjRequiredForCompanyOnboarding===true,'separate auth and real CNPJ required');
assert(Array.isArray(info.privacy?.sharedWithNr1Check)&&info.privacy.sharedWithNr1Check.join(',')==='workspaceRef,businessName,sector','allow-list is exact');
const launch=await api('/v1/ecosystem/nr1check/launch',{method:'POST',...a,body:{}});const u=new URL(launch.url);const keys=[...u.searchParams.keys()].sort();
assert(u.pathname==='/nexoffice','launch enters dedicated NR1 route');
assert(JSON.stringify(keys)===JSON.stringify(['businessName','sector','source','workspaceRef'].sort()),`only allow-listed query params: ${keys.join(',')}`);
const forbidden=['email','token','authorization','cnpj','cpf','employee','health','psychosocial','complaint','document'];for(const key of forbidden)assert(!u.search.toLowerCase().includes(key),`launch URL does not expose ${key}`);
assert(u.searchParams.get('workspaceRef')===a.workspace,'workspace ref matches authenticated tenant');
await api('/v1/ecosystem/nr1check',{token:a.token,workspace:b.workspace,expect:403});
await api('/v1/ecosystem/nr1check/launch',{method:'POST',token:a.token,workspace:b.workspace,body:{},expect:403});
console.log(JSON.stringify({ok:true,product:info.product,sharedFields:info.privacy.sharedWithNr1Check,crossTenantDenied:true,sso:false},null,2));
