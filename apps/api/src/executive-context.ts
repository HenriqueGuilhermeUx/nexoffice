import {buildBusinessGraph} from './business-graph.js';
import {readBusinessIntelligence} from './business-intelligence.js';
import {financeSummary} from './events.js';
import {query} from './db.js';
import {buildRelationshipIntelligence} from './routes-relationship-intelligence.js';

export type ExecutivePriorityLevel='info'|'attention'|'critical';

export interface ExecutiveEvidence {
  source:string;
  label:string;
  value:unknown;
}

export interface ExecutivePriority {
  code:string;
  level:ExecutivePriorityLevel;
  title:string;
  detail:string;
  hypothesis?:string|null;
  recommendedNextStep?:string|null;
  evidence:ExecutiveEvidence[];
}

export interface ExecutiveContext {
  generatedAt:string;
  workspace:{id:string;name:string};
  headline:string;
  priorities:ExecutivePriority[];
  businessGraph:{
    nodes:number;
    edges:number;
    sources:string[];
    relationships:Record<string,number>;
  };
  indicators:{
    pipelineMinor:number;
    openDeals:number;
    receivableMinor:number;
    overdueCount:number;
    overdueReceivableMinor:number;
    payableMinor:number;
    projectedCash30Minor:number|null;
    businessHealthScore:number|null;
    businessKnowledgePct:number|null;
    relationshipAtRisk:number;
    relationshipRenewalSoon:number;
    relationshipAttention:number;
    externalRelationshipEvents:number;
  };
  evidencePolicy:{
    causalClaimsRequireEvidence:true;
    correlationsAreHypotheses:true;
    externalEffects:false;
    readOnly:true;
  };
}

const n=(value:unknown)=>Number(value||0);

export async function buildExecutiveContext(workspaceId:string,workspaceName:string):Promise<ExecutiveContext>{
  const [graph,finance,business,crm,overdueByContact,relationship]=await Promise.all([
    buildBusinessGraph(workspaceId,workspaceName,90),
    financeSummary(workspaceId),
    readBusinessIntelligence(workspaceId).catch(()=>null),
    query<any>(`select
      count(*) filter(where stage not in ('won','lost'))::int open_deals,
      coalesce(sum(value_minor) filter(where stage not in ('won','lost')),0)::bigint pipeline_minor,
      count(*) filter(where stage='proposal')::int proposals,
      count(*) filter(where stage='lead')::int leads
      from crm_deals where workspace_id=$1`,[workspaceId]),
    query<any>(`select
      coalesce(c.name,l.description) label,
      count(*)::int entries,
      coalesce(sum(l.amount_minor),0)::bigint amount_minor,
      min(l.due_at) oldest_due_at
      from ledger_entries l
      left join crm_contacts c on c.id=l.contact_id
      where l.workspace_id=$1
        and l.direction='income'
        and l.status in ('open','overdue')
        and l.due_at is not null
        and l.due_at<now()
      group by coalesce(c.name,l.description)
      order by amount_minor desc
      limit 5`,[workspaceId]),
    buildRelationshipIntelligence(workspaceId,false).catch(()=>null)
  ]);

  const relationships=graph.edges.reduce<Record<string,number>>((acc,edge)=>{
    acc[edge.kind]=(acc[edge.kind]||0)+1;
    return acc;
  },{});
  const metrics=(business as any)?.metrics||{};
  const snapshot=(business as any)?.snapshot||{};
  const priorities:ExecutivePriority[]=[];

  for(const signal of graph.executiveSignals){
    const evidence=Object.entries(signal.evidence||{}).map(([label,value])=>({source:'nex.business_graph',label,value}));
    priorities.push({
      code:signal.code,
      level:signal.level,
      title:signal.title,
      detail:signal.detail,
      recommendedNextStep:signal.code==='receivables_overdue'
        ?'Revisar os maiores recebíveis vencidos e confirmar cobrança, conciliação ou renegociação.'
        :signal.code==='tasks_overdue'
          ?'Priorizar tarefas atrasadas ligadas a clientes, vendas ou entregas relevantes.'
          :signal.code==='deals_past_expected_close'
            ?'Revisar oportunidades fora do prazo e definir próximo passo ou encerramento.'
            :null,
      evidence
    });
  }

  const businessSignals=Array.isArray((business as any)?.signals)?(business as any).signals:[];
  for(const signal of businessSignals.slice(0,6)){
    const severity=String(signal.severity||'info');
    const level:ExecutivePriorityLevel=severity==='critical'?'critical':severity==='attention'?'attention':'info';
    if(priorities.some(item=>item.code===String(signal.code)))continue;
    priorities.push({
      code:String(signal.code||'business_signal'),
      level,
      title:String(signal.title||'Sinal do negócio'),
      detail:String(signal.message||'Sinal identificado pela inteligência empresarial.'),
      hypothesis:signal.why_it_matters?String(signal.why_it_matters):null,
      recommendedNextStep:signal.recommendation?String(signal.recommendation):null,
      evidence:Object.entries(signal.evidence||{}).map(([label,value])=>({source:'nex.business_intelligence',label,value}))
    });
  }

  if(overdueByContact.length){
    const total=overdueByContact.reduce((sum,row)=>sum+n(row.amount_minor),0);
    const top=overdueByContact[0];
    const existing=priorities.find(item=>item.code==='receivables_overdue');
    const evidence:ExecutiveEvidence[]=[
      {source:'nex.finance',label:'topOverdueCounterparty',value:top.label},
      {source:'nex.finance',label:'topOverdueAmountMinor',value:n(top.amount_minor)},
      {source:'nex.finance',label:'top5OverdueAmountMinor',value:total}
    ];
    if(existing)existing.evidence.push(...evidence);
  }

  const topClientShare=metrics.top_client_share_pct??metrics.topClientSharePct;
  if(topClientShare!==null&&topClientShare!==undefined&&Number(topClientShare)>=35&&!priorities.some(item=>item.code==='customer_concentration')){
    priorities.push({
      code:'customer_concentration',
      level:Number(topClientShare)>=50?'critical':'attention',
      title:'Receita concentrada em poucos clientes',
      detail:`O maior cliente representa cerca de ${Number(topClientShare).toFixed(1)}% da receita observada.`,
      hypothesis:'Concentração elevada aumenta a exposição caso esse relacionamento desacelere; isso é um risco, não uma previsão de churn.',
      recommendedNextStep:'Revisar dependência, relacionamento e pipeline de substituição/expansão.',
      evidence:[{source:'nex.business_intelligence',label:'topClientSharePct',value:Number(topClientShare)}]
    });
  }

  const relationshipSummary=(relationship as any)?.summary||{};
  const relationshipRows=Array.isArray((relationship as any)?.relationships)?(relationship as any).relationships:[];
  const atRiskRelationships=relationshipRows.filter((row:any)=>row.status==='risk');
  const renewalRelationships=relationshipRows.filter((row:any)=>row.status==='renewal');
  if(atRiskRelationships.length){
    const top=atRiskRelationships.slice(0,3);
    priorities.push({
      code:'relationship_at_risk',
      level:atRiskRelationships.length>=3?'critical':'attention',
      title:'Clientes com relacionamento em risco',
      detail:`${atRiskRelationships.length} cliente(s) combinam sinais que merecem recuperação prioritária.`,
      hypothesis:'A classificação usa regras visíveis de atraso e recência de relacionamento; não é uma previsão automática de churn.',
      recommendedNextStep:'Revisar os clientes em risco, confirmar o contexto financeiro e criar follow-ups internos antes de qualquer contato externo.',
      evidence:[
        {source:'nex.relationship_intelligence',label:'atRiskCount',value:atRiskRelationships.length},
        {source:'nex.relationship_intelligence',label:'topContacts',value:top.map((row:any)=>({name:row.name,reasons:row.reasons,daysSinceTouch:row.daysSinceTouch,externalSources:row.externalSources||[]}))}
      ]
    });
  }
  if(renewalRelationships.length){
    const top=renewalRelationships.slice(0,3);
    priorities.push({
      code:'relationship_renewal_soon',
      level:'attention',
      title:'Renovações pedem preparação',
      detail:`${renewalRelationships.length} cliente(s) estão em janela de renovação ou término de recorrência.`,
      recommendedNextStep:'Preparar contexto, oferta e tarefa de renovação; nada deve ser enviado automaticamente.',
      evidence:[
        {source:'nex.relationship_intelligence',label:'renewalSoonCount',value:renewalRelationships.length},
        {source:'nex.relationship_intelligence',label:'topRenewals',value:top.map((row:any)=>({name:row.name,renewalAt:row.renewalAt,reasons:row.reasons,externalSources:row.externalSources||[]}))}
      ]
    });
  }

  const projectedCash30=metrics.projected_cash_30_minor??metrics.projectedCash30Minor??null;
  if(projectedCash30!==null&&Number(projectedCash30)<0&&!priorities.some(item=>item.code==='projected_cash_negative')){
    priorities.push({
      code:'projected_cash_negative',
      level:'critical',
      title:'Projeção de caixa negativa em 30 dias',
      detail:'Com os lançamentos atualmente registrados, o caixa projetado para 30 dias fica negativo.',
      hypothesis:'A projeção depende da qualidade e completude dos recebimentos e pagamentos registrados.',
      recommendedNextStep:'Revisar recebíveis, contas a pagar e datas previstas antes de assumir novos compromissos.',
      evidence:[{source:'nex.business_intelligence',label:'projectedCash30Minor',value:Number(projectedCash30)}]
    });
  }

  const rank=(level:ExecutivePriorityLevel)=>level==='critical'?0:level==='attention'?1:2;
  priorities.sort((a,b)=>rank(a.level)-rank(b.level));
  const selected=priorities.slice(0,8);

  const critical=selected.filter(item=>item.level==='critical').length;
  const attention=selected.filter(item=>item.level==='attention').length;
  const headline=critical
    ?`Encontrei ${critical} prioridade(s) crítica(s) e ${attention} ponto(s) de atenção no contexto atual.`
    :attention
      ?`Encontrei ${attention} ponto(s) que merecem atenção antes de virarem problema.`
      :graph.coverage.nodes<10
        ?'Ainda estou aprendendo o negócio; faltam sinais suficientes para uma leitura executiva forte.'
        :'O contexto atual não mostra prioridade crítica, mas continuo monitorando mudanças entre financeiro, vendas e operação.';

  return{
    generatedAt:new Date().toISOString(),
    workspace:{id:workspaceId,name:workspaceName},
    headline,
    priorities:selected,
    businessGraph:{
      nodes:graph.coverage.nodes,
      edges:graph.coverage.edges,
      sources:graph.coverage.sources,
      relationships
    },
    indicators:{
      pipelineMinor:n(crm[0]?.pipeline_minor),
      openDeals:n(crm[0]?.open_deals),
      receivableMinor:n((finance as any).receivable_minor),
      overdueCount:n((finance as any).overdue_count),
      overdueReceivableMinor:n((finance as any).overdue_receivable_minor),
      payableMinor:n((finance as any).payable_minor),
      projectedCash30Minor:projectedCash30===null?null:Number(projectedCash30),
      businessHealthScore:snapshot?.overall_score===null||snapshot?.overall_score===undefined?null:Number(snapshot.overall_score),
      businessKnowledgePct:snapshot?.knowledge_pct===null||snapshot?.knowledge_pct===undefined?null:Number(snapshot.knowledge_pct),
      relationshipAtRisk:n(relationshipSummary.atRisk),
      relationshipRenewalSoon:n(relationshipSummary.renewalSoon),
      relationshipAttention:n(relationshipSummary.attention),
      externalRelationshipEvents:n((relationship as any)?.sources?.googleWorkspaceEventsObserved)
    },
    evidencePolicy:{
      causalClaimsRequireEvidence:true,
      correlationsAreHypotheses:true,
      externalEffects:false,
      readOnly:true
    }
  };
}

export function executiveNarrative(context:ExecutiveContext){
  const priorityText=context.priorities.length
    ?context.priorities.slice(0,4).map((item,index)=>`${index+1}. ${item.title}: ${item.detail}`).join(' ')
    :'Ainda não encontrei um sinal executivo forte.';
  return `${context.headline} ${priorityText}`;
}
