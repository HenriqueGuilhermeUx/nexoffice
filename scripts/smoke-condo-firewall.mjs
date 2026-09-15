const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
const internalKey=process.env.NEXOFFICE_INTERNAL_KEY||'platform-smoke-key';

async function call(path,{method='GET',body,expected=200}={}){
  const headers={accept:'application/json','x-nexoffice-key':internalKey};
  if(body!==undefined)headers['content-type']='application/json';
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(response.status!==expected)throw new Error(`${method} ${path} -> ${response.status}, expected ${expected}: ${JSON.stringify(payload)}`);
  return payload;
}
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};
const workspaceRef='condo-smoke-account';

const provision=await call('/v1/platform/provision',{method:'POST',body:{sourceProduct:'sindcopilot',externalWorkspaceRef:workspaceRef,businessName:'Síndico Smoke',vertical:'condo',ownerEmail:'condo-smoke@nexoffice.test',ownerName:'Condo Smoke Owner',memberRole:'owner',externalUserSubject:'condo-smoke-owner',entitlements:['addon.sindcopilot']}});
assert(provision.workspace?.vertical==='condo','condo workspace provisioned');

const now=new Date(),periodEnd=now.toISOString(),periodStart=new Date(now.getTime()-24*60*60*1000).toISOString();
const accepted=await call('/v1/platform/condo-signals',{method:'POST',body:{sourceProduct:'sindcopilot',externalWorkspaceRef:workspaceRef,correlationId:'condo-smoke-compliance',signalType:'compliance.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},metrics:{pending:6,upcoming:3,overdue:2,completed:9,alertsFailed:1}}});
assert(accepted.ok===true&&accepted.privacy==='aggregate_only','valid condo aggregate accepted');

const docs=await call('/v1/platform/condo-signals',{method:'POST',body:{sourceProduct:'sindcopilot',externalWorkspaceRef:workspaceRef,correlationId:'condo-smoke-documents',signalType:'documents.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},metrics:{pendingReview:4,ocrPending:2,ocrFailed:1,indexingPending:3,indexingFailed:1}}});
assert(docs.signal?.signal_type==='documents.summary','document aggregate accepted');

const forbidden=await call('/v1/platform/condo-signals',{method:'POST',expected:400,body:{sourceProduct:'sindcopilot',externalWorkspaceRef:workspaceRef,correlationId:'condo-smoke-sensitive',signalType:'portfolio.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},metrics:{totalCondominiums:4,activeCondominiums:4,activeAssistants:2},residentName:'Morador Sigiloso',unit:'101',cpf:'00000000000',noticeText:'texto de advertência'}});
assert(forbidden.error==='request_failed'||forbidden.issues,'resident/unit/content fields rejected');

const forbiddenMetrics=await call('/v1/platform/condo-signals',{method:'POST',expected:400,body:{sourceProduct:'sindcopilot',externalWorkspaceRef:workspaceRef,correlationId:'condo-smoke-sensitive-metrics',signalType:'notices.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},metrics:{drafts:2,sent:5,cancelled:1,ownerPhone:'5513999999999',generatedContent:'minuta privada'}}});
assert(forbiddenMetrics.error==='request_failed'||forbiddenMetrics.issues,'private fields inside metrics rejected');

await call('/v1/platform/provision',{method:'POST',body:{sourceProduct:'sindcopilot',externalWorkspaceRef:'condo-smoke-general',businessName:'General Condo Smoke',vertical:'general',ownerEmail:'general-condo@nexoffice.test',ownerName:'General Condo',memberRole:'owner',externalUserSubject:'general-condo-owner'}});
const wrongVertical=await call('/v1/platform/condo-signals',{method:'POST',expected:409,body:{sourceProduct:'sindcopilot',externalWorkspaceRef:'condo-smoke-general',correlationId:'condo-smoke-wrong',signalType:'suppliers.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},metrics:{total:3,rated:2}}});
assert(wrongVertical.error==='condo_workspace_required','non-condo workspace rejects condo signals');

const listed=await call(`/v1/platform/condo-signals?sourceProduct=sindcopilot&externalWorkspaceRef=${encodeURIComponent(workspaceRef)}&limit=20`);
assert(listed.signals.length===2&&listed.allowedSignalTypes.includes('compliance.summary'),'only accepted condo aggregates listed');

console.log(JSON.stringify({ok:true,privacy:'aggregate_only',accepted:2,rejectedSensitivePayloads:2,rejectedWrongVertical:1},null,2));
