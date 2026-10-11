import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog,emitBusinessEvent} from './events.js';

const uuid=z.string().uuid();

type BillingCycle='weekly'|'monthly'|'quarterly'|'yearly';
type Frequency='weekly'|'monthly'|'yearly';
type RecurrenceOption={
  action:'activate_recurrence'|'generate_upcoming'|'review_receivables'|'open_client'|'create_proposal'|'review_catalog_cycle';
  label:string;
  reason:string;
  operationId?:string|null;
  ruleId?:string|null;
  contactId?:string|null;
  catalogItemId?:string|null;
  view?:'finance'|'crm'|'materials';
};

function cycleConfig(cycle:string):{frequency:Frequency;intervalCount:number}|null{
  if(cycle==='weekly')return{frequency:'weekly',intervalCount:1};
  if(cycle==='monthly')return{frequency:'monthly',intervalCount:1};
  if(cycle==='quarterly')return{frequency:'monthly',intervalCount:3};
  if(cycle==='yearly')return{frequency:'yearly',intervalCount:1};
  return null;
}

function advance(date:Date,frequency:Frequency,intervalCount:number){
  const next=new Date(date);
  if(frequency==='weekly')next.setUTCDate(next.getUTCDate()+7*intervalCount);
  else if(frequency==='monthly')next.setUTCMonth(next.getUTCMonth()+intervalCount);
  else next.setUTCFullYear(next.getUTCFullYear()+intervalCount);
  return next;
}

function firstFutureOccurrence(base:Date,frequency:Frequency,intervalCount:number){
  let next=advance(base,frequency,intervalCount),safety=0;
  const now=Date.now();
  while(next.getTime()<=now&&safety++<120)next=advance(next,frequency,intervalCount);
  return next;
}

function occurrencesWithin(startValue:string|Date,frequency:Frequency,intervalCount:number,days:number,endsAt?:string|null){
  const end=new Date(Date.now()+days*86400000),hardEnd=endsAt?new Date(Math.min(end.getTime(),new Date(endsAt).getTime())):end;
  let cursor=new Date(startValue),count=0,safety=0;
  while(cursor<=hardEnd&&safety++<120){
    if(cursor.getTime()>=Date.now())count++;
    cursor=advance(cursor,frequency,intervalCount);
  }
  return count;
}

function ruleRisk(row:any){
  if(!row.active)return'paused';
  if(Number(row.overdue_count||0)>0)return'high';
  const next=new Date(row.next_run_at).getTime(),days=(next-Date.now())/86400000;
  if(days<=7)return'attention';
  return'healthy';
}

export async function registerRecurrenceIntelligenceRoutes(app:FastifyInstance){
  app.post('/v1/finance/recurrence-intelligence/activate/:operationId',async req=>{
    const ctx=await workspaceContext(req,'finance.write');
    const operationId=uuid.parse((req.params as any).operationId);
    const operation=(await query<any>(`
      select o.*,c.name contact_name,ci.name catalog_name,ci.billing_cycle,ci.active catalog_active
      from business_operations o
      join crm_contacts c on c.id=o.contact_id
      join business_catalog_items ci on ci.id=o.catalog_item_id
      where o.id=$1 and o.workspace_id=$2
    `,[operationId,ctx.workspaceId]))[0];
    if(!operation)throw new ApiError(404,'operation_not_found','Operação comercial com oferta do catálogo não encontrada.');
    if(operation.status==='cancelled')throw new ApiError(409,'operation_cancelled','Não é possível ativar recorrência a partir de uma operação cancelada.');
    if(!operation.catalog_active)throw new ApiError(409,'catalog_item_inactive','Reative ou revise a oferta no catálogo antes de ativar a recorrência.');
    const config=cycleConfig(String(operation.billing_cycle||''));
    if(!config)throw new ApiError(409,'billing_cycle_not_supported','Use recorrência semanal, mensal, trimestral ou anual. Ciclos personalizados devem ser ajustados no catálogo antes da ativação.');

    const existing=(await query<any>(`
      select * from recurring_rules
      where workspace_id=$1 and source_operation_id=$2
      limit 1
    `,[ctx.workspaceId,operationId]))[0];
    if(existing)return{reused:true,rule:existing,externalEffect:false};

    const base=new Date(operation.due_at||operation.created_at||new Date().toISOString());
    const nextRunAt=firstFutureOccurrence(base,config.frequency,config.intervalCount);
    const metadata={
      source:'business_operation_recurrence',
      sourceOperationId:operationId,
      catalogItemId:operation.catalog_item_id,
      catalogName:operation.catalog_name,
      billingCycle:operation.billing_cycle,
      dealId:operation.deal_id||null,
      quantity:Number(operation.quantity||1),
      unitPriceMinor:operation.unit_price_minor===null?null:Number(operation.unit_price_minor),
      unitCostMinor:operation.unit_cost_minor===null?null:Number(operation.unit_cost_minor),
      activationMode:'explicit',
      retroactiveGeneration:false
    };

    const result=await transaction(async client=>{
      const rule=(await client.query<any>(`
        insert into recurring_rules(
          workspace_id,contact_id,direction,category,description,amount_minor,currency,
          frequency,interval_count,next_run_at,metadata,source_operation_id,catalog_item_id
        ) values($1,$2,'income','service',$3,$4,$5,$6,$7,$8,$9,$10,$11)
        returning *
      `,[
        ctx.workspaceId,operation.contact_id,operation.description,operation.amount_minor,operation.currency,
        config.frequency,config.intervalCount,nextRunAt.toISOString(),JSON.stringify(metadata),operationId,operation.catalog_item_id
      ])).rows[0];
      const updated=(await client.query<any>(`
        update business_operations
        set metadata=metadata||$3::jsonb,updated_at=now()
        where id=$1 and workspace_id=$2
        returning *
      `,[operationId,ctx.workspaceId,JSON.stringify({recurrenceRuleId:rule.id,recurrenceActivatedAt:new Date().toISOString()})])).rows[0];
      return{rule,operation:updated};
    });

    await auditLog(ctx,'recurrence.intelligence_activated','business_operation',operationId,operation,{ruleId:result.rule.id,nextRunAt:result.rule.next_run_at,externalEffect:false});
    await emitBusinessEvent(ctx.workspaceId,'recurrence.activated','nexoffice.erp','business_operation',operationId,{ruleId:result.rule.id,catalogItemId:operation.catalog_item_id,contactId:operation.contact_id,nextRunAt:result.rule.next_run_at,externalEffect:false});
    return{reused:false,...result,externalEffect:false,retroactiveGeneration:false};
  });

  app.get('/v1/finance/recurrence-intelligence',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    const rules=await query<any>(`
      select
        r.id,r.contact_id,r.source_operation_id,r.catalog_item_id,r.description,r.amount_minor,r.currency,
        r.frequency,r.interval_count,r.next_run_at,r.ends_at,r.active,r.metadata,r.created_at,r.updated_at,
        c.name contact_name,ci.name catalog_name,ci.billing_cycle,
        coalesce(s.generated_count,0)::int generated_count,
        coalesce(s.paid_count,0)::int paid_count,
        coalesce(s.overdue_count,0)::int overdue_count,
        coalesce(s.overdue_minor,0)::bigint overdue_minor,
        s.last_paid_at
      from recurring_rules r
      left join crm_contacts c on c.id=r.contact_id
      left join business_catalog_items ci on ci.id=r.catalog_item_id
      left join lateral (
        select
          count(*)::int generated_count,
          count(*) filter(where l.status='paid')::int paid_count,
          count(*) filter(where l.status in ('open','overdue') and l.due_at<now())::int overdue_count,
          coalesce(sum(l.amount_minor) filter(where l.status in ('open','overdue') and l.due_at<now()),0)::bigint overdue_minor,
          max(l.paid_at) filter(where l.status='paid') last_paid_at
        from ledger_entries l
        where l.workspace_id=r.workspace_id
          and l.metadata->>'recurringRuleId'=r.id::text
      ) s on true
      where r.workspace_id=$1 and r.direction='income'
      order by r.active desc,r.next_run_at asc
    `,[ctx.workspaceId]);

    const uncovered=await query<any>(`
      select distinct on (o.contact_id,o.catalog_item_id)
        o.id operation_id,o.contact_id,o.catalog_item_id,o.deal_id,o.amount_minor,o.currency,o.status,o.created_at,o.due_at,
        c.name contact_name,ci.name catalog_name,ci.billing_cycle,ci.price_minor,ci.cost_minor
      from business_operations o
      join crm_contacts c on c.id=o.contact_id
      join business_catalog_items ci on ci.id=o.catalog_item_id
      where o.workspace_id=$1
        and o.status<>'cancelled'
        and ci.active=true
        and ci.billing_cycle<>'one_time'
        and not exists (
          select 1 from recurring_rules r
          where r.workspace_id=o.workspace_id
            and r.contact_id=o.contact_id
            and r.catalog_item_id=o.catalog_item_id
            and r.active=true
        )
      order by o.contact_id,o.catalog_item_id,o.created_at desc
      limit 100
    `,[ctx.workspaceId]);

    let expected30Minor=0,dueSoonRules=0,overdueCount=0,overdueMinor=0;
    const normalizedRules=rules.map(row=>{
      const frequency=String(row.frequency) as Frequency,intervalCount=Number(row.interval_count||1);
      const occurrences=row.active?occurrencesWithin(row.next_run_at,frequency,intervalCount,30,row.ends_at):0;
      const expected=occurrences*Number(row.amount_minor||0);
      expected30Minor+=expected;
      if(row.active&&new Date(row.next_run_at).getTime()<=Date.now()+30*86400000)dueSoonRules++;
      overdueCount+=Number(row.overdue_count||0);overdueMinor+=Number(row.overdue_minor||0);
      const risk=ruleRisk(row);
      const options:RecurrenceOption[]=[];
      if(Number(row.overdue_count||0)>0){
        options.push({action:'review_receivables',label:'Revisar cobrança',reason:'Há recebimento recorrente vencido para este relacionamento.',ruleId:row.id,contactId:row.contact_id,catalogItemId:row.catalog_item_id,view:'finance'});
        options.push({action:'open_client',label:'Abrir cliente',reason:'Veja o relacionamento antes de decidir a abordagem.',ruleId:row.id,contactId:row.contact_id,catalogItemId:row.catalog_item_id,view:'crm'});
      }else if(row.active&&new Date(row.next_run_at).getTime()<=Date.now()+30*86400000){
        options.push({action:'generate_upcoming',label:'Gerar próximos recebíveis',reason:'A próxima recorrência entra na janela dos próximos 30 dias.',ruleId:row.id,contactId:row.contact_id,catalogItemId:row.catalog_item_id,view:'finance'});
        options.push({action:'open_client',label:'Ver cliente',reason:'Confira o contexto do relacionamento antes do próximo ciclo.',ruleId:row.id,contactId:row.contact_id,catalogItemId:row.catalog_item_id,view:'crm'});
      }else{
        options.push({action:'create_proposal',label:'Criar proposta de expansão',reason:'Use a oferta recorrente como base para renovar ou ampliar o relacionamento.',ruleId:row.id,contactId:row.contact_id,catalogItemId:row.catalog_item_id,view:'materials'});
        options.push({action:'open_client',label:'Ver relacionamento',reason:'Acompanhe o cliente sem esperar surgir um problema.',ruleId:row.id,contactId:row.contact_id,catalogItemId:row.catalog_item_id,view:'crm'});
      }
      return{
        ...row,
        amount_minor:Number(row.amount_minor||0),
        overdue_minor:Number(row.overdue_minor||0),
        expected_30_minor:expected,
        occurrences_30:occurrences,
        risk,
        best_options:options.slice(0,3)
      };
    });

    const normalizedUncovered=uncovered.map(row=>{
      const supported=Boolean(cycleConfig(String(row.billing_cycle||'')));
      const options:RecurrenceOption[]=supported?[
        {action:'activate_recurrence',label:'Ativar recorrência',reason:'Crie os próximos recebimentos a partir desta operação sem gerar cobranças retroativas.',operationId:row.operation_id,contactId:row.contact_id,catalogItemId:row.catalog_item_id,view:'finance'},
        {action:'create_proposal',label:'Usar em proposta',reason:'Leve a mesma oferta para uma renovação ou expansão.',operationId:row.operation_id,contactId:row.contact_id,catalogItemId:row.catalog_item_id,view:'materials'},
        {action:'open_client',label:'Abrir cliente',reason:'Revise o relacionamento antes de ativar o próximo ciclo.',operationId:row.operation_id,contactId:row.contact_id,catalogItemId:row.catalog_item_id,view:'crm'}
      ]:[
        {action:'review_catalog_cycle',label:'Ajustar recorrência',reason:'O ciclo personalizado precisa ser convertido em semanal, mensal, trimestral ou anual para automação segura.',operationId:row.operation_id,contactId:row.contact_id,catalogItemId:row.catalog_item_id,view:'finance'},
        {action:'open_client',label:'Abrir cliente',reason:'Revise o relacionamento enquanto ajusta a regra.',operationId:row.operation_id,contactId:row.contact_id,catalogItemId:row.catalog_item_id,view:'crm'}
      ];
      return{...row,amount_minor:Number(row.amount_minor||0),supported_cycle:supported,best_options:options};
    });

    const bestOptions:RecurrenceOption[]=[];
    const firstOverdue=normalizedRules.find(row=>Number(row.overdue_count)>0);
    const firstUncovered=normalizedUncovered.find(row=>row.supported_cycle);
    const firstCustom=normalizedUncovered.find(row=>!row.supported_cycle);
    if(firstOverdue)bestOptions.push({action:'review_receivables',label:'Resolver recorrência em atraso',reason:`${firstOverdue.contact_name||'Cliente'} tem ${firstOverdue.overdue_count} recebimento(s) recorrente(s) vencido(s).`,ruleId:firstOverdue.id,contactId:firstOverdue.contact_id,catalogItemId:firstOverdue.catalog_item_id,view:'finance'});
    if(firstUncovered)bestOptions.push({action:'activate_recurrence',label:'Ativar próxima recorrência',reason:`${firstUncovered.catalog_name} já foi vendido para ${firstUncovered.contact_name}, mas ainda não tem regra ativa.`,operationId:firstUncovered.operation_id,contactId:firstUncovered.contact_id,catalogItemId:firstUncovered.catalog_item_id,view:'finance'});
    if(dueSoonRules>0)bestOptions.push({action:'generate_upcoming',label:'Gerar próximos 30 dias',reason:`${dueSoonRules} regra(s) têm vencimentos dentro da próxima janela.`,view:'finance'});
    if(firstCustom)bestOptions.push({action:'review_catalog_cycle',label:'Ajustar ciclo personalizado',reason:`${firstCustom.catalog_name} precisa de um ciclo definido para entrar na automação segura.`,operationId:firstCustom.operation_id,catalogItemId:firstCustom.catalog_item_id,view:'finance'});
    if(!bestOptions.length&&normalizedRules.length)bestOptions.push({action:'create_proposal',label:'Expandir receita recorrente',reason:'As recorrências estão organizadas; use a melhor oferta ativa em uma proposta de expansão.',catalogItemId:normalizedRules[0].catalog_item_id,contactId:normalizedRules[0].contact_id,view:'materials'});

    return{
      summary:{
        activeRules:normalizedRules.filter(row=>row.active).length,
        expected30Minor,
        dueSoonRules,
        overdueCount,
        overdueMinor,
        uncoveredRelationships:normalizedUncovered.length,
        supportedUncoveredRelationships:normalizedUncovered.filter(row=>row.supported_cycle).length
      },
      rules:normalizedRules,
      uncovered:normalizedUncovered,
      bestOptions:bestOptions.slice(0,4),
      safety:{automaticExternalActions:false,retroactiveGeneration:false,generationRequiresExplicitUserAction:true}
    };
  });
}
