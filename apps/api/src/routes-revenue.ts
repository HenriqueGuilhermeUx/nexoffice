import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog} from './events.js';
import {externalActionGate} from './integration-runtime.js';

const inputSchema=z.object({contactId:z.string().uuid(),message:z.string().trim().min(1).max(2000),channel:z.literal('whatsapp').default('whatsapp')}).strict();
const digits=(value:unknown)=>String(value||'').replace(/\D/g,'');
const asNumber=(value:unknown)=>Number(value||0);

export async function registerRevenueRoutes(app:FastifyInstance){
  app.get('/v1/revenue/overview',async req=>{
    const ctx=await workspaceContext(req,'crm.read');
    const [crmRow]=await query<any>(`select
      count(*) filter(where stage not in ('won','lost'))::int open_opportunities,
      coalesce(sum(value_minor) filter(where stage not in ('won','lost')),0)::bigint open_pipeline_minor,
      count(*) filter(where metadata->>'marketingProjectId' is not null or coalesce(source,'') like 'growth:%')::int modo_opportunities,
      count(*) filter(where stage='won' and (metadata->>'marketingProjectId' is not null or coalesce(source,'') like 'growth:%'))::int modo_customers,
      coalesce(sum(value_minor) filter(where stage='won' and (metadata->>'marketingProjectId' is not null or coalesce(source,'') like 'growth:%')),0)::bigint modo_won_value_minor,
      count(*) filter(where stage not in ('won','lost') and updated_at<now()-interval '3 days')::int stalled_opportunities,
      coalesce(sum(value_minor) filter(where stage not in ('won','lost') and updated_at<now()-interval '3 days'),0)::bigint stalled_value_minor,
      count(*) filter(where stage not in ('won','lost') and coalesce(next_action,'')='')::int no_next_action
      from crm_deals where workspace_id=$1`,[ctx.workspaceId]);
    const [followupRow]=await query<any>(`select
      count(*)::int prepared,
      count(*) filter(where status='open')::int pending,
      count(*) filter(where status in ('approved','executing','done'))::int approved_or_executed,
      count(*) filter(where status='done')::int done
      from command_actions
      where workspace_id=$1 and metadata->>'source'='revenue-center' and metadata->>'provider'='smartbots'`,[ctx.workspaceId]);
    const projects=await query<any>(`select
      coalesce(nullif(metadata->>'marketingProjectId',''),nullif(split_part(coalesce(source,''),':',2),'')) project_id,
      count(*)::int opportunities,
      count(*) filter(where stage in ('qualified','meeting','proposal','won'))::int progressed,
      count(*) filter(where stage='won')::int customers,
      coalesce(sum(value_minor) filter(where stage='won'),0)::bigint won_value_minor
      from crm_deals
      where workspace_id=$1 and (metadata->>'marketingProjectId' is not null or coalesce(source,'') like 'growth:%')
      group by 1 order by coalesce(sum(value_minor) filter(where stage='won'),0) desc,count(*) desc limit 20`,[ctx.workspaceId]);
    const stalled=await query<any>(`select d.id,d.title,d.stage,d.value_minor,d.next_action,d.updated_at,d.contact_id,c.name contact_name,c.phone contact_phone
      from crm_deals d left join crm_contacts c on c.id=d.contact_id and c.workspace_id=d.workspace_id
      where d.workspace_id=$1 and d.stage not in ('won','lost') and d.updated_at<now()-interval '3 days'
      order by d.value_minor desc,d.updated_at asc limit 8`,[ctx.workspaceId]);
    const gate=externalActionGate('smartbots.message.send');
    const metrics={
      openOpportunities:asNumber(crmRow?.open_opportunities),openPipelineMinor:asNumber(crmRow?.open_pipeline_minor),
      modoOpportunities:asNumber(crmRow?.modo_opportunities),modoCustomers:asNumber(crmRow?.modo_customers),modoWonValueMinor:asNumber(crmRow?.modo_won_value_minor),
      stalledOpportunities:asNumber(crmRow?.stalled_opportunities),stalledValueMinor:asNumber(crmRow?.stalled_value_minor),noNextAction:asNumber(crmRow?.no_next_action),
      followupsPrepared:asNumber(followupRow?.prepared),followupsPending:asNumber(followupRow?.pending),followupsApprovedOrExecuted:asNumber(followupRow?.approved_or_executed),followupsDone:asNumber(followupRow?.done)
    };
    const moneyNow:Array<Record<string,unknown>>=[];
    if(metrics.stalledOpportunities>0)moneyNow.push({kind:'stalled_pipeline',priority:'high',title:`${metrics.stalledOpportunities} oportunidade(s) estão paradas há mais de 3 dias`,potentialMinor:metrics.stalledValueMinor,action:'followup',reason:'Receita potencial já existente no pipeline merece contato antes de criar mais demanda.'});
    if(metrics.noNextAction>0)moneyNow.push({kind:'missing_next_action',priority:'high',title:`${metrics.noNextAction} oportunidade(s) estão sem próxima ação`,potentialMinor:null,action:'crm',reason:'Pipeline sem próxima ação tende a esfriar mesmo quando a aquisição funcionou.'});
    if(metrics.modoOpportunities>0&&metrics.modoCustomers===0)moneyNow.push({kind:'modo_conversion_gap',priority:'high',title:`A MODO já originou ${metrics.modoOpportunities} oportunidade(s), mas ainda não há venda ganha atribuída`,potentialMinor:null,action:'smartbots',reason:'Antes de ampliar mídia, priorize qualificação, follow-up e proposta.'});
    else if(metrics.modoCustomers>0)moneyNow.push({kind:'modo_revenue_proven',priority:'normal',title:`MODO já tem ${metrics.modoCustomers} cliente(s) ganho(s) atribuído(s)`,potentialMinor:metrics.modoWonValueMinor,action:'learning',reason:'Use o projeto vencedor como baseline e teste uma variável por vez.'});
    return {
      metrics,
      attribution:{provider:'modo',projects:projects.map(row=>({projectId:row.project_id,opportunities:asNumber(row.opportunities),progressed:asNumber(row.progressed),customers:asNumber(row.customers),wonValueMinor:asNumber(row.won_value_minor)})),sourceOfTruth:'nexoffice_crm'},
      smartbots:{liveSendEnabled:gate.enabled,isolatedGateEnabled:gate.smartBotsEnabled,globalExternalActionsEnabled:gate.globalEnabled,humanApprovalRequired:true,provider:'smartbots'},
      moneyNow:moneyNow.slice(0,3),
      stalled
    };
  });

  app.post('/v1/revenue/followups',async req=>{
    const ctx=await workspaceContext(req,'command.decide');
    const input=inputSchema.parse(req.body);
    const contact=(await query<any>(`select id,name,phone,company_name from crm_contacts where workspace_id=$1 and id=$2 limit 1`,[ctx.workspaceId,input.contactId]))[0];
    if(!contact)throw new ApiError(404,'contact_not_found','Contato não encontrado neste workspace.');
    const recipient=digits(contact.phone);
    if(recipient.length<10)throw new ApiError(400,'contact_whatsapp_required','Este contato não possui um WhatsApp válido no CRM.');
    const title=`Follow-up com ${contact.name}`;
    const summary=`Mensagem comercial preparada para ${contact.name}.`;
    const payload={channel:'whatsapp',recipient,contactName:contact.name,message:input.message,contactId:contact.id};
    const created=await transaction(async client=>{
      const approval=await client.query<any>(`insert into approval_requests(workspace_id,action_type,title,description,status,requested_by_agent,subject_type,subject_id,proposed_payload) values($1,'message.send',$2,$3,'pending','crm','crm_contact',$4,$5) returning *`,[ctx.workspaceId,title,summary,contact.id,JSON.stringify(payload)]);
      const action=await client.query<any>(`insert into command_actions(workspace_id,agent_role,title,summary,priority,status,autonomy,approval_id,subject_type,subject_id,primary_action,secondary_actions,metadata) values($1,'crm',$2,$3,'high','open','approval_required',$4,'crm_contact',$5,$6,$7,$8) returning *`,[ctx.workspaceId,title,summary,approval.rows[0].id,contact.id,JSON.stringify({type:'message.send',payload}),JSON.stringify([]),JSON.stringify({source:'revenue-center',provider:'smartbots',humanApprovalRequired:true})]);
      return {approval:approval.rows[0],action:action.rows[0]};
    });
    const gate=externalActionGate('smartbots.message.send');
    await auditLog(ctx,'revenue.followup.prepared','command_action',created.action.id,null,{contactId:contact.id,provider:'smartbots',channel:'whatsapp',approvalId:created.approval.id,externalEffect:false},{humanApprovalRequired:true,workspaceScoped:true,smartBotsLiveSendEnabled:gate.enabled});
    return {status:'pending_approval',provider:'smartbots',contact:{id:contact.id,name:contact.name,companyName:contact.company_name||null},action:created.action,approval:{id:created.approval.id,status:created.approval.status},governance:{humanApprovalRequired:true,liveSendEnabled:gate.enabled,isolatedSmartBotsGateEnabled:gate.smartBotsEnabled,globalExternalActionsEnabled:gate.globalEnabled}};
  });
}
