import {query} from './db.js';

export type DecisionMemoryItem={
  id:string;
  actionId?:string|null;
  approvalId?:string|null;
  actionType:string;
  title:string;
  context:string|null;
  decision:string;
  decidedAt:string;
  decidedBy:{id:string|null;name:string|null;email:string|null;actorType:string};
  rationale:string|null;
  rationaleStatus:'recorded'|'not_recorded';
  observedOutcome:{
    status:string;
    observedAt:string|null;
    executionObserved:boolean;
    successObserved:boolean|null;
  };
  subject:{type:string|null;id:string|null};
  source:'command_action'|'approval_request'|'audit_log';
  evidence:{auditId?:string|null;currentActionStatus?:string|null;approvalStatus?:string|null};
};

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const obj=(value:unknown):Record<string,any>=>{
  if(value&&typeof value==='object')return value as Record<string,any>;
  try{return JSON.parse(String(value||'{}'))}catch{return{}}
};

export async function buildDecisionMemory(workspaceId:string,contactId:string){
  const relatedRows=await query<any>(
    `select id,'contact' kind from crm_contacts where workspace_id=$1 and id=$2
     union all select id,'deal' kind from crm_deals where workspace_id=$1 and contact_id=$2
     union all select id,'crm_activity' kind from crm_activities where workspace_id=$1 and contact_id=$2
     union all select id,'ledger_entry' kind from ledger_entries where workspace_id=$1 and contact_id=$2
     union all select id,'task' kind from tasks where workspace_id=$1 and contact_id=$2
     union all select id,'appointment' kind from appointments where workspace_id=$1 and contact_id=$2
     union all select id,'document' kind from document_refs where workspace_id=$1 and contact_id=$2`,
    [workspaceId,contactId]
  );
  const relatedIds=[...new Set(relatedRows.map((row:any)=>String(row.id)).filter(id=>uuid.test(id)))];
  if(!relatedIds.length)return emptyDecisionMemory();

  const [actions,approvals]=await Promise.all([
    query<any>(
      `select id,approval_id,agent_role,title,summary,status,autonomy,subject_type,subject_id,primary_action,metadata,created_at,updated_at
       from command_actions where workspace_id=$1 and subject_id=any($2::uuid[]) order by updated_at desc limit 300`,
      [workspaceId,relatedIds]
    ),
    query<any>(
      `select id,action_type,title,description,status,requested_by_agent,subject_type,subject_id,proposed_payload,decided_by,decided_at,created_at
       from approval_requests where workspace_id=$1 and subject_id=any($2::uuid[]) order by coalesce(decided_at,created_at) desc limit 300`,
      [workspaceId,relatedIds]
    )
  ]);

  const actionIds=actions.map((row:any)=>String(row.id)).filter((id:string)=>uuid.test(id));
  const approvalIds=approvals.map((row:any)=>String(row.id)).filter((id:string)=>uuid.test(id));
  const auditSubjectIds=[...new Set([...relatedIds,...actionIds,...approvalIds])];

  const audits=auditSubjectIds.length?await query<any>(
    `select id,actor_type,actor_ref,action,subject_type,subject_id,before_state,after_state,metadata,occurred_at
     from audit_log where workspace_id=$1 and subject_id=any($2::uuid[])
     order by occurred_at desc limit 800`,
    [workspaceId,auditSubjectIds]
  ).catch(()=>[]):[];

  const actorIds=[...new Set([
    ...approvals.map((row:any)=>String(row.decided_by||'')),
    ...audits.filter((row:any)=>String(row.actor_type)==='user').map((row:any)=>String(row.actor_ref||''))
  ].filter(id=>uuid.test(id)))];
  const users=actorIds.length?await query<any>(
    `select id,name,email from users where id=any($1::uuid[])`,
    [actorIds]
  ).catch(()=>[]):[];
  const userById=new Map(users.map((row:any)=>[String(row.id),row]));
  const auditBySubject=new Map<string,any[]>();
  for(const row of audits){
    const key=String(row.subject_id||'');
    if(!auditBySubject.has(key))auditBySubject.set(key,[]);
    auditBySubject.get(key)!.push(row);
  }
  const approvalById=new Map(approvals.map((row:any)=>[String(row.id),row]));

  const decisions:DecisionMemoryItem[]=[];
  for(const action of actions){
    const status=String(action.status||'');
    if(!['approved','rejected','dismissed','executing','done','failed'].includes(status))continue;
    const approval=action.approval_id?approvalById.get(String(action.approval_id)):null;
    const actionAudits=auditBySubject.get(String(action.id))||[];
    const approvalAudits=approval?auditBySubject.get(String(approval.id))||[]:[];
    const decisionAudit=[...actionAudits,...approvalAudits].find((row:any)=>['command.decision','approval.decided'].includes(String(row.action)))||null;
    const meta=obj(decisionAudit?.metadata);
    const rationale=cleanReason(meta.reason||meta.rationale||meta.note);
    const actorId=String(approval?.decided_by||decisionAudit?.actor_ref||'')||null;
    const actor=actorId?userById.get(actorId):null;
    const decision=String(meta.decision||approval?.status||decisionStatusFromAction(status));
    const decidedAt=String(approval?.decided_at||decisionAudit?.occurred_at||action.updated_at||action.created_at);
    decisions.push({
      id:'decision:'+String(action.id),
      actionId:String(action.id),
      approvalId:approval?.id?String(approval.id):null,
      actionType:String(obj(action.primary_action)?.type||approval?.action_type||'command.action'),
      title:String(action.title||approval?.title||'Decisão'),
      context:String(action.summary||approval?.description||'').trim()||null,
      decision,
      decidedAt,
      decidedBy:{
        id:actorId,
        name:actor?.name?String(actor.name):actorId?'Usuário do workspace':String(action.agent_role||approval?.requested_by_agent||'sistema'),
        email:actor?.email?String(actor.email):null,
        actorType:actorId?'user':status==='executing'||status==='done'?'system':'unknown'
      },
      rationale,
      rationaleStatus:rationale?'recorded':'not_recorded',
      observedOutcome:outcomeFromAction(status,String(action.updated_at||'')),
      subject:{type:action.subject_type||approval?.subject_type||null,id:action.subject_id||approval?.subject_id||null},
      source:'command_action',
      evidence:{
        auditId:decisionAudit?.id?String(decisionAudit.id):null,
        currentActionStatus:status,
        approvalStatus:approval?.status?String(approval.status):null
      }
    });
  }

  const coveredApprovals=new Set(decisions.map(item=>item.approvalId).filter(Boolean));
  for(const approval of approvals){
    if(coveredApprovals.has(String(approval.id)))continue;
    const status=String(approval.status||'');
    if(!['approved','rejected','expired','cancelled'].includes(status))continue;
    const audit=(auditBySubject.get(String(approval.id))||[]).find((row:any)=>String(row.action)==='approval.decided')||null;
    const meta=obj(audit?.metadata);
    const rationale=cleanReason(meta.reason||meta.rationale||meta.note);
    const actorId=String(approval.decided_by||audit?.actor_ref||'')||null;
    const actor=actorId?userById.get(actorId):null;
    decisions.push({
      id:'approval:'+String(approval.id),
      actionId:null,
      approvalId:String(approval.id),
      actionType:String(approval.action_type||'approval'),
      title:String(approval.title||'Aprovação'),
      context:String(approval.description||'').trim()||null,
      decision:status,
      decidedAt:String(approval.decided_at||audit?.occurred_at||approval.created_at),
      decidedBy:{id:actorId,name:actor?.name?String(actor.name):actorId?'Usuário do workspace':'sistema',email:actor?.email?String(actor.email):null,actorType:actorId?'user':'system'},
      rationale,
      rationaleStatus:rationale?'recorded':'not_recorded',
      observedOutcome:{status:'approval_'+status,observedAt:String(approval.decided_at||audit?.occurred_at||approval.created_at),executionObserved:false,successObserved:null},
      subject:{type:approval.subject_type||null,id:approval.subject_id||null},
      source:'approval_request',
      evidence:{auditId:audit?.id?String(audit.id):null,currentActionStatus:null,approvalStatus:status}
    });
  }

  decisions.sort((a,b)=>new Date(b.decidedAt).getTime()-new Date(a.decidedAt).getTime());
  return{
    decisions:decisions.slice(0,100),
    summary:{
      total:decisions.length,
      approved:decisions.filter(item=>item.decision==='approved').length,
      rejected:decisions.filter(item=>item.decision==='rejected').length,
      dismissed:decisions.filter(item=>item.decision==='dismissed').length,
      withRationale:decisions.filter(item=>item.rationaleStatus==='recorded').length,
      withObservedExecution:decisions.filter(item=>item.observedOutcome.executionObserved).length,
      latestDecisionAt:decisions[0]?.decidedAt||null
    },
    methodology:{
      sources:['command_actions','approval_requests','audit_log'],
      actorResolution:'users.id when available',
      rationalePolicy:'only_explicitly_recorded',
      outcomePolicy:'current_command_status_is_observation_not_causality'
    },
    safety:{readOnly:true,externalEffects:false,inferredRationale:false,causalClaims:false}
  };
}

function cleanReason(value:unknown){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  return text?text.slice(0,1000):null;
}
function decisionStatusFromAction(status:string){
  if(status==='rejected')return'rejected';
  if(status==='dismissed')return'dismissed';
  if(['approved','executing','done','failed'].includes(status))return'approved';
  return status;
}
function outcomeFromAction(status:string,observedAt:string){
  if(status==='done')return{status:'done',observedAt:observedAt||null,executionObserved:true,successObserved:true};
  if(status==='failed')return{status:'failed',observedAt:observedAt||null,executionObserved:true,successObserved:false};
  if(status==='executing')return{status:'executing',observedAt:observedAt||null,executionObserved:true,successObserved:null};
  return{status:status==='approved'?'approved_waiting_execution':status,observedAt:observedAt||null,executionObserved:false,successObserved:null};
}
function emptyDecisionMemory(){
  return{
    decisions:[] as DecisionMemoryItem[],
    summary:{total:0,approved:0,rejected:0,dismissed:0,withRationale:0,withObservedExecution:0,latestDecisionAt:null as string|null},
    methodology:{sources:['command_actions','approval_requests','audit_log'],actorResolution:'users.id when available',rationalePolicy:'only_explicitly_recorded',outcomePolicy:'current_command_status_is_observation_not_causality'},
    safety:{readOnly:true,externalEffects:false,inferredRationale:false,causalClaims:false}
  };
}
