import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {agenticsBridgeConfigured,getNexaAgenticsPreview,signNexofficeAgenticsPreview} from './nexa-agentics-bridge.js';

const tenant=randomUUID(),principal=randomUUID();
const ctx={workspaceId:tenant,user:{id:principal}} as any;
const key=randomBytes(48),encoded=key.toString('base64url');
const env={NODE_ENV:'test',NEXOFFICE_AGENTICS_BRIDGE_ENABLED:'true',
 NEXOFFICE_AGENTICS_PRODUCT_KEY_B64:encoded,
 NEXOFFICE_AGENTICS_BASE_URL:'http://127.0.0.1:48619/'} as NodeJS.ProcessEnv;
const fields=['version','product','tenantId','principalId','operation','eventId','issuedAt','expiresAt'];
function response(r:any,overrides:Record<string,unknown>={}){
 return {contract:'nexa.agentics.product.preview.v1',status:'review_only',
  product:'nexoffice',tenantId:r.tenantId,eventId:r.eventId,agent:'operations',
  title:'Pulso operacional',summary:'Indicadores agregados, conteúdo sintético',
  synthetic:true,readOnly:true,customerDataAccess:false,
  financialExecutionAllowed:false,externalToolsAllowed:false,
  medicalDataAccess:false,legalCaseDataAccess:false,productionReady:false,...overrides};
}
test('workspace/principal taken from authenticated server context and signed',()=>{
 const {request,signature}=signNexofficeAgenticsPreview(ctx,'business.pulse.preview',env,Date.parse('2026-10-23T12:00:00Z'));
 assert.equal(request.product,'nexoffice');
 assert.equal(request.tenantId,tenant);
 assert.equal(request.principalId,principal);
 assert.equal(request.expiresAt-request.issuedAt,20);
 const expected=createHmac('sha256',key)
  .update(JSON.stringify(fields.map(field=>(request as any)[field])),'utf8').digest('base64url');
 assert.equal(signature,expected);
});
test('review-only bridge disabled by default and in production',()=>{
 assert.equal(agenticsBridgeConfigured({}),false);
 assert.equal(agenticsBridgeConfigured({...env,NODE_ENV:'production'}),false);
 assert.equal(agenticsBridgeConfigured({...env,RENDER:'true'}),false);
});
test('no product-side override of workspace/principal or unsupported actions',()=>{
 assert.throws(()=>signNexofficeAgenticsPreview(
  {...ctx,workspaceId:'tenant-from-browser'},'business.pulse.preview',env),
  /verified_workspace_required/);
 assert.throws(()=>signNexofficeAgenticsPreview(ctx,'finance.transfer' as any,env),
  /unapproved_operation/);
});
test('only loopback fixture accepted, never arbitrary network targets',async()=>{
 for(const address of ['https://attacker.invalid/','http://127.0.0.1:8000/',
  'http://127.0.0.1:48619@attacker.invalid/',
  'http://127.0.0.1:48619/redirect','file:///etc/passwd']){
  await assert.rejects(getNexaAgenticsPreview(ctx,'business.pulse.preview',
   {...env,NEXOFFICE_AGENTICS_BASE_URL:address}),
   /untrusted_gateway_endpoint/);
 }
});
test('preview sends only signed identity metadata; response strips extra sensitive fields',async()=>{
 let calls=0;
 const mock:typeof fetch=async(url,init)=>{
  calls++;
  assert.equal(String(url),'http://127.0.0.1:48619/v1/agentics/preview');
  assert.equal(init?.method,'POST');
  const body=JSON.parse(String(init?.body));
  assert.deepEqual(Object.keys(body).sort(),['request','signature']);
  assert.deepEqual(Object.keys(body.request).sort(),fields.slice().sort());
  assert.equal(body.request.tenantId,tenant);
  assert.equal(body.request.principalId,principal);
  assert.equal(body.request.operation,'business.pulse.preview');
  assert.equal('message' in body.request,false);
  assert.equal('customerData' in body.request,false);
  return Response.json(response(body.request,{secretFromProvider:'hidden'}));
 };
 const result=await getNexaAgenticsPreview(ctx,'business.pulse.preview',env,mock);
 assert.equal(calls,1);
 assert.equal(result.synthetic,true);
 assert.equal(result.financialExecutionAllowed,false);
 assert.equal((result as any).secretFromProvider,undefined);
});
test('fail-closed on cross-tenant answer, financial flag, privacy violations or network outage',async()=>{
 for(const props of [
  {tenantId:randomUUID()},{financialExecutionAllowed:true},{customerDataAccess:true},
  {medicalDataAccess:true},{legalCaseDataAccess:true},{productionReady:true},
  {synthetic:false},{externalToolsAllowed:true}
 ]){
  const mock:typeof fetch=async(_url,init)=>{
   const body=JSON.parse(String(init?.body));
   return Response.json(response(body.request,props));
  };
  await assert.rejects(getNexaAgenticsPreview(ctx,'business.pulse.preview',env,mock),
   /untrusted_gateway_response/);
 }
 const down:typeof fetch=async()=>{throw Error('no connection')};
 await assert.rejects(getNexaAgenticsPreview(ctx,'business.pulse.preview',env,down),
  /gateway_unavailable/);
});
test('weak/missing product signing keys never produce requests',()=>{
 assert.throws(()=>signNexofficeAgenticsPreview(ctx,'task.plan.preview',
  {...env,NEXOFFICE_AGENTICS_PRODUCT_KEY_B64:randomBytes(12).toString('base64url')}),
  /private_product_key_required|invalid_product_key/);
});
