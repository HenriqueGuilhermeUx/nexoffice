import {execFileSync} from 'node:child_process';

const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const internalKey=process.env.NEXOFFICE_INTERNAL_KEY||'platform-smoke-key';
let token='';let workspace='';

const request=async(path,{method='GET',body,auth=false,internal=false,expectStatus}={})=>{
  const headers={'content-type':'application/json'};
  if(auth&&token)headers.authorization=`Bearer ${token}`;
  if(auth&&workspace)headers['x-workspace-id']=workspace;
  if(internal)headers['x-nexoffice-key']=internalKey;
  const r=await fetch(base+path,{method,headers,body:body!==undefined?JSON.stringify(body):undefined});
  const payload=await r.json().catch(()=>({}));
  if(expectStatus!==undefined){if(r.status!==expectStatus)throw new Error(`${method} ${path} -> expected ${expectStatus}, got ${r.status} ${JSON.stringify(payload)}`);return payload}
  if(!r.ok)throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(payload)}`);
  return payload;
};
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};
const dbScalar=sql=>execFileSync('psql',[process.env.DATABASE_URL,'-At','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8'}).trim();

const health=await request('/v1/platform/health',{internal:true});
assert(health.status==='ok'&&health.capabilities.includes('provision'),'platform bridge health');
assert(health.capabilities.includes('federated-user'),'federated user capability');
assert(health.capabilities.includes('browser-handoff'),'browser handoff capability');
assert(health.capabilities.includes('federated-rbac'),'federated RBAC capability');

const provisionInput={
  sourceProduct:'nexjud',
  externalWorkspaceRef:'nexjud-office-smoke-001',
  businessName:'Escritório Jurídico Smoke',
  vertical:'legal',
  ownerEmail:'platform-owner@nexoffice.test',
  ownerName:'Platform Owner',
  externalUserSubject:'nexjud-user-smoke-001',
  entitlements:['addon.nexjud']
};

const first=await request('/v1/platform/provision',{method:'POST',internal:true,body:provisionInput});
assert(first.created===true,'first provision creates workspace');
assert(first.workspace?.id,'provision returns workspace');
assert(first.workspace.vertical==='legal','provision applies legal vertical');
assert(first.workspace.modules.includes('legal-pack'),'provision applies legal pack');
assert(first.memberRole==='owner','default platform role remains owner');
assert(first.federatedUserCreated===true,'trusted source creates federated NexOffice user');
assert(!first.inviteToken,'federated user does not need second onboarding');
const provisionedWorkspace=first.workspace.id;
assert(/^[0-9a-f-]{36}$/i.test(provisionedWorkspace),'provision returns UUID workspace');

const originCount=Number(dbScalar(`select count(*) from workspace_origins where workspace_id='${provisionedWorkspace}'::uuid and source_product='nexjud' and external_workspace_ref='${provisionInput.externalWorkspaceRef}'`));
assert(originCount===1,'source product origin persisted exactly once');
const entitlementCount=Number(dbScalar(`select count(*) from entitlements where workspace_id='${provisionedWorkspace}'::uuid and source='nexjud' and status='active' and capability in ('core.crm','core.command-center','pack.legal','addon.nexjud')`));
assert(entitlementCount===4,'core, vertical and addon entitlements persisted for source');

const exchange=await request('/v1/platform/session-exchange',{method:'POST',internal:true,body:{sourceProduct:'nexjud',externalWorkspaceRef:provisionInput.externalWorkspaceRef,externalUserSubject:provisionInput.externalUserSubject,email:provisionInput.ownerEmail}});
assert(exchange.token,'session exchange returns NexOffice session');
assert(exchange.workspace.id===provisionedWorkspace,'session exchange resolves correct workspace');
assert(exchange.workspace.role==='owner','session exchange preserves owner role');
token=exchange.token;workspace=exchange.workspace.id;
const me=await request('/v1/auth/me',{auth:true});
const membership=me.workspaces.find(x=>x.id===workspace);
assert(me.user.email===provisionInput.ownerEmail,'federated session resolves correct user');
assert(membership?.role==='owner','federated owner has workspace access');

const localLogin=await request('/v1/auth/login',{method:'POST',body:{email:provisionInput.ownerEmail,password:'AnyPassword123!'},expectStatus:401});
assert(localLogin.error==='invalid_credentials','federated user cannot use local password login');

const second=await request('/v1/platform/provision',{method:'POST',internal:true,body:provisionInput});
assert(second.created===false,'repeat provision is idempotent');
assert(second.workspace.id===provisionedWorkspace,'repeat provision returns same workspace');
assert(second.userExists===true&&second.userExisted===true,'repeat provision recognizes existing federated owner');
assert(second.federatedUserCreated===false,'repeat provision does not duplicate user');
assert(Number(dbScalar(`select count(*) from workspace_origins where source_product='nexjud' and external_workspace_ref='${provisionInput.externalWorkspaceRef}'`))===1,'idempotent provision does not duplicate origin');

const handoff=await request('/v1/platform/handoff',{method:'POST',internal:true,body:{sourceProduct:'nexjud',externalWorkspaceRef:provisionInput.externalWorkspaceRef,externalUserSubject:provisionInput.externalUserSubject,email:provisionInput.ownerEmail}});
assert(handoff.handoffCode&&handoff.expiresAt,'handoff returns short-lived code');
assert(String(handoff.url||'').includes('#handoff='),'handoff URL uses fragment, not bearer token query');

const consumed=await request('/v1/platform/handoff/consume',{method:'POST',body:{code:handoff.handoffCode}});
assert(consumed.token,'handoff consumption creates NexOffice session');
assert(consumed.workspace.id===provisionedWorkspace,'handoff opens correct workspace');
assert(consumed.user.email===provisionInput.ownerEmail,'handoff opens correct user');
const consumedAgain=await request('/v1/platform/handoff/consume',{method:'POST',body:{code:handoff.handoffCode},expectStatus:401});
assert(consumedAgain.error==='invalid_handoff','handoff is strictly single-use');

const exchangeAgain=await request('/v1/platform/session-exchange',{method:'POST',internal:true,body:{sourceProduct:'nexjud',externalWorkspaceRef:provisionInput.externalWorkspaceRef,externalUserSubject:provisionInput.externalUserSubject,email:provisionInput.ownerEmail}});
assert(exchangeAgain.token&&exchangeAgain.workspace.id===provisionedWorkspace,'repeat exchange reuses bound external identity');

const otherLegalInput={
  sourceProduct:'nexjud',
  externalWorkspaceRef:'nexjud-office-smoke-002',
  businessName:'Escritório Jurídico Isolado Smoke',
  vertical:'legal',
  ownerEmail:'platform-other@nexoffice.test',
  ownerName:'Platform Other',
  externalUserSubject:'nexjud-user-smoke-002',
  entitlements:['addon.nexjud']
};
const otherLegal=await request('/v1/platform/provision',{method:'POST',internal:true,body:otherLegalInput});
assert(otherLegal.created===true&&otherLegal.workspace.id!==provisionedWorkspace,'second external tenant gets distinct NexOffice workspace');
const crossTenant=await request('/v1/platform/session-exchange',{method:'POST',internal:true,expectStatus:409,body:{sourceProduct:'nexjud',externalWorkspaceRef:otherLegalInput.externalWorkspaceRef,externalUserSubject:provisionInput.externalUserSubject,email:provisionInput.ownerEmail}});
assert(crossTenant.error==='onboarding_required','external identity cannot cross tenant boundary');
const wrongSource=await request('/v1/platform/session-exchange',{method:'POST',internal:true,expectStatus:404,body:{sourceProduct:'sindcopilot',externalWorkspaceRef:provisionInput.externalWorkspaceRef,externalUserSubject:provisionInput.externalUserSubject,email:provisionInput.ownerEmail}});
assert(wrongSource.error==='workspace_not_provisioned','workspace origin is isolated by source product');

// Multi-user embedded product: one SindCopilot manager account maps to one NexOffice workspace.
const condoTenant='sind-owner-smoke-001';
const condoOwner=await request('/v1/platform/provision',{method:'POST',internal:true,body:{
  sourceProduct:'sindcopilot',externalWorkspaceRef:condoTenant,businessName:'Gestora Condominial Smoke',vertical:'condo',
  ownerEmail:'sind-owner@nexoffice.test',ownerName:'Síndico Owner',memberRole:'owner',externalUserSubject:'sind-owner-user-001',entitlements:['addon.sindcopilot']
}});
assert(condoOwner.created===true&&condoOwner.workspace.vertical==='condo','SindCopilot owner creates condo workspace');
assert(condoOwner.memberRole==='owner','SindCopilot owner keeps owner role');

const condoMember=await request('/v1/platform/provision',{method:'POST',internal:true,body:{
  sourceProduct:'sindcopilot',externalWorkspaceRef:condoTenant,businessName:'Gestora Condominial Smoke',vertical:'condo',
  ownerEmail:'sind-assistant@nexoffice.test',ownerName:'Assistente Smoke',memberRole:'member',externalUserSubject:'sind-assistant-user-001',entitlements:['addon.sindcopilot']
}});
assert(condoMember.created===false,'assistant joins existing manager workspace');
assert(condoMember.workspace.id===condoOwner.workspace.id,'assistant shares manager NexOffice workspace');
assert(condoMember.memberRole==='member','assistant is not escalated to owner');

const memberExchange=await request('/v1/platform/session-exchange',{method:'POST',internal:true,body:{sourceProduct:'sindcopilot',externalWorkspaceRef:condoTenant,externalUserSubject:'sind-assistant-user-001',email:'sind-assistant@nexoffice.test'}});
assert(memberExchange.workspace.id===condoOwner.workspace.id,'assistant exchange resolves manager workspace');
assert(memberExchange.workspace.role==='member','assistant exchange preserves reduced role');
token=memberExchange.token;workspace=memberExchange.workspace.id;
const memberMe=await request('/v1/auth/me',{auth:true});
assert(memberMe.workspaces.find(x=>x.id===workspace)?.role==='member','assistant membership is reduced in NexOffice');

console.log(JSON.stringify({ok:true,workspace:provisionedWorkspace,source:'nexjud',vertical:'legal',idempotent:true,sourceOrigin:true,entitlements:true,tenantIsolation:true,sourceIsolation:true,federatedUser:true,sessionExchange:true,browserHandoff:true,singleUse:true,federatedRbac:true,condoWorkspace:condoOwner.workspace.id},null,2));
