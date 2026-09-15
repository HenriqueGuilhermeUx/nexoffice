import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog,emitBusinessEvent,financeSummary} from './events.js';

const uuid=z.string().uuid();
const activeActionStatuses=new Set(['open','approved','executing','failed']);

type CommandAreaId='messages'|'pix'|'documents'|'fiscal'|'growth'|'agenda'|'crm';

type CommandActionSummary={
  id:string;
  agent_role:string;
  title:string;
  summary:string;
  priority:string;
  status:string;
  autonomy:string;
  approval_id?:string|null;
  primary_action?:{type?:string;payload?:unknown}|null;
  created_at:string;
};

function commandAreaFor(action:CommandActionSummary):CommandAreaId|null{
  const type=String(action.primary_action?.type||'');
  if(type.startsWith('message.send')||type==='collection.reminder.send')return 'messages';
  if(type.startsWith('payment.charge')||type.startsWith('collection.charge'))return 'pix';
  if(type.startsWith('document.'))return 'documents';
  if(type.startsWith('invoice.'))return 'fiscal';
  if(type.startsWith('campaign.')||type.startsWith('growth.')||action.agent_role==='growth')return 'growth';
  if(type.startsWith('appointment.')||type.startsWith('reminder.')||action.agent_role==='secretary')return 'agenda';
  if(type.startsWith('lead.')||type.startsWith('deal.')||action.agent_role==='crm')return 'crm';
  return null;
}

export async function registerCommandRoutes(app:FastifyInstance){
  app.post('/v1/events',async req=>{const ctx=await workspaceContext(req,'command.read'),input=z.object({type:z.string().min(3),source:z.string().default('api'),subjectType:z.string().optional().nullable(),subjectId:uuid.optional().nullable(),payload:z.record(z.string(),z.unknown()).default({}),correlationId:z.string().optional().nullable()}).parse(req.body);return emitBusinessEvent(ctx.workspaceId,input.type,input.source,input.subjectType||null,input.subjectId||null,input.payload,input.correlationId||null)});
  app.get('/v1/command/actions',async req=>{const ctx=await workspaceContext(req,'command.read'),includeDone=String((req.query as any)?.includeDone||'false')==='true';return query<any>(`select * from command_actions where workspace_id=$1 and ($2::boolean or status not in ('done','dismissed','rejected')) order by case priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,created_at desc limit 300`,[ctx.workspaceId,includeDone])});

  app.get('/v1/command/overview',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const [actions,approvals,documents,collections,agenda,crm,outbox]=await Promise.all([
      query<CommandActionSummary>(`select id,agent_role,title,summary,priority,status,autonomy,approval_id,primary_action,created_at from command_actions where workspace_id=$1 and status in ('open','approved','executing','failed') order by case priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,created_at desc limit 300`,[ctx.workspaceId]),
      query<any>(`select count(*)::int pending from approval_requests where workspace_id=$1 and status='pending'`,[ctx.workspaceId]),
      query<any>(`select count(*)::int attention,count(*) filter(where sync_error is not null)::int sync_errors from document_refs where workspace_id=$1 and (sync_error is not null or intelligence_status in ('queued','processing','failed') or signature_status in ('queued','requested','failed'))`,[ctx.workspaceId]),
      query<any>(`select count(*) filter(where direction='income' and (status='overdue' or (status='open' and due_at<now())))::int overdue_count,coalesce(sum(amount_minor) filter(where direction='income' and (status='overdue' or (status='open' and due_at<now()))),0)::bigint overdue_minor from ledger_entries where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*) filter(where status<>'cancelled' and starts_at>=date_trunc('day',now()) and starts_at<date_trunc('day',now())+interval '1 day')::int today_appointments,(select count(*)::int from tasks where workspace_id=$1 and status in ('todo','doing') and due_at<=now()+interval '24 hours') due_tasks from appointments where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*) filter(where stage not in ('won','lost'))::int open_deals,count(*) filter(where stage not in ('won','lost') and updated_at<now()-interval '2 days')::int stale_deals,coalesce(sum(value_minor) filter(where stage not in ('won','lost')),0)::bigint open_pipeline_minor from crm_deals where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select topic,status,count(*)::int count from outbox_messages where workspace_id=$1 and status in ('pending','processing','failed','dead') group by topic,status`,[ctx.workspaceId])
    ]);

    const grouped:Record<CommandAreaId,CommandActionSummary[]>={messages:[],pix:[],documents:[],fiscal:[],growth:[],agenda:[],crm:[]};
    for(const action of actions){if(!activeActionStatuses.has(action.status))continue;const area=commandAreaFor(action);if(area)grouped[area].push(action)}
    const outboxRows=outbox as Array<{topic:string;status:string;count:number}>;
    const outboxCount=(topic:string,statuses:string[])=>outboxRows.filter(row=>row.topic===topic&&statuses.includes(row.status)).reduce((sum,row)=>sum+Number(row.count||0),0);
    const failed=(topic:string)=>outboxCount(topic,['failed','dead']);
    const queued=(topic:string)=>outboxCount(topic,['pending','processing']);
    const pendingApprovals=Number(approvals[0]?.pending||0);
    const top=(id:CommandAreaId)=>grouped[id].slice(0,3).map(action=>({id:action.id,title:action.title,summary:action.summary,priority:action.priority,status:action.status,autonomy:action.autonomy,approvalId:action.approval_id||null,actionType:String(action.primary_action?.type||'')}));
    const actionStats=(id:CommandAreaId)=>({openActions:grouped[id].filter(a=>a.status==='open'||a.status==='approved'||a.status==='executing').length,failedActions:grouped[id].filter(a=>a.status==='failed').length,pendingApprovals:grouped[id].filter(a=>a.approval_id&&a.status==='open').length});
    const documentAttention=Number(documents[0]?.attention||0),documentSyncErrors=Number(documents[0]?.sync_errors||0);
    const overdueCount=Number(collections[0]?.overdue_count||0),overdueMinor=Number(collections[0]?.overdue_minor||0);
    const todayAppointments=Number(agenda[0]?.today_appointments||0),dueTasks=Number(agenda[0]?.due_tasks||0);
    const openDeals=Number(crm[0]?.open_deals||0),staleDeals=Number(crm[0]?.stale_deals||0),openPipelineMinor=Number(crm[0]?.open_pipeline_minor||0);

    return {
      generatedAt:new Date().toISOString(),
      pendingApprovals,
      areas:[
        {id:'approvals',label:'Aprovações',attention:pendingApprovals,detail:pendingApprovals?`${pendingApprovals} decisão(ões) aguardando ação humana`:'Nenhuma decisão aguardando aprovação',metrics:{pending:pendingApprovals}},
        {id:'messages',label:'Mensagens',attention:grouped.messages.length+failed('smartbots.message.send'),detail:failed('smartbots.message.send')?`${failed('smartbots.message.send')} envio(s) com falha`:`${grouped.messages.length} ação(ões) de comunicação`,metrics:{...actionStats('messages'),queuedOutbound:queued('smartbots.message.send'),failedOutbound:failed('smartbots.message.send')},actions:top('messages')},
        {id:'pix',label:'Pix',attention:grouped.pix.length+failed('nextgen.charge.create'),detail:failed('nextgen.charge.create')?`${failed('nextgen.charge.create')} cobrança(s) exigem revisão`:`${overdueCount} recebível(is) vencido(s)`,metrics:{...actionStats('pix'),overdueCount,overdueMinor,queuedOutbound:queued('nextgen.charge.create'),failedOutbound:failed('nextgen.charge.create')},actions:top('pix')},
        {id:'documents',label:'Documentos',attention:Math.max(grouped.documents.length,documentAttention)+failed('docwallet.document.action'),detail:documentSyncErrors?`${documentSyncErrors} erro(s) de sincronização`:`${documentAttention} documento(s) em processamento`,metrics:{...actionStats('documents'),documentAttention,documentSyncErrors,queuedOutbound:queued('docwallet.document.action'),failedOutbound:failed('docwallet.document.action')},actions:top('documents')},
        {id:'fiscal',label:'Fiscal',attention:grouped.fiscal.length+failed('taxagent.invoice.issue'),detail:failed('taxagent.invoice.issue')?`${failed('taxagent.invoice.issue')} operação(ões) fiscais com falha`:`${grouped.fiscal.length} ação(ões) fiscais`,metrics:{...actionStats('fiscal'),queuedOutbound:queued('taxagent.invoice.issue'),failedOutbound:failed('taxagent.invoice.issue')},actions:top('fiscal')},
        {id:'growth',label:'Growth',attention:grouped.growth.length+failed('modo.growth.action'),detail:`${grouped.growth.length} oportunidade(s)/plano(s)`,metrics:{...actionStats('growth'),queuedOutbound:queued('modo.growth.action'),failedOutbound:failed('modo.growth.action')},actions:top('growth')},
        {id:'agenda',label:'Agenda',attention:grouped.agenda.length+dueTasks,detail:`${todayAppointments} compromisso(s) hoje · ${dueTasks} tarefa(s) próximas`,metrics:{...actionStats('agenda'),todayAppointments,dueTasks},actions:top('agenda')},
        {id:'crm',label:'CRM',attention:grouped.crm.length+staleDeals,detail:`${openDeals} oportunidade(s) abertas · ${staleDeals} sem atividade recente`,metrics:{...actionStats('crm'),openDeals,staleDeals,openPipelineMinor},actions:top('crm')}
      ]
    };
  });

  app.post('/v1/command/actions/:id/decision',async req=>{const ctx=await workspaceContext(req,'command.decide'),id=uuid.parse((req.params as any).id),input=z.object({decision:z.enum(['approved','rejected','dismissed'])}).parse(req.body),before=(await query<any>(`select * from command_actions where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];if(!before)throw new ApiError(404,'not_found','Ação não encontrada.');if(before.approval_id&&input.decision!=='dismissed')await query(`update approval_requests set status=$3,decided_by=$4,decided_at=now() where id=$1 and workspace_id=$2 and status='pending'`,[before.approval_id,ctx.workspaceId,input.decision,ctx.user.id]);const status=input.decision==='dismissed'?'dismissed':input.decision;const rows=await query<any>(`update command_actions set status=$3,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId,status]);await auditLog(ctx,'command.decision','command_action',id,before,rows[0],{decision:input.decision});return rows[0]});
  app.get('/v1/approvals',async req=>{const ctx=await workspaceContext(req,'command.read');return query<any>(`select * from approval_requests where workspace_id=$1 and status='pending' order by created_at desc limit 200`,[ctx.workspaceId])});
  app.post('/v1/approvals/:id/decision',async req=>{const ctx=await workspaceContext(req,'command.decide'),id=uuid.parse((req.params as any).id),input=z.object({decision:z.enum(['approved','rejected'])}).parse(req.body);const rows=await query<any>(`update approval_requests set status=$3,decided_by=$4,decided_at=now() where workspace_id=$1 and id=$2 and status='pending' returning *`,[ctx.workspaceId,id,input.decision,ctx.user.id]);if(rows.length)await query(`update command_actions set status=$3,updated_at=now() where workspace_id=$1 and approval_id=$2`,[ctx.workspaceId,id,input.decision]);if(!rows.length)throw new ApiError(404,'not_found_or_decided','Aprovação não encontrada ou já decidida.');await auditLog(ctx,'approval.decided','approval_request',id,null,rows[0],{decision:input.decision});return rows[0]});
  app.get('/v1/autonomy-policies',async req=>{const ctx=await workspaceContext(req,'command.read');return query<any>(`select * from autonomy_policies where workspace_id=$1 order by action_type`,[ctx.workspaceId])});
  app.put('/v1/autonomy-policies/:actionType',async req=>{const ctx=await workspaceContext(req,'autonomy.manage'),actionType=decodeURIComponent(String((req.params as any).actionType)),input=z.object({mode:z.enum(['automatic','notify','approval_required']),maxAmountMinor:z.number().int().nonnegative().optional().nullable(),allowedChannels:z.array(z.string()).optional().nullable(),conditions:z.record(z.string(),z.unknown()).default({})}).parse(req.body),before=(await query<any>(`select * from autonomy_policies where workspace_id=$1 and action_type=$2`,[ctx.workspaceId,actionType]))[0]||null;const rows=await query<any>(`insert into autonomy_policies(workspace_id,action_type,mode,max_amount_minor,allowed_channels,conditions) values($1,$2,$3,$4,$5,$6) on conflict(workspace_id,action_type) do update set mode=excluded.mode,max_amount_minor=excluded.max_amount_minor,allowed_channels=excluded.allowed_channels,conditions=excluded.conditions,updated_at=now() returning *`,[ctx.workspaceId,actionType,input.mode,input.maxAmountMinor||null,input.allowedChannels||null,JSON.stringify(input.conditions)]);await auditLog(ctx,'autonomy.updated','autonomy_policy',rows[0].id,before,rows[0]);return rows[0]});
  app.get('/v1/audit',async req=>{const ctx=await workspaceContext(req,'workspace.manage');return query<any>(`select * from audit_log where workspace_id=$1 order by occurred_at desc limit 500`,[ctx.workspaceId])});
  app.get('/v1/integrations',async req=>{const ctx=await workspaceContext(req,'integrations.read');return query<any>(`select id,provider,status,external_account_ref,capabilities,config,connected_at,last_health_at,last_health_status,last_error,updated_at from integrations where workspace_id=$1 order by provider`,[ctx.workspaceId])});
  app.post('/v1/usage',async req=>{const ctx=await workspaceContext(req,'usage.read'),input=z.object({capability:z.string(),operation:z.string(),units:z.number().nonnegative(),unitName:z.string(),provider:z.string().optional().nullable(),costMinorEstimate:z.number().int().nonnegative().optional().nullable(),currency:z.string().length(3).default('BRL'),metadata:z.record(z.string(),z.unknown()).default({})}).parse(req.body);const rows=await query<any>(`insert into usage_events(workspace_id,capability,operation,units,unit_name,provider,cost_minor_estimate,currency,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[ctx.workspaceId,input.capability,input.operation,input.units,input.unitName,input.provider||null,input.costMinorEstimate||null,input.currency,JSON.stringify(input.metadata)]);return rows[0]});
  app.get('/v1/usage/monthly',async req=>{const ctx=await workspaceContext(req,'usage.read');return query<any>(`select capability,provider,sum(units)::float units,max(unit_name) unit_name,coalesce(sum(cost_minor_estimate),0)::bigint cost_minor from usage_events where workspace_id=$1 and occurred_at>=date_trunc('month',now()) group by capability,provider order by cost_minor desc,capability`,[ctx.workspaceId])});
  app.get('/v1/dashboard',async req=>{const ctx=await workspaceContext(req,'workspace.read');const [crm,finance,actions,approvals,tasks,appointments,usage]=await Promise.all([query<any>(`select count(*)::int deals,count(*) filter(where stage not in ('won','lost'))::int open_deals,coalesce(sum(value_minor) filter(where stage not in ('won','lost')),0)::bigint open_pipeline_minor,count(*) filter(where stage='won' and updated_at>=date_trunc('month',now()))::int won_month from crm_deals where workspace_id=$1`,[ctx.workspaceId]),financeSummary(ctx.workspaceId),query<any>(`select count(*)::int open_actions from command_actions where workspace_id=$1 and status in ('open','approved','executing')`,[ctx.workspaceId]),query<any>(`select count(*)::int pending_approvals from approval_requests where workspace_id=$1 and status='pending'`,[ctx.workspaceId]),query<any>(`select count(*)::int due_tasks from tasks where workspace_id=$1 and status in ('todo','doing') and due_at<=now()+interval '24 hours'`,[ctx.workspaceId]),query<any>(`select count(*)::int today_appointments from appointments where workspace_id=$1 and starts_at>=date_trunc('day',now()) and starts_at<date_trunc('day',now())+interval '1 day' and status<>'cancelled'`,[ctx.workspaceId]),query<any>(`select capability,sum(units)::float units,coalesce(sum(cost_minor_estimate),0)::bigint cost_minor from usage_events where workspace_id=$1 and occurred_at>=date_trunc('month',now()) group by capability order by cost_minor desc`,[ctx.workspaceId])]);return {workspace:{id:ctx.workspaceId,name:ctx.workspaceName,role:ctx.role},crm:crm[0],finance,command:actions[0],approvals:approvals[0],tasks:tasks[0],appointments:appointments[0],usage}});
}
