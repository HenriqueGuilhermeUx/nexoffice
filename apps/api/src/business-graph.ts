import type {BusinessGraphEdge,BusinessGraphNode,BusinessGraphSnapshot} from '@nexoffice/domain';
import {query} from './db.js';

const key=(kind:string,id:string)=>`${kind}:${id}`;
const edgeId=(kind:string,from:string,to:string)=>`${kind}:${from}->${to}`;
const number=(value:unknown)=>Number(value||0);

export async function buildBusinessGraph(workspaceId:string,workspaceName:string,windowDays=90):Promise<BusinessGraphSnapshot>{
  const days=Math.min(365,Math.max(7,Math.trunc(windowDays||90)));
  const [workspaces,contacts,deals,accounts,ledger,tasks,appointments,documents,events]=await Promise.all([
    query<any>(`select id,name,vertical,currency from workspaces where id=$1 limit 1`,[workspaceId]),
    query<any>(`select id,kind,name,company_name,tags,created_at,updated_at from crm_contacts where workspace_id=$1 order by updated_at desc limit 150`,[workspaceId]),
    query<any>(`select id,contact_id,title,stage,value_minor,currency,next_action,expected_close_at,created_at,updated_at from crm_deals where workspace_id=$1 order by updated_at desc limit 150`,[workspaceId]),
    query<any>(`select id,name,kind,currency,opening_balance_minor,active from finance_accounts where workspace_id=$1 order by active desc,name limit 50`,[workspaceId]),
    query<any>(`select id,contact_id,account_id,direction,category,description,amount_minor,currency,status,due_at,paid_at,created_at,updated_at from ledger_entries where workspace_id=$1 and coalesce(paid_at,due_at,created_at)>=now()-($2::text||' days')::interval order by coalesce(paid_at,due_at,created_at) desc limit 300`,[workspaceId,String(days)]),
    query<any>(`select id,contact_id,deal_id,title,status,priority,assigned_to,due_at,created_at,updated_at from tasks where workspace_id=$1 and (status not in ('done','cancelled') or coalesce(completed_at,updated_at)>=now()-($2::text||' days')::interval) order by updated_at desc limit 150`,[workspaceId,String(days)]),
    query<any>(`select id,contact_id,title,starts_at,ends_at,status,assigned_to,created_at,updated_at from appointments where workspace_id=$1 and starts_at>=now()-($2::text||' days')::interval order by starts_at desc limit 150`,[workspaceId,String(days)]),
    query<any>(`select id,contact_id,provider,external_ref,title,status,document_type,created_at,updated_at from document_refs where workspace_id=$1 order by updated_at desc limit 150`,[workspaceId]),
    query<any>(`select id,type,source,subject_type,subject_id,occurred_at,payload from business_events where workspace_id=$1 and occurred_at>=now()-($2::text||' days')::interval order by occurred_at desc limit 300`,[workspaceId,String(days)])
  ]);

  const workspace=workspaces[0]||{id:workspaceId,name:workspaceName,vertical:'general',currency:'BRL'};
  const nodes:BusinessGraphNode[]=[];
  const edges:BusinessGraphEdge[]=[];
  const seenNodes=new Set<string>();
  const seenEdges=new Set<string>();

  const addNode=(node:BusinessGraphNode)=>{
    if(seenNodes.has(node.id))return;
    seenNodes.add(node.id);nodes.push(node);
  };
  const addEdge=(edge:BusinessGraphEdge)=>{
    if(!seenNodes.has(edge.from)||!seenNodes.has(edge.to)||seenEdges.has(edge.id))return;
    seenEdges.add(edge.id);edges.push(edge);
  };

  const organizationId=key('organization',workspaceId);
  addNode({
    id:organizationId,sourceId:workspaceId,kind:'organization',label:String(workspace.name||workspaceName),
    source:'nexoffice.workspace',status:'active',attributes:{vertical:workspace.vertical,currency:workspace.currency}
  });

  for(const row of contacts){
    const kind=row.kind==='company'?'external_organization':'person';
    addNode({id:key(kind,row.id),sourceId:row.id,kind,label:String(row.name||row.company_name||'Contato'),source:'nexoffice.crm',status:'active',occurredAt:row.updated_at,attributes:{companyName:row.company_name||null,tags:Array.isArray(row.tags)?row.tags:[]}});
  }
  for(const row of accounts)addNode({id:key('financial_account',row.id),sourceId:row.id,kind:'financial_account',label:String(row.name||'Conta financeira'),source:'nexoffice.finance',status:row.active?'active':'inactive',attributes:{accountKind:row.kind,currency:row.currency,openingBalanceMinor:number(row.opening_balance_minor)}});
  for(const row of deals)addNode({id:key('deal',row.id),sourceId:row.id,kind:'deal',label:String(row.title||'Oportunidade'),source:'nexoffice.crm',status:String(row.stage||''),occurredAt:row.updated_at,attributes:{valueMinor:number(row.value_minor),currency:row.currency,nextAction:row.next_action||null,expectedCloseAt:row.expected_close_at||null}});
  for(const row of ledger)addNode({id:key('financial_entry',row.id),sourceId:row.id,kind:'financial_entry',label:String(row.description||row.category||'Lançamento'),source:'nexoffice.finance',status:String(row.status||''),occurredAt:row.paid_at||row.due_at||row.created_at,attributes:{direction:row.direction,category:row.category,amountMinor:number(row.amount_minor),currency:row.currency,dueAt:row.due_at||null,paidAt:row.paid_at||null}});
  for(const row of tasks)addNode({id:key('task',row.id),sourceId:row.id,kind:'task',label:String(row.title||'Tarefa'),source:'nexoffice.tasks',status:String(row.status||''),occurredAt:row.updated_at,attributes:{priority:row.priority,dueAt:row.due_at||null,assignedTo:row.assigned_to||null}});
  for(const row of appointments)addNode({id:key('appointment',row.id),sourceId:row.id,kind:'appointment',label:String(row.title||'Compromisso'),source:'nexoffice.agenda',status:String(row.status||''),occurredAt:row.starts_at,attributes:{startsAt:row.starts_at,endsAt:row.ends_at||null,assignedTo:row.assigned_to||null}});
  for(const row of documents)addNode({id:key('document',row.id),sourceId:row.id,kind:'document',label:String(row.title||'Documento'),source:`nexoffice.documents.${row.provider||'internal'}`,status:String(row.status||''),occurredAt:row.updated_at,attributes:{documentType:row.document_type||null,provider:row.provider||null,externalRef:row.external_ref||null}});
  for(const row of events)addNode({id:key('event',row.id),sourceId:row.id,kind:'event',label:String(row.type||'Evento'),source:String(row.source||'nexoffice.events'),occurredAt:row.occurred_at,attributes:{eventType:row.type,payload:row.payload&&typeof row.payload==='object'?row.payload:{}}});

  const contactNode=(id:string|null|undefined)=>{
    if(!id)return null;
    return seenNodes.has(key('person',id))?key('person',id):seenNodes.has(key('external_organization',id))?key('external_organization',id):null;
  };

  for(const row of contacts){
    const node=contactNode(row.id);if(node)addEdge({id:edgeId('contains',organizationId,node),from:organizationId,to:node,kind:'contains',source:'nexoffice.crm',attributes:{}});
  }
  for(const row of accounts){
    const node=key('financial_account',row.id);addEdge({id:edgeId('contains',organizationId,node),from:organizationId,to:node,kind:'contains',source:'nexoffice.finance',attributes:{}});
  }
  for(const row of deals){
    const deal=key('deal',row.id),contact=contactNode(row.contact_id);
    addEdge({id:edgeId('contains',organizationId,deal),from:organizationId,to:deal,kind:'contains',source:'nexoffice.crm',attributes:{}});
    if(contact)addEdge({id:edgeId('has_deal',contact,deal),from:contact,to:deal,kind:'has_deal',source:'nexoffice.crm',attributes:{stage:row.stage}});
  }
  for(const row of ledger){
    const entry=key('financial_entry',row.id),contact=contactNode(row.contact_id),account=row.account_id?key('financial_account',row.account_id):null;
    addEdge({id:edgeId('contains',organizationId,entry),from:organizationId,to:entry,kind:'contains',source:'nexoffice.finance',attributes:{}});
    if(contact)addEdge({id:edgeId('financial_activity',contact,entry),from:contact,to:entry,kind:'financial_activity',source:'nexoffice.finance',attributes:{direction:row.direction}});
    if(account&&seenNodes.has(account))addEdge({id:edgeId('generated',account,entry),from:account,to:entry,kind:'generated',source:'nexoffice.finance',attributes:{}});
  }
  for(const row of tasks){
    const task=key('task',row.id),contact=contactNode(row.contact_id),deal=row.deal_id?key('deal',row.deal_id):null;
    addEdge({id:edgeId('contains',organizationId,task),from:organizationId,to:task,kind:'contains',source:'nexoffice.tasks',attributes:{}});
    if(contact)addEdge({id:edgeId('related_to',contact,task),from:contact,to:task,kind:'related_to',source:'nexoffice.tasks',attributes:{}});
    if(deal&&seenNodes.has(deal))addEdge({id:edgeId('supports',task,deal),from:task,to:deal,kind:'supports',source:'nexoffice.tasks',attributes:{}});
  }
  for(const row of appointments){
    const appointment=key('appointment',row.id),contact=contactNode(row.contact_id);
    addEdge({id:edgeId('contains',organizationId,appointment),from:organizationId,to:appointment,kind:'contains',source:'nexoffice.agenda',attributes:{}});
    if(contact)addEdge({id:edgeId('scheduled_with',contact,appointment),from:contact,to:appointment,kind:'scheduled_with',source:'nexoffice.agenda',attributes:{}});
  }
  for(const row of documents){
    const document=key('document',row.id),contact=contactNode(row.contact_id);
    addEdge({id:edgeId('contains',organizationId,document),from:organizationId,to:document,kind:'contains',source:'nexoffice.documents',attributes:{}});
    if(contact)addEdge({id:edgeId('document_for',document,contact),from:document,to:contact,kind:'document_for',source:'nexoffice.documents',attributes:{}});
  }

  const subjectKey=(subjectType:string|null,subjectId:string|null)=>{
    if(!subjectType||!subjectId)return null;
    const map:Record<string,string>={crm_contact:'person',crm_deal:'deal',ledger_entry:'financial_entry',finance_account:'financial_account',task:'task',appointment:'appointment',document_ref:'document'};
    const kind=map[subjectType];if(!kind)return null;
    if(kind==='person'){
      return seenNodes.has(key('person',subjectId))?key('person',subjectId):seenNodes.has(key('external_organization',subjectId))?key('external_organization',subjectId):null;
    }
    const id=key(kind,subjectId);return seenNodes.has(id)?id:null;
  };
  for(const row of events){
    const event=key('event',row.id),subject=subjectKey(row.subject_type,row.subject_id);
    addEdge({id:edgeId('contains',organizationId,event),from:organizationId,to:event,kind:'contains',source:'nexoffice.events',attributes:{}});
    if(subject)addEdge({id:edgeId('generated',subject,event),from:subject,to:event,kind:'generated',source:String(row.source||'nexoffice.events'),attributes:{eventType:row.type}});
  }

  const overdueReceivables=ledger.filter(row=>row.direction==='income'&&['open','overdue'].includes(String(row.status))&&row.due_at&&new Date(row.due_at).getTime()<Date.now());
  const overdueTasks=tasks.filter(row=>!['done','cancelled'].includes(String(row.status))&&row.due_at&&new Date(row.due_at).getTime()<Date.now());
  const openDeals=deals.filter(row=>!['won','lost'].includes(String(row.stage)));
  const stalledDeals=openDeals.filter(row=>row.expected_close_at&&new Date(row.expected_close_at).getTime()<Date.now());
  const executiveSignals:BusinessGraphSnapshot['executiveSignals']=[];

  if(overdueReceivables.length)executiveSignals.push({
    code:'receivables_overdue',level:'critical',title:'Recebíveis vencidos',
    detail:`${overdueReceivables.length} recebível(is) vencido(s) somam ${overdueReceivables.reduce((sum,row)=>sum+number(row.amount_minor),0)} centavos.`,
    evidence:{count:overdueReceivables.length,amountMinor:overdueReceivables.reduce((sum,row)=>sum+number(row.amount_minor),0)}
  });
  if(overdueTasks.length)executiveSignals.push({
    code:'tasks_overdue',level:'attention',title:'Pendências operacionais atrasadas',
    detail:`${overdueTasks.length} tarefa(s) aberta(s) ultrapassaram o prazo.`,
    evidence:{count:overdueTasks.length}
  });
  if(stalledDeals.length)executiveSignals.push({
    code:'deals_past_expected_close',level:'attention',title:'Oportunidades além da data esperada',
    detail:`${stalledDeals.length} oportunidade(s) seguem abertas após a data esperada de fechamento.`,
    evidence:{count:stalledDeals.length,valueMinor:stalledDeals.reduce((sum,row)=>sum+number(row.value_minor),0)}
  });
  if(nodes.length<10)executiveSignals.push({
    code:'graph_learning',level:'info',title:'Contexto ainda em aprendizado',
    detail:'O Nex Business Graph ainda tem poucos sinais para relacionar. Conectar fontes e registrar a operação aumentará a qualidade da análise.',
    evidence:{nodes:nodes.length,edges:edges.length}
  });

  const byKind:Record<string,number>={};
  for(const node of nodes)byKind[node.kind]=(byKind[node.kind]||0)+1;

  return{
    workspaceId,workspaceName:String(workspace.name||workspaceName),nodes,edges,
    coverage:{nodes:nodes.length,edges:edges.length,byKind,sources:[...new Set(nodes.map(node=>node.source))].sort(),windowDays:days,generatedAt:new Date().toISOString()},
    executiveSignals,
    safety:{readOnly:true,externalEffects:false,derivedFromWorkspaceData:true}
  };
}
