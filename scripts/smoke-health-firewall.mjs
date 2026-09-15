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
const workspaceRef='health-smoke-clinic';

const provision=await call('/v1/platform/provision',{method:'POST',body:{
  sourceProduct:'mydatamed',
  externalWorkspaceRef:workspaceRef,
  businessName:'Clínica Health Smoke',
  vertical:'health',
  ownerEmail:'health-smoke@nexoffice.test',
  ownerName:'Health Smoke Owner',
  memberRole:'owner',
  externalUserSubject:'health-smoke-owner',
  entitlements:['addon.mydatamed']
}});
assert(provision.workspace?.vertical==='health','health workspace must be provisioned');

const now=new Date();
const periodEnd=now.toISOString();
const periodStart=new Date(now.getTime()-24*60*60*1000).toISOString();
const correlationId='health-signal-smoke-001';

const accepted=await call('/v1/platform/health-signals',{method:'POST',body:{
  sourceProduct:'mydatamed',
  externalWorkspaceRef:workspaceRef,
  correlationId,
  signalType:'sla.summary',
  periodStart,
  periodEnd,
  dimensions:{window:'day',scope:'workspace'},
  metrics:{total:10,withinSla:8,breached:2,avgFirstResponseMinutes:12,complianceRatio:0.8}
}});
assert(accepted.ok===true,'valid aggregate signal accepted');
assert(accepted.privacy==='aggregate_only','aggregate privacy marker');
assert(accepted.signal?.signal_type==='sla.summary','signal type persisted');

const listed=await call(`/v1/platform/health-signals?sourceProduct=mydatamed&externalWorkspaceRef=${encodeURIComponent(workspaceRef)}&limit=10`);
assert(listed.privacy==='aggregate_only','list privacy marker');
assert(Array.isArray(listed.signals)&&listed.signals.some(x=>x.correlation_id===correlationId),'accepted signal listed');

// Schema is strict: patient-level identity or clinical content must be rejected even when
// all otherwise-required aggregate fields are valid.
const forbiddenPatient=await call('/v1/platform/health-signals',{method:'POST',expected:400,body:{
  sourceProduct:'mydatamed',externalWorkspaceRef:workspaceRef,correlationId:'health-signal-smoke-patient',
  signalType:'requests.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},
  metrics:{open:5,overdue:1,escalated:1,resolved:3},
  patientId:'patient-123',diagnosis:'hipertensão'
}});
assert(forbiddenPatient.error==='request_failed'||forbiddenPatient.issues,'patient fields rejected by strict schema');

const forbiddenClinicalMetric=await call('/v1/platform/health-signals',{method:'POST',expected:400,body:{
  sourceProduct:'mydatamed',externalWorkspaceRef:workspaceRef,correlationId:'health-signal-smoke-clinical',
  signalType:'appointments.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},
  metrics:{scheduled:10,completed:8,cancelled:1,noShow:1,pending:0,patientName:'Maria',examResult:'positivo'}
}});
assert(forbiddenClinicalMetric.error==='request_failed'||forbiddenClinicalMetric.issues,'clinical metric fields rejected');

await call('/v1/platform/provision',{method:'POST',body:{
  sourceProduct:'health-wallet',externalWorkspaceRef:'health-smoke-general',businessName:'General Smoke',vertical:'general',
  ownerEmail:'general-health-smoke@nexoffice.test',ownerName:'General Smoke Owner',memberRole:'owner',externalUserSubject:'general-health-smoke-owner'
}});
const wrongVertical=await call('/v1/platform/health-signals',{method:'POST',expected:409,body:{
  sourceProduct:'health-wallet',externalWorkspaceRef:'health-smoke-general',correlationId:'health-signal-smoke-general',
  signalType:'workload.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},
  metrics:{activeCases:3,waitingReview:1,waitingPatientReply:1,dueToday:1}
}});
assert(wrongVertical.error==='health_workspace_required','non-health workspace rejects health signals');

// Idempotency: same correlation ID updates the aggregate instead of duplicating it.
const updated=await call('/v1/platform/health-signals',{method:'POST',body:{
  sourceProduct:'mydatamed',externalWorkspaceRef:workspaceRef,correlationId,
  signalType:'sla.summary',periodStart,periodEnd,dimensions:{window:'day',scope:'workspace'},
  metrics:{total:12,withinSla:10,breached:2,avgFirstResponseMinutes:11,complianceRatio:0.833333}
}});
assert(Number(updated.signal?.metrics?.total)===12,'idempotent aggregate update applied');
const relisted=await call(`/v1/platform/health-signals?sourceProduct=mydatamed&externalWorkspaceRef=${encodeURIComponent(workspaceRef)}&limit=100`);
assert(relisted.signals.filter(x=>x.correlation_id===correlationId).length===1,'idempotency prevents duplicate health aggregate');

console.log(JSON.stringify({ok:true,privacy:'aggregate_only',accepted:1,rejectedSensitivePayloads:2,rejectedWrongVertical:1,idempotency:true},null,2));