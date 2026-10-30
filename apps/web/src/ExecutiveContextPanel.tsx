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

export default function ExecutiveContextPanel({workspaceId}:{workspaceId:string}){
  const [context,setContext]=useState<ExecutiveContext|null>(null);
  const [sources,setSources]=useState<SourceRegistry|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  const load=useCallback(async()=>{
    if(!workspaceId)return;
    setLoading(true);setError('');
    try{
      const [ctx,registry]=await Promise.all([
        api<ExecutiveContext>('/v1/assistant/executive-context'),
        api<SourceRegistry>('/v1/business-graph/sources')
      ]);
      setContext(ctx);setSources(registry);
    }catch(e:any){
      setError(e?.message||'Não foi possível montar a visão executiva.');
    }finally{setLoading(false)}
  },[workspaceId]);

  useEffect(()=>{void load()},[load]);

  if(loading&&!context)return <section className="executiveContextPanel"><div className="executiveContextLoading">Maya está cruzando o contexto do negócio…</div></section>;
  if(error&&!context)return <section className="executiveContextPanel"><div className="executiveContextError">{error}<button onClick={()=>void load()}>Tentar novamente</button></div></section>;
  if(!context)return null;

  const priority=context.priorities.slice(0,3);
  const connectedIntegrations=sources?.integrations.filter(item=>item.status==='connected').length||0;
  const avSignals=sources?.alternativeVentures.reduce((sum,item)=>sum+Number(item.signals||0),0)||0;

  return <section className="executiveContextPanel">
    <div className="executiveContextHead">
      <div>
        <p className="eyebrow">MAYA · VISÃO EXECUTIVA</p>
        <h3>{context.headline}</h3>
        <p>Leitura cruzada de vendas, financeiro, operação, agenda, documentos e fontes externas. Correlações multi-sistema aparecem como hipóteses explicáveis; nenhuma ação é executada daqui.</p>
      </div>
      <button onClick={()=>void load()} disabled={loading}>{loading?'Analisando…':'Atualizar leitura'}</button>
    </div>

    <div className="executivePriorityGrid">
      {priority.length?priority.map((item,index)=><article className={`executivePriority ${item.level}`} key={item.code}>
        <div className="executivePriorityTop"><span>{String(index+1).padStart(2,'0')}</span><b>{levelLabel[item.level]||item.level}</b></div>
        <h4>{item.title}</h4>
        <p>{item.detail}</p>
        {item.hypothesis&&<small><strong>Leitura:</strong> {item.hypothesis}</small>}
        {item.recommendedNextStep&&<div className="executiveNext"><span>PRÓXIMO PASSO</span>{item.recommendedNextStep}</div>}
        {item.learningContext&&<div className="executiveLearningContext">
          <span>HISTÓRICO COMPARÁVEL · CONTEXTO, NÃO CAUSALIDADE</span>
          <p>Em {item.learningContext.sampleSize} decisões aprovadas de <b>{item.learningContext.actionType}</b>, {item.learningContext.outcomeCoveragePct}% tiveram algum resultado posterior observado; {item.learningContext.positiveDecisionPct}% tiveram ao menos um resultado positivo e {item.learningContext.negativeDecisionPct}% ao menos um negativo.</p>
          <small>Evidência {item.learningContext.evidenceLevel}. Uso apenas consultivo; a recomendação continua sujeita à revisão humana.</small>
        </div>}
        {item.evidence?.length>0&&<details><summary>Ver evidências</summary><div className="executiveEvidence">{item.evidence.slice(0,6).map((e,i)=><code key={`${item.code}-${i}`}><span>{e.label}</span>{typeof e.value==='object'?JSON.stringify(e.value):String(e.value)}</code>)}</div></details>}
      </article>):<article className="executivePriority info"><h4>Nenhuma prioridade crítica agora.</h4><p>A Maya continua monitorando mudanças entre as áreas conectadas.</p></article>}
    </div>

    {context.decisionLearning?.topPatterns?.length>0&&<div className="executiveDecisionPatterns">
      <div className="executiveDecisionPatternsHead"><div><p className="eyebrow">MAYA · PADRÕES DE DECISÃO</p><h4>O que costuma ser observado depois de decisões semelhantes</h4><p>Padrões descritivos do histórico da empresa. Amostra e cobertura ficam visíveis; nada aqui altera autonomia ou prova causalidade.</p></div><span>{context.decisionLearning.patterns} padrão(ões)</span></div>
      <div className="executiveDecisionPatternGrid">{context.decisionLearning.topPatterns.map(pattern=><article key={pattern.actionType+'|'+pattern.decision}>
        <div><b>{pattern.actionType}</b><span>{pattern.decision}</span></div>
        <p>{pattern.interpretation}</p>
        <div className="executivePatternStats"><span><b>{pattern.sampleSize}</b> decisões</span><span><b>{pattern.outcomeCoveragePct}%</b> com resultado observado</span><span><b>{pattern.positiveDecisionPct}%</b> com ao menos um resultado positivo</span><span><b>{pattern.negativeDecisionPct}%</b> com ao menos um resultado negativo</span></div>
        <small>Evidência: {pattern.evidenceLevel} · {pattern.recommendedUse}</small>
      </article>)}</div>
    </div>}

    <div className="executiveContextFooter">
      <div><span>Contexto</span><b>{context.businessGraph.nodes} nós · {context.businessGraph.edges} relações</b></div>
      <div><span>Fontes do grafo</span><b>{context.businessGraph.sources.length}</b></div>
      <div><span>Integrações conectadas</span><b>{connectedIntegrations}</b></div>
      <div><span>Sinais Alternative Ventures</span><b>{avSignals}</b></div>
      <div><span>Pipeline</span><b>{money(context.indicators.pipelineMinor)}</b></div>
      <div><span>Conhecimento do negócio</span><b>{context.indicators.businessKnowledgePct==null?'Aprendendo':`${Math.round(context.indicators.businessKnowledgePct)}%`}</b></div>
      <div><span>Cruzamentos multi-sistema</span><b>{context.crossSystem?.insights||0}</b></div>
      <div><span>Clientes correlacionados</span><b>{context.crossSystem?.customers||0}</b></div>
      <div><span>Padrões de decisão</span><b>{context.decisionLearning?.patterns||0}</b></div>
      <div><span>Decisões analisadas</span><b>{context.decisionLearning?.decisionsAnalyzed||0}</b></div>
    </div>

    <div className="executiveContextTrust">
      <span>✓ Workspace isolado</span><span>✓ Somente leitura</span><span>✓ Evidências rastreáveis</span><span>✓ Mín. 2 fontes por correlação</span><span>✓ Padrão ≠ causalidade</span><span>✓ Sem efeito externo</span>
    </div>
  </section>;
}
