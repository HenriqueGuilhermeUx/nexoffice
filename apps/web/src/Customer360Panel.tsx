import {useEffect,useMemo,useState} from 'react';
import {api} from './api';
import './customer-360.css';

type TimelineItem={
  id:string;at:string;kind:string;source:string;title:string;detail?:string|null;status?:string|null;
  amountMinor?:number|null;direction?:'income'|'expense'|null;evidence?:Record<string,unknown>;
};
type Customer360={
  contact:{id:string;kind:string;name:string;email?:string|null;phone?:string|null;companyName?:string|null;source?:string|null;tags:string[]};
  currentState:{
    relationshipStatus:string;relationshipReasons:string[];lastTouchAt?:string|null;daysSinceTouch?:number|null;externalInteractions90:number;
    openDeals:number;openPipelineMinor:number;overdueReceivables:number;overdueMinor:number;bankIncome90Minor:number;openTasks:number;upcomingAppointments:number;nextRenewalAt?:string|null;
  };
  maya:{headline:string;summary:string;recommendedNextStep:string;confidence:string;hypothesis?:string|null};
  crossSystemInsights:Array<{code:string;level:string;confidence:string;title:string;detail:string;hypothesis:string;sourceSystems:string[];recommendedNextStep:string}>;
  decisions:Array<{id:string;actionId?:string|null;approvalId?:string|null;actionType:string;title:string;context?:string|null;decision:string;decidedAt:string;decidedBy:{id:string|null;name:string|null;email:string|null;actorType:string};rationale?:string|null;rationaleStatus:'recorded'|'not_recorded';observedOutcome:{status:string;observedAt?:string|null;executionObserved:boolean;successObserved:boolean|null};subject:{type:string|null;id:string|null};source:string}>;
  decisionSummary:{total:number;approved:number;rejected:number;dismissed:number;withRationale:number;withObservedExecution:number;latestDecisionAt?:string|null};
  timeline:TimelineItem[];
  memory:{events:number;sourceSystems:string[];latestEventAt?:string|null;oldestEventAt?:string|null;factsOnly:boolean;decisionsIncluded:boolean;decisionMemoryStatus:string};
  safety:{readOnly:boolean;externalEffects:boolean;exactEmailForExternalIdentity:boolean;rawExternalFilesStored:boolean;causalClaims:boolean};
};

const money=(minor:unknown)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(minor||0)/100);
const dt=(value?:string|null)=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—';
const statusLabel:Record<string,string>={risk:'Em risco',renewal:'Renovação',attention:'Atenção',expansion:'Expansão',healthy:'Saudável',unknown:'Aprendendo'};
const sourceLabel=(source:string)=>source==='nexoffice.crm'?'CRM NexOffice':source==='nexoffice.finance'?'Financeiro NexOffice':source==='nexoffice.agenda'?'Agenda NexOffice':source==='nexoffice.tasks'?'Tarefas NexOffice':source.startsWith('nexoffice.documents')?'Documentos':source==='external.crm'?'CRM externo':source==='external.erp'?'ERP externo':source==='external.google.gmail'?'Gmail':source==='external.google.calendar'?'Google Calendar':source==='external.microsoft.mail'?'Outlook':source==='external.microsoft.calendar'?'Microsoft Calendar':source==='external.email'?'E-mail importado':source==='external.calendar'?'Calendário importado':source==='nexoffice.decision_memory'?'Decision Memory':source.startsWith('bank:')?'Banco / conciliação':source;

export default function Customer360Panel({contactId,onClose}:{contactId:string;onClose:()=>void}){
  const[data,setData]=useState<Customer360|null>(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[filter,setFilter]=useState('all');

  useEffect(()=>{let alive=true;(async()=>{
    setLoading(true);setError('');
    try{const result=await api<Customer360>('/v1/crm/contacts/'+contactId+'/360');if(alive)setData(result)}
    catch(e:any){if(alive)setError(e?.message||'Não foi possível montar a memória deste cliente.')}
    finally{if(alive)setLoading(false)}
  })();return()=>{alive=false}},[contactId]);

  const timeline=useMemo(()=>{
    if(!data)return[];
    if(filter==='all')return data.timeline;
    if(filter==='relationship')return data.timeline.filter(item=>['crm','communication','calendar','external_crm'].includes(item.kind));
    if(filter==='finance')return data.timeline.filter(item=>['finance','bank','erp'].includes(item.kind));
    if(filter==='work')return data.timeline.filter(item=>['task','document'].includes(item.kind));
    if(filter==='decisions')return data.timeline.filter(item=>item.kind==='decision');
    return data.timeline;
  },[data,filter]);

  return <section className="customer360">
    <div className="customer360Top">
      <div><p className="eyebrow">BUSINESS MEMORY · CUSTOMER 360</p><h3>{data?.contact.name||'Cliente'}</h3><p>{data?.contact.companyName||data?.contact.email||'Contexto unificado do relacionamento.'}</p></div>
      <button onClick={onClose}>Fechar</button>
    </div>
    {loading&&!data&&<div className="customer360Loading">Maya está reconstruindo a memória do relacionamento…</div>}
    {error&&!data&&<div className="customer360Error">{error}</div>}
    {data&&<>
      <div className="customer360State">
        <div><span>Status</span><b>{statusLabel[data.currentState.relationshipStatus]||data.currentState.relationshipStatus}</b></div>
        <div><span>Pipeline aberto</span><b>{money(data.currentState.openPipelineMinor)}</b><small>{data.currentState.openDeals} oportunidade(s)</small></div>
        <div><span>Vencido</span><b>{money(data.currentState.overdueMinor)}</b><small>{data.currentState.overdueReceivables} título(s)</small></div>
        <div><span>Interações externas</span><b>{data.currentState.externalInteractions90}</b><small>últimos 90 dias</small></div>
        <div><span>Último sinal</span><b>{dt(data.currentState.lastTouchAt)}</b></div>
      </div>

      <div className="customer360Maya">
        <div><small>MAYA · LEITURA ATUAL</small><h4>{data.maya.headline}</h4><p>{data.maya.summary}</p>{data.maya.hypothesis&&<em>{data.maya.hypothesis}</em>}</div>
        <aside><span>PRÓXIMO MOVIMENTO</span><b>{data.maya.recommendedNextStep}</b><small>Confiança: {data.maya.confidence}. Nenhuma ação é executada daqui.</small></aside>
      </div>

      {data.crossSystemInsights.length>0&&<div className="customer360Insights">
        <div className="customer360SectionHead"><div><small>CROSS-SYSTEM INTELLIGENCE</small><h4>O que outros sistemas, juntos, estão dizendo</h4></div><span>{data.crossSystemInsights.length} correlação(ões)</span></div>
        <div className="customer360InsightGrid">{data.crossSystemInsights.slice(0,4).map(item=><article key={item.code+item.title} className={item.level}>
          <div><b>{item.title}</b><span>{item.confidence}</span></div><p>{item.detail}</p><small>{item.sourceSystems.map(sourceLabel).join(' · ')}</small><em>{item.hypothesis}</em>
        </article>)}</div>
      </div>}
      {data.decisions.length>0&&<div className="customer360Decisions">
        <div className="customer360SectionHead"><div><small>DECISION MEMORY</small><h4>O que foi decidido neste relacionamento</h4></div><span>{data.decisionSummary.total} decisão(ões)</span></div>
        <div className="customer360DecisionList">{data.decisions.slice(0,8).map(item=><article key={item.id}>
          <div className="customer360DecisionHead"><div><b>{item.title}</b><span className={'decision-'+item.decision}>{item.decision}</span></div><small>{dt(item.decidedAt)} · {item.decidedBy.name||item.decidedBy.actorType}</small></div>
          {item.context&&<p>{item.context}</p>}
          <div className="customer360DecisionMeta"><span><b>Motivo</b>{item.rationale||'Não registrado'}</span><span><b>Desfecho observado</b>{item.observedOutcome.status}</span><span><b>Ação</b>{item.actionType}</span></div>
        </article>)}</div>
      </div>}


      <div className="customer360Memory">
        <div className="customer360SectionHead"><div><small>LINHA DO TEMPO UNIFICADA</small><h4>{data.memory.events} eventos · {data.memory.sourceSystems.length} fontes</h4></div><div className="customer360Filters"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Tudo</button><button className={filter==='relationship'?'active':''} onClick={()=>setFilter('relationship')}>Relacionamento</button><button className={filter==='finance'?'active':''} onClick={()=>setFilter('finance')}>Financeiro</button><button className={filter==='work'?'active':''} onClick={()=>setFilter('work')}>Trabalho</button><button className={filter==='decisions'?'active':''} onClick={()=>setFilter('decisions')}>Decisões</button></div></div>
        <div className="customer360Timeline">{timeline.slice(0,80).map(item=><article key={item.id}>
          <div className="customer360Rail"><span className={'kind-'+item.kind}/></div>
          <div className="customer360Event"><div><b>{item.title}</b><span>{dt(item.at)}</span></div><small>{sourceLabel(item.source)}{item.status?' · '+item.status:''}</small>{item.detail&&<p>{item.detail}</p>}{item.amountMinor!=null&&<strong className={item.direction==='expense'?'negative':'positive'}>{money(item.amountMinor)}</strong>}</div>
        </article>)}</div>
      </div>

      <div className="customer360Trust"><span>✓ Somente fatos e decisões registradas</span><span>✓ Motivo nunca inferido</span><span>✓ Identidade externa por e-mail exato</span><span>✓ Fontes rastreáveis</span><span>✓ Sem causalidade presumida</span><span>✓ Sem efeito externo</span></div>
    </>}
  </section>;
}
