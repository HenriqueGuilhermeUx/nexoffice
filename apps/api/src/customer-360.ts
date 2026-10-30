
import {query} from './db.js';
import {buildRelationshipIntelligence} from './routes-relationship-intelligence.js';
import {buildCrossSystemIntelligence} from './cross-system-intelligence.js';
import {buildDecisionMemory} from './decision-memory.js';

type TimelineItem={
  id:string;
  at:string;
  kind:'crm'|'communication'|'calendar'|'finance'|'bank'|'document'|'task'|'external_crm'|'erp'|'decision';
  source:string;
  title:string;
  detail?:string|null;
  status?:string|null;
  amountMinor?:number|null;
  direction?:'income'|'expense'|null;
  evidence?:Record<string,unknown>;
};

const n=(value:unknown)=>Number(value||0);
const lower=(value:unknown)=>String(value||'').trim().toLowerCase();
const emailsFrom=(value:unknown)=>{
  const text=Array.isArray(value)?value.join(' '):String(value||'');
  return [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(lower).filter(Boolean))];
};
const hasEmail=(payload:any,email:string)=>{
  const normalized=payload?.normalized&&typeof payload.normalized==='object'?payload.normalized:{};
  const values=[
    payload?.from,payload?.to,payload?.cc,payload?.organizer,payload?.organizerEmail,payload?.attendees,payload?.attendeeEmails,
    normalized?.email,normalized?.partyEmail
  ];
  return values.flatMap(emailsFrom).includes(email);
};
const cleanText=(value:unknown,max=500)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);

export async function buildCustomer360(workspaceId:string,contactId:string){
  const contact=(await query<any>(
    `select id,kind,name,email,phone,company_name,source,tags,created_at,updated_at
     from crm_contacts where id=$1 and workspace_id=$2 limit 1`,
    [contactId,workspaceId]
  ))[0];
  if(!contact)return null;

  const [activities,deals,tasks,appointments,documents,ledger,bankRows,events,relationship,cross,decisionMemory]=await Promise.all([
    query<any>(`select id,type,direction,subject,body,occurred_at,metadata from crm_activities where workspace_id=$1 and contact_id=$2 order by occurred_at desc limit 200`,[workspaceId,contactId]),
    query<any>(`select id,title,stage,value_minor,currency,next_action,expected_close_at,created_at,updated_at from crm_deals where workspace_id=$1 and contact_id=$2 order by updated_at desc limit 100`,[workspaceId,contactId]),
    query<any>(`select id,title,status,priority,due_at,created_at,updated_at from tasks where workspace_id=$1 and contact_id=$2 order by coalesce(due_at,updated_at) desc limit 100`,[workspaceId,contactId]),
    query<any>(`select id,title,status,starts_at,ends_at,created_at,updated_at from appointments where workspace_id=$1 and contact_id=$2 order by starts_at desc limit 100`,[workspaceId,contactId]),
    query<any>(`select id,provider,title,status,document_type,signature_status,created_at,updated_at from document_refs where workspace_id=$1 and contact_id=$2 order by updated_at desc limit 100`,[workspaceId,contactId]),
    query<any>(`select id,direction,category,description,amount_minor,currency,status,due_at,paid_at,created_at,updated_at from ledger_entries where workspace_id=$1 and contact_id=$2 order by coalesce(paid_at,due_at,created_at) desc limit 200`,[workspaceId,contactId]),
    query<any>(`select b.id,b.provider,b.occurred_at,b.direction,b.amount_minor,b.currency,b.description,b.counterparty,b.status,m.match_type,m.confidence
      from reconciliation_matches m
      join bank_transactions b on b.id=m.bank_transaction_id and b.workspace_id=m.workspace_id
      join ledger_entries l on l.id=m.ledger_entry_id and l.workspace_id=m.workspace_id
      where m.workspace_id=$1 and l.contact_id=$2
      order by b.occurred_at desc limit 200`,[workspaceId,contactId]),
    query<any>(`select id,source,type,occurred_at,payload from business_events
      where workspace_id=$1
        and source in ('external.crm','external.erp','external.google.gmail','external.google.calendar','external.microsoft.mail','external.microsoft.calendar','external.email','external.calendar')
        and occurred_at>=now()-interval '365 days'
      order by occurred_at desc limit 4000`,[workspaceId]),
    buildRelationshipIntelligence(workspaceId,false).catch(()=>null),
    buildCrossSystemIntelligence(workspaceId).catch(()=>null),
    buildDecisionMemory(workspaceId,contactId).catch(()=>null)
  ]);

  const mail=lower(contact.email);
  const externalEvents=mail?events.filter((row:any)=>hasEmail(row.payload&&typeof row.payload==='object'?row.payload:{},mail)):[];
  const timeline:TimelineItem[]=[];

  for(const row of activities)timeline.push({
    id:'crm_activity:'+row.id,at:String(row.occurred_at),kind:'crm',source:'nexoffice.crm',
    title:cleanText(row.subject||row.type||'Interação CRM'),
    detail:row.body?cleanText(row.body,240):null,status:row.direction||null,
    evidence:{type:row.type,direction:row.direction||null}
  });
  for(const row of deals)timeline.push({
    id:'deal:'+row.id,at:String(row.updated_at||row.created_at),kind:'crm',source:'nexoffice.crm',
    title:cleanText(row.title||'Oportunidade'),detail:row.next_action?cleanText(row.next_action,240):null,status:String(row.stage||''),
    amountMinor:n(row.value_minor),evidence:{expectedCloseAt:row.expected_close_at||null,currency:row.currency||'BRL'}
  });
  for(const row of tasks)timeline.push({
    id:'task:'+row.id,at:String(row.updated_at||row.created_at),kind:'task',source:'nexoffice.tasks',
    title:cleanText(row.title||'Tarefa'),status:String(row.status||''),evidence:{priority:row.priority||null,dueAt:row.due_at||null}
  });
  for(const row of appointments)timeline.push({
    id:'appointment:'+row.id,at:String(row.starts_at),kind:'calendar',source:'nexoffice.agenda',
    title:cleanText(row.title||'Compromisso'),status:String(row.status||''),evidence:{endsAt:row.ends_at||null}
  });
  for(const row of documents)timeline.push({
    id:'document:'+row.id,at:String(row.updated_at||row.created_at),kind:'document',source:'nexoffice.documents.'+String(row.provider||'internal'),
    title:cleanText(row.title||'Documento'),status:String(row.status||''),evidence:{documentType:row.document_type||null,signatureStatus:row.signature_status||null}
  });
  for(const row of ledger)timeline.push({
    id:'ledger:'+row.id,at:String(row.paid_at||row.due_at||row.created_at),kind:'finance',source:'nexoffice.finance',
    title:cleanText(row.description||row.category||'Lançamento financeiro'),status:String(row.status||''),amountMinor:n(row.amount_minor),direction:row.direction,
    evidence:{category:row.category||null,dueAt:row.due_at||null,paidAt:row.paid_at||null,currency:row.currency||'BRL'}
  });
  for(const row of bankRows)timeline.push({
    id:'bank:'+row.id,at:String(row.occurred_at),kind:'bank',source:'bank:'+String(row.provider||'unknown'),
    title:cleanText(row.counterparty||row.description||'Movimentação bancária'),detail:cleanText(row.description,240),status:String(row.status||''),
    amountMinor:n(row.amount_minor),direction:row.direction,evidence:{matchType:row.match_type||null,confidence:Number(row.confidence||0)}
  });

  for(const decision of (decisionMemory as any)?.decisions||[])timeline.push({
    id:String(decision.id),at:String(decision.decidedAt),kind:'decision',source:'nexoffice.decision_memory',
    title:String(decision.title||decision.actionType||'Decisão'),
    detail:decision.rationale?String(decision.rationale):decision.context?String(decision.context):null,
    status:String(decision.decision||''),
    evidence:{
      actionType:decision.actionType||null,
      decidedBy:decision.decidedBy||null,
      rationaleStatus:decision.rationaleStatus||'not_recorded',
      observedOutcome:decision.observedOutcome||null,
      subject:decision.subject||null
    }
  });

  for(const row of externalEvents){
    const payload=row.payload&&typeof row.payload==='object'?row.payload:{};
    const normalized=payload.normalized&&typeof payload.normalized==='object'?payload.normalized:{};
    if(row.source==='external.crm'){
      const resourceKind=String(payload.resourceKind||normalized.resourceKind||'record');
      timeline.push({
        id:'external_crm:'+row.id,at:String(normalized.occurredAt||normalized.updatedAt||normalized.createdAt||row.occurred_at),
        kind:'external_crm',source:'external.crm',
        title:cleanText(normalized.name||normalized.subject||resourceKind||'Registro CRM externo'),
        detail:normalized.notesExcerpt?cleanText(normalized.notesExcerpt,240):null,
        status:String(normalized.stage||normalized.status||'')||null,
        amountMinor:normalized.amountMinor==null?null:n(normalized.amountMinor),
        evidence:{resourceKind,sourceSystem:payload.sourceSystem||null,owner:normalized.owner||null,expectedCloseAt:normalized.expectedCloseAt||null}
      });
      continue;
    }
    if(row.source==='external.erp'){
      const resourceKind=String(payload.resourceKind||normalized.resourceKind||'record');
      timeline.push({
        id:'erp:'+row.id,at:String(normalized.occurredAt||normalized.dueAt||row.occurred_at),
        kind:'erp',source:'external.erp',
        title:cleanText(normalized.name||normalized.partyName||normalized.description||resourceKind||'Registro ERP'),
        status:String(normalized.status||'')||null,
        amountMinor:normalized.amountMinor==null?null:n(normalized.amountMinor),
        evidence:{resourceKind,sourceSystem:payload.sourceSystem||null,dueAt:normalized.dueAt||null,paidAt:normalized.paidAt||null}
      });
      continue;
    }
    const isMail=row.source==='external.google.gmail'||row.source==='external.microsoft.mail'||row.source==='external.email';
    timeline.push({
      id:'external_context:'+row.id,at:String(row.occurred_at),kind:isMail?'communication':'calendar',source:String(row.source),
      title:cleanText(payload.subject||payload.summary||(isMail?'E-mail observado':'Evento de calendário')),
      detail:payload.excerpt?cleanText(payload.excerpt,240):null,
      evidence:isMail?{from:payload.from||[],to:payload.to||[],cc:payload.cc||[]}:{organizer:payload.organizer||payload.organizerEmail||null,attendees:payload.attendees||payload.attendeeEmails||[]}
    });
  }

  timeline.sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime());

  const relationshipRow=Array.isArray((relationship as any)?.relationships)
    ?(relationship as any).relationships.find((row:any)=>String(row.contactId)===String(contactId))||null
    :null;
  const crossInsights=Array.isArray((cross as any)?.insights)
    ?(cross as any).insights.filter((row:any)=>String(row.contactId)===String(contactId))
    :[];

  const nativeOpenDeals=deals.filter((row:any)=>!['won','lost'].includes(String(row.stage)));
  const externalOpenDeals=externalEvents.filter((row:any)=>{
    if(row.source!=='external.crm')return false;
    const payload=row.payload&&typeof row.payload==='object'?row.payload:{};
    const normalized=payload.normalized&&typeof payload.normalized==='object'?payload.normalized:{};
    const kind=String(payload.resourceKind||normalized.resourceKind||'');
    const stage=String(normalized.stage||normalized.status||'').toLowerCase();
    return kind==='deal'&&!['won','lost','ganho','perdido','closed','fechado','cancelled','cancelado'].includes(stage);
  });
  const openDealsCount=nativeOpenDeals.length+externalOpenDeals.length;
  const openPipelineMinor=nativeOpenDeals.reduce((sum:number,row:any)=>sum+n(row.value_minor),0)+externalOpenDeals.reduce((sum:number,row:any)=>sum+n((row.payload as any)?.normalized?.amountMinor),0);
  const overdueLedger=ledger.filter((row:any)=>row.direction==='income'&&['open','overdue'].includes(String(row.status))&&row.due_at&&new Date(row.due_at).getTime()<Date.now());
  const externalOverdue=externalEvents.filter((row:any)=>{
    if(row.source!=='external.erp')return false;
    const payload=row.payload&&typeof row.payload==='object'?row.payload:{};
    const normalized=payload.normalized&&typeof payload.normalized==='object'?payload.normalized:{};
    const kind=String(payload.resourceKind||normalized.resourceKind||'');
    const dueAt=normalized.dueAt?new Date(String(normalized.dueAt)).getTime():NaN;
    const status=String(normalized.status||'').toLowerCase();
    return kind==='receivable'&&Number.isFinite(dueAt)&&dueAt<Date.now()&&!['paid','pago','recebido','settled','closed','quitado','liquidado'].includes(status);
  });
  const overdueReceivablesCount=overdueLedger.length+externalOverdue.length;
  const overdueMinor=overdueLedger.reduce((sum:number,row:any)=>sum+n(row.amount_minor),0)+externalOverdue.reduce((sum:number,row:any)=>sum+n((row.payload as any)?.normalized?.amountMinor),0);
  const paidMinor90=bankRows.filter((row:any)=>row.direction==='income'&&new Date(row.occurred_at).getTime()>=Date.now()-90*86400000).reduce((sum:number,row:any)=>sum+n(row.amount_minor),0);
  const openTasks=tasks.filter((row:any)=>!['done','cancelled'].includes(String(row.status)));
  const upcomingAppointments=appointments.filter((row:any)=>!['cancelled','completed'].includes(String(row.status))&&new Date(row.starts_at).getTime()>=Date.now());
  const sourceSystems=[...new Set(timeline.map(item=>item.source))].sort();

  const topCross=crossInsights[0]||null;
  const decisions=Array.isArray((decisionMemory as any)?.decisions)?(decisionMemory as any).decisions:[];
  const latestDecision=decisions[0]||null;
  const relationshipOption=Array.isArray(relationshipRow?.bestOptions)?relationshipRow.bestOptions[0]||null:null;
  const recommendedNextStep=topCross?.recommendedNextStep
    ||(latestDecision?.observedOutcome?.status==='approved_waiting_execution'?'Acompanhar a execução da decisão aprovada: '+String(latestDecision.title||latestDecision.actionType):null)
    ||(relationshipOption?.label?String(relationshipOption.label)+(relationshipOption.reason?' — '+String(relationshipOption.reason):''):null)
    ||(openTasks[0]?.title?'Revisar tarefa aberta: '+String(openTasks[0].title):null)
    ||'Revisar o histórico recente e registrar um próximo passo interno.';

  const headline=topCross
    ?String(topCross.title)
    :relationshipRow?.status==='risk'
      ?'Relacionamento exige atenção antes do próximo movimento.'
      :openDealsCount
        ?'Há oportunidade comercial ativa neste relacionamento.'
        :overdueLedger.length
          ?'Há pendência financeira que merece acompanhamento.'
          :'A memória atual não mostra sinal crítico para este cliente.';

  const summaryParts:string[]=[];
  if(latestDecision)summaryParts.push('última decisão: '+String(latestDecision.decision)+' em '+new Intl.DateTimeFormat('pt-BR',{dateStyle:'short'}).format(new Date(String(latestDecision.decidedAt))));
  if(openDealsCount)summaryParts.push(openDealsCount+' oportunidade(s) aberta(s), total de '+openPipelineMinor+' centavos');
  if(overdueReceivablesCount)summaryParts.push(overdueReceivablesCount+' recebível(is) vencido(s), total de '+overdueMinor+' centavos');
  if(relationshipRow?.externalInteractions90)summaryParts.push(Number(relationshipRow.externalInteractions90)+' interação(ões) externas nos últimos 90 dias');
  if(paidMinor90)summaryParts.push(paidMinor90+' centavos em entradas bancárias conciliadas nos últimos 90 dias');
  if(!summaryParts.length)summaryParts.push(timeline.length+' evento(s) disponíveis na memória do relacionamento');

  return{
    contact:{
      id:String(contact.id),kind:contact.kind,name:contact.name,email:contact.email||null,phone:contact.phone||null,
      companyName:contact.company_name||null,source:contact.source||null,tags:Array.isArray(contact.tags)?contact.tags:[]
    },
    currentState:{
      relationshipStatus:relationshipRow?.status||'unknown',
      relationshipReasons:relationshipRow?.reasons||[],
      lastTouchAt:relationshipRow?.lastTouchAt||timeline[0]?.at||null,
      daysSinceTouch:relationshipRow?.daysSinceTouch??null,
      externalInteractions90:n(relationshipRow?.externalInteractions90),
      openDeals:openDealsCount,
      openPipelineMinor,
      overdueReceivables:overdueReceivablesCount,
      overdueMinor,
      bankIncome90Minor:paidMinor90,
      openTasks:openTasks.length,
      upcomingAppointments:upcomingAppointments.length,
      nextRenewalAt:relationshipRow?.renewalAt||null
    },
    maya:{
      headline,
      summary:summaryParts.join(' · ')+'.',
      recommendedNextStep,
      confidence:topCross?.confidence||'contextual',
      hypothesis:topCross?.hypothesis||null
    },
    crossSystemInsights:crossInsights,
    decisions,
    decisionSummary:(decisionMemory as any)?.summary||{total:0,approved:0,rejected:0,dismissed:0,withRationale:0,withObservedExecution:0,latestDecisionAt:null},
    timeline:timeline.slice(0,300),
    memory:{
      events:timeline.length,
      sourceSystems,
      latestEventAt:timeline[0]?.at||null,
      oldestEventAt:timeline.at(-1)?.at||null,
      factsOnly:true,
      decisionsIncluded:true,
      decisionMemoryStatus:'operational_from_audit_and_approval_trail'
    },
    safety:{
      readOnly:true,
      externalEffects:false,
      exactEmailForExternalIdentity:true,
      rawExternalFilesStored:false,
      causalClaims:false
    }
  };
}
