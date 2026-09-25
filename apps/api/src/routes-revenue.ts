import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog} from './events.js';
import {externalActionGate} from './integration-runtime.js';

const inputSchema=z.object({contactId:z.string().uuid(),message:z.string().trim().min(1).max(2000),channel:z.literal('whatsapp').default('whatsapp')}).strict();
const playbookInput=z.object({dealId:z.string().uuid(),kind:z.enum(['stalled_pipeline','missing_next_action'])}).strict();
const digits=(value:unknown)=>String(value||'').replace(/\D/g,'');
const asNumber=(value:unknown)=>Number(value||0);
type RevenueSegment='health_services'|'professional_services'|'commerce'|'general';

function segmentFor(vertical:unknown):RevenueSegment{
  const value=String(vertical||'').toLowerCase();
  if(/health|saude|saúde|clinic|clinica|clínica|medical|medic|odonto|wellness|bem.?estar|acupunt/.test(value))return 'health_services';
  if(/agency|agencia|agência|consult|service|servico|serviço|professional|advoc|contab|software|marketing/.test(value))return 'professional_services';
  if(/commerce|comercio|comércio|retail|varejo|loja|e-?commerce|restaurant|restaurante/.test(value))return 'commerce';
  return 'general';
}

function playbooksFor(segment:RevenueSegment){
  const labels={health_services:'Serviços de saúde & bem-estar',professional_services:'Serviços profissionais',commerce:'Comércio & varejo',general:'Negócio geral'} as const;
  const stalled={
    health_services:{style:'acolhedor e objetivo',steps:['Retomar o interesse sem pressão','Relembrar o benefício/necessidade já discutido','Oferecer um próximo horário ou passo simples']},
    professional_services:{style:'consultivo e direto',steps:['Retomar o contexto da proposta','Reforçar o resultado esperado','Pedir uma decisão ou próximo passo claro']},
    commerce:{style:'curto e orientado à oferta',steps:['Retomar o produto/serviço de interesse','Reforçar disponibilidade ou condição relevante','Convidar para concluir a compra']},
    general:{style:'humano e objetivo',steps:['Retomar o contexto','Remover a principal fricção','Combinar um próximo passo concreto']}
  }[segment];
  return [
    {kind:'stalled_pipeline',label:'Recuperar oportunidade parada',segment:labels[segment],goal:'Transformar pipeline existente em conversa e próximo passo.',messageStyle:stalled.style,steps:stalled.steps,approvalRequired:true},
    {kind:'missing_next_action',label:'Dar próximo passo ao pipeline',segment:labels[segment],goal:'Evitar que oportunidades sem ação definida esfriem.',messageStyle:stalled.style,steps:['Revisar o último contexto registrado','Definir a menor próxima ação útil','Preparar contato apenas quando houver WhatsApp válido'],approvalRequired:true},
    {kind:'modo_conversion_gap',label:'Converter demanda antes de ampliar mídia',segment:labels[segment],goal:'Trabalhar oportunidades originadas pela MODO antes de comprar mais alcance.',messageStyle:stalled.style,steps:['Priorizar leads já captados','Qualificar intenção e timing','Levar os melhores para proposta/agendamento'],approvalRequired:true},
    {kind:'modo_revenue_proven',label:'Replicar o que já vendeu',segment:labels[segment],goal:'Usar projetos MODO com receita atribuída como baseline.',messageStyle:'aprendizado controlado',steps:['Identificar projeto vencedor','Preservar oferta/audiência que funcionou','Testar uma variável por vez e medir receita'],approvalRequired:false}
  ];
}

function playbookMessage(segment:RevenueSegment,kind:'stalled_pipeline'|'missing_next_action',contactName:string,dealTitle:string){
  const first=String(contactName||'').trim().split(/\s+/)[0]||contactName;
  if(segment==='health_services')return `Olá, ${first}. Queria retomar nosso contato sobre ${dealTitle}. Se ainda fizer sentido para você, posso te ajudar a combinar o próximo passo ou encontrar uma opção de horário adequada. Como prefere seguir?`;
  if(segment==='professional_services')return `Olá, ${first}. Retomando nossa conversa sobre ${dealTitle}: queria confirmar se o objetivo que alinhamos continua sendo prioridade. Se sim, posso organizar o próximo passo de forma bem objetiva. Faz sentido avançarmos?`;
  if(segment==='commerce')return `Olá, ${first}. Passando para retomar seu interesse em ${dealTitle}. Se ainda estiver considerando, posso te ajudar a concluir o próximo passo e confirmar as condições disponíveis. Quer que eu siga por aqui?`;
  return kind==='missing_next_action'
    ?`Olá, ${first}. Retomando nosso contato sobre ${dealTitle}. Posso te ajudar a definir o próximo passo para avançarmos de forma simples?`
    :`Olá, ${first}. Passando para dar continuidade ao que conversamos sobre ${dealTitle}. Ainda faz sentido avançarmos? Se sim, posso facilitar o próximo passo por aqui.`;
}

async function createApprovalFollowup(workspaceId:string,contact:any,message:string,metadata:Record<string,unknown>={}){
  const recipient=digits(contact.phone);
  if(recipient.length<10)throw new ApiError(400,'contact_whatsapp_required','Este contato não possui um WhatsApp válido no CRM.');
  const title=`Follow-up com ${contact.name}`;
  const summary=`Mensagem comercial preparada para ${contact.name}.`;
  const payload={channel:'whatsapp',recipient,contactName:contact.name,message,contactId:contact.id};
  const created=await transaction(async client=>{
    const approval=await client.query<any>(`insert into approval_requests(workspace_id,action_type,title,description,status,requested_by_agent,subject_type,subject_id,proposed_payload) values($1,'message.send',$2,$3,'pending','crm','crm_contact',$4,$5) returning *`,[workspaceId,title,summary,contact.id,JSON.stringify(payload)]);
    const action=await client.query<any>(`insert into command_actions(workspace_id,agent_role,title,summary,priority,status,autonomy,approval_id,subject_type,subject_id,primary_action,secondary_actions,metadata) values($1,'crm',$2,$3,'high','open','approval_required',$4,'crm_contact',$5,$6,$7,$8) returning *`,[workspaceId,title,summary,approval.rows[0].id,contact.id,JSON.stringify({type:'message.send',payload}),JSON.stringify([]),JSON.stringify({source:'revenue-center',provider:'smartbots',humanApprovalRequired:true,...metadata})]);
    return {approval:approval.rows[0],action:action.rows[0]};
  });
  return{...created,payload};
}

export async function registerRevenueRoutes(app:FastifyInstance){
  app.get('/v1/revenue/overview',async req=>{
    const ctx=await workspaceContext(req,'crm.read');
    const workspace=(await query<any>(`select vertical from workspaces where id=$1`,[ctx.workspaceId]))[0];
    const segment=segmentFor(workspace?.vertical);
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
      segment,
      playbooks:playbooksFor(segment),
      attribution:{provider:'modo',projects:projects.map(row=>({projectId:row.project_id,opportunities:asNumber(row.opportunities),progressed:asNumber(row.progressed),customers:asNumber(row.customers),wonValueMinor:asNumber(row.won_value_minor)})),sourceOfTruth:'nexoffice_crm'},
      smartbots:{liveSendEnabled:gate.enabled,isolatedGateEnabled:gate.smartBotsEnabled,globalExternalActionsEnabled:gate.globalEnabled,humanApprovalRequired:true,provider:'smartbots'},
      moneyNow:moneyNow.slice(0,3),
      stalled
    };
  });

  app.post('/v1/revenue/playbooks/prepare',async req=>{
    const ctx=await workspaceContext(req,'command.decide');
    const input=playbookInput.parse(req.body);
    const deal=(await query<any>(`select d.id,d.title,d.stage,d.next_action,d.updated_at,d.contact_id,c.id contact_id_join,c.name contact_name,c.phone contact_phone,c.company_name
      from crm_deals d left join crm_contacts c on c.id=d.contact_id and c.workspace_id=d.workspace_id
      where d.workspace_id=$1 and d.id=$2 and d.stage not in ('won','lost') limit 1`,[ctx.workspaceId,input.dealId]))[0];
    if(!deal)throw new ApiError(404,'deal_not_found','Oportunidade não encontrada neste workspace.');
    if(input.kind==='stalled_pipeline'&&new Date(deal.updated_at).getTime()>Date.now()-3*24*60*60*1000)throw new ApiError(409,'deal_not_stalled','Esta oportunidade ainda não está parada há 3 dias.');
    if(input.kind==='missing_next_action'&&String(deal.next_action||'').trim())throw new ApiError(409,'deal_has_next_action','Esta oportunidade já possui próxima ação definida.');
    if(!deal.contact_id_join)throw new ApiError(409,'deal_contact_required','Vincule um contato à oportunidade antes de preparar o playbook.');
    const workspace=(await query<any>(`select vertical from workspaces where id=$1`,[ctx.workspaceId]))[0];
    const segment=segmentFor(workspace?.vertical);
    const message=playbookMessage(segment,input.kind,deal.contact_name,deal.title);
    const contact={id:deal.contact_id_join,name:deal.contact_name,phone:deal.contact_phone,company_name:deal.company_name};
    const created=await createApprovalFollowup(ctx.workspaceId,contact,message,{playbookKind:input.kind,revenueSegment:segment,dealId:deal.id});
    const gate=externalActionGate('smartbots.message.send');
    await auditLog(ctx,'revenue.playbook.prepared','command_action',created.action.id,null,{dealId:deal.id,contactId:contact.id,playbookKind:input.kind,revenueSegment:segment,provider:'smartbots',approvalId:created.approval.id,externalEffect:false},{humanApprovalRequired:true,workspaceScoped:true,smartBotsLiveSendEnabled:gate.enabled});
    return{status:'pending_approval',playbook:{kind:input.kind,segment,messagePreview:message},deal:{id:deal.id,title:deal.title},contact:{id:contact.id,name:contact.name},action:created.action,approval:{id:created.approval.id,status:created.approval.status},governance:{humanApprovalRequired:true,liveSendEnabled:gate.enabled,externalEffect:false}};
  });

  app.post('/v1/revenue/followups',async req=>{
    const ctx=await workspaceContext(req,'command.decide');
    const input=inputSchema.parse(req.body);
    const contact=(await query<any>(`select id,name,phone,company_name from crm_contacts where workspace_id=$1 and id=$2 limit 1`,[ctx.workspaceId,input.contactId]))[0];
    if(!contact)throw new ApiError(404,'contact_not_found','Contato não encontrado neste workspace.');
    const created=await createApprovalFollowup(ctx.workspaceId,contact,input.message);
    const gate=externalActionGate('smartbots.message.send');
    await auditLog(ctx,'revenue.followup.prepared','command_action',created.action.id,null,{contactId:contact.id,provider:'smartbots',channel:'whatsapp',approvalId:created.approval.id,externalEffect:false},{humanApprovalRequired:true,workspaceScoped:true,smartBotsLiveSendEnabled:gate.enabled});
    return {status:'pending_approval',provider:'smartbots',contact:{id:contact.id,name:contact.name,companyName:contact.company_name||null},action:created.action,approval:{id:created.approval.id,status:created.approval.status},governance:{humanApprovalRequired:true,liveSendEnabled:gate.enabled,isolatedSmartBotsGateEnabled:gate.smartBotsEnabled,globalExternalActionsEnabled:gate.globalEnabled}};
  });
}
