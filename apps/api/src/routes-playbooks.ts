import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {ApiError,hasPermission,workspaceContext} from './auth.js';
import {query,transaction} from './db.js';
import {auditLog} from './events.js';
import {businessActionDefinition} from './business-action-registry.js';
import {executeLowRiskBusinessAction} from './business-action-engine.js';

const uuid=z.string().uuid();
export const templateKey=z.enum(['commercial_to_cash','relationship_recovery','renewal_expansion','stock_replenishment']);
export type PlaybookTemplateKey=z.infer<typeof templateKey>;
const handoffActions=new Set(['materials.proposal.prepare','operations.continue','finance.receivables.review','relationship.review','profitability.review','reconciliation.review']);

type StepDraft={actionId:string;title:string;description:string;payload:Record<string,unknown>};
export type StartContext={contactId?:string|null;dealId?:string|null;operationId?:string|null;catalogItemId?:string|null;subjectType?:string|null;subjectId?:string|null;reason?:string|null};

export function executionMode(actionId:string){
  const def=businessActionDefinition(actionId);
  if(!def)throw new ApiError(500,'playbook_action_missing','Ação do playbook não está registrada.');
  if(def.externalEffect)return 'dedicated_external_flow';
  if(def.humanApprovalRequired)return 'human_confirmation';
  if(handoffActions.has(actionId))return 'handoff';
  return 'safe_internal';
}

export function handoffFor(actionId:string,payload:Record<string,unknown>){
  const base={payload};
  if(actionId==='materials.proposal.prepare')return{...base,view:'materials',action:'prepare_proposal'};
  if(actionId==='operations.continue')return{...base,view:'operations',action:'open_operation'};
  if(actionId==='finance.receivables.review')return{...base,view:'finance',action:'review_receivables'};
  if(actionId==='relationship.review')return{...base,view:'crm',action:'open_client'};
  if(actionId==='profitability.review')return{...base,view:'finance',action:'view_profitability'};
  if(actionId==='reconciliation.confirm'||actionId==='reconciliation.review')return{...base,view:'finance',action:'review_reconciliation'};
  if(actionId==='recurrence.activate')return{...base,view:'finance',action:'activate_recurrence'};
  if(actionId==='fiscal.issue')return{...base,view:'operations',action:'review_fiscal'};
  if(actionId.startsWith('purchasing.'))return{...base,view:'operations',action:'inventory'};
  if(actionId==='message.send')return{...base,view:'crm',action:'prepare_message'};
  if(actionId==='inventory.adjust')return{...base,view:'operations',action:'inventory'};
  return{...base,view:'command',action:'review'};
}

export async function advanceRun(ctx:any,runId:string){
  return transaction(async client=>{
    const run=(await client.query<any>(`select * from business_playbook_runs where id=$1 and workspace_id=$2 for update`,[runId,ctx.workspaceId])).rows[0];
    if(!run)throw new ApiError(404,'playbook_run_not_found','Playbook não encontrado.');
    const next=(await client.query<any>(`select * from business_playbook_steps where run_id=$1 and workspace_id=$2 and status in ('pending','ready','waiting_human','blocked') order by position asc limit 1`,[runId,ctx.workspaceId])).rows[0];
    if(!next){
      const completed=(await client.query<any>(`update business_playbook_runs set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now() where id=$1 and workspace_id=$2 returning *`,[runId,ctx.workspaceId])).rows[0];
      return{run:completed,nextStep:null};
    }
    let status=next.status;
    if(status==='pending'){
      const changed=(await client.query<any>(`update business_playbook_steps set status='ready',updated_at=now() where id=$1 and workspace_id=$2 returning *`,[next.id,ctx.workspaceId])).rows[0];
      status=changed.status;
    }
    const runStatus=status==='waiting_human'?'waiting_human':'active';
    const updated=(await client.query<any>(`update business_playbook_runs set status=$3,current_step=$4,updated_at=now() where id=$1 and workspace_id=$2 returning *`,[runId,ctx.workspaceId,runStatus,next.position])).rows[0];
    return{run:updated,nextStep:{...next,status}};
  });
}

export async function buildPlaybook(ctx:any,key:PlaybookTemplateKey,context:StartContext){
  const tomorrow=new Date(Date.now()+24*60*60*1000).toISOString();

  if(key==='commercial_to_cash'){
    if(!context.operationId)throw new ApiError(400,'operation_required','Selecione uma operação comercial para este playbook.');
    const operation=(await query<any>(`select o.*,c.name contact_name,ci.name catalog_name,ci.billing_cycle from business_operations o left join crm_contacts c on c.id=o.contact_id left join business_catalog_items ci on ci.id=o.catalog_item_id where o.id=$1 and o.workspace_id=$2`,[context.operationId,ctx.workspaceId]))[0];
    if(!operation)throw new ApiError(404,'operation_not_found','Operação comercial não encontrada.');
    const shared={contactId:operation.contact_id,dealId:operation.deal_id||null,operationId:operation.id,catalogItemId:operation.catalog_item_id||null};
    const steps:StepDraft[]=[
      {actionId:'materials.proposal.prepare',title:'Preparar proposta e contexto comercial',description:'Abra Materiais já com cliente e oferta vinculados; nada é enviado automaticamente.',payload:shared},
      {actionId:'operations.continue',title:'Continuar a operação até contrato e entrega',description:'Revise contrato, execução e prontidão da operação sem perder a linhagem comercial.',payload:shared},
      {actionId:'fiscal.issue',title:'Revisar e emitir a nota quando estiver pronta',description:'A emissão fiscal continua em fluxo dedicado e exige ação humana explícita.',payload:shared},
      {actionId:'finance.receivables.review',title:'Acompanhar cobrança e recebimento',description:'Abra o financeiro no contexto desta venda e acompanhe até o dinheiro entrar.',payload:shared}
    ];
    if(operation.billing_cycle&&operation.billing_cycle!=='one_time')steps.push({actionId:'recurrence.activate',title:'Ativar o próximo ciclo',description:'Depois do primeiro ciclo, ative a recorrência futura sem gerar cobranças retroativas.',payload:shared});
    else steps.push({actionId:'profitability.review',title:'Revisar resultado da venda',description:'Feche o ciclo conferindo receita, custo conhecido e margem desta operação.',payload:shared});
    return{title:'Venda → Caixa',objective:'Levar uma venda do contexto comercial até recebimento e resultado sem perder a continuidade.',subjectType:'business_operation',subjectId:operation.id,contactId:operation.contact_id,dealId:operation.deal_id||null,operationId:operation.id,catalogItemId:operation.catalog_item_id||null,steps};
  }

  if(key==='relationship_recovery'){
    if(!context.contactId)throw new ApiError(400,'contact_required','Selecione um cliente para este playbook.');
    const contact=(await query<any>(`select id,name from crm_contacts where id=$1 and workspace_id=$2`,[context.contactId,ctx.workspaceId]))[0];
    if(!contact)throw new ApiError(404,'contact_not_found','Cliente não encontrado.');
    const shared={contactId:contact.id,catalogItemId:context.catalogItemId||null};
    const steps:StepDraft[]=[
      {actionId:'task.followup.create',title:'Criar follow-up interno',description:'Crie uma tarefa clara para que a recuperação não dependa da memória.',payload:{contactId:contact.id,title:'Revisar relacionamento com '+contact.name,description:context.reason||'Playbook de recuperação de relacionamento.',priority:'high',dueAt:tomorrow}},
      {actionId:'relationship.review',title:'Revisar o contexto do cliente',description:'Cheque histórico, atrasos, atividades e sinais antes de decidir a abordagem.',payload:shared},
      {actionId:'materials.proposal.prepare',title:'Preparar uma alternativa de recuperação',description:'Se fizer sentido, prepare renovação, ajuste ou nova proposta sem enviar ainda.',payload:shared},
      {actionId:'message.send',title:'Falar com o cliente',description:'A comunicação externa só acontece no fluxo dedicado, com revisão humana.',payload:{contactId:contact.id,objective:'relationship_recovery'}}
    ];
    return{title:'Recuperação de Cliente',objective:'Transformar um sinal de risco em sequência prática de recuperação com contexto e controle.',subjectType:'crm_contact',subjectId:contact.id,contactId:contact.id,dealId:null,operationId:null,catalogItemId:context.catalogItemId||null,steps};
  }

  if(key==='renewal_expansion'){
    if(!context.contactId)throw new ApiError(400,'contact_required','Selecione um cliente para este playbook.');
    const contact=(await query<any>(`select id,name from crm_contacts where id=$1 and workspace_id=$2`,[context.contactId,ctx.workspaceId]))[0];
    if(!contact)throw new ApiError(404,'contact_not_found','Cliente não encontrado.');
    const shared={contactId:contact.id,catalogItemId:context.catalogItemId||null};
    const steps:StepDraft[]=[
      {actionId:'relationship.review',title:'Revisar relacionamento e uso',description:'Entenda pagamentos, atividades e contexto antes de oferecer renovação ou expansão.',payload:shared},
      {actionId:'materials.proposal.prepare',title:'Preparar renovação ou expansão',description:'Use a oferta e o histórico do cliente para montar a próxima proposta.',payload:shared},
      {actionId:'task.followup.create',title:'Agendar follow-up de renovação',description:'Deixe o próximo contato interno já programado.',payload:{contactId:contact.id,title:'Follow-up de renovação · '+contact.name,description:'Revisar proposta e próximo ciclo antes do vencimento.',priority:'normal',dueAt:tomorrow}},
      {actionId:'message.send',title:'Enviar a abordagem aprovada',description:'Mensagem externa continua sob revisão e envio humano.',payload:{contactId:contact.id,objective:'renewal_expansion'}}
    ];
    return{title:'Renovação & Expansão',objective:'Antecipar o próximo ciclo e transformar um relacionamento saudável em renovação ou expansão.',subjectType:'crm_contact',subjectId:contact.id,contactId:contact.id,dealId:null,operationId:null,catalogItemId:context.catalogItemId||null,steps};
  }

  if(key==='stock_replenishment'){
    if(!context.catalogItemId)throw new ApiError(400,'catalog_item_required','Selecione um produto com estoque controlado.');
    const item=(await query<any>(`select ci.*,s.name supplier_name,coalesce(sum(case when im.movement_type in ('opening','purchase','adjustment_in','transfer_in','return_in') then im.quantity when im.id is null then 0 else -im.quantity end),0)::numeric on_hand from business_catalog_items ci left join crm_contacts s on s.id=ci.preferred_supplier_id left join inventory_movements im on im.workspace_id=ci.workspace_id and im.catalog_item_id=ci.id where ci.id=$1 and ci.workspace_id=$2 and ci.active=true and ci.kind='product' and ci.track_inventory=true group by ci.id,s.name`,[context.catalogItemId,ctx.workspaceId]))[0];
    if(!item)throw new ApiError(404,'tracked_product_not_found','Produto com estoque controlado não encontrado.');
    const onHand=Number(item.on_hand||0),reorder=Number(item.reorder_point||0),suggested=Math.max(1,Math.ceil(Math.max(reorder*2-onHand,1)));
    const shared={catalogItemId:item.id,supplierContactId:item.preferred_supplier_id||null,quantity:suggested};
    const steps:StepDraft[]=[
      {actionId:'purchasing.plan',title:'Planejar a reposição',description:'Crie um rascunho interno de compra com a quantidade sugerida; nenhum pedido é enviado.',payload:shared},
      {actionId:'purchasing.send_to_supplier',title:'Enviar o pedido ao fornecedor',description:'A comunicação com o fornecedor é externa e continua sob ação humana.',payload:shared},
      {actionId:'purchasing.receive',title:'Confirmar o recebimento',description:'Quando a mercadoria chegar, confirme fisicamente para atualizar o estoque.',payload:{catalogItemId:item.id}}
    ];
    return{title:'Reposição de Estoque',objective:'Sair do alerta de estoque baixo até o recebimento físico sem automatizar pedido ou pagamento externo.',subjectType:'catalog_item',subjectId:item.id,contactId:item.preferred_supplier_id||null,dealId:null,operationId:null,catalogItemId:item.id,steps,metadata:{onHand,reorderPoint:reorder,suggestedQuantity:suggested,supplierName:item.supplier_name||null}};
  }

  throw new ApiError(400,'playbook_not_supported','Playbook não suportado.');
}

export async function loadRun(ctx:any,runId:string){
  const run=(await query<any>(`select r.*,c.name contact_name,ci.name catalog_name,o.title operation_title from business_playbook_runs r left join crm_contacts c on c.id=r.contact_id left join business_catalog_items ci on ci.id=r.catalog_item_id left join business_operations o on o.id=r.operation_id where r.id=$1 and r.workspace_id=$2`,[runId,ctx.workspaceId]))[0];
  if(!run)throw new ApiError(404,'playbook_run_not_found','Playbook não encontrado.');
  const steps=await query<any>(`select * from business_playbook_steps where run_id=$1 and workspace_id=$2 order by position`,[runId,ctx.workspaceId]);
  return{...run,steps,currentStep:steps.find(step=>['ready','waiting_human','blocked'].includes(step.status))||null,progress:steps.length?Math.round(steps.filter(step=>['completed','skipped'].includes(step.status)).length/steps.length*100):0};
}


export async function startPlaybookRun(ctx:any,key:PlaybookTemplateKey,context:StartContext,source='smart_playbooks_v1'){
  const built=await buildPlaybook(ctx,key,context);
  const duplicate=(await query<any>(`select id from business_playbook_runs where workspace_id=$1 and template_key=$2 and status in ('active','waiting_human') and coalesce(subject_id::text,'')=coalesce($3::text,'') limit 1`,[ctx.workspaceId,key,built.subjectId||null]))[0];
  if(duplicate)return{reused:true,run:await loadRun(ctx,duplicate.id)};

  for(const step of built.steps){
    const def=businessActionDefinition(step.actionId);
    if(!def)throw new ApiError(500,'playbook_action_missing','Ação '+step.actionId+' não está registrada.');
    if(!hasPermission(ctx.role,ctx.permissions,def.permission))throw new ApiError(403,'playbook_permission_denied','Seu perfil não pode iniciar este playbook porque falta a permissão '+def.permission+'.');
  }

  const run=await transaction(async client=>{
    const row=(await client.query<any>(`insert into business_playbook_runs(workspace_id,template_key,title,objective,subject_type,subject_id,contact_id,deal_id,operation_id,catalog_item_id,created_by,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,[ctx.workspaceId,key,built.title,built.objective,built.subjectType,built.subjectId,built.contactId,built.dealId,built.operationId,built.catalogItemId,ctx.user.id,JSON.stringify({source,reason:context.reason||null,...((built as any).metadata||{})})])).rows[0];
    for(let i=0;i<built.steps.length;i++){
      const step=built.steps[i];
      await client.query(`insert into business_playbook_steps(workspace_id,run_id,position,action_id,title,description,status,execution_mode,payload,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[ctx.workspaceId,row.id,i+1,step.actionId,step.title,step.description,i===0?'ready':'pending',executionMode(step.actionId),JSON.stringify(step.payload),JSON.stringify({actionDefinition:businessActionDefinition(step.actionId)})]);
    }
    return row;
  });
  await auditLog(ctx,'playbook.started','business_playbook_run',run.id,null,{templateKey:key,subjectType:built.subjectType,subjectId:built.subjectId,source,externalEffect:false});
  return{reused:false,run:await loadRun(ctx,run.id)};
}

export async function registerPlaybookRoutes(app:FastifyInstance){
  app.get('/v1/playbooks/intelligence',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    const activeRuns=await query<any>(`select r.*,c.name contact_name,ci.name catalog_name,(select count(*)::int from business_playbook_steps s where s.run_id=r.id) total_steps,(select count(*)::int from business_playbook_steps s where s.run_id=r.id and s.status in ('completed','skipped')) completed_steps,(select json_build_object('id',s.id,'position',s.position,'title',s.title,'description',s.description,'actionId',s.action_id,'status',s.status,'executionMode',s.execution_mode,'payload',s.payload) from business_playbook_steps s where s.run_id=r.id and s.status in ('ready','waiting_human','blocked') order by s.position limit 1) current_step_data from business_playbook_runs r left join crm_contacts c on c.id=r.contact_id left join business_catalog_items ci on ci.id=r.catalog_item_id where r.workspace_id=$1 and r.status in ('active','waiting_human') order by r.updated_at desc limit 30`,[ctx.workspaceId]);

    const recommendations:any[]=[];
    const stalled=(await query<any>(`select o.id operation_id,o.contact_id,o.catalog_item_id,o.title,c.name contact_name from business_operations o left join crm_contacts c on c.id=o.contact_id where o.workspace_id=$1 and o.status not in ('paid','cancelled','closed') and o.updated_at<now()-interval '14 days' order by o.updated_at asc limit 1`,[ctx.workspaceId]))[0];
    if(stalled)recommendations.push({templateKey:'commercial_to_cash',title:'Destravar venda até o caixa',reason:(stalled.contact_name||'Uma operação')+' está sem avanço há mais de 14 dias.',priority:'high',context:{operationId:stalled.operation_id,contactId:stalled.contact_id,catalogItemId:stalled.catalog_item_id}});

    const overdue=(await query<any>(`select l.contact_id,c.name contact_name,count(*)::int overdue_count,coalesce(sum(l.amount_minor),0)::bigint overdue_minor from ledger_entries l join crm_contacts c on c.id=l.contact_id where l.workspace_id=$1 and l.direction='income' and l.contact_id is not null and l.status in ('open','overdue') and l.due_at<now() group by l.contact_id,c.name order by overdue_minor desc limit 1`,[ctx.workspaceId]))[0];
    if(overdue)recommendations.push({templateKey:'relationship_recovery',title:'Recuperar relacionamento em risco',reason:`${overdue.contact_name} tem ${overdue.overdue_count} recebimento(s) vencido(s).`,priority:'high',context:{contactId:overdue.contact_id,reason:'Recebimentos vencidos: '+overdue.overdue_count}});

    const renewal=(await query<any>(`select r.contact_id,r.catalog_item_id,c.name contact_name,ci.name catalog_name,r.next_run_at from recurring_rules r join crm_contacts c on c.id=r.contact_id left join business_catalog_items ci on ci.id=r.catalog_item_id where r.workspace_id=$1 and r.active=true and r.direction='income' and r.next_run_at<=now()+interval '45 days' and not exists(select 1 from ledger_entries l where l.workspace_id=r.workspace_id and l.contact_id=r.contact_id and l.direction='income' and l.status in ('open','overdue') and l.due_at<now()) order by r.next_run_at asc limit 1`,[ctx.workspaceId]))[0];
    if(renewal)recommendations.push({templateKey:'renewal_expansion',title:'Preparar renovação ou expansão',reason:`${renewal.contact_name} entra em novo ciclo em breve${renewal.catalog_name?' com '+renewal.catalog_name:''}.`,priority:'normal',context:{contactId:renewal.contact_id,catalogItemId:renewal.catalog_item_id}});

    const lowStock=(await query<any>(`select ci.id catalog_item_id,ci.name,ci.reorder_point,ci.preferred_supplier_id,coalesce(sum(case when im.movement_type in ('opening','purchase','adjustment_in','transfer_in','return_in') then im.quantity when im.id is null then 0 else -im.quantity end),0)::numeric on_hand from business_catalog_items ci left join inventory_movements im on im.workspace_id=ci.workspace_id and im.catalog_item_id=ci.id where ci.workspace_id=$1 and ci.active=true and ci.kind='product' and ci.track_inventory=true group by ci.id having ci.reorder_point>0 and coalesce(sum(case when im.movement_type in ('opening','purchase','adjustment_in','transfer_in','return_in') then im.quantity when im.id is null then 0 else -im.quantity end),0)<=ci.reorder_point order by (ci.reorder_point-coalesce(sum(case when im.movement_type in ('opening','purchase','adjustment_in','transfer_in','return_in') then im.quantity when im.id is null then 0 else -im.quantity end),0)) desc limit 1`,[ctx.workspaceId]))[0];
    if(lowStock)recommendations.push({templateKey:'stock_replenishment',title:'Repor estoque antes de faltar',reason:`${lowStock.name} está em ${Number(lowStock.on_hand)} com ponto de reposição ${Number(lowStock.reorder_point)}.`,priority:'high',context:{catalogItemId:lowStock.catalog_item_id,contactId:lowStock.preferred_supplier_id}});

    const activeKeys=new Set(activeRuns.map(run=>run.template_key+':'+String(run.subject_id||run.contact_id||run.catalog_item_id||'')));
    const filtered=recommendations.filter(rec=>!activeKeys.has(rec.templateKey+':'+String(rec.context.operationId||rec.context.contactId||rec.context.catalogItemId||'')));
    return{
      recommendations:filtered.slice(0,4),
      activeRuns:activeRuns.map(run=>({...run,total_steps:Number(run.total_steps||0),completed_steps:Number(run.completed_steps||0),progress:Number(run.total_steps||0)?Math.round(Number(run.completed_steps||0)/Number(run.total_steps||0)*100):0,currentStep:run.current_step_data||null})),
      templates:[
        {key:'commercial_to_cash',label:'Venda → Caixa',description:'Leva uma operação até recebimento, resultado e próximo ciclo.'},
        {key:'relationship_recovery',label:'Recuperação de Cliente',description:'Organiza reação a atraso, silêncio ou risco sem disparar comunicação sozinho.'},
        {key:'renewal_expansion',label:'Renovação & Expansão',description:'Antecipação de próximo ciclo, proposta e follow-up.'},
        {key:'stock_replenishment',label:'Reposição de Estoque',description:'Planeja compra, fornecedor e recebimento sem automatizar pedido/pagamento.'}
      ],
      safety:{externalActionsAutomatic:false,humanConfirmationRespected:true,actionRegistryEnforced:true}
    };
  });

  app.get('/v1/playbooks/runs/:id',async req=>{
    const ctx=await workspaceContext(req,'command.read');
    return loadRun(ctx,uuid.parse((req.params as any).id));
  });

  app.post('/v1/playbooks/start',async req=>{
    const ctx=await workspaceContext(req,'command.decide');
    const input=z.object({templateKey,context:z.object({contactId:uuid.optional().nullable(),dealId:uuid.optional().nullable(),operationId:uuid.optional().nullable(),catalogItemId:uuid.optional().nullable(),subjectType:z.string().optional().nullable(),subjectId:uuid.optional().nullable(),reason:z.string().max(1000).optional().nullable()}).default({})}).parse(req.body||{});
    return startPlaybookRun(ctx,input.templateKey,input.context);
  });

  app.post('/v1/playbooks/runs/:runId/steps/:stepId/execute',async req=>{
    const ctx=await workspaceContext(req,'command.decide'),runId=uuid.parse((req.params as any).runId),stepId=uuid.parse((req.params as any).stepId);
    const step=(await query<any>(`select s.*,r.status run_status from business_playbook_steps s join business_playbook_runs r on r.id=s.run_id where s.id=$1 and s.run_id=$2 and s.workspace_id=$3`,[stepId,runId,ctx.workspaceId]))[0];
    if(!step)throw new ApiError(404,'playbook_step_not_found','Etapa não encontrada.');
    if(step.status==='completed'||step.status==='skipped')return{reused:true,run:await loadRun(ctx,runId)};
    if(!['ready','waiting_human','blocked'].includes(step.status))throw new ApiError(409,'playbook_step_not_ready','Conclua a etapa atual antes de avançar.');
    const def=businessActionDefinition(step.action_id);
    if(!def)throw new ApiError(500,'playbook_action_missing','Ação do playbook não está registrada.');
    if(!hasPermission(ctx.role,ctx.permissions,def.permission))throw new ApiError(403,'permission_denied','Você não tem permissão para esta ação.');

    if(step.execution_mode==='dedicated_external_flow'||step.execution_mode==='human_confirmation'){
      const gate={definition:def,handoff:handoffFor(step.action_id,step.payload||{}),humanConfirmationRequired:true,externalEffect:def.externalEffect};
      await query(`update business_playbook_steps set status='waiting_human',started_at=coalesce(started_at,now()),result=$4::jsonb,updated_at=now() where id=$1 and run_id=$2 and workspace_id=$3`,[stepId,runId,ctx.workspaceId,JSON.stringify(gate)]);
      await query(`update business_playbook_runs set status='waiting_human',updated_at=now() where id=$1 and workspace_id=$2`,[runId,ctx.workspaceId]);
      await auditLog(ctx,'playbook.human_gate','business_playbook_step',stepId,step,{actionId:step.action_id,externalEffect:def.externalEffect});
      return{humanGate:true,...gate,run:await loadRun(ctx,runId)};
    }

    await query(`update business_playbook_steps set status='executing',started_at=coalesce(started_at,now()),updated_at=now() where id=$1 and run_id=$2 and workspace_id=$3`,[stepId,runId,ctx.workspaceId]);
    try{
      const executed=await executeLowRiskBusinessAction(ctx as any,step.action_id,step.payload||{});
      if((executed as any).requiresHandoff){
        await query(`update business_playbook_steps set status='waiting_human',result=$4::jsonb,updated_at=now() where id=$1 and run_id=$2 and workspace_id=$3`,[stepId,runId,ctx.workspaceId,JSON.stringify(executed)]);
        await query(`update business_playbook_runs set status='waiting_human',updated_at=now() where id=$1 and workspace_id=$2`,[runId,ctx.workspaceId]);
        return{handoff:true,...executed,run:await loadRun(ctx,runId)};
      }
      await query(`update business_playbook_steps set status='completed',result=$4::jsonb,completed_at=now(),completed_by=$5,updated_at=now() where id=$1 and run_id=$2 and workspace_id=$3`,[stepId,runId,ctx.workspaceId,JSON.stringify(executed),ctx.user.id]);
      if(step.action_id==='purchasing.plan'&&(executed as any)?.result?.id){
        await query(`update business_playbook_steps set payload=payload||$4::jsonb,updated_at=now() where run_id=$1 and workspace_id=$2 and position>$3 and action_id in ('purchasing.send_to_supplier','purchasing.receive')`,[runId,ctx.workspaceId,step.position,JSON.stringify({purchaseOrderId:(executed as any).result.id})]);
      }
      await auditLog(ctx,'playbook.step_executed','business_playbook_step',stepId,step,{actionId:step.action_id,externalEffect:false});
      const advanced=await advanceRun(ctx,runId);
      return{executed:true,result:executed,advanced,run:await loadRun(ctx,runId)};
    }catch(error){
      await query(`update business_playbook_steps set status='ready',result=$4::jsonb,updated_at=now() where id=$1 and run_id=$2 and workspace_id=$3`,[stepId,runId,ctx.workspaceId,JSON.stringify({error:error instanceof Error?error.message:String(error)})]);
      throw error;
    }
  });

  app.post('/v1/playbooks/runs/:runId/steps/:stepId/complete',async req=>{
    const ctx=await workspaceContext(req,'command.decide'),runId=uuid.parse((req.params as any).runId),stepId=uuid.parse((req.params as any).stepId);
    const input=z.object({outcome:z.enum(['completed','skipped']).default('completed'),note:z.string().trim().max(1000).optional().nullable()}).parse(req.body||{});
    const before=(await query<any>(`select * from business_playbook_steps where id=$1 and run_id=$2 and workspace_id=$3`,[stepId,runId,ctx.workspaceId]))[0];
    if(!before)throw new ApiError(404,'playbook_step_not_found','Etapa não encontrada.');
    if(before.status==='completed'||before.status==='skipped')return{reused:true,run:await loadRun(ctx,runId)};
    if(!['waiting_human','ready','blocked'].includes(before.status))throw new ApiError(409,'playbook_step_not_completable','Esta etapa ainda não pode ser concluída manualmente.');
    if(input.outcome==='completed'&&before.action_id==='purchasing.receive'){
      const purchaseOrderId=String(before.payload?.purchaseOrderId||'');
      if(!purchaseOrderId)throw new ApiError(409,'playbook_evidence_missing','Abra o fluxo de compras e confirme o recebimento antes de concluir esta etapa.');
      const order=(await query<any>(`select status from purchase_orders where id=$1 and workspace_id=$2`,[purchaseOrderId,ctx.workspaceId]))[0];
      if(order?.status!=='received')throw new ApiError(409,'playbook_evidence_not_met','A compra ainda não consta como recebida. Confirme o recebimento no fluxo de Estoque & Compras.');
    }
    if(input.outcome==='completed'&&before.action_id==='recurrence.activate'){
      const operationId=String(before.payload?.operationId||'');
      const rule=operationId?(await query<any>(`select id from recurring_rules where workspace_id=$1 and source_operation_id=$2 and active=true limit 1`,[ctx.workspaceId,operationId]))[0]:null;
      if(!rule)throw new ApiError(409,'playbook_evidence_not_met','A recorrência ainda não está ativa para esta operação.');
    }
    if(input.outcome==='completed'&&before.action_id==='fiscal.issue'){
      const operationId=String(before.payload?.operationId||'');
      const operation=operationId?(await query<any>(`select fiscal_status from business_operations where id=$1 and workspace_id=$2`,[operationId,ctx.workspaceId]))[0]:null;
      if(operation?.fiscal_status!=='authorized')throw new ApiError(409,'playbook_evidence_not_met','A nota ainda não consta como autorizada nesta operação.');
    }
    await query(`update business_playbook_steps set status=$4,result=coalesce(result,'{}'::jsonb)||$5::jsonb,completed_at=now(),completed_by=$6,updated_at=now() where id=$1 and run_id=$2 and workspace_id=$3`,[stepId,runId,ctx.workspaceId,input.outcome,JSON.stringify({manualCompletion:true,note:input.note||null,evidenceChecked:['purchasing.receive','recurrence.activate','fiscal.issue'].includes(before.action_id)}),ctx.user.id]);
    await auditLog(ctx,'playbook.step_completed','business_playbook_step',stepId,before,{outcome:input.outcome,note:input.note||null});
    await advanceRun(ctx,runId);
    return{run:await loadRun(ctx,runId)};
  });

  app.post('/v1/playbooks/runs/:id/cancel',async req=>{
    const ctx=await workspaceContext(req,'command.decide'),id=uuid.parse((req.params as any).id);
    const before=(await query<any>(`select * from business_playbook_runs where id=$1 and workspace_id=$2`,[id,ctx.workspaceId]))[0];
    if(!before)throw new ApiError(404,'playbook_run_not_found','Playbook não encontrado.');
    if(before.status==='completed'||before.status==='cancelled')return before;
    const row=(await query<any>(`update business_playbook_runs set status='cancelled',updated_at=now() where id=$1 and workspace_id=$2 returning *`,[id,ctx.workspaceId]))[0];
    await auditLog(ctx,'playbook.cancelled','business_playbook_run',id,before,row);
    return row;
  });
}
