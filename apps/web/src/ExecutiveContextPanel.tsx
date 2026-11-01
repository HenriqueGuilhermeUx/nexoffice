import {useCallback,useEffect,useState} from 'react';
import {api} from './api';

type Evidence={source:string;label:string;value:unknown};
type Priority={
  code:string;
  level:'info'|'attention'|'critical';
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
  evidence:Evidence[];
};
type ExecutiveContext={
  generatedAt:string;
  headline:string;
  priorities:Priority[];
  businessGraph:{nodes:number;edges:number;sources:string[];relationships:Record<string,number>};
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
    crossSystemInsights:number;
    decisionPatterns:number;
    decisionsAnalyzed:number;
  };
  crossSystem:{insights:number;critical:number;attention:number;customers:number;sourceSystems:string[]};
  decisionLearning:{patterns:number;decisionsAnalyzed:number;decisionsWithObservedOutcome:number;outcomeCoveragePct:number;topPatterns:Array<{actionType:string;decision:string;sampleSize:number;outcomeCoveragePct:number;positiveDecisionPct:number;negativeDecisionPct:number;evidenceLevel:string;interpretation:string;recommendedUse:string}>};
  contextualDecisionLearning:{patterns:number;decisionsAnalyzed:number;topPatterns:Array<{actionType:string;decision:string;context:{contactKind:string;financialState:string;engagementState:string};sampleSize:number;outcomeCoveragePct:number;positiveDecisionPct:number;negativeDecisionPct:number;evidenceLevel:string;interpretation:string;recommendedUse:string}>};
  decisionEffectiveness:{decisionsAnalyzed:number;posturePatterns:number;contextualPatterns:number;comparablePrioritySets:number;byPosture:Array<{posture:string;sampleSize:number;completedObservationWindows:number;decisionsWithObservedEvents:number;observationCoveragePct:number;decisionsWithPositivePct:number;decisionsWithNegativePct:number;neutralOnlyPct:number;evidenceLevel:string;interpretation:string;recommendedUse:string}>;comparisons:Array<{priorityCode:string;priorityTitle:string;postures:Array<any>;interpretation:string;safeConclusion:string}>} ;
  decisionFollowup:{decisionsTracked:number;withObservedEvents:number;monitoring:number;positiveObservations:number;negativeObservations:number;topFollowups:Array<{decisionId:string;priorityTitle:string;selectedLabel:string;selectedPosture:string;rationale:string;chosenAt:string;daysSinceDecision:number;observationStatus:string;summary:{totalObserved:number;positive:number;negative:number;neutral:number;latestObservedAt:string|null};observedEvents:Array<{eventId:string;eventType:string;source:string;observedAt:string;daysAfterDecision:number;code:string;label:string;polarity:string;detail:string|null}>;interpretation:string;relationship:{temporal:true;sameWorkspace:true;causalClaim:false}}>} ;
  recommendationStack:{prioritiesCovered:number;pathsGenerated:number;prioritiesWithComparableCases:number;items:Array<{priority:{code:string;level:string;title:string;detail:string;hypothesis:string|null};paths:Array<{id:string;label:string;posture:'conservative'|'balanced'|'active';description:string;why:string;tradeoffs:string[];risks:string[];suggestedActionFamily:string|null;confidence:'low'|'medium'|'high';evidence:Evidence[];comparableCases:Array<{contactId:string|null;name:string|null;similarityScore:number;actionType:string;sampleSize:number;outcomeCoveragePct:number;positiveDecisionPct:number;negativeDecisionPct:number;evidenceLevel:string}>;humanReviewRequired:true;externalEffects:false}>;recommendationPolicy:{defaultPath:'balanced';defaultIsSuggestionOnly:true;automaticSelection:false;automaticExecution:false;humanChoosesPath:true;causalClaims:false}}>} ;
  caseBasedLearning:{currentCases:number;casesWithComparableHistory:number;strongMatches:number;topCases:Array<{contactId:string;name:string;relationshipStatus:string;currentContext:{contactKind:string;financialState:string;engagementState:string};reasons:string[];bestMatch:{similarityScore:number;matchedDimensions:string[];actionType:string;sampleSize:number;outcomeCoveragePct:number;positiveDecisionPct:number;negativeDecisionPct:number;evidenceLevel:string;interpretation:string}|null;interpretation:string}>};
  evidencePolicy:{causalClaimsRequireEvidence:boolean;correlationsAreHypotheses:boolean;externalEffects:false;readOnly:true};
};
type SourceRegistry={
  native:Array<{source:string;kind:string;records:number;connected:boolean}>;
  integrations:Array<{provider:string;status:string;capabilities:string[]}>;
  alternativeVentures:Array<{sourceProduct:string;signals:number;lastSignalAt?:string|null;privacy:string}>;
  connectorContract:{version:string;normalizesTo:string;supports:string[]};
  safety:{workspaceScoped:boolean;secretsReturned:boolean;externalEffects:boolean};
};

const money=(minor:number|null|undefined)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(minor||0)/100);
const levelLabel:Record<string,string>={critical:'Crítico',attention:'Atenção',info:'Observação'};
const localDateKey=()=>{
  const d=new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
const hashText=(value:string)=>{
  let hash=2166136261;
  for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return 'fnv1a-'+(hash>>>0).toString(16).padStart(8,'0');
};

export default function ExecutiveContextPanel({workspaceId}:{workspaceId:string}){
  const [context,setContext]=useState<ExecutiveContext|null>(null);
  const [sources,setSources]=useState<SourceRegistry|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [decisionStatus,setDecisionStatus]=useState<Record<string,string>>({});
  const [deepOpen,setDeepOpen]=useState(false);
  const [briefingReview,setBriefingReview]=useState<{review_date:string;briefing_hash:string;reviewed_at:string;metadata?:{snapshot?:any}}|null>(null);
  const [reviewHistory,setReviewHistory]=useState<Array<{review_date:string;briefing_hash:string;reviewed_at:string;metadata?:{snapshot?:any}}>>([]);
  const [reviewMessage,setReviewMessage]=useState('');
  const reviewDate=localDateKey();
  const scrollTo=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});

  const load=useCallback(async()=>{
    if(!workspaceId)return;
    setLoading(true);setError('');
    try{
      const [ctx,registry,reviewState,historyState]=await Promise.all([
        api<ExecutiveContext>('/v1/assistant/executive-context'),
        api<SourceRegistry>('/v1/business-graph/sources'),
        api<{review:{review_date:string;briefing_hash:string;reviewed_at:string;metadata?:{snapshot?:any}}|null}>(`/v1/executive-briefing/review?date=${reviewDate}`).catch(()=>({review:null})),
        api<{reviews:Array<{review_date:string;briefing_hash:string;reviewed_at:string;metadata?:{snapshot?:any}}>}>(`/v1/executive-briefing/history?before=${reviewDate}&limit=7`).catch(()=>({reviews:[]}))
      ]);
      setContext(ctx);setSources(registry);setBriefingReview(reviewState.review||null);setReviewHistory(historyState.reviews||[]);
    }catch(e:any){
      setError(e?.message||'Não foi possível montar a visão executiva.');
    }finally{setLoading(false)}
  },[workspaceId,reviewDate]);

  useEffect(()=>{void load()},[load]);

  const recordDecision=useCallback(async(item:ExecutiveContext['recommendationStack']['items'][number],path:ExecutiveContext['recommendationStack']['items'][number]['paths'][number])=>{
    const rationale=window.prompt('Por que você escolheu este caminho? A justificativa ficará registrada na memória executiva.');
    if(!rationale||rationale.trim().length<8)return;
    setDecisionStatus(current=>({...current,[path.id]:'Salvando…'}));
    try{
      await api('/v1/executive-decisions',{
        method:'POST',
        body:JSON.stringify({
          priority:item.priority,
          path:{
            id:path.id,
            posture:path.posture,
            label:path.label,
            suggestedActionFamily:path.suggestedActionFamily,
            confidence:path.confidence,
            tradeoffs:path.tradeoffs,
            risks:path.risks,
            evidence:(path as any).evidence||[],
            comparableCases:path.comparableCases||[]
          },
          rationale:rationale.trim()
        })
      });
      setDecisionStatus(current=>({...current,[path.id]:'Decisão registrada · nenhuma ação executada'}));
    }catch(e:any){
      setDecisionStatus(current=>({...current,[path.id]:e?.message||'Não foi possível registrar a decisão'}));
    }
  },[]);

  if(loading&&!context)return <section className="executiveContextPanel"><div className="executiveContextLoading">Maya está cruzando o contexto do negócio…</div></section>;
  if(error&&!context)return <section className="executiveContextPanel"><div className="executiveContextError">{error}<button onClick={()=>void load()}>Tentar novamente</button></div></section>;
  if(!context)return null;

  const priority=context.priorities.slice(0,3);
  const connectedIntegrations=sources?.integrations.filter(item=>item.status==='connected').length||0;
  const avSignals=sources?.alternativeVentures.reduce((sum,item)=>sum+Number(item.signals||0),0)||0;
  const briefingKnow=[
    ...priority.map(item=>({title:item.title,detail:item.detail,level:item.level})),
    ...(context.indicators.projectedCash30Minor!=null&&context.indicators.projectedCash30Minor<0?[{title:'Caixa projetado em atenção',detail:`A projeção de 30 dias está negativa em ${money(Math.abs(context.indicators.projectedCash30Minor))}.`,level:'critical' as const}]:[]),
    ...(context.indicators.overdueCount>0?[{title:'Recebíveis vencidos',detail:`${context.indicators.overdueCount} item(ns) vencido(s), somando ${money(context.indicators.overdueReceivableMinor)}.`,level:'attention' as const}]:[])
  ].slice(0,3);
  const briefingDecisions=(context.recommendationStack?.items||[]).slice(0,2).map(item=>({
    code:item.priority.code,
    title:item.priority.title,
    detail:item.priority.detail,
    balanced:item.paths.find(path=>path.posture==='balanced')||item.paths[0]
  }));
  const briefingRisk=priority.find(item=>item.level==='critical')
    ||priority.find(item=>item.level==='attention')
    ||(context.indicators.projectedCash30Minor!=null&&context.indicators.projectedCash30Minor<0
      ?{code:'projected_cash_negative',level:'critical' as const,title:'Pressão de caixa projetada',detail:`A projeção de caixa para 30 dias está negativa em ${money(Math.abs(context.indicators.projectedCash30Minor))}.`,evidence:[]}
      :null);
  const briefingSnapshot={
    priorities:priority.map(item=>({code:item.code,level:item.level,title:item.title})),
    decisions:briefingDecisions.map(item=>({code:item.code,path:item.balanced?.id||null})),
    risk:briefingRisk?{code:briefingRisk.code,level:briefingRisk.level,title:briefingRisk.title}:null,
    overdueCount:context.indicators.overdueCount,
    projectedCash30Minor:context.indicators.projectedCash30Minor
  };
  const briefingHash=hashText(JSON.stringify({
    ...briefingSnapshot,
    priorities:priority.map(item=>({...briefingSnapshot.priorities.find(x=>x.code===item.code),detail:item.detail,next:item.recommendedNextStep||null})),
    decisions:briefingDecisions.map(item=>({...briefingSnapshot.decisions.find(x=>x.code===item.code),confidence:item.balanced?.confidence||null})),
    risk:briefingRisk?{...briefingSnapshot.risk,detail:briefingRisk.detail}:null,
    overdueReceivableMinor:context.indicators.overdueReceivableMinor
  }));
  const baselineReview=briefingReview||reviewHistory[0]||null;
  const previousSnapshot=baselineReview?.metadata?.snapshot||null;
  const briefingChanges:string[]=[];
  if(previousSnapshot){
    const previousPriorityCodes=new Set((previousSnapshot.priorities||[]).map((x:any)=>x.code));
    const currentPriorityCodes=new Set(briefingSnapshot.priorities.map(x=>x.code));
    const newPriorities=briefingSnapshot.priorities.filter(x=>!previousPriorityCodes.has(x.code));
    const removedPriorities=(previousSnapshot.priorities||[]).filter((x:any)=>!currentPriorityCodes.has(x.code));
    const escalated=briefingSnapshot.priorities.filter(current=>{
      const previous=(previousSnapshot.priorities||[]).find((x:any)=>x.code===current.code);
      const weight:Record<string,number>={info:1,attention:2,critical:3};
      return previous&&weight[current.level]>weight[previous.level];
    });
    const previousDecisionCodes=new Set((previousSnapshot.decisions||[]).map((x:any)=>x.code));
    const newDecisions=briefingSnapshot.decisions.filter(x=>!previousDecisionCodes.has(x.code));
    if(newPriorities.length)briefingChanges.push(`${newPriorities.length} nova(s) prioridade(s)`);
    if(escalated.length)briefingChanges.push(`${escalated.length} prioridade(s) agravada(s)`);
    if(newDecisions.length)briefingChanges.push(`${newDecisions.length} nova(s) decisão(ões)`);
    if(removedPriorities.length)briefingChanges.push(`${removedPriorities.length} prioridade(s) deixou(aram) o topo`);
    if(JSON.stringify(previousSnapshot.risk||null)!==JSON.stringify(briefingSnapshot.risk||null))briefingChanges.push('risco principal alterado');
    if(Number(previousSnapshot.overdueCount||0)!==briefingSnapshot.overdueCount)briefingChanges.push('vencidos atualizados');
    if(previousSnapshot.projectedCash30Minor!==briefingSnapshot.projectedCash30Minor)briefingChanges.push('projeção de caixa atualizada');
  }
  const reviewedAt=briefingReview?.reviewed_at||null;
  const changedSinceReview=Boolean(baselineReview&&baselineReview.briefing_hash!==briefingHash);
  const comparedFromPreviousDay=Boolean(!briefingReview&&baselineReview);
  const baselineLabel=baselineReview?new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(new Date(`${baselineReview.review_date}T12:00:00`)):null;
  const markReviewed=async()=>{
    setReviewMessage('Salvando revisão…');
    try{
      const result=await api<{review:{review_date:string;briefing_hash:string;reviewed_at:string;metadata?:{snapshot?:any}}}>('/v1/executive-briefing/review',{
        method:'POST',body:JSON.stringify({date:reviewDate,briefingHash,snapshot:briefingSnapshot})
      });
      setBriefingReview(result.review);setReviewMessage('Briefing revisado e sincronizado.');
    }catch(e:any){setReviewMessage(e?.message||'Não foi possível salvar a revisão.')}
  };
  const reopenReview=async()=>{
    setReviewMessage('Reabrindo revisão…');
    try{
      await api(`/v1/executive-briefing/review?date=${reviewDate}`,{method:'DELETE'});
      setBriefingReview(null);setReviewMessage('Revisão reaberta.');
    }catch(e:any){setReviewMessage(e?.message||'Não foi possível reabrir a revisão.')}
  };

  return <section className="executiveContextPanel">
    <div className="executiveContextHead">
      <div>
        <p className="eyebrow">MAYA · VISÃO EXECUTIVA</p>
        <h3>{context.headline}</h3>
        <p>Leitura cruzada de vendas, financeiro, operação, agenda, documentos e fontes externas. Correlações multi-sistema aparecem como hipóteses explicáveis; nenhuma ação é executada daqui.</p>
      </div>
      <button onClick={()=>void load()} disabled={loading}>{loading?'Analisando…':'Atualizar leitura'}</button>
    </div>

    <div className="executiveBriefing">
      <div className="executiveBriefingHead">
        <div><p className="eyebrow">BRIEFING DE HOJE</p><h4>3 coisas para saber · 2 decisões para tomar · 1 risco para acompanhar</h4></div>
        <div className="executiveBriefingStatus">
          <span>{new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(new Date())}</span>
          <b className={changedSinceReview?'changed':reviewedAt?'reviewed':'pending'}>{changedSinceReview?(comparedFromPreviousDay?'Mudou desde a última revisão':'Mudou desde a revisão'):reviewedAt?'Revisado hoje':'Pendente de revisão'}</b>
        </div>
      </div>
      <div className="executiveBriefingGrid">
        <section>
          <strong><b>3</b> coisas para saber</strong>
          <div className="executiveBriefingList">
            {briefingKnow.length?briefingKnow.map((item,index)=><button className="executiveBriefingItem" key={'know|'+index} onClick={()=>scrollTo('maya-priorities')}>
              <span className={'briefingLevel '+item.level}>{String(index+1).padStart(2,'0')}</span>
              <div><b>{item.title}</b><p>{item.detail}</p></div>
            </button>):<button className="executiveBriefingItem" onClick={()=>scrollTo('maya-priorities')}><span className="briefingLevel info">✓</span><div><b>Nenhuma mudança crítica agora</b><p>A Maya continua cruzando as fontes conectadas.</p></div></button>}
          </div>
        </section>
        <section>
          <strong><b>2</b> decisões para tomar</strong>
          <div className="executiveBriefingList">
            {briefingDecisions.length?briefingDecisions.map((item,index)=><button className="executiveBriefingItem" key={'decision|'+item.code} onClick={()=>scrollTo('maya-decisions')}>
              <span className="briefingLevel decision">{String(index+1).padStart(2,'0')}</span>
              <div><b>{item.title}</b><p>{item.balanced?.label||'Revisar caminho'} · {item.balanced?.confidence||'baixa'} confiança</p></div>
            </button>):<button className="executiveBriefingItem" onClick={()=>scrollTo('maya-decisions')}><span className="briefingLevel info">✓</span><div><b>Nenhuma decisão estruturada pendente</b><p>A Maya não encontrou uma escolha executiva prioritária neste momento.</p></div></button>}
          </div>
        </section>
        <section>
          <strong><b>1</b> risco para acompanhar</strong>
          <button className="executiveBriefingRisk executiveBriefingRiskButton" onClick={()=>{if(briefingRisk?.learningContext)setDeepOpen(true);scrollTo(briefingRisk?.learningContext?'maya-analysis':'maya-priorities')}}>
            {briefingRisk?<><span className={'briefingLevel '+briefingRisk.level}>!</span><div><b>{briefingRisk.title}</b><p>{briefingRisk.detail}</p><small>{briefingRisk.learningContext?'Abrir contexto e histórico':'Acompanhar prioridade'} · sem execução automática.</small></div></>:<><span className="briefingLevel info">✓</span><div><b>Sem risco crítico destacado</b><p>Os sinais atuais não formam um risco executivo prioritário.</p></div></>}
          </button>
        </section>
      </div>
      <div className="executiveBriefingReview">
        <div>
          <span>{changedSinceReview?(comparedFromPreviousDay?`O contexto mudou desde sua revisão de ${baselineLabel}.`:'O contexto mudou depois da sua última revisão.'):reviewedAt?`Revisado às ${new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(reviewedAt))}`:baselineReview?`Última revisão registrada em ${baselineLabel}.`:'Ainda não marcou o briefing de hoje como revisado.'}</span>
          <small>{changedSinceReview?(comparedFromPreviousDay?'Revise o briefing de hoje para atualizar sua referência executiva.':'Revise novamente para confirmar a nova leitura.'):`${briefingDecisions.length} decisão(ões) executiva(s) estruturada(s) para revisar.`}</small>
          {changedSinceReview&&briefingChanges.length>0&&<div className="executiveBriefingChanges">{briefingChanges.slice(0,4).map(item=><em key={item}>{item}</em>)}</div>}
          {reviewMessage&&<small className="executiveReviewMessage">{reviewMessage}</small>}
        </div>
        <div>
          {briefingDecisions.length>0&&<button onClick={()=>scrollTo('maya-decisions')}>Ver decisões</button>}
          {(!reviewedAt||changedSinceReview)?<button className="primary" onClick={()=>void markReviewed()}>{changedSinceReview?'Revisar nova versão':'Marcar como revisado'}</button>:<button onClick={()=>void reopenReview()}>Reabrir revisão</button>}
        </div>
      </div>
      {reviewHistory.length>0&&<details className="executiveBriefingHistory">
        <summary>Últimas revisões</summary>
        <div>{reviewHistory.slice(0,7).map(item=><span key={item.review_date}>
          <b>{new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(new Date(`${item.review_date}T12:00:00`))}</b>
          <small>{new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date(item.reviewed_at))}</small>
        </span>)}</div>
      </details>}
    </div>

    <div className="executivePriorityGrid" id="maya-priorities">
      {priority.length?priority.map((item,index)=><article className={`executivePriority ${item.level}`} key={item.code}>
        <div className="executivePriorityTop"><span>{String(index+1).padStart(2,'0')}</span><b>{levelLabel[item.level]||item.level}</b></div>
        <h4>{item.title}</h4>
        <p>{item.detail}</p>
        {item.hypothesis&&<small><strong>Leitura:</strong> {item.hypothesis}</small>}
        {item.recommendedNextStep&&<div className="executiveNext"><span>PRÓXIMO PASSO</span>{item.recommendedNextStep}</div>}
        {item.learningContext&&<button className="executiveHistoryHint" onClick={()=>setDeepOpen(true)}>
          Histórico comparável disponível · {item.learningContext.sampleSize} decisões · evidência {item.learningContext.evidenceLevel}
        </button>}
        {item.evidence?.length>0&&<details><summary>Ver evidências</summary><div className="executiveEvidence">{item.evidence.slice(0,6).map((e,i)=><code key={`${item.code}-${i}`}><span>{e.label}</span>{typeof e.value==='object'?JSON.stringify(e.value):String(e.value)}</code>)}</div></details>}
      </article>):<article className="executivePriority info"><h4>Nenhuma prioridade crítica agora.</h4><p>A Maya continua monitorando mudanças entre as áreas conectadas.</p></article>}
    </div>

    {context.recommendationStack?.items?.length>0&&<div className="executiveRecommendationStack" id="maya-decisions">
      <div className="executiveDecisionPatternsHead"><div><p className="eyebrow">MAYA · CAMINHOS DE DECISÃO</p><h4>Três formas de responder à prioridade atual</h4><p>A Maya organiza alternativas com evidências, riscos, trade-offs e precedentes comparáveis. Nenhum caminho é escolhido ou executado automaticamente.</p></div><span>{context.recommendationStack.pathsGenerated} caminho(s)</span></div>
      {context.recommendationStack.items.slice(0,3).map(item=><section className="executiveRecommendationItem" key={'rec|'+item.priority.code}>
        <div className="executiveRecommendationPriority"><span>{item.priority.level}</span><div><h5>{item.priority.title}</h5><p>{item.priority.detail}</p></div></div>
        <div className="executiveRecommendationGrid">{item.paths.map(path=><article className={'executiveRecommendationPath '+path.posture} key={path.id}>
          <div className="executiveRecommendationPathHead"><div><b>{path.label}</b><span>{path.posture}</span></div><em>{path.confidence} confiança</em></div>
          <p>{path.description}</p>
          <small>{path.why}</small>
          <div className="executiveRecommendationLists"><div><strong>Trade-offs</strong><ul>{path.tradeoffs.map(x=><li key={x}>{x}</li>)}</ul></div><div><strong>Riscos</strong><ul>{path.risks.map(x=><li key={x}>{x}</li>)}</ul></div></div>
          {path.comparableCases?.length>0&&<div className="executiveRecommendationCases"><span>Precedentes comparáveis</span>{path.comparableCases.slice(0,2).map((c,i)=><small key={String(c.contactId||i)}>{c.name||'Caso histórico'} · {c.similarityScore}% similar · {c.sampleSize} decisões · {c.outcomeCoveragePct}% com resultado observado</small>)}</div>}
          <footer><span>{path.suggestedActionFamily||'revisão'}</span><b>Escolha humana obrigatória</b></footer>
          <button className="executiveDecisionButton" onClick={()=>void recordDecision(item,path)}>Registrar esta decisão</button>
          {decisionStatus[path.id]&&<small className="executiveDecisionStatus">{decisionStatus[path.id]}</small>}
        </article>)}</div>
      </section>)}
    </div>}

    <div className="executiveExplain" id="maya-analysis">
      <div>
        <p className="eyebrow">POR QUE A MAYA CHEGOU NISSO</p>
        <h4>Histórico, precedentes e aprendizado ficam disponíveis sem poluir a decisão.</h4>
        <p>Abra quando quiser auditar a leitura: casos comparáveis, acompanhamento de decisões, padrões contextuais e strategy learning.</p>
      </div>
      <button onClick={()=>setDeepOpen(open=>!open)}>{deepOpen?'Ocultar análise':'Ver análise completa'}</button>
    </div>

    {deepOpen&&<div className="executiveDeepAnalysis">
    {context.decisionEffectiveness?.byPosture?.length>0&&<div className="executiveDecisionEffectiveness">
      <div className="executiveDecisionPatternsHead"><div><p className="eyebrow">MAYA · STRATEGY LEARNING</p><h4>Como as posturas vêm se comportando no histórico observado</h4><p>A comparação é descritiva. Diferenças podem refletir seleção, contexto e fatores não medidos; nenhuma postura é tratada como causalmente superior.</p></div><span>{context.decisionEffectiveness.decisionsAnalyzed} decisão(ões)</span></div>
      <div className="executiveDecisionEffectivenessGrid">{context.decisionEffectiveness.byPosture.map(item=><article key={'strategy|'+item.posture}>
        <div className="executiveDecisionFollowupHead"><div><b>{item.posture}</b><span>Evidência {item.evidenceLevel}</span></div><em>{item.sampleSize} casos</em></div>
        <div className="executivePatternStats"><span><b>{item.observationCoveragePct}%</b> com eventos observados</span><span><b>{item.decisionsWithPositivePct}%</b> com positivo</span><span><b>{item.decisionsWithNegativePct}%</b> com negativo</span><span><b>{item.completedObservationWindows}</b> janelas completas</span></div>
        <p>{item.interpretation}</p>
        <small>{item.recommendedUse}</small>
      </article>)}</div>
      {context.decisionEffectiveness.comparisons?.length>0&&<div className="executiveStrategyComparisons">{context.decisionEffectiveness.comparisons.slice(0,3).map(item=><article key={'cmp|'+item.priorityCode}><b>{item.priorityTitle}</b><p>{item.interpretation}</p><small>{item.safeConclusion}</small></article>)}</div>}
    </div>}

    {context.decisionFollowup?.topFollowups?.length>0&&<div className="executiveDecisionFollowup">
      <div className="executiveDecisionPatternsHead"><div><p className="eyebrow">MAYA · ACOMPANHAMENTO DE DECISÕES</p><h4>O que aconteceu depois das escolhas registradas</h4><p>Eventos posteriores são observados no mesmo workspace e relacionados por contexto. Sequência temporal não significa causalidade.</p></div><span>{context.decisionFollowup.withObservedEvents}/{context.decisionFollowup.decisionsTracked} com observações</span></div>
      <div className="executiveDecisionFollowupGrid">{context.decisionFollowup.topFollowups.map(item=><article key={'followup|'+item.decisionId}>
        <div className="executiveDecisionFollowupHead"><div><b>{item.priorityTitle}</b><span>{item.selectedLabel} · {item.selectedPosture}</span></div><em>{item.daysSinceDecision} dia(s)</em></div>
        <p><strong>Por que foi escolhido:</strong> {item.rationale}</p>
        <div className="executivePatternStats"><span><b>{item.summary.totalObserved}</b> eventos observados</span><span><b>{item.summary.positive}</b> positivos</span><span><b>{item.summary.negative}</b> negativos</span><span><b>{item.summary.neutral}</b> neutros</span></div>
        {item.observedEvents?.length>0&&<div className="executiveObservedEvents">{item.observedEvents.slice(0,4).map(event=><div key={event.eventId}><span>{event.label}</span><small>{event.daysAfterDecision} dia(s) depois · {event.source}</small>{event.detail&&<p>{event.detail}</p>}</div>)}</div>}
        <small className="executiveCausalCaveat">{item.interpretation}</small>
      </article>)}</div>
    </div>}


    {context.caseBasedLearning?.topCases?.length>0&&<div className="executiveDecisionPatterns">
      <div className="executiveDecisionPatternsHead"><div><p className="eyebrow">MAYA · CASOS COMPARÁVEIS</p><h4>O que aconteceu em situações parecidas com as de agora</h4><p>A Maya compara o contexto atual com padrões históricos reconstruídos na data das decisões. Similaridade organiza evidências; não recomenda repetir uma ação automaticamente.</p></div><span>{context.caseBasedLearning.casesWithComparableHistory} caso(s) com histórico</span></div>
      <div className="executiveDecisionPatternGrid">{context.caseBasedLearning.topCases.map(item=><article key={'case|'+item.contactId}>
        <div><b>{item.name}</b><span>{item.relationshipStatus}</span></div>
        <div className="executiveContextTags"><span>{item.currentContext.contactKind}</span><span>{item.currentContext.financialState}</span><span>{item.currentContext.engagementState}</span></div>
        {item.reasons?.length>0&&<p>{item.reasons.join(' · ')}</p>}
        {item.bestMatch&&<>
          <div className="executiveCaseScore"><strong>{item.bestMatch.similarityScore}%</strong><span>similaridade contextual</span></div>
          <p>{item.bestMatch.interpretation}</p>
          <div className="executivePatternStats"><span><b>{item.bestMatch.sampleSize}</b> decisões históricas</span><span><b>{item.bestMatch.outcomeCoveragePct}%</b> com resultado observado</span><span><b>{item.bestMatch.positiveDecisionPct}%</b> com positivo</span><span><b>{item.bestMatch.negativeDecisionPct}%</b> com negativo</span></div>
          <small>Dimensões coincidentes: {item.bestMatch.matchedDimensions.join(', ')} · Evidência {item.bestMatch.evidenceLevel}. Apenas apoio à revisão humana.</small>
        </>}
      </article>)}</div>
    </div>}

    {context.contextualDecisionLearning?.topPatterns?.length>0&&<div className="executiveDecisionPatterns">
      <div className="executiveDecisionPatternsHead"><div><p className="eyebrow">MAYA · INTELIGÊNCIA CONTEXTUAL</p><h4>Decisões em situações realmente comparáveis</h4><p>O contexto é reconstruído na data da decisão: tipo de cliente, atrasos existentes naquele momento e recência de interação. Isso reduz comparações enganosas e continua sem provar causalidade.</p></div><span>{context.contextualDecisionLearning.patterns} padrão(ões)</span></div>
      <div className="executiveDecisionPatternGrid">{context.contextualDecisionLearning.topPatterns.map(pattern=><article key={'ctx|'+pattern.actionType+'|'+pattern.decision+'|'+pattern.context.contactKind+'|'+pattern.context.financialState+'|'+pattern.context.engagementState}>
        <div><b>{pattern.actionType}</b><span>{pattern.decision}</span></div>
        <div className="executiveContextTags"><span>{pattern.context.contactKind}</span><span>{pattern.context.financialState}</span><span>{pattern.context.engagementState}</span></div>
        <p>{pattern.interpretation}</p>
        <div className="executivePatternStats"><span><b>{pattern.sampleSize}</b> decisões comparáveis</span><span><b>{pattern.outcomeCoveragePct}%</b> com resultado observado</span><span><b>{pattern.positiveDecisionPct}%</b> com positivo</span><span><b>{pattern.negativeDecisionPct}%</b> com negativo</span></div>
        <small>Evidência: {pattern.evidenceLevel} · {pattern.recommendedUse}</small>
      </article>)}</div>
    </div>}

    {context.decisionLearning?.topPatterns?.length>0&&<div className="executiveDecisionPatterns">
      <div className="executiveDecisionPatternsHead"><div><p className="eyebrow">MAYA · PADRÕES DE DECISÃO</p><h4>O que costuma ser observado depois de decisões semelhantes</h4><p>Padrões descritivos do histórico da empresa. Amostra e cobertura ficam visíveis; nada aqui altera autonomia ou prova causalidade.</p></div><span>{context.decisionLearning.patterns} padrão(ões)</span></div>
      <div className="executiveDecisionPatternGrid">{context.decisionLearning.topPatterns.map(pattern=><article key={pattern.actionType+'|'+pattern.decision}>
        <div><b>{pattern.actionType}</b><span>{pattern.decision}</span></div>
        <p>{pattern.interpretation}</p>
        <div className="executivePatternStats"><span><b>{pattern.sampleSize}</b> decisões</span><span><b>{pattern.outcomeCoveragePct}%</b> com resultado observado</span><span><b>{pattern.positiveDecisionPct}%</b> com ao menos um resultado positivo</span><span><b>{pattern.negativeDecisionPct}%</b> com ao menos um resultado negativo</span></div>
        <small>Evidência: {pattern.evidenceLevel} · {pattern.recommendedUse}</small>
      </article>)}</div>
    </div>}


    </div>}

    <div className="executiveContextFooter executiveContextFooterCompact">
      <div><span>Conhecimento do negócio</span><b>{context.indicators.businessKnowledgePct==null?'Aprendendo':`${Math.round(context.indicators.businessKnowledgePct)}%`}</b></div>
      <div><span>Fontes conectadas</span><b>{context.businessGraph.sources.length+connectedIntegrations}</b></div>
      <div><span>Cruzamentos relevantes</span><b>{context.crossSystem?.insights||0}</b></div>
      <div><span>Decisões acompanhadas</span><b>{context.decisionFollowup?.decisionsTracked||0}</b></div>
    </div>

    <div className="executiveContextTrust">
      <span>✓ Workspace isolado</span><span>✓ Somente leitura</span><span>✓ Evidências rastreáveis</span><span>✓ Mín. 2 fontes por correlação</span><span>✓ Padrão ≠ causalidade</span><span>✓ Sem efeito externo</span>
    </div>
  </section>;
}
