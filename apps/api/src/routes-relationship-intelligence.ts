import type {FastifyInstance} from 'fastify';
import {workspaceContext} from './auth.js';
import {query} from './db.js';
import {readDocWalletUpcomingExpirations} from './docwallet-intelligence-adapter.js';

type RelationshipStatus='healthy'|'attention'|'risk'|'renewal'|'expansion';
type RelationshipOption={
  action:'view_context'|'review_finance'|'create_followup_task'|'create_renewal_proposal'|'create_expansion_proposal';
  label:string;
  reason:string;
  contactId:string;
  catalogItemId?:string|null;
};

const MS_DAY=86400000;
const daysUntil=(value?:string|null)=>value?Math.ceil((new Date(value).getTime()-Date.now())/MS_DAY):null;
const daysSince=(value?:string|null)=>value?Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/MS_DAY)):null;
const newest=(values:(string|null|undefined)[])=>{
  const valid=values.filter(Boolean).map(String).sort((a,b)=>new Date(b).getTime()-new Date(a).getTime());
  return valid[0]||null;
};
const earliest=(values:(string|null|undefined)[])=>{
  const valid=values.filter(Boolean).map(String).sort((a,b)=>new Date(a).getTime()-new Date(b).getTime());
  return valid[0]||null;
};

export async function buildRelationshipIntelligence(workspaceId:string,includeDocWallet=true){
    const [contacts,activities,ledger,recurring,deals,operations,appointments,catalog,documents,externalRelationshipEvents,docUpcoming]=await Promise.all([
      query<any>('select id,name,email,phone,company_name,tags,created_at,updated_at from crm_contacts where workspace_id=$1 order by updated_at desc limit 500',[workspaceId]),
      query<any>("select contact_id,max(occurred_at) last_activity_at,count(*) filter(where occurred_at>=now()-interval '90 days')::int interactions_90 from crm_activities where workspace_id=$1 and contact_id is not null group by contact_id",[workspaceId]),
      query<any>("select contact_id,count(*) filter(where direction='income')::int income_count,count(*) filter(where direction='income' and status='paid')::int paid_count,max(paid_at) filter(where direction='income' and status='paid') last_paid_at,count(*) filter(where direction='income' and status in ('open','overdue') and due_at<now())::int overdue_count,coalesce(sum(amount_minor) filter(where direction='income' and status in ('open','overdue') and due_at<now()),0)::bigint overdue_minor from ledger_entries where workspace_id=$1 and contact_id is not null group by contact_id",[workspaceId]),
      query<any>("select contact_id,count(*) filter(where active and direction='income')::int active_rules,min(next_run_at) filter(where active and direction='income') next_cycle_at,min(ends_at) filter(where active and direction='income' and ends_at is not null and ends_at>=now()) recurrence_ends_at,min(next_run_at) filter(where active and direction='income' and frequency='yearly' and next_run_at>=now()) yearly_renewal_at from recurring_rules where workspace_id=$1 and contact_id is not null group by contact_id",[workspaceId]),
      query<any>("select contact_id,count(*) filter(where stage not in ('won','lost'))::int open_deals,coalesce(sum(value_minor) filter(where stage not in ('won','lost')),0)::bigint open_pipeline_minor,count(*) filter(where stage='won')::int won_deals,count(*) filter(where stage='lost' and updated_at>=now()-interval '90 days')::int lost_90,max(updated_at) filter(where stage='won') last_won_at from crm_deals where workspace_id=$1 and contact_id is not null group by contact_id",[workspaceId]),
      query<any>("select contact_id,count(*)::int operation_count,max(created_at) last_operation_at,array_remove(array_agg(distinct catalog_item_id),null) catalog_item_ids from business_operations where workspace_id=$1 and contact_id is not null and status<>'cancelled' group by contact_id",[workspaceId]),
      query<any>("select contact_id,max(starts_at) filter(where status='completed') last_completed_appointment_at,count(*) filter(where status='no_show' and starts_at>=now()-interval '180 days')::int no_show_180 from appointments where workspace_id=$1 and contact_id is not null group by contact_id",[workspaceId]),
      query<any>("select id,name,kind,price_minor,cost_minor,billing_cycle from business_catalog_items where workspace_id=$1 and active=true and price_minor>0 order by case when cost_minor is not null and price_minor>0 then (price_minor-cost_minor)::numeric/price_minor else -1 end desc,price_minor desc,name",[workspaceId]),
      query<any>("select contact_id,external_ref,title from document_refs where workspace_id=$1 and provider='docwallet' and contact_id is not null",[workspaceId]),
      query<any>("select source,occurred_at,payload from business_events where workspace_id=$1 and source in ('external.google.gmail','external.google.calendar','external.microsoft.mail','external.microsoft.calendar','external.email','external.calendar') and occurred_at>=now()-interval '180 days' order by occurred_at desc limit 2000",[workspaceId]),
      includeDocWallet?readDocWalletUpcomingExpirations(workspaceId,60).catch(()=>({ok:false,error:'docwallet_unavailable'} as any)):Promise.resolve({ok:false,error:'docwallet_skipped'} as any)
    ]);

    const map=(rows:any[])=>new Map(rows.map(row=>[String(row.contact_id),row]));
    const activityBy=map(activities),ledgerBy=map(ledger),recurringBy=map(recurring),dealBy=map(deals),operationBy=map(operations),appointmentBy=map(appointments);
    const normalizeEmail=(value:unknown)=>String(value||'').trim().toLowerCase();
    const emailsFrom=(value:unknown)=>{
      const text=Array.isArray(value)?value.join(' '):String(value||'');
      return [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(normalizeEmail).filter(Boolean))];
    };
    const externalByEmail=new Map<string,{last_activity_at:string;interactions_90:number;sources:Set<string>}>();
    for(const event of externalRelationshipEvents){
      const payload=event.payload&&typeof event.payload==='object'?event.payload:{};
      const isEmail=event.source==='external.google.gmail'||event.source==='external.microsoft.mail'||event.source==='external.email';
      const emails=isEmail
        ?[...emailsFrom(payload.from),...emailsFrom(payload.to),...emailsFrom(payload.cc)]
        :[...emailsFrom(payload.organizer),...emailsFrom(payload.organizerEmail),...emailsFrom(payload.attendees),...emailsFrom(payload.attendeeEmails)];
      for(const email of new Set(emails)){
        const current=externalByEmail.get(email);
        const occurredAt=String(event.occurred_at);
        const within90=new Date(occurredAt).getTime()>=Date.now()-90*MS_DAY;
        if(!current)externalByEmail.set(email,{last_activity_at:occurredAt,interactions_90:within90?1:0,sources:new Set([String(event.source)])});
        else{
          if(new Date(occurredAt).getTime()>new Date(current.last_activity_at).getTime())current.last_activity_at=occurredAt;
          if(within90)current.interactions_90++;
          current.sources.add(String(event.source));
        }
      }
    }
    const documentByExternal=new Map(documents.map((row:any)=>[String(row.external_ref),row]));
    const documentRenewalByContact=new Map<string,{dueDate:string;title:string}>();
    const alerts=Array.isArray((docUpcoming as any)?.payload?.alerts)?(docUpcoming as any).payload.alerts:[];
    for(const alert of alerts){
      const ref=documentByExternal.get(String(alert?.documentId||''));
      if(!ref||!alert?.dueDate)continue;
      const contactId=String(ref.contact_id),current=documentRenewalByContact.get(contactId),candidate={dueDate:String(alert.dueDate),title:String(alert.title||ref.title||'Contrato')};
      if(!current||new Date(candidate.dueDate).getTime()<new Date(current.dueDate).getTime())documentRenewalByContact.set(contactId,candidate);
    }
    const relationships:any[]=[];

    for(const contact of contacts){
      const id=String(contact.id),a=activityBy.get(id)||{},l=ledgerBy.get(id)||{},r=recurringBy.get(id)||{},d=dealBy.get(id)||{},o=operationBy.get(id)||{},ap=appointmentBy.get(id)||{};
      const external=externalByEmail.get(normalizeEmail(contact.email))||null;
      const activeRules=Number(r.active_rules||0),incomeCount=Number(l.income_count||0),paidCount=Number(l.paid_count||0),wonDeals=Number(d.won_deals||0),operationCount=Number(o.operation_count||0);
      const isCustomer=activeRules>0||incomeCount>0||paidCount>0||wonDeals>0||operationCount>0;
      if(!isCustomer)continue;

      const purchasedIds=new Set((o.catalog_item_ids||[]).map(String));
      const expansion=catalog.find((item:any)=>!purchasedIds.has(String(item.id)))||null;
      const lastTouchAt=newest([a.last_activity_at,external?.last_activity_at,ap.last_completed_appointment_at,o.last_operation_at,l.last_paid_at,d.last_won_at,contact.created_at]);
      const staleDays=daysSince(lastTouchAt)??0;
      const overdueCount=Number(l.overdue_count||0),overdueMinor=Number(l.overdue_minor||0),lost90=Number(d.lost_90||0),noShow180=Number(ap.no_show_180||0);
      const documentRenewal=documentRenewalByContact.get(id)||null;
      const renewalAt=earliest([r.recurrence_ends_at,r.yearly_renewal_at,documentRenewal?.dueDate]);
      const renewalDays=daysUntil(renewalAt);

      const reasons:string[]=[];
      let status:RelationshipStatus='healthy';
      if(overdueCount>=2||(overdueCount>=1&&staleDays>=45)){
        status='risk';
        reasons.push(overdueCount>=2?overdueCount+' recebimentos vencidos':'Recebimento vencido e '+staleDays+' dias sem interação');
      }else if(renewalDays!==null&&renewalDays>=0&&renewalDays<=60){
        status='renewal';
        if(documentRenewal&&renewalAt===documentRenewal.dueDate)reasons.push((documentRenewal.title||'Contrato')+' vence em '+renewalDays+' dia(s)');
        else reasons.push('Renovação ou término da recorrência em '+renewalDays+' dia(s)');
      }else if(overdueCount===1||staleDays>=45||noShow180>=2||lost90>=1){
        status='attention';
        if(overdueCount===1)reasons.push('1 recebimento vencido');
        if(staleDays>=45)reasons.push(staleDays+' dias sem interação');
        if(noShow180>=2)reasons.push(noShow180+' faltas em compromissos nos últimos 180 dias');
        if(lost90>=1)reasons.push(lost90+' oportunidade(s) perdida(s) nos últimos 90 dias');
      }else if(expansion&&(activeRules>0||wonDeals>0)){
        status='expansion';
        reasons.push('Relacionamento em dia e há oferta ativa ainda não utilizada');
      }else{
        reasons.push(activeRules>0?'Recorrência ativa sem sinal crítico':'Relacionamento sem sinal crítico');
      }

      const options:RelationshipOption[]=[];
      if(status==='risk'){
        options.push({action:'review_finance',label:'Revisar recebíveis',reason:'Entenda os vencimentos antes de abordar o cliente.',contactId:id});
        options.push({action:'create_followup_task',label:'Criar tarefa de recuperação',reason:'Organize um próximo passo interno sem enviar mensagem automaticamente.',contactId:id});
        options.push({action:'view_context',label:'Ver contexto',reason:'Abra os sinais que levaram o relacionamento a risco.',contactId:id});
      }else if(status==='renewal'){
        const renewalCatalogId=(o.catalog_item_ids||[])[0]||null;
        options.push({action:'create_renewal_proposal',label:'Preparar renovação',reason:'Abra Materiais com a oferta já usada pelo cliente como ponto de partida.',contactId:id,catalogItemId:renewalCatalogId});
        options.push({action:'create_followup_task',label:'Criar tarefa de renovação',reason:'Deixe a conversa de renovação preparada na rotina.',contactId:id});
        options.push({action:'view_context',label:'Ver contexto',reason:'Confira histórico e próximos ciclos antes de decidir.',contactId:id});
      }else if(status==='attention'){
        options.push({action:'create_followup_task',label:'Criar follow-up',reason:'Transforme o sinal em uma próxima ação interna.',contactId:id});
        if(overdueCount>0)options.push({action:'review_finance',label:'Revisar cobrança',reason:'Há vencimento que merece revisão antes do contato.',contactId:id});
        options.push({action:'view_context',label:'Ver contexto',reason:'Veja os motivos e o histórico recente.',contactId:id});
      }else if(status==='expansion'&&expansion){
        options.push({action:'create_expansion_proposal',label:'Preparar expansão',reason:'Use uma oferta ainda não utilizada; revise adequação antes de enviar.',contactId:id,catalogItemId:String(expansion.id)});
        options.push({action:'create_followup_task',label:'Criar tarefa comercial',reason:'Organize a conversa de expansão sem contato automático.',contactId:id});
        options.push({action:'view_context',label:'Ver contexto',reason:'Confirme histórico, pagamentos e pipeline antes da proposta.',contactId:id});
      }else{
        options.push({action:'view_context',label:'Ver relacionamento',reason:'Acompanhe o cliente antes que apareça um problema.',contactId:id});
        options.push({action:'create_followup_task',label:'Agendar cuidado',reason:'Crie um próximo passo interno de relacionamento.',contactId:id});
      }

      relationships.push({
        contactId:id,name:contact.name,email:contact.email||null,phone:contact.phone||null,companyName:contact.company_name||null,status,reasons,
        lastTouchAt,daysSinceTouch:staleDays,
        externalLastTouchAt:external?.last_activity_at||null,
        externalInteractions90:Number(external?.interactions_90||0),
        externalSources:external?[...external.sources].sort():[],
        activeRules,nextCycleAt:r.next_cycle_at||null,renewalAt,documentRenewalAt:documentRenewal?.dueDate||null,documentRenewalTitle:documentRenewal?.title||null,overdueCount,overdueMinor,incomeCount,paidCount,lastPaidAt:l.last_paid_at||null,
        openDeals:Number(d.open_deals||0),openPipelineMinor:Number(d.open_pipeline_minor||0),wonDeals,lost90,noShow180,operationCount,
        expansionCandidate:expansion?{id:String(expansion.id),name:expansion.name,kind:expansion.kind,priceMinor:Number(expansion.price_minor||0),billingCycle:expansion.billing_cycle}:null,
        bestOptions:options
      });
    }

    const priority:Record<RelationshipStatus,number>={risk:0,renewal:1,attention:2,expansion:3,healthy:4};
    relationships.sort((a,b)=>priority[a.status as RelationshipStatus]-priority[b.status as RelationshipStatus]||b.overdueMinor-a.overdueMinor||b.daysSinceTouch-a.daysSinceTouch);
    const count=(status:RelationshipStatus)=>relationships.filter(row=>row.status===status).length;
    const bestOptions:RelationshipOption[]=[];
    for(const row of relationships){
      for(const option of row.bestOptions){
        if(bestOptions.length>=4)break;
        if(!bestOptions.some(existing=>existing.action===option.action&&existing.contactId===option.contactId))bestOptions.push(option);
      }
      if(bestOptions.length>=4)break;
    }

    return{
      summary:{customers:relationships.length,atRisk:count('risk'),renewalSoon:count('renewal'),attention:count('attention'),expansion:count('expansion'),healthy:count('healthy')},
      relationships,bestOptions,
      rules:{risk:'2+ recebimentos vencidos, ou atraso combinado com 45+ dias sem interação',renewal:'término de recorrência ou ciclo anual nos próximos 60 dias',attention:'1 atraso, 45+ dias sem interação, 2+ faltas ou oportunidade perdida recente',expansion:'cliente em dia com oferta ativa ainda não utilizada'},
      safety:{externalCommunication:false,automaticProposalSend:false,automaticDiscount:false,automaticRenewal:false},
      sources:{
        docWalletExpirationsAvailable:Boolean((docUpcoming as any)?.ok),
        docWalletAlertsUsed:alerts.length,
        externalContextEventsObserved:externalRelationshipEvents.length,
        googleWorkspaceEventsObserved:externalRelationshipEvents.filter((event:any)=>String(event.source).startsWith('external.google.')).length,
        microsoft365EventsObserved:externalRelationshipEvents.filter((event:any)=>String(event.source).startsWith('external.microsoft.')).length,
        manualWorkspaceContextEventsObserved:externalRelationshipEvents.filter((event:any)=>event.source==='external.email'||event.source==='external.calendar').length,
        googleWorkspaceEmailsObserved:externalRelationshipEvents.filter((event:any)=>event.source==='external.google.gmail').length
      }
    };
}

export async function registerRelationshipIntelligenceRoutes(app:FastifyInstance){
  app.get('/v1/crm/relationship-intelligence',async req=>{
    const ctx=await workspaceContext(req,'crm.read');
    const includeDocWallet=String((req.query as any)?.includeDocWallet??'true').toLowerCase()!=='false';
    return buildRelationshipIntelligence(ctx.workspaceId,includeDocWallet);
  });
}
