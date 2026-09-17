import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext,ApiError} from './auth.js';
import {query} from './db.js';
import {financeSummary} from './events.js';
import {readDocWalletUpcomingExpirations} from './docwallet-intelligence-adapter.js';
import {buildOperationalPriorities,operationalSignalNarrative,safeOperationalSignal,type OperationalSignal} from './operational-signals.js';

const uuid=z.string().uuid();
const roles=['secretary','service','crm','erp','collections','controller','documents','growth'] as const;

export async function registerAssistantRoutes(app:FastifyInstance){
  app.get('/v1/assistant/brief',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const [finance,crm,agenda,tasks,docs,actions,workspace,signalRows]=await Promise.all([
      financeSummary(ctx.workspaceId),
      query<any>(`select count(*) filter(where stage not in ('won','lost'))::int open_deals,coalesce(sum(value_minor) filter(where stage not in ('won','lost')),0)::bigint open_pipeline_minor,count(*) filter(where stage='lead')::int leads,count(*) filter(where stage='proposal')::int proposals from crm_deals where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*)::int today from appointments where workspace_id=$1 and starts_at>=date_trunc('day',now()) and starts_at<date_trunc('day',now())+interval '1 day' and status not in ('cancelled')`,[ctx.workspaceId]),
      query<any>(`select count(*)::int due from tasks where workspace_id=$1 and status in ('todo','doing') and (due_at is null or due_at<=now()+interval '24 hours')`,[ctx.workspaceId]),
      query<any>(`select count(*)::int total,count(*) filter(where signature_status not in ('not_requested','signed','completed'))::int signatures_pending,count(*) filter(where intelligence_status in ('queued','processing','error'))::int analysis_attention from document_refs where workspace_id=$1`,[ctx.workspaceId]),
      query<any>(`select count(*)::int open_actions from command_actions where workspace_id=$1 and status in ('open','approved','executing')`,[ctx.workspaceId]),
      query<any>(`select vertical from workspaces where id=$1`,[ctx.workspaceId]),
      query<any>(`select id,source_product,signal_type,period_start,period_end,metrics,dimensions,created_at from workspace_operational_signals where workspace_id=$1 order by period_end desc,created_at desc limit 30`,[ctx.workspaceId])
    ]);
    const vertical=String(workspace[0]?.vertical||'general');
    const operationalSignals=signalRows.map(safeOperationalSignal);
    const pulse={finance,crm:crm[0],agenda:agenda[0],tasks:tasks[0],documents:docs[0],command:actions[0],operational:{privacy:'aggregate_only',signals:operationalSignals.slice(0,12)}};
    const priorities=[] as Array<{level:string;title:string;detail:string;target:string}>;
    if(Number(finance.overdue_count)>0)priorities.push({level:'high',title:`${finance.overdue_count} cobrança(s) vencida(s)`,detail:`Há ${money(finance.receivable_minor)} a receber no total.`,target:'finance'});
    if(Number(tasks[0]?.due||0)>0)priorities.push({level:'normal',title:`${tasks[0].due} tarefa(s) pedem atenção`,detail:'Revise prazos e próximos passos.',target:'agenda'});
    if(Number(crm[0]?.leads||0)>0)priorities.push({level:'normal',title:`${crm[0].leads} lead(s) no início do funil`,detail:`Pipeline aberto de ${money(crm[0].open_pipeline_minor)}.`,target:'crm'});
    if(Number(docs[0]?.signatures_pending||0)>0)priorities.push({level:'normal',title:`${docs[0].signatures_pending} assinatura(s) pendente(s)`,detail:'Acompanhe os documentos que aguardam ação.',target:'documents'});
    priorities.push(...buildOperationalPriorities(vertical,operationalSignals));
    priorities.sort((a,b)=>priorityRank(a.level)-priorityRank(b.level));
    const verticalPrompt=vertical==='legal'?'Como está a operação jurídica no NexJud?':vertical==='health'?'Como está a operação administrativa de saúde?':vertical==='condo'?'Como está a operação dos condomínios no SindCopilot?':vertical==='commerce'?'Como está minha operação de commerce?':null;
    return {workspace:{id:ctx.workspaceId,name:ctx.workspaceName,vertical},pulse,priorities,suggestedPrompts:[verticalPrompt,'Como está meu negócio hoje?','O que tenho para receber?','Quais oportunidades devo priorizar?','Como está minha agenda?','Quais documentos precisam de atenção?'].filter(Boolean)};
  });

  app.get('/v1/assistant/conversations',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    return query<any>(`select id,agent_role,title,status,created_at,updated_at from assistant_conversations where workspace_id=$1 and user_id=$2 order by updated_at desc limit 100`,[ctx.workspaceId,ctx.user.id]);
  });

  app.get('/v1/assistant/conversations/:id/messages',async req=>{
    const ctx=await workspaceContext(req,'command.read'),id=uuid.parse((req.params as any).id);
    const conversation=(await query<any>(`select id from assistant_conversations where id=$1 and workspace_id=$2 and user_id=$3`,[id,ctx.workspaceId,ctx.user.id]))[0];
    if(!conversation)throw new ApiError(404,'not_found','Conversa não encontrada.');
    return query<any>(`select id,role,agent_role,content,metadata,created_at from assistant_messages where conversation_id=$1 order by created_at asc limit 500`,[id]);
  });

  app.post('/v1/assistant/chat',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const input=z.object({message:z.string().min(1).max(8000),conversationId:uuid.optional().nullable(),agentRole:z.enum(roles).optional().nullable()}).parse(req.body);
    let conversationId=input.conversationId||null;
    if(conversationId){
      const found=(await query<any>(`select id from assistant_conversations where id=$1 and workspace_id=$2 and user_id=$3`,[conversationId,ctx.workspaceId,ctx.user.id]))[0];
      if(!found)throw new ApiError(404,'not_found','Conversa não encontrada.');
    }else{
      const title=input.message.trim().slice(0,70)+(input.message.trim().length>70?'…':'');
      const row=(await query<any>(`insert into assistant_conversations(workspace_id,user_id,agent_role,title) values($1,$2,$3,$4) returning id`,[ctx.workspaceId,ctx.user.id,input.agentRole||null,title]))[0];
      conversationId=row.id;
    }
    await query(`insert into assistant_messages(workspace_id,conversation_id,user_id,role,agent_role,content) values($1,$2,$3,'user',$4,$5)`,[ctx.workspaceId,conversationId,ctx.user.id,input.agentRole||null,input.message.trim()]);
    const result=await answer(ctx.workspaceId,input.message,input.agentRole||null);
    const saved=(await query<any>(`insert into assistant_messages(workspace_id,conversation_id,role,agent_role,content,metadata) values($1,$2,'assistant',$3,$4,$5) returning *`,[ctx.workspaceId,conversationId,input.agentRole||result.agentRole,result.text,JSON.stringify({actions:result.actions,facts:result.facts})]))[0];
    await query(`update assistant_conversations set agent_role=coalesce(agent_role,$2),updated_at=now() where id=$1`,[conversationId,input.agentRole||result.agentRole]);
    return {conversationId,message:saved,actions:result.actions,facts:result.facts,agentRole:input.agentRole||result.agentRole};
  });
}

async function answer(workspaceId:string,message:string,forcedRole:string|null){
  const text=normalize(message);const actions:Array<{label:string;target:string}> = [];
  const vertical=await getWorkspaceVertical(workspaceId);

  if(vertical==='legal'&&match(text,['nexjud','operacao juridica','operacao legal','juridic','movimentacao juridica','movimentacoes juridicas','carteira juridica'])){
    const signals=await getOperationalSignals(workspaceId,'nexjud');
    const narrative=operationalSignalNarrative('legal',signals);
    actions.push({label:'Central de Comando',target:'command'});
    return {agentRole:forcedRole||'controller',text:narrative.text,facts:narrative.facts,actions};
  }
  if(vertical==='health'&&match(text,['operacao de saude','operacao administrativa de saude','sla','solicitacoes operacionais','carga operacional de saude'])){
    const signals=await getOperationalSignals(workspaceId);
    const narrative=operationalSignalNarrative('health',signals);
    actions.push({label:'Central de Comando',target:'command'});
    return {agentRole:forcedRole||'controller',text:narrative.text,facts:narrative.facts,actions};
  }
  if(vertical==='condo'&&match(text,['sindcopilot','condominio','condominios','operacao condominial','compliance condominial','operacao dos condominios'])){
    const signals=await getOperationalSignals(workspaceId,'sindcopilot');
    const narrative=operationalSignalNarrative('condo',signals);
    actions.push({label:'Central de Comando',target:'command'});
    return {agentRole:forcedRole||'controller',text:narrative.text,facts:narrative.facts,actions};
  }
  if(vertical==='commerce'&&match(text,['commerce','ecommerce','e-commerce','pedidos','fulfillment','estoque','carrinhos','conversao da loja','operacao da loja'])){
    const signals=await getOperationalSignals(workspaceId);
    const narrative=operationalSignalNarrative('commerce',signals);
    actions.push({label:'Central de Comando',target:'command'});
    return {agentRole:forcedRole||'controller',text:narrative.text,facts:narrative.facts,actions};
  }
  if(match(text,['receber','recebiveis','cobranca','cobrancas','vencid','inadimpl'])){
    const finance=await financeSummary(workspaceId);const overdue=await query<any>(`select l.id,l.description,l.amount_minor,l.due_at,c.name contact_name from ledger_entries l left join crm_contacts c on c.id=l.contact_id where l.workspace_id=$1 and l.direction='income' and l.status in ('open','overdue') order by case when l.due_at<now() then 0 else 1 end,l.due_at nulls last limit 8`,[workspaceId]);
    actions.push({label:'Abrir financeiro',target:'finance'});return {agentRole:forcedRole||'collections',text:`Você tem ${money(finance.receivable_minor)} a receber e ${finance.overdue_count||0} lançamento(s) vencido(s).${overdue.length?` Prioridades: ${overdue.map(x=>`${x.contact_name||x.description} (${money(x.amount_minor)})`).join('; ')}.`:''}`,facts:{finance,overdue},actions};
  }
  if(match(text,['pagar','despesa','despesas','custos','gastos'])){
    const finance=await financeSummary(workspaceId);const payable=await query<any>(`select description,amount_minor,due_at,status from ledger_entries where workspace_id=$1 and direction='expense' and status in ('open','overdue','planned') order by due_at nulls last limit 8`,[workspaceId]);
    actions.push({label:'Abrir financeiro',target:'finance'});return {agentRole:forcedRole||'controller',text:`Há ${money(finance.payable_minor)} em contas a pagar abertas. ${payable.length?`Próximos itens: ${payable.map(x=>`${x.description} (${money(x.amount_minor)})`).join('; ')}.`:'Não encontrei despesas futuras registradas.'}`,facts:{finance,payable},actions};
  }
  if(match(text,['lead','leads','pipeline','crm','venda','vendas','oportunidade','oportunidades','proposta'])){
    const summary=(await query<any>(`select count(*) filter(where stage not in ('won','lost'))::int open_deals,coalesce(sum(value_minor) filter(where stage not in ('won','lost')),0)::bigint pipeline,count(*) filter(where stage='proposal')::int proposals from crm_deals where workspace_id=$1`,[workspaceId]))[0];
    const deals=await query<any>(`select title,stage,value_minor,next_action from crm_deals where workspace_id=$1 and stage not in ('won','lost') order by value_minor desc,updated_at desc limit 8`,[workspaceId]);
    actions.push({label:'Abrir CRM',target:'crm'});return {agentRole:forcedRole||'crm',text:`Seu pipeline aberto é de ${money(summary.pipeline)}, com ${summary.open_deals} oportunidade(s) e ${summary.proposals} proposta(s).${deals.length?` Eu priorizaria: ${deals.slice(0,4).map(x=>`${x.title} (${money(x.value_minor)}${x.next_action?`, próximo passo: ${x.next_action}`:''})`).join('; ')}.`:''}`,facts:{summary,deals},actions};
  }
  if(match(text,['agenda','compromisso','compromissos','reuniao','reunioes','hoje','amanha'])){
    const rows=await query<any>(`select title,starts_at,status from appointments where workspace_id=$1 and starts_at>=date_trunc('day',now()) and starts_at<now()+interval '7 days' and status not in ('cancelled') order by starts_at limit 12`,[workspaceId]);
    actions.push({label:'Abrir agenda',target:'agenda'});return {agentRole:forcedRole||'secretary',text:rows.length?`Nos próximos 7 dias encontrei ${rows.length} compromisso(s). Os primeiros são: ${rows.slice(0,6).map(x=>`${x.title} em ${datePt(x.starts_at)}`).join('; ')}.`:'Não encontrei compromissos nos próximos 7 dias.',facts:{appointments:rows},actions};
  }
  if(match(text,['tarefa','tarefas','pendencia','pendencias','prazo','prazos'])){
    const rows=await query<any>(`select title,priority,due_at,status from tasks where workspace_id=$1 and status in ('todo','doing') order by case priority when 'critical' then 1 when 'high' then 2 else 3 end,due_at nulls last limit 12`,[workspaceId]);
    actions.push({label:'Abrir tarefas',target:'agenda'});return {agentRole:forcedRole||'secretary',text:rows.length?`Há ${rows.length} tarefa(s) abertas na lista principal. Prioridades: ${rows.slice(0,6).map(x=>`${x.title}${x.due_at?` até ${datePt(x.due_at)}`:''}`).join('; ')}.`:'Não encontrei tarefas abertas.',facts:{tasks:rows},actions};
  }
  if(match(text,['documento','documentos','assinatura','assinaturas','contrato','contratos'])){
    const [docs,docWallet]=await Promise.all([
      query<any>(`select title,status,intelligence_status,signature_status,document_type from document_refs where workspace_id=$1 order by updated_at desc limit 12`,[workspaceId]),
      readDocWalletUpcomingExpirations(workspaceId,60).catch(()=>({ok:false,error:'docwallet_unavailable'}))
    ]);
    const alerts=docWallet.ok&&Array.isArray((docWallet as any).payload?.alerts)?(docWallet as any).payload.alerts:[];
    const signatureCount=docs.filter(x=>x.signature_status&&!['not_requested','signed','completed'].includes(x.signature_status)).length;
    const analysisCount=docs.filter(x=>['queued','processing','error'].includes(x.intelligence_status)).length;
    const local=docs.length?`Há ${docs.length} documento(s) recentes no NexOffice. ${signatureCount} têm assinatura em andamento e ${analysisCount} precisam de atenção na análise.`:'Ainda não há referências documentais neste workspace.';
    const upcoming=alerts.length?` No DocWallet encontrei ${alerts.length} alerta(s) com vencimento nos próximos 60 dias. Prioridades: ${alerts.slice(0,4).map((item:any)=>`${item.title||'Documento'}${item.dueDate?` em ${dateOnlyPt(item.dueDate)}`:''}`).join('; ')}.`:'';
    actions.push({label:'Abrir documentos',target:'documents'});return {agentRole:forcedRole||'documents',text:`${local}${upcoming}`,facts:{documents:docs,docWallet:{connected:Boolean(docWallet.ok),upcomingAlerts:alerts.slice(0,8)}},actions};
  }
  if(match(text,['marketing','campanha','campanhas','conteudo','growth','publicidade'])){
    actions.push({label:'Ver integrações',target:'integrations'});return {agentRole:forcedRole||'growth',text:'O Growth Agent está preparado para receber sinais do CRM, agenda e serviços vendidos e repassá-los ao MODO. Antes de publicar ou alterar orçamento, o NexOffice respeita sua política de aprovação.',facts:{},actions};
  }
  const [finance,crm,tasks,agenda,actionsOpen,signals]=await Promise.all([financeSummary(workspaceId),query<any>(`select count(*) filter(where stage not in ('won','lost'))::int open_deals,coalesce(sum(value_minor) filter(where stage not in ('won','lost')),0)::bigint pipeline from crm_deals where workspace_id=$1`,[workspaceId]),query<any>(`select count(*)::int due from tasks where workspace_id=$1 and status in ('todo','doing') and (due_at is null or due_at<=now()+interval '24 hours')`,[workspaceId]),query<any>(`select count(*)::int today from appointments where workspace_id=$1 and starts_at>=date_trunc('day',now()) and starts_at<date_trunc('day',now())+interval '1 day' and status<>'cancelled'`,[workspaceId]),query<any>(`select count(*)::int n from command_actions where workspace_id=$1 and status in ('open','approved','executing')`,[workspaceId]),getOperationalSignals(workspaceId)]);
  const operational=operationalSignalNarrative(vertical,signals);
  const verticalSuffix=(vertical==='legal'||vertical==='health'||vertical==='condo'||vertical==='commerce')&&signals.length?` ${operational.text}`:'';
  actions.push({label:'Central de Comando',target:'command'});return {agentRole:forcedRole||'controller',text:`Resumo agora: pipeline de ${money(crm[0].pipeline)} em ${crm[0].open_deals} oportunidade(s); ${money(finance.receivable_minor)} a receber, com ${finance.overdue_count||0} vencido(s); ${agenda[0].today||0} compromisso(s) hoje; ${tasks[0].due||0} tarefa(s) pedindo atenção; e ${actionsOpen[0].n||0} ação(ões) na Central de Comando.${verticalSuffix}`,facts:{finance,crm:crm[0],tasks:tasks[0],agenda:agenda[0],command:actionsOpen[0],operational:operational.facts},actions};
}

async function getWorkspaceVertical(workspaceId:string){const rows=await query<any>(`select vertical from workspaces where id=$1`,[workspaceId]);return String(rows[0]?.vertical||'general')}
async function getOperationalSignals(workspaceId:string,sourceProduct?:string):Promise<OperationalSignal[]>{
  const rows=await query<any>(`select id,source_product,signal_type,period_start,period_end,metrics,dimensions,created_at from workspace_operational_signals where workspace_id=$1 and ($2::text is null or source_product=$2) order by period_end desc,created_at desc limit 30`,[workspaceId,sourceProduct||null]);
  return rows.map(safeOperationalSignal);
}
function priorityRank(level:string){return level==='high'?0:1}
function normalize(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function match(text:string,words:string[]){return words.some(w=>text.includes(w))}
function money(value:any){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0)/100)}
function datePt(value:any){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value))}
function dateOnlyPt(value:any){const date=new Date(`${String(value).slice(0,10)}T12:00:00-03:00`);return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(date)}
