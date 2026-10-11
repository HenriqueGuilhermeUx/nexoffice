import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {workspaceContext} from './auth.js';
import {query} from './db.js';
import {auditLog} from './events.js';
import {executeLowRiskBusinessAction} from './business-action-engine.js';
import {advanceRun,handoffFor,loadRun,startPlaybookRun,type PlaybookTemplateKey,type StartContext} from './routes-playbooks.js';

type Candidate={templateKey:PlaybookTemplateKey;title:string;reason:string;priority:'high'|'normal';context:StartContext;subjectLabel:string};
type Intent={key:PlaybookTemplateKey|'all';label:string};

function normalize(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function any(text:string,terms:string[]){return terms.some(term=>text.includes(term))}
function interpret(message:string):Intent[]{
  const text=normalize(message);
  const intents:Intent[]=[];
  const all=any(text,['cuida do que precisa','resolva o que precisa','resolve o que precisa','organiza tudo','organize tudo','prioridades do negocio','prioridades do negócio','o que precisa de atencao','o que precisa de atenção','tudo que der','resolve as prioridades','resolva as prioridades']);
  if(all)return[{key:'all',label:'prioridades do negócio'}];
  if(any(text,['cliente em risco','clientes em risco','inadimpl','atrasad','recebimento venc','cobranca venc','cobrança venc','recupera cliente','recuperar cliente']))intents.push({key:'relationship_recovery',label:'clientes em risco'});
  if(any(text,['venda parada','vendas paradas','venda travada','vendas travadas','operacao parada','operação parada','operacoes paradas','operações paradas','destrava venda','destravar venda','venda ate o caixa','venda até o caixa']))intents.push({key:'commercial_to_cash',label:'vendas paradas'});
  if(any(text,['estoque baixo','repor estoque','reposicao','reposição','produto acab','produtos acab','vai faltar','precisa repor','o que precisa ser reposto']))intents.push({key:'stock_replenishment',label:'estoque baixo'});
  if(any(text,['renovacao','renovação','renovar','expansao','expansão','upsell','proximo ciclo','próximo ciclo']))intents.push({key:'renewal_expansion',label:'renovações e expansão'});
  return intents;
}

async function candidatesFor(ctx:any,intents:Intent[],limit:number):Promise<Candidate[]>{
  const keys=new Set<PlaybookTemplateKey>();
  if(intents.some(i=>i.key==='all'))(['relationship_recovery','commercial_to_cash','stock_replenishment','renewal_expansion'] as PlaybookTemplateKey[]).forEach(k=>keys.add(k));
  else intents.forEach(i=>{if(i.key!=='all')keys.add(i.key)});

  const candidates:Candidate[]=[];
  if(keys.has('relationship_recovery')){
    const rows=await query<any>(`
      select l.contact_id,c.name contact_name,count(*)::int overdue_count,coalesce(sum(l.amount_minor),0)::bigint overdue_minor
      from ledger_entries l join crm_contacts c on c.id=l.contact_id
      where l.workspace_id=$1 and l.direction='income' and l.contact_id is not null
        and l.status in ('open','overdue') and l.due_at<now()
      group by l.contact_id,c.name
      order by overdue_minor desc,overdue_count desc
      limit $2
    `,[ctx.workspaceId,limit]);
    for(const row of rows)candidates.push({
      templateKey:'relationship_recovery',title:'Recuperar relacionamento em risco',
      reason:`${row.contact_name} tem ${row.overdue_count} recebimento(s) vencido(s).`,
      priority:'high',subjectLabel:row.contact_name,
      context:{contactId:row.contact_id,reason:`Recebimentos vencidos: ${row.overdue_count}`}
    });
  }

  if(keys.has('commercial_to_cash')){
    const rows=await query<any>(`
      select o.id operation_id,o.contact_id,o.catalog_item_id,o.title,c.name contact_name,o.updated_at
      from business_operations o left join crm_contacts c on c.id=o.contact_id
      where o.workspace_id=$1 and o.status not in ('paid','cancelled','closed')
        and o.updated_at<now()-interval '14 days'
      order by o.updated_at asc
      limit $2
    `,[ctx.workspaceId,limit]);
    for(const row of rows)candidates.push({
      templateKey:'commercial_to_cash',title:'Destravar venda até o caixa',
      reason:`${row.contact_name||row.title||'Operação'} está sem avanço há mais de 14 dias.`,
      priority:'high',subjectLabel:row.contact_name||row.title||'Operação',
      context:{operationId:row.operation_id,contactId:row.contact_id,catalogItemId:row.catalog_item_id}
    });
  }

  if(keys.has('stock_replenishment')){
    const rows=await query<any>(`
      select ci.id catalog_item_id,ci.name,ci.reorder_point,ci.preferred_supplier_id,
        coalesce(sum(case when im.movement_type in ('opening','purchase','adjustment_in','transfer_in','return_in') then im.quantity when im.id is null then 0 else -im.quantity end),0)::numeric on_hand
      from business_catalog_items ci
      left join inventory_movements im on im.workspace_id=ci.workspace_id and im.catalog_item_id=ci.id
      where ci.workspace_id=$1 and ci.active=true and ci.kind='product' and ci.track_inventory=true
      group by ci.id
      having ci.reorder_point>0 and coalesce(sum(case when im.movement_type in ('opening','purchase','adjustment_in','transfer_in','return_in') then im.quantity when im.id is null then 0 else -im.quantity end),0)<=ci.reorder_point
      order by (ci.reorder_point-coalesce(sum(case when im.movement_type in ('opening','purchase','adjustment_in','transfer_in','return_in') then im.quantity when im.id is null then 0 else -im.quantity end),0)) desc
      limit $2
    `,[ctx.workspaceId,limit]);
    for(const row of rows)candidates.push({
      templateKey:'stock_replenishment',title:'Repor estoque antes de faltar',
      reason:`${row.name} está em ${Number(row.on_hand)} com ponto de reposição ${Number(row.reorder_point)}.`,
      priority:'high',subjectLabel:row.name,
      context:{catalogItemId:row.catalog_item_id,contactId:row.preferred_supplier_id}
    });
  }

  if(keys.has('renewal_expansion')){
    const rows=await query<any>(`
      select r.contact_id,r.catalog_item_id,c.name contact_name,ci.name catalog_name,r.next_run_at
      from recurring_rules r join crm_contacts c on c.id=r.contact_id
      left join business_catalog_items ci on ci.id=r.catalog_item_id
      where r.workspace_id=$1 and r.active=true and r.direction='income'
        and r.next_run_at<=now()+interval '45 days'
        and not exists(
          select 1 from ledger_entries l where l.workspace_id=r.workspace_id and l.contact_id=r.contact_id
            and l.direction='income' and l.status in ('open','overdue') and l.due_at<now()
        )
      order by r.next_run_at asc
      limit $2
    `,[ctx.workspaceId,limit]);
    for(const row of rows)candidates.push({
      templateKey:'renewal_expansion',title:'Preparar renovação ou expansão',
      reason:`${row.contact_name} entra em novo ciclo em breve${row.catalog_name?' com '+row.catalog_name:''}.`,
      priority:'normal',subjectLabel:row.contact_name,
      context:{contactId:row.contact_id,catalogItemId:row.catalog_item_id}
    });
  }

  const rank=(c:Candidate)=>c.priority==='high'?0:1;
  return candidates.sort((a,b)=>rank(a)-rank(b)).slice(0,limit);
}

async function executeSafePrefix(ctx:any,runId:string,maxSteps=5){
  const executed:any[]=[];
  for(let i=0;i<maxSteps;i++){
    const run=await loadRun(ctx,runId);
    const step=run.currentStep;
    if(!step||step.status!=='ready'||step.execution_mode!=='safe_internal')return{run,executed,stoppedAt:step||null};
    const action=await executeLowRiskBusinessAction(ctx,step.action_id,step.payload||{});
    await query(`
      update business_playbook_steps
      set status='completed',result=$4::jsonb,started_at=coalesce(started_at,now()),completed_at=now(),completed_by=$5,updated_at=now()
      where id=$1 and run_id=$2 and workspace_id=$3
    `,[step.id,runId,ctx.workspaceId,JSON.stringify({...action,orchestratedBy:'maya_playbooks_v2'}),ctx.user.id]);
    if(step.action_id==='purchasing.plan'&&(action as any)?.result?.id){
      await query(`
        update business_playbook_steps
        set payload=payload||$4::jsonb,updated_at=now()
        where run_id=$1 and workspace_id=$2 and position>$3
          and action_id in ('purchasing.send_to_supplier','purchasing.receive')
      `,[runId,ctx.workspaceId,step.position,JSON.stringify({purchaseOrderId:(action as any).result.id})]);
    }
    await auditLog(ctx,'playbook.maya_safe_step','business_playbook_step',step.id,step,{runId,actionId:step.action_id,externalEffect:false,orchestrator:'maya_playbooks_v2'});
    executed.push({stepId:step.id,position:step.position,actionId:step.action_id,title:step.title,result:(action as any).result||null});
    await advanceRun(ctx,runId);
  }
  const run=await loadRun(ctx,runId);
  return{run,executed,stoppedAt:run.currentStep||null};
}

function attentionFor(run:any,candidate:Candidate){
  const step=run.currentStep;
  if(!step)return null;
  const handoff=handoffFor(step.action_id,step.payload||{});
  const kind=step.execution_mode==='dedicated_external_flow'?'external_approval':step.execution_mode==='human_confirmation'?'human_confirmation':'context_handoff';
  return{
    runId:run.id,templateKey:run.template_key,playbookTitle:run.title,subject:candidate.subjectLabel,
    kind,stepId:step.id,stepPosition:step.position,stepTitle:step.title,description:step.description,
    actionId:step.action_id,executionMode:step.execution_mode,handoff,
    why:candidate.reason
  };
}

export async function registerMayaPlaybookRoutes(app:FastifyInstance){
  app.post('/v1/playbooks/maya',async req=>{
    const ctx=await workspaceContext(req,'command.decide');
    const input=z.object({
      message:z.string().trim().min(2).max(2000),
      maxRuns:z.number().int().min(1).max(5).default(3),
      mode:z.enum(['execute_safe','preview']).default('execute_safe')
    }).parse(req.body||{});
    const intents=interpret(input.message);
    if(!intents.length)return{
      understood:false,
      message:'A Maya não encontrou um objetivo operacional claro para Playbooks.',
      suggestedPrompts:['Maya, cuida dos clientes em risco','Maya, organiza as vendas paradas','Maya, cuida do que precisa ser reposto','Maya, prepara as renovações próximas','Maya, resolve as prioridades do negócio'],
      safety:{externalActionsAutomatic:false,humanConfirmationRespected:true,safeInternalOnly:true}
    };

    const candidates=await candidatesFor(ctx,intents,input.maxRuns);
    if(input.mode==='preview')return{
      understood:true,mode:'preview',interpretation:intents,candidates,
      message:candidates.length?`Encontrei ${candidates.length} caso(s) para organizar.`:'Não encontrei casos atuais que correspondam ao pedido.',
      safety:{externalActionsAutomatic:false,humanConfirmationRespected:true,safeInternalOnly:true}
    };

    const results:any[]=[];
    let safeStepsExecuted=0,reusedRuns=0,newRuns=0;
    for(const candidate of candidates){
      const started=await startPlaybookRun(ctx,candidate.templateKey,candidate.context,'maya_playbooks_v2');
      if(started.reused)reusedRuns++;else newRuns++;
      const progressed=await executeSafePrefix(ctx,started.run.id);
      safeStepsExecuted+=progressed.executed.length;
      const finalRun=progressed.run;
      results.push({
        candidate,run:finalRun,reused:started.reused,
        safeStepsExecuted:progressed.executed,
        humanAttention:attentionFor(finalRun,candidate)
      });
    }

    const attention=results.map(r=>r.humanAttention).filter(Boolean);
    await auditLog(ctx,'playbook.maya_orchestrated','workspace',ctx.workspaceId,null,{
      message:input.message,intents:intents.map(i=>i.key),candidates:candidates.length,newRuns,reusedRuns,safeStepsExecuted,humanAttention:attention.length,
      externalEffect:false,orchestrator:'maya_playbooks_v2'
    });
    const noCases=candidates.length===0;
    const text=noCases?'Não encontrei casos atuais para esse pedido.':
      attention.length?`Organizei ${candidates.length} caso(s), executei ${safeStepsExecuted} etapa(s) internas seguras e deixei ${attention.length} ponto(s) que precisam de você.`:
      `Organizei ${candidates.length} caso(s) e executei ${safeStepsExecuted} etapa(s) internas seguras. Nenhuma decisão humana ficou pendente agora.`;

    return{
      understood:true,mode:'execute_safe',agent:'Maya',interpretation:intents,
      summary:{selected:candidates.length,newRuns,reusedRuns,safeStepsExecuted,humanAttention:attention.length},
      message:text,results,humanAttention:attention,
      safety:{
        externalActionsAutomatic:false,
        fiscalAutomatic:false,
        financialConfirmationAutomatic:false,
        supplierCommunicationAutomatic:false,
        customerCommunicationAutomatic:false,
        humanConfirmationRespected:true,
        safeInternalOnly:true
      }
    };
  });
}
