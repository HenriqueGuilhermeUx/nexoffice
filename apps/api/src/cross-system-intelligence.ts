
import {query} from './db.js';

export type CrossSystemLevel='info'|'attention'|'critical';
export type CrossSystemConfidence='medium'|'high';

export type CrossSystemFact={source:string;label:string;value:unknown};

export type CrossSystemInsight={
  code:string;
  level:CrossSystemLevel;
  confidence:CrossSystemConfidence;
  title:string;
  detail:string;
  hypothesis:string;
  contactId:string;
  contactName:string;
  sourceSystems:string[];
  facts:CrossSystemFact[];
  recommendedNextStep:string;
};

const MS_DAY=86400000;
const n=(value:unknown)=>Number(value||0);
const email=(value:unknown)=>String(value||'').trim().toLowerCase();
const ageDays=(value:unknown)=>{
  const time=value?new Date(String(value)).getTime():NaN;
  return Number.isFinite(time)?Math.max(0,Math.floor((Date.now()-time)/MS_DAY)):null;
};
const deltaDays=(value:unknown)=>{
  const time=value?new Date(String(value)).getTime():NaN;
  return Number.isFinite(time)?Math.ceil((time-Date.now())/MS_DAY):null;
};
const activeStage=(value:unknown)=>!['won','lost','ganho','perdido','closed','fechado','cancelled','cancelado'].includes(String(value||'').trim().toLowerCase());

export async function buildCrossSystemIntelligence(workspaceId:string){
  const [contacts,nativeDeals,nativeFinance,bankReality,events]=await Promise.all([
    query<any>("select id,name,email,company_name from crm_contacts where workspace_id=$1 and email is not null order by updated_at desc limit 500",[workspaceId]),
    query<any>("select contact_id,count(*) filter(where stage not in ('won','lost'))::int open_deals,coalesce(sum(value_minor) filter(where stage not in ('won','lost')),0)::bigint open_pipeline_minor,min(expected_close_at) filter(where stage not in ('won','lost') and expected_close_at is not null) next_expected_close_at,max(updated_at) filter(where stage not in ('won','lost')) last_deal_update_at from crm_deals where workspace_id=$1 and contact_id is not null group by contact_id",[workspaceId]),
    query<any>("select contact_id,count(*) filter(where direction='income' and status in ('open','overdue') and due_at<now())::int overdue_count,coalesce(sum(amount_minor) filter(where direction='income' and status in ('open','overdue') and due_at<now()),0)::bigint overdue_minor,max(paid_at) filter(where direction='income' and status='paid') last_paid_at from ledger_entries where workspace_id=$1 and contact_id is not null group by contact_id",[workspaceId]),
    query<any>("select l.contact_id,max(b.occurred_at) last_bank_activity_at,max(b.occurred_at) filter(where b.direction='income') last_bank_income_at,coalesce(sum(b.amount_minor) filter(where b.direction='income' and b.occurred_at>=now()-interval '90 days'),0)::bigint bank_income_90_minor,array_remove(array_agg(distinct b.provider),null) providers from reconciliation_matches m join bank_transactions b on b.id=m.bank_transaction_id and b.workspace_id=m.workspace_id join ledger_entries l on l.id=m.ledger_entry_id and l.workspace_id=m.workspace_id where m.workspace_id=$1 and l.contact_id is not null group by l.contact_id",[workspaceId]),
    query<any>("select source,type,occurred_at,payload from business_events where workspace_id=$1 and source in ('external.crm','external.erp','external.google.gmail','external.google.calendar','external.microsoft.mail','external.microsoft.calendar','external.email','external.calendar') and occurred_at>=now()-interval '180 days' order by occurred_at desc limit 4000",[workspaceId])
  ]);

  const dealBy=new Map(nativeDeals.map((row:any)=>[String(row.contact_id),row]));
  const financeBy=new Map(nativeFinance.map((row:any)=>[String(row.contact_id),row]));
  const bankBy=new Map(bankReality.map((row:any)=>[String(row.contact_id),row]));
  const external=new Map<string,{
    interactions:number;
    lastInteractionAt:string|null;
    interactionSources:Set<string>;
    openDeals:number;
    openDealMinor:number;
    earliestExpectedCloseAt:string|null;
    overdueReceivables:number;
    overdueReceivableMinor:number;
  }>();

  const ensure=(mail:string)=>{
    let row=external.get(mail);
    if(!row){
      row={interactions:0,lastInteractionAt:null,interactionSources:new Set(),openDeals:0,openDealMinor:0,earliestExpectedCloseAt:null,overdueReceivables:0,overdueReceivableMinor:0};
      external.set(mail,row);
    }
    return row;
  };
  const emailsFrom=(value:unknown)=>{
    const text=Array.isArray(value)?value.join(' '):String(value||'');
    return [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(email).filter(Boolean))];
  };
  const rememberInteraction=(mail:string,occurredAt:string,source:string)=>{
    if(!mail)return;
    const row=ensure(mail);
    row.interactions++;
    row.interactionSources.add(source);
    if(!row.lastInteractionAt||new Date(occurredAt).getTime()>new Date(row.lastInteractionAt).getTime())row.lastInteractionAt=occurredAt;
  };

  for(const event of events){
    const payload=event.payload&&typeof event.payload==='object'?event.payload:{};
    const occurredAt=String(event.occurred_at);
    if(event.source==='external.crm'){
      const normalized=payload.normalized&&typeof payload.normalized==='object'?payload.normalized:{};
      const kind=String(payload.resourceKind||normalized.resourceKind||'');
      const mails=[...new Set([...emailsFrom(normalized.email),...emailsFrom(normalized.partyEmail)])];
      if(kind==='activity'){
        for(const mail of mails)rememberInteraction(mail,String(normalized.occurredAt||occurredAt),'external.crm');
      }else if(kind==='deal'&&activeStage(normalized.stage||normalized.status)){
        for(const mail of mails){
          const row=ensure(mail);
          row.openDeals++;
          row.openDealMinor+=n(normalized.amountMinor);
          const close=normalized.expectedCloseAt?String(normalized.expectedCloseAt):null;
          if(close&&(!row.earliestExpectedCloseAt||new Date(close).getTime()<new Date(row.earliestExpectedCloseAt).getTime()))row.earliestExpectedCloseAt=close;
        }
      }
      continue;
    }
    if(event.source==='external.erp'){
      const normalized=payload.normalized&&typeof payload.normalized==='object'?payload.normalized:{};
      const kind=String(payload.resourceKind||normalized.resourceKind||'');
      if(kind!=='receivable')continue;
      const dueAt=normalized.dueAt?new Date(String(normalized.dueAt)).getTime():NaN;
      const status=String(normalized.status||'').trim().toLowerCase();
      const overdue=Number.isFinite(dueAt)&&dueAt<Date.now()&&!['paid','pago','recebido','settled','closed','quitado','liquidado'].includes(status);
      if(!overdue)continue;
      for(const mail of [...new Set([...emailsFrom(normalized.email),...emailsFrom(normalized.partyEmail)])]){
        const row=ensure(mail);
        row.overdueReceivables++;
        row.overdueReceivableMinor+=n(normalized.amountMinor);
      }
      continue;
    }
    if(event.source==='external.google.gmail'||event.source==='external.microsoft.mail'||event.source==='external.email'){
      for(const mail of [...new Set([...emailsFrom(payload.from),...emailsFrom(payload.to),...emailsFrom(payload.cc)])])rememberInteraction(mail,occurredAt,String(event.source));
      continue;
    }
    for(const mail of [...new Set([...emailsFrom(payload.organizer),...emailsFrom(payload.organizerEmail),...emailsFrom(payload.attendees),...emailsFrom(payload.attendeeEmails)])])rememberInteraction(mail,occurredAt,String(event.source));
  }

  const insights:CrossSystemInsight[]=[];
  for(const contact of contacts){
    const contactId=String(contact.id),mail=email(contact.email);
    if(!mail)continue;
    const nativeDeal=dealBy.get(contactId)||{};
    const nativeFin=financeBy.get(contactId)||{};
    const bank=bankBy.get(contactId)||{};
    const ext=external.get(mail);

    const openDeals=n(nativeDeal.open_deals)+n(ext?.openDeals);
    const pipelineMinor=n(nativeDeal.open_pipeline_minor)+n(ext?.openDealMinor);
    const overdueCount=n(nativeFin.overdue_count)+n(ext?.overdueReceivables);
    const overdueMinor=n(nativeFin.overdue_minor)+n(ext?.overdueReceivableMinor);
    const lastInteractionAt=ext?.lastInteractionAt||null;
    const interactionDays=ageDays(lastInteractionAt);
    const interactions90=n(ext?.interactions);
    const expectedCloseAt=earliest([nativeDeal.next_expected_close_at,ext?.earliestExpectedCloseAt]);
    const expectedCloseDays=deltaDays(expectedCloseAt);
    const bankIncome90=n(bank.bank_income_90_minor);
    const bankDays=ageDays(bank.last_bank_income_at);

    if(openDeals>0&&overdueCount>0){
      const sources=new Set<string>();
      if(n(nativeDeal.open_deals)>0)sources.add('nexoffice.crm');
      if(n(ext?.openDeals)>0)sources.add('external.crm');
      if(n(nativeFin.overdue_count)>0)sources.add('nexoffice.finance');
      if(n(ext?.overdueReceivables)>0)sources.add('external.erp');
      if(sources.size>=2)insights.push({
        code:'opportunity_vs_payment_risk',
        level:overdueCount>=2||overdueMinor>=pipelineMinor*.25?'critical':'attention',
        confidence:'high',
        title:'Oportunidade comercial com risco financeiro simultâneo',
        detail:String(contact.name)+' tem '+openDeals+' oportunidade(s) aberta(s) somando '+pipelineMinor+' centavos e '+overdueCount+' recebível(is) vencido(s) somando '+overdueMinor+' centavos.',
        hypothesis:'Há interesse comercial em andamento ao mesmo tempo em que existe pendência financeira. Isso não prova risco de churn ou inadimplência futura, mas recomenda coordenar venda e cobrança antes do próximo passo.',
        contactId,contactName:String(contact.name),sourceSystems:[...sources].sort(),
        facts:[
          {source:'cross.crm',label:'openDeals',value:openDeals},
          {source:'cross.crm',label:'pipelineMinor',value:pipelineMinor},
          {source:'cross.finance',label:'overdueCount',value:overdueCount},
          {source:'cross.finance',label:'overdueMinor',value:overdueMinor}
        ],
        recommendedNextStep:'Revisar a oportunidade e os recebíveis do mesmo cliente em conjunto antes de avançar proposta, desconto ou cobrança.'
      });
    }

    if(openDeals>0&&expectedCloseDays!==null&&expectedCloseDays<0&&interactions90>=2&&interactionDays!==null&&interactionDays<=30){
      const sources=new Set<string>();
      if(n(nativeDeal.open_deals)>0)sources.add('nexoffice.crm');
      if(n(ext?.openDeals)>0)sources.add('external.crm');
      for(const source of ext?.interactionSources||[])sources.add(source);
      if(sources.size>=2)insights.push({
        code:'engagement_without_progress',
        level:'attention',confidence:'high',
        title:'Relacionamento ativo, mas oportunidade não avançou',
        detail:String(contact.name)+' teve '+interactions90+' interação(ões) externas observadas e ainda possui oportunidade além da data esperada de fechamento.',
        hypothesis:'A comunicação continua ativa, mas o estágio comercial pode estar desatualizado ou existe um bloqueio que não foi registrado. A correlação não identifica a causa.',
        contactId,contactName:String(contact.name),sourceSystems:[...sources].sort(),
        facts:[
          {source:'cross.relationship',label:'externalInteractions',value:interactions90},
          {source:'cross.relationship',label:'lastInteractionAt',value:lastInteractionAt},
          {source:'cross.crm',label:'expectedCloseAt',value:expectedCloseAt},
          {source:'cross.crm',label:'openDeals',value:openDeals}
        ],
        recommendedNextStep:'Revisar o último contato, confirmar o estágio real e registrar o próximo passo ou encerramento da oportunidade.'
      });
    }

    if(bankIncome90>0&&bankDays!==null&&bankDays<=30&&(interactionDays===null||interactionDays>=45)){
      const sources=new Set<string>(['bank_transactions']);
      for(const provider of Array.isArray(bank.providers)?bank.providers:[])sources.add('bank:'+String(provider));
      if(n(nativeDeal.open_deals)>0||n(ext?.openDeals)>0)sources.add(n(ext?.openDeals)>0?'external.crm':'nexoffice.crm');
      if(sources.size>=2)insights.push({
        code:'payment_without_relationship',
        level:'attention',confidence:'high',
        title:'Movimento financeiro recente sem relacionamento recente',
        detail:String(contact.name)+' teve '+bankIncome90+' centavos de entradas bancárias conciliadas nos últimos 90 dias, mas não há interação externa observada há pelo menos 45 dias.',
        hypothesis:'O cliente segue gerando movimento financeiro, mas a camada de relacionamento parece silenciosa. Isso pode ser normal em contratos recorrentes; a Nex não assume deterioração sem evidência adicional.',
        contactId,contactName:String(contact.name),sourceSystems:[...sources].sort(),
        facts:[
          {source:'cross.bank',label:'bankIncome90Minor',value:bankIncome90},
          {source:'cross.bank',label:'lastBankIncomeAt',value:bank.last_bank_income_at||null},
          {source:'cross.relationship',label:'lastInteractionAt',value:lastInteractionAt}
        ],
        recommendedNextStep:'Confirmar se o relacionamento é recorrente/automático ou se vale criar um ponto de contato de acompanhamento.'
      });
    }

    if(openDeals>0&&overdueCount===0&&interactions90>=2&&interactionDays!==null&&interactionDays<=21&&(bankIncome90>0||Boolean(nativeFin.last_paid_at))){
      const sources=new Set<string>();
      if(n(ext?.openDeals)>0)sources.add('external.crm');else sources.add('nexoffice.crm');
      for(const source of ext?.interactionSources||[])sources.add(source);
      if(bankIncome90>0)sources.add('bank_transactions');else sources.add('nexoffice.finance');
      if(sources.size>=3)insights.push({
        code:'commercial_momentum',
        level:'info',confidence:'medium',
        title:'Momento comercial favorável com relacionamento e financeiro em dia',
        detail:String(contact.name)+' combina oportunidade aberta, interações recentes e ausência de recebíveis vencidos.',
        hypothesis:'A combinação sugere momento favorável para revisar avanço comercial, mas não prevê conversão.',
        contactId,contactName:String(contact.name),sourceSystems:[...sources].sort(),
        facts:[
          {source:'cross.crm',label:'openDeals',value:openDeals},
          {source:'cross.relationship',label:'externalInteractions',value:interactions90},
          {source:'cross.finance',label:'overdueCount',value:overdueCount},
          {source:'cross.bank',label:'bankIncome90Minor',value:bankIncome90}
        ],
        recommendedNextStep:'Revisar a oportunidade e confirmar se existe próximo passo comercial claro, sem contato automático.'
      });
    }
  }

  const rank=(level:CrossSystemLevel)=>level==='critical'?0:level==='attention'?1:2;
  insights.sort((a,b)=>rank(a.level)-rank(b.level)||b.sourceSystems.length-a.sourceSystems.length);
  return{
    generatedAt:new Date().toISOString(),
    summary:{
      insights:insights.length,
      critical:insights.filter(item=>item.level==='critical').length,
      attention:insights.filter(item=>item.level==='attention').length,
      customers:new Set(insights.map(item=>item.contactId)).size,
      sourceSystems:[...new Set(insights.flatMap(item=>item.sourceSystems))].sort()
    },
    insights:insights.slice(0,50),
    methodology:{
      minimumDistinctSources:2,
      deterministicIdentity:'exact_email_or_reconciled_finance_link',
      correlationsAreHypotheses:true,
      causalClaims:false
    },
    safety:{readOnly:true,externalEffects:false,automaticCommunication:false,automaticFinancialAction:false}
  };
}

function earliest(values:unknown[]){
  const valid=values.filter(Boolean).map(String).sort((a,b)=>new Date(a).getTime()-new Date(b).getTime());
  return valid[0]||null;
}
