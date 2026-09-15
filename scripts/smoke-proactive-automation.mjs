import {execFileSync} from 'node:child_process';

const base=process.env.SMOKE_API_URL||'http://127.0.0.1:4000';
let token='',workspace='';
async function call(path,{method='GET',body,expected=200}={}){
  const headers={accept:'application/json','content-type':'application/json'};
  if(token)headers.authorization=`Bearer ${token}`;
  if(workspace)headers['x-workspace-id']=workspace;
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(response.status!==expected)throw new Error(`${method} ${path} -> ${response.status}, expected ${expected}: ${JSON.stringify(payload)}`);
  return payload;
}
const assert=(value,message)=>{if(!value)throw new Error(`ASSERT: ${message}`)};

const register=await call('/v1/auth/register',{method:'POST',body:{name:'Automation Smoke',email:'automation-smoke@nexoffice.test',password:'SmokePass123!',businessName:'Automation Company',vertical:'general'}});
token=register.token;workspace=register.workspace.id;

const contact=await call('/v1/crm/contacts',{method:'POST',body:{kind:'person',name:'Maria Cliente',email:'maria@example.test',phone:'5513999990001',source:'smoke'}});
const appointment=await call('/v1/appointments',{method:'POST',body:{contactId:contact.id,title:'Reunião de diagnóstico',startsAt:new Date(Date.now()+4*3600000).toISOString(),endsAt:new Date(Date.now()+5*3600000).toISOString(),status:'scheduled'}});
const deal=await call('/v1/crm/deals',{method:'POST',body:{contactId:contact.id,title:'Projeto Automação',stage:'proposal',valueMinor:250000,nextAction:'Follow-up da proposta'}});

const emailOnly=await call('/v1/crm/contacts',{method:'POST',body:{kind:'person',name:'Carlos Sem WhatsApp',email:'carlos@example.test',source:'smoke'}});
await call('/v1/appointments',{method:'POST',body:{contactId:emailOnly.id,title:'Reunião sem telefone',startsAt:new Date(Date.now()+5*3600000).toISOString(),endsAt:new Date(Date.now()+6*3600000).toISOString(),status:'scheduled'}});

// A oportunidade precisa parecer realmente antiga: em produção created_at nunca fica à frente de updated_at.
// O fixture envelhece ambos para testar a regra de inatividade sem contradizer a cronologia real.
execFileSync('psql',[process.env.DATABASE_URL,'-v','ON_ERROR_STOP=1','-c',`update crm_deals set created_at=now()-interval '4 days',updated_at=now()-interval '4 days' where id='${deal.id}' and workspace_id='${workspace}'`],{stdio:'pipe'});

const overview=await call('/v1/automations/overview');
assert(Number(overview.appointmentConfirmationsDue)===2,'two appointment confirmations detected');
assert(Number(overview.staleDeals)>=1,'stale CRM opportunity detected');
assert(overview.firstOutboundRequiresHumanApproval===true,'outbound guard exposed');

const first=await call('/v1/automations/scan',{method:'POST',body:{appointments:true,crm:true,maxPerType:20}});
assert(first.appointmentCandidates===2,'appointment candidates scanned');
assert(first.crmCandidates>=1,'CRM candidate scanned');
assert(first.outboundApprovals>=2,'WhatsApp actions require approval');
assert(first.internalReviews>=1,'missing-phone case becomes internal review');

let actions=await call('/v1/command/actions');
const proactive=actions.filter(x=>x.metadata?.source==='proactive_automation');
const appointmentAction=proactive.find(x=>x.subject_id===appointment.id&&x.primary_action?.type==='message.send.appointment_confirmation');
const crmAction=proactive.find(x=>x.subject_id===deal.id&&x.primary_action?.type==='message.send.crm_followup');
assert(appointmentAction?.approval_id,'appointment WhatsApp has approval request');
assert(crmAction?.approval_id,'CRM WhatsApp has approval request');
assert(String(appointmentAction.primary_action?.payload?.message||'').includes('confirmar'),'appointment message prewritten');
assert(String(crmAction.primary_action?.payload?.message||'').includes('avaliar'),'proposal follow-up message prewritten');

const second=await call('/v1/automations/scan',{method:'POST',body:{appointments:true,crm:true,maxPerType:20}});
assert(second.created===0,'repeat scan creates no duplicate cards');
assert(second.reused>=3,'repeat scan reuses existing automation actions');

await call(`/v1/command/actions/${appointmentAction.id}/decision`,{method:'POST',body:{decision:'approved'}});
const execute=await call(`/v1/command/actions/${appointmentAction.id}/execute`,{method:'POST',body:{}});
assert(execute.run?.status==='queued_external','approved confirmation enters reliable outbox');
const processed=await call('/v1/outbox/process',{method:'POST',body:{limit:20}});
assert(processed.results.some(x=>x.topic==='smartbots.message.send'&&x.ok===true&&x.dryRun===true),'CI keeps external message dry-run');

console.log(JSON.stringify({ok:true,appointmentCandidates:first.appointmentCandidates,crmCandidates:first.crmCandidates,outboundApprovals:first.outboundApprovals,internalReviews:first.internalReviews,idempotent:true,humanApproval:true,dryRun:true},null,2));
