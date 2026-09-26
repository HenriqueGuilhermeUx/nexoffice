import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog,emitBusinessEvent} from './events.js';
import {nextgenFinancialActionsEnabled,nextgenFinancialConfigured,nextgenFinancialRequest} from './nextgen-financial-adapter.js';

const uuid=z.string().uuid();
const confirm=z.object({humanConfirmed:z.literal(true)}).strict();

type ChargeResult={success:boolean;created?:boolean;duplicate?:boolean;correlationId:string;status:string;provider?:string;charge?:any;externalEffect:boolean};
type SubscriptionResult={success:boolean;created?:boolean;duplicate?:boolean;correlationId:string;status:string;provider?:string;subscription?:any;externalEffect:boolean};

function safeCharge(value:any){return value?{id:String(value.id||''),identifier:String(value.identifier||''),correlationID:String(value.correlationID||''),status:String(value.status||''),value:Number(value.value||0),brCode:typeof value.brCode==='string'?value.brCode:null,qrCodeImage:typeof value.qrCodeImage==='string'?value.qrCodeImage:null,paymentLinkUrl:typeof value.paymentLinkUrl==='string'?value.paymentLinkUrl:null,createdAt:value.createdAt||null,paidAt:value.paidAt||null}:null}
function safeSubscription(value:any){return value?{id:String(value.id||''),status:String(value.status||''),value:Number(value.value||0),dayGenerateCharge:Number(value.dayGenerateCharge||0)||null,periodicity:value.periodicity||null,correlationID:value.correlationID||null,createdAt:value.createdAt||null,updatedAt:value.updatedAt||null}:null}
function correlation(workspaceId:string,kind:string,id:string){return `nexoffice:${workspaceId}:${kind}:${id}`}

async function approvedAction(workspaceId:string,actionId:string,expectedType:string){
  const action=(await query<any>(`select a.*,r.status approval_status from command_actions a left join approval_requests r on r.id=a.approval_id where a.id=$1 and a.workspace_id=$2`,[actionId,workspaceId]))[0];
  if(!action)throw new ApiError(404,'command_action_not_found','Ação financeira não encontrada.');
  const type=String(action.primary_action?.type||'');
  if(type!==expectedType)throw new ApiError(409,'command_action_type_mismatch','Esta ação não corresponde à operação financeira solicitada.');
  if(action.autonomy!=='approval_required'||action.status!=='approved'||(action.approval_id&&action.approval_status!=='approved'))throw new ApiError(409,'financial_action_not_approved','A operação financeira precisa estar explicitamente aprovada antes da execução.');
  return action;
}

async function operationByCorrelation(workspaceId:string,correlationId:string){return (await query<any>(`select * from financial_provider_operations where workspace_id=$1 and correlation_id=$2`,[workspaceId,correlationId]))[0]||null}

export async function registerFinancialEngineRoutes(app:FastifyInstance){
  app.get('/v1/collections/payment-engine',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    if(!nextgenFinancialConfigured())return{configured:false,actionsEnabled:false,provider:'financial_engine',capabilities:[],externalEffect:false};
    try{
      const health=await nextgenFinancialRequest<any>(ctx.workspaceId,'/health');
      return{configured:true,actionsEnabled:nextgenFinancialActionsEnabled()&&Boolean(health.actionsEnabled),provider:'financial_engine',capabilities:Array.isArray(health.capabilities)?health.capabilities:[],requiresHumanApproval:true,openFinanceRead:false,externalEffect:false};
    }catch{return{configured:true,actionsEnabled:false,provider:'financial_engine',capabilities:[],degraded:true,requiresHumanApproval:true,openFinanceRead:false,externalEffect:false}}
  });

  app.post('/v1/collections/actions/:actionId/execute-charge',async req=>{
    const ctx=await workspaceContext(req,'finance.write'),actionId=uuid.parse((req.params as any).actionId);confirm.parse(req.body||{});
    if(!nextgenFinancialActionsEnabled())throw new ApiError(409,'financial_actions_disabled','A criação de cobranças Pix ainda não está habilitada neste ambiente.');
    const action=await approvedAction(ctx.workspaceId,actionId,'payment.charge.create');
    const payload=action.primary_action?.payload||{};
    const ledgerId=uuid.parse(String(payload.ledgerEntryId||action.subject_id||''));
    const ledger=(await query<any>(`select l.*,c.name contact_name,c.email contact_email,c.phone contact_phone,c.document_number from ledger_entries l left join crm_contacts c on c.id=l.contact_id where l.id=$1 and l.workspace_id=$2 and l.direction='income'`,[ledgerId,ctx.workspaceId]))[0];
    if(!ledger)throw new ApiError(404,'receivable_not_found','Recebível não encontrado.');
    if(ledger.status==='paid')throw new ApiError(409,'already_paid','Este recebível já foi pago.');
    const key=correlation(ctx.workspaceId,'charge',actionId);
    const existing=await operationByCorrelation(ctx.workspaceId,key);
    if(existing&&['CREATED','PAID','EXPIRED','CANCELED'].includes(String(existing.provider_status)))return{operation:existing,charge:existing.receipt,duplicate:true,externalEffect:false};
    const result=await nextgenFinancialRequest<ChargeResult>(ctx.workspaceId,'/charges',{method:'POST',body:JSON.stringify({correlationId:key,commandActionId:actionId,approvalId:action.approval_id||null,humanApproved:true,amountMinor:Number(ledger.amount_minor),description:String(ledger.description||'Cobrança NexOffice'),customer:{name:ledger.contact_name||undefined,email:ledger.contact_email||undefined,phone:ledger.contact_phone||undefined,taxID:ledger.document_number||undefined}})},key);
    const charge=safeCharge(result.charge);
    const operation=(await query<any>(`insert into financial_provider_operations(workspace_id,ledger_entry_id,command_action_id,approval_id,operation_type,provider,correlation_id,provider_status,amount_minor,external_ref,receipt,metadata) values($1,$2,$3,$4,'pix_charge','nextgen',$5,$6,$7,$8,$9,$10) on conflict(workspace_id,correlation_id) do update set provider_status=excluded.provider_status,external_ref=excluded.external_ref,receipt=excluded.receipt,updated_at=now() returning *`,[ctx.workspaceId,ledgerId,actionId,action.approval_id||null,key,String(result.status||'CREATED'),Number(ledger.amount_minor),charge?.id||null,JSON.stringify(charge||{}),JSON.stringify({providerEngine:'nextgen',humanConfirmed:true})]))[0];
    await query(`update command_actions set status='done',updated_at=now(),metadata=metadata||$3::jsonb where id=$1 and workspace_id=$2`,[actionId,ctx.workspaceId,JSON.stringify({financialProviderOperationId:operation.id,providerStatus:operation.provider_status})]);
    await query(`update ledger_entries set external_ref=coalesce(external_ref,$3),metadata=metadata||$4::jsonb,updated_at=now() where id=$1 and workspace_id=$2`,[ledgerId,ctx.workspaceId,key,JSON.stringify({pixChargeOperationId:operation.id,pixChargeStatus:operation.provider_status,pixChargeProvider:'nextgen'})]);
    await auditLog(ctx,'collections.pix_charge.created','ledger_entry',ledgerId,null,{operationId:operation.id,commandActionId:actionId,amountMinor:Number(ledger.amount_minor),providerStatus:operation.provider_status,humanConfirmed:true,externalEffect:true});
    return{operation,charge,duplicate:Boolean(result.duplicate),externalEffect:Boolean(result.externalEffect)};
  });

  app.get('/v1/collections/ledger/:id/charge',async req=>{
    const ctx=await workspaceContext(req,'finance.read'),id=uuid.parse((req.params as any).id);
    const operation=(await query<any>(`select * from financial_provider_operations where workspace_id=$1 and ledger_entry_id=$2 and operation_type='pix_charge' order by created_at desc limit 1`,[ctx.workspaceId,id]))[0];
    if(!operation)return{configured:nextgenFinancialConfigured(),operation:null,externalEffect:false};
    return{configured:true,operation:{...operation,receipt:safeCharge(operation.receipt)},externalEffect:false};
  });

  app.post('/v1/collections/ledger/:id/reconcile-charge',async req=>{
    const ctx=await workspaceContext(req,'finance.write'),id=uuid.parse((req.params as any).id);
    const operation=(await query<any>(`select * from financial_provider_operations where workspace_id=$1 and ledger_entry_id=$2 and operation_type='pix_charge' order by created_at desc limit 1`,[ctx.workspaceId,id]))[0];
    if(!operation)throw new ApiError(404,'pix_charge_not_found','Este recebível ainda não possui uma cobrança Pix gerada pelo motor financeiro.');
    const provider=await nextgenFinancialRequest<any>(ctx.workspaceId,`/charges/${encodeURIComponent(operation.correlation_id)}/reconcile`,{method:'POST',body:'{}'});
    const charge=safeCharge(provider.charge),status=String(provider.status||operation.provider_status);
    let becamePaid=false;
    await transaction(async client=>{
      await client.query(`update financial_provider_operations set provider_status=$3,external_ref=coalesce($4,external_ref),receipt=$5::jsonb,updated_at=now() where id=$1 and workspace_id=$2`,[operation.id,ctx.workspaceId,status,charge?.id||null,JSON.stringify(charge||{})]);
      if(status==='PAID'){
        const rows=await client.query(`update ledger_entries set status='paid',paid_at=coalesce(paid_at,$3::timestamptz,now()),metadata=metadata||$4::jsonb,updated_at=now() where id=$1 and workspace_id=$2 and status<>'paid' returning id`,[id,ctx.workspaceId,charge?.paidAt||null,JSON.stringify({reconciled:true,reconciliationProvider:'nextgen',financialProviderOperationId:operation.id,pixChargeStatus:'PAID'})]);
        becamePaid=Boolean(rows.rowCount);
      }else await client.query(`update ledger_entries set metadata=metadata||$3::jsonb,updated_at=now() where id=$1 and workspace_id=$2`,[id,ctx.workspaceId,JSON.stringify({pixChargeStatus:status})]);
    });
    if(becamePaid)await emitBusinessEvent(ctx.workspaceId,'payment.received','nexoffice.financial-engine','ledger_entry',id,{amountMinor:Number(operation.amount_minor),financialProviderOperationId:operation.id,provider:'nextgen'});
    await auditLog(ctx,'collections.pix_charge.reconciled','ledger_entry',id,null,{operationId:operation.id,status,becamePaid,externalFinancialEffect:false});
    return{operationId:operation.id,status,charge,ledgerMarkedPaid:becamePaid,externalEffect:false};
  });

  app.post('/v1/collections/recurring-rules/:id/prepare-pix-recurring',async req=>{
    const ctx=await workspaceContext(req,'finance.write'),id=uuid.parse((req.params as any).id);
    const rule=(await query<any>(`select r.*,c.name contact_name,c.email contact_email,c.phone contact_phone,c.document_number from recurring_rules r left join crm_contacts c on c.id=r.contact_id where r.id=$1 and r.workspace_id=$2 and r.direction='income'`,[id,ctx.workspaceId]))[0];
    if(!rule)throw new ApiError(404,'recurring_rule_not_found','Regra recorrente de recebimento não encontrada.');
    if(!['weekly','monthly'].includes(String(rule.frequency))||Number(rule.interval_count)!==1)throw new ApiError(409,'recurrence_not_supported','Pix recorrente V1 aceita apenas recorrência semanal ou mensal com intervalo 1.');
    if(!rule.contact_name||!rule.document_number)throw new ApiError(409,'customer_identity_required','O cliente precisa ter nome e CPF/CNPJ no CRM para preparar Pix recorrente.');
    const day=new Date(rule.next_run_at).getUTCDate();
    if(day>27)throw new ApiError(409,'recurring_day_not_supported','Para Pix recorrente V1, escolha um dia entre 1 e 27.');
    return emitBusinessEvent(ctx.workspaceId,'payment.recurring.create','nexoffice.collections','recurring_rule',id,{recurringRuleId:id,amountMinor:Number(rule.amount_minor),frequency:rule.frequency,dayGenerateCharge:day,customer:{name:rule.contact_name,email:rule.contact_email,phone:rule.contact_phone,taxID:rule.document_number}});
  });

  app.post('/v1/collections/actions/:actionId/execute-recurring',async req=>{
    const ctx=await workspaceContext(req,'finance.write'),actionId=uuid.parse((req.params as any).actionId);confirm.parse(req.body||{});
    if(!nextgenFinancialActionsEnabled())throw new ApiError(409,'financial_actions_disabled','Pix recorrente ainda não está habilitado neste ambiente.');
    const action=await approvedAction(ctx.workspaceId,actionId,'payment.recurring.create');
    const p=action.primary_action?.payload||{},ruleId=uuid.parse(String(p.recurringRuleId||action.subject_id||''));
    const rule=(await query<any>(`select r.*,c.name contact_name,c.email contact_email,c.phone contact_phone,c.document_number from recurring_rules r left join crm_contacts c on c.id=r.contact_id where r.id=$1 and r.workspace_id=$2`,[ruleId,ctx.workspaceId]))[0];
    if(!rule)throw new ApiError(404,'recurring_rule_not_found','Regra recorrente não encontrada.');
    const key=correlation(ctx.workspaceId,'recurring',actionId),existing=await operationByCorrelation(ctx.workspaceId,key);
    if(existing&&['ACTIVE','CREATED','CANCELED'].includes(String(existing.provider_status)))return{operation:existing,subscription:existing.receipt,duplicate:true,externalEffect:false};
    const day=Number(p.dayGenerateCharge||new Date(rule.next_run_at).getUTCDate());
    const result=await nextgenFinancialRequest<SubscriptionResult>(ctx.workspaceId,'/subscriptions',{method:'POST',body:JSON.stringify({correlationId:key,commandActionId:actionId,approvalId:action.approval_id||null,humanApproved:true,amountMinor:Number(rule.amount_minor),dayGenerateCharge:day,periodicity:String(rule.frequency)==='weekly'?'WEEKLY':'MONTHLY',customer:{name:rule.contact_name,email:rule.contact_email,phone:rule.contact_phone,taxID:rule.document_number}})},key);
    const subscription=safeSubscription(result.subscription);
    const operation=(await query<any>(`insert into financial_provider_operations(workspace_id,recurring_rule_id,command_action_id,approval_id,operation_type,provider,correlation_id,provider_status,amount_minor,external_ref,receipt,metadata) values($1,$2,$3,$4,'pix_recurring','nextgen',$5,$6,$7,$8,$9,$10) on conflict(workspace_id,correlation_id) do update set provider_status=excluded.provider_status,external_ref=excluded.external_ref,receipt=excluded.receipt,updated_at=now() returning *`,[ctx.workspaceId,ruleId,actionId,action.approval_id||null,key,String(result.status||'ACTIVE'),Number(rule.amount_minor),subscription?.id||null,JSON.stringify(subscription||{}),JSON.stringify({humanConfirmed:true})]))[0];
    await query(`update recurring_rules set metadata=metadata||$3::jsonb,updated_at=now() where id=$1 and workspace_id=$2`,[ruleId,ctx.workspaceId,JSON.stringify({pixRecurringOperationId:operation.id,pixRecurringStatus:operation.provider_status})]);
    await query(`update command_actions set status='done',updated_at=now(),metadata=metadata||$3::jsonb where id=$1 and workspace_id=$2`,[actionId,ctx.workspaceId,JSON.stringify({financialProviderOperationId:operation.id})]);
    await auditLog(ctx,'collections.pix_recurring.created','recurring_rule',ruleId,null,{operationId:operation.id,commandActionId:actionId,humanConfirmed:true,externalEffect:true});
    return{operation,subscription,duplicate:Boolean(result.duplicate),externalEffect:Boolean(result.externalEffect)};
  });

  app.get('/v1/collections/recurring',async req=>{
    const ctx=await workspaceContext(req,'finance.read');
    return query<any>(`select o.*,r.description,r.frequency,r.next_run_at,c.name contact_name from financial_provider_operations o left join recurring_rules r on r.id=o.recurring_rule_id left join crm_contacts c on c.id=r.contact_id where o.workspace_id=$1 and o.operation_type='pix_recurring' order by o.created_at desc limit 200`,[ctx.workspaceId]);
  });

  app.post('/v1/collections/recurring/:operationId/prepare-cancel',async req=>{
    const ctx=await workspaceContext(req,'finance.write'),operationId=uuid.parse((req.params as any).operationId);
    const operation=(await query<any>(`select * from financial_provider_operations where id=$1 and workspace_id=$2 and operation_type='pix_recurring'`,[operationId,ctx.workspaceId]))[0];
    if(!operation)throw new ApiError(404,'recurring_operation_not_found','Recorrência Pix não encontrada.');
    if(operation.provider_status==='CANCELED')throw new ApiError(409,'already_canceled','Esta recorrência já foi cancelada.');
    return emitBusinessEvent(ctx.workspaceId,'payment.recurring.cancel','nexoffice.collections','recurring_rule',operation.recurring_rule_id,{financialProviderOperationId:operation.id,correlationId:operation.correlation_id,amountMinor:Number(operation.amount_minor)});
  });

  app.post('/v1/collections/actions/:actionId/execute-recurring-cancel',async req=>{
    const ctx=await workspaceContext(req,'finance.write'),actionId=uuid.parse((req.params as any).actionId);confirm.parse(req.body||{});
    if(!nextgenFinancialActionsEnabled())throw new ApiError(409,'financial_actions_disabled','Ações financeiras ainda não estão habilitadas neste ambiente.');
    const action=await approvedAction(ctx.workspaceId,actionId,'payment.recurring.cancel'),p=action.primary_action?.payload||{};
    const operationId=uuid.parse(String(p.financialProviderOperationId||''));
    const operation=(await query<any>(`select * from financial_provider_operations where id=$1 and workspace_id=$2 and operation_type='pix_recurring'`,[operationId,ctx.workspaceId]))[0];
    if(!operation)throw new ApiError(404,'recurring_operation_not_found','Recorrência Pix não encontrada.');
    const result=await nextgenFinancialRequest<any>(ctx.workspaceId,`/subscriptions/${encodeURIComponent(operation.correlation_id)}/cancel`,{method:'POST',body:JSON.stringify({humanApproved:true,approvalId:action.approval_id||null})});
    await query(`update financial_provider_operations set provider_status='CANCELED',updated_at=now() where id=$1 and workspace_id=$2`,[operationId,ctx.workspaceId]);
    await query(`update recurring_rules set metadata=metadata||$3::jsonb,updated_at=now() where id=$1 and workspace_id=$2`,[operation.recurring_rule_id,ctx.workspaceId,JSON.stringify({pixRecurringStatus:'CANCELED'})]);
    await query(`update command_actions set status='done',updated_at=now() where id=$1 and workspace_id=$2`,[actionId,ctx.workspaceId]);
    await auditLog(ctx,'collections.pix_recurring.cancelled','recurring_rule',operation.recurring_rule_id,null,{operationId,humanConfirmed:true,externalEffect:true});
    return{operationId,status:'CANCELED',duplicate:Boolean(result.duplicate),externalEffect:Boolean(result.externalEffect)};
  });
}
