import {buildBusinessGraph} from './business-graph.js';
import {readBusinessIntelligence} from './business-intelligence.js';
import {financeSummary} from './events.js';
import {query} from './db.js';
import {buildRelationshipIntelligence} from './routes-relationship-intelligence.js';
import {buildCrossSystemIntelligence} from './cross-system-intelligence.js';
import {buildDecisionPatterns} from './decision-patterns.js';
import {buildContextualDecisionIntelligence} from './contextual-decision-intelligence.js';
import {buildCaseBasedExecutiveIntelligence} from './case-based-executive-intelligence.js';
import {buildExecutiveRecommendationStack} from './executive-recommendation-stack.js';

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
  learningContext?:{
    actionType:string;
    decision:string;
    sampleSize:number;
    outcomeCoveragePct:number;
    positiveDecisionPct:number;
    negativeDecisionPct:number;
    evidenceLevel:string;
    interpretation:string;
    causalClaim:false;
    advisoryOnly:true;
  }|null;
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
    crossSystemInsights:number;
    decisionPatterns:number;
    decisionsAnalyzed:number;
  };
  crossSystem:{
    insights:number;
    critical:number;
    attention:number;
    customers:number;
    sourceSystems:string[];
  };
  decisionLearning:{
    patterns:number;
    decisionsAnalyzed:number;
    decisionsWithObservedOutcome:number;
    outcomeCoveragePct:number;
    topPatterns:Array<{actionType:string;decision:string;sampleSize:number;outcomeCoveragePct:number;positiveDecisionPct:number;negativeDecisionPct:number;evidenceLevel:string;interpretation:string;recommendedUse:string}>;
  };
  contextualDecisionLearning:{
    patterns:number;
    decisionsAnalyzed:number;
    topPatterns:Array<{
      actionType:string;
      decision:string;
      context:{contactKind:string;financialState:string;engagementState:string};
      sampleSize:number;
      outcomeCoveragePct:number;
      positiveDecisionPct:number;
      negativeDecisionPct:number;
      evidenceLevel:string;
      interpretation:string;
      recommendedUse:string;
    }>;
  };
  recommendationStack:{
    prioritiesCovered:number;
    pathsGenerated:number;
    prioritiesWithComparableCases:number;
    items:Array<{
      priority:{code:string;level:string;title:string;detail:string;hypothesis:string|null};
      paths:Array<{
        id:string;
        label:string;
        posture:'conservative'|'balanced'|'active';
        description:string;
        why:string;
        tradeoffs:string[];
        risks:string[];
        suggestedActionFamily:string|null;
        confidence:'low'|'medium'|'high';
        comparableCases:Array<{contactId:string|null;name:string|null;similarityScore:number;actionType:string;sampleSize:number;outcomeCoveragePct:number;positiveDecisionPct:number;negativeDecisionPct:number;evidenceLevel:string}>;
        humanReviewRequired:true;
        externalEffects:false;
      }>;
      recommendationPolicy:{defaultPath:'balanced';defaultIsSuggestionOnly:true;automaticSelection:false;automaticExecution:false;humanChoosesPath:true;causalClaims:false};
    }>;
  };
  caseBasedLearning:{
    currentCases:number;
    casesWithComparableHistory:number;
    strongMatches:number;
    topCases:Array<{
      contactId:string;
      name:string;
      relationshipStatus:string;
      currentContext:{contactKind:string;financialState:string;engagementState:string};
      reasons:string[];
      bestMatch:{
        similarityScore:number;
        matchedDimensions:string[];
        actionType:string;
        sampleSize:number;
        outcomeCoveragePct:number;
        positiveDecisionPct:number;
        negativeDecisionPct:number;
        evidenceLevel:string;
        interpretation:string;
      }|null;
      interpretation:string;
    }>;
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
  const [graph,finance,business,crm,overdueByContact,relationship,crossSystem,decisionPatterns,contextualPatterns]=await Promise.all([
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
    buildRelationshipIntelligence(workspaceId,false).catch(()=>null),
    buildCrossSystemIntelligence(workspaceId).catch(()=>null),
    buildDecisionPatterns(workspaceId,180,3).catch(()=>null),
    buildContextualDecisionIntelligence(workspaceId,180,3).catch(()=>null)
  ]);
  const caseBased=await buildCaseBasedExecutiveIntelligence(workspaceId,180,3,{relationship,contextual:contextualPatterns}).catch(()=>null);

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
      recommendedNextStep:signal.code==='receivables_overdue'||signal.code==='external_receivables_overdue'
        ?'Revisar os maiores recebíveis vencidos e confirmar cobrança, conciliação ou renegociação.'
        :signal.code==='tasks_overdue'
          ?'Priorizar tarefas atrasadas ligadas a clientes, vendas ou entregas relevantes.'
          :signal.code==='deals_past_expected_close'||signal.code==='external_deals_past_expected_close'
            ?'Revisar oportunidades fora do prazo e definir próximo passo, atualização de estágio ou encerramento.'
            :null,
      evidence
    });
  }

  const crossInsights=Array.isArray((crossSystem as any)?.insights)?(crossSystem as any).insights:[];
  for(const insight of crossInsights.slice(0,8)){
    if(priorities.some(item=>item.code===String(insight.code)&&item.detail===String(insight.detail)))continue;
    priorities.push({
      code:String(insight.code||'cross_system_signal'),
      level:String(insight.level||'info') as ExecutivePriorityLevel,
      title:String(insight.title||'Correlação entre sistemas'),
      detail:String(insight.detail||'A Nex encontrou uma relação entre fontes do negócio.'),
      hypothesis:insight.hypothesis?String(insight.hypothesis):'Correlação observada entre fontes; não implica causalidade.',
      recommendedNextStep:insight.recommendedNextStep?String(insight.recommendedNextStep):null,
      evidence:[
        {source:'nex.cross_system',label:'contact',value:{id:insight.contactId,name:insight.contactName}},
        {source:'nex.cross_system',label:'confidence',value:insight.confidence||null},
        {source:'nex.cross_system',label:'sourceSystems',value:Array.isArray(insight.sourceSystems)?insight.sourceSystems:[]},
        ...(Array.isArray(insight.facts)?insight.facts.slice(0,6).map((fact:any)=>({source:String(fact.source||'nex.cross_system'),label:String(fact.label||'fact'),value:fact.value})):[])
      ]
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

  const patternRows=Array.isArray((decisionPatterns as any)?.patterns)?(decisionPatterns as any).patterns:[];
  const actionHints:Record<string,string[]>={
    receivables_overdue:['payment.','message.','task.'],
    external_receivables_overdue:['payment.','message.','task.'],
    relationship_at_risk:['message.','task.','deal.'],
    relationship_renewal_soon:['deal.','document.','message.','task.'],
    deals_past_expected_close:['deal.','message.','task.'],
    external_deals_past_expected_close:['deal.','message.','task.'],
    tasks_overdue:['task.'],
    projected_cash_negative:['payment.']
  };
  const patternRank=(value:string)=>value==='substantial'?4:value==='established'?3:value==='developing'?2:1;
  for(const priority of priorities){
    const hints=actionHints[priority.code]||[];
    if(!hints.length)continue;
    const candidates=patternRows
      .filter((item:any)=>String(item.decision)==='approved')
      .filter((item:any)=>hints.some(prefix=>String(item.actionType||'').startsWith(prefix)))
      .filter((item:any)=>Number(item.sampleSize||0)>=3)
      .sort((a:any,b:any)=>patternRank(String(b.evidenceLevel))-patternRank(String(a.evidenceLevel))||Number(b.sampleSize||0)-Number(a.sampleSize||0)||Number(b.outcomeCoveragePct||0)-Number(a.outcomeCoveragePct||0));
    const learned=candidates[0];
    if(!learned)continue;
    priority.learningContext={
      actionType:String(learned.actionType||''),
      decision:String(learned.decision||''),
      sampleSize:n(learned.sampleSize),
      outcomeCoveragePct:n(learned.outcomeCoveragePct),
      positiveDecisionPct:n(learned.positiveDecisionPct),
      negativeDecisionPct:n(learned.negativeDecisionPct),
      evidenceLevel:String(learned.evidenceLevel||'early'),
      interpretation:String(learned.interpretation||''),
      causalClaim:false,
      advisoryOnly:true
    };
    priority.evidence.push({source:'nex.decision_patterns',label:'historicalDecisionPattern',value:priority.learningContext});
  }

  const rank=(level:ExecutivePriorityLevel)=>level==='critical'?0:level==='attention'?1:2;
  priorities.sort((a,b)=>rank(a.level)-rank(b.level));
  const selected=priorities.slice(0,8);
  const recommendationStack=buildExecutiveRecommendationStack(selected,caseBased);

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
      externalRelationshipEvents:n((relationship as any)?.sources?.externalContextEventsObserved),
      crossSystemInsights:n((crossSystem as any)?.summary?.insights),
      decisionPatterns:n((decisionPatterns as any)?.summary?.patterns),
      decisionsAnalyzed:n((decisionPatterns as any)?.summary?.decisionsAnalyzed)
    },
    crossSystem:{
      insights:n((crossSystem as any)?.summary?.insights),
      critical:n((crossSystem as any)?.summary?.critical),
      attention:n((crossSystem as any)?.summary?.attention),
      customers:n((crossSystem as any)?.summary?.customers),
      sourceSystems:Array.isArray((crossSystem as any)?.summary?.sourceSystems)?(crossSystem as any).summary.sourceSystems:[]
    },
    decisionLearning:{
      patterns:n((decisionPatterns as any)?.summary?.patterns),
      decisionsAnalyzed:n((decisionPatterns as any)?.summary?.decisionsAnalyzed),
      decisionsWithObservedOutcome:n((decisionPatterns as any)?.summary?.decisionsWithObservedOutcome),
      outcomeCoveragePct:n((decisionPatterns as any)?.summary?.outcomeCoveragePct),
      topPatterns:Array.isArray((decisionPatterns as any)?.patterns)?(decisionPatterns as any).patterns.slice(0,3).map((item:any)=>({
        actionType:String(item.actionType||''),decision:String(item.decision||''),sampleSize:n(item.sampleSize),outcomeCoveragePct:n(item.outcomeCoveragePct),positiveDecisionPct:n(item.positiveDecisionPct),negativeDecisionPct:n(item.negativeDecisionPct),evidenceLevel:String(item.evidenceLevel||'early'),interpretation:String(item.interpretation||''),recommendedUse:String(item.recommendedUse||'')
      })):[]
    },
    contextualDecisionLearning:{
      patterns:n((contextualPatterns as any)?.summary?.contextualPatterns),
      decisionsAnalyzed:n((contextualPatterns as any)?.summary?.decisionsAnalyzed),
      topPatterns:Array.isArray((contextualPatterns as any)?.contextualPatterns)?(contextualPatterns as any).contextualPatterns.slice(0,5).map((item:any)=>({
        actionType:String(item.actionType||''),
        decision:String(item.decision||''),
        context:{
          contactKind:String(item.context?.contactKind||'unknown'),
          financialState:String(item.context?.financialState||'unknown'),
          engagementState:String(item.context?.engagementState||'unknown')
        },
        sampleSize:n(item.sampleSize),
        outcomeCoveragePct:n(item.outcomeCoveragePct),
        positiveDecisionPct:n(item.positiveDecisionPct),
        negativeDecisionPct:n(item.negativeDecisionPct),
        evidenceLevel:String(item.evidenceLevel||'early'),
        interpretation:String(item.interpretation||''),
        recommendedUse:String(item.recommendedUse||'')
      })):[]
    },
    recommendationStack:{
      prioritiesCovered:n((recommendationStack as any)?.summary?.prioritiesCovered),
      pathsGenerated:n((recommendationStack as any)?.summary?.pathsGenerated),
      prioritiesWithComparableCases:n((recommendationStack as any)?.summary?.prioritiesWithComparableCases),
      items:Array.isArray((recommendationStack as any)?.items)?(recommendationStack as any).items:[]
    },
    caseBasedLearning:{
      currentCases:n((caseBased as any)?.summary?.currentCases),
      casesWithComparableHistory:n((caseBased as any)?.summary?.casesWithComparableHistory),
      strongMatches:n((caseBased as any)?.summary?.strongMatches),
      topCases:Array.isArray((caseBased as any)?.cases)?(caseBased as any).cases.filter((item:any)=>item.bestMatch).slice(0,5).map((item:any)=>({
        contactId:String(item.contactId||''),
        name:String(item.name||'Cliente'),
        relationshipStatus:String(item.relationshipStatus||'unknown'),
        currentContext:{
          contactKind:String(item.currentContext?.contactKind||'unknown'),
          financialState:String(item.currentContext?.financialState||'unknown'),
          engagementState:String(item.currentContext?.engagementState||'unknown')
        },
        reasons:Array.isArray(item.reasons)?item.reasons.map(String):[],
        bestMatch:item.bestMatch?{
          similarityScore:n(item.bestMatch.similarityScore),
          matchedDimensions:Array.isArray(item.bestMatch.matchedDimensions)?item.bestMatch.matchedDimensions.map(String):[],
          actionType:String(item.bestMatch.actionType||''),
          sampleSize:n(item.bestMatch.sampleSize),
          outcomeCoveragePct:n(item.bestMatch.outcomeCoveragePct),
          positiveDecisionPct:n(item.bestMatch.positiveDecisionPct),
          negativeDecisionPct:n(item.bestMatch.negativeDecisionPct),
          evidenceLevel:String(item.bestMatch.evidenceLevel||'early'),
          interpretation:String(item.bestMatch.interpretation||'')
        }:null,
        interpretation:String(item.interpretation||'')
      })):[]
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
  const topPattern=context.decisionLearning?.topPatterns?.[0];
  const learnedPriority=context.priorities.find(item=>item.learningContext)?.learningContext;
  const learnedText=learnedPriority
    ?` Para uma prioridade atual, existe histórico comparável: ${learnedPriority.sampleSize} decisões aprovadas de ${learnedPriority.actionType}, com ${learnedPriority.outcomeCoveragePct}% tendo algum resultado posterior observado. Isso serve apenas como contexto de revisão humana e não prova causalidade.`
    :'';
  const patternText=topPattern
    ?` Padrão descritivo: em ${topPattern.sampleSize} decisões ${topPattern.decision} de ${topPattern.actionType}, ${topPattern.outcomeCoveragePct}% tiveram algum resultado posterior observado e ${topPattern.positiveDecisionPct}% tiveram ao menos um resultado positivo. Associação temporal; não implica causalidade.`
    :'';
  return `${context.headline} ${priorityText}${learnedText}${patternText}`;
}
