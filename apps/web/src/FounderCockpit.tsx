import {useEffect,useState} from 'react';
import {api,post,session} from './api';

type PlanItem={id:string;title:string;rationale:string;benefit:string;action_target:string;priority:number;status:string;task_id?:string|null;due_at?:string|null;source_type:string};
type Cockpit={
  generatedAt:string;
  health:{score:number|null;delta:number|null;status:string;summary?:string|null};
  money:{income7dMinor:number;expense7dMinor:number;overdueMinor:number;overdueCount:number};
  sales:{pipelineMinor:number;openDeals:number};
  operations:{overdueTasks:number;dueTasks7d:number;appointmentsToday:number;appointments7d:number};
  changes:{wins:Array<{title:string;detail:string}>;attention:Array<{title:string;detail:string}>};
  plan:{plan:any;items:PlanItem[]};
  results:Array<{id:string;title:string;status:string;summary?:string|null;note:string;effectPct?:number|null;completedAt?:string|null}>;
  activation:{summary:{journeys:number;clicked:number;value:number;click_rate_pct?:number|null;value_rate_pct?:number|null;average_hours_to_value?:number|null}};
  note:string;
};

type Props={onNavigate?:(view:string)=>void;onChanged?:()=>void|Promise<void>};
const money=(minor:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(minor||0)/100);
const statusLabel=(v:string)=>v==='improved'?'Melhorou':v==='worsened'?'Piorou':'Estável';
const targetToView=(target:string)=>target==='finance'?'finance':target==='crm'?'crm':target==='agenda'?'agenda':target==='documents'?'documents':'command';

export default function FounderCockpit({onNavigate,onChanged}:Props){
  const [data,setData]=useState<Cockpit|null>(null);const [loading,setLoading]=useState(false);const [busyId,setBusyId]=useState('');const [error,setError]=useState('');
  useEffect(()=>{if(session.token()&&session.workspace())void load()},[session.workspace()]);
  async function load(){setLoading(true);setError('');try{setData(await api<Cockpit>('/v1/intelligence/founder-cockpit'))}catch(e:any){setError(e?.message||'Não foi possível montar a visão do dono.')}finally{setLoading(false)}}
  async function createTask(item:PlanItem){setBusyId(item.id);setError('');try{await post(`/v1/intelligence/plan/7-days/items/${item.id}/task`,{});await load();await onChanged?.()}catch(e:any){setError(e?.message||'Não foi possível acompanhar esta ação.')}finally{setBusyId('')}}
  if(!data&&loading)return <section className="founderCockpit loading">Montando sua visão executiva…</section>;
  if(!data)return error?<section className="founderCockpit error">{error}</section>:null;
  const score=data.health.score;const delta=data.health.delta;
  return <section className="founderCockpit">
    <header className="founderHeader"><div><small>VISÃO DO DONO · 30 SEGUNDOS</small><h2>O que mudou, o que exige decisão e o que fazer nesta semana.</h2><p>{data.note}</p></div><div className="founderScore"><small>SAÚDE DO NEGÓCIO</small><b>{score===null?'…':score}</b><span>{delta===null?'Base em formação':`${delta>0?'+':''}${delta} desde a referência`}</span><button onClick={()=>void load()} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button></div></header>
    {error&&<div className="founderError">{error}</div>}
    <div className="founderKpis"><article><small>ENTRADAS · 7 DIAS</small><b>{money(data.money.income7dMinor)}</b><span>saídas {money(data.money.expense7dMinor)}</span></article><article className={data.money.overdueCount?'attention':''}><small>VENCIDOS</small><b>{money(data.money.overdueMinor)}</b><span>{data.money.overdueCount} recebimento(s)</span></article><article><small>PIPELINE</small><b>{money(data.sales.pipelineMinor)}</b><span>{data.sales.openDeals} oportunidade(s)</span></article><article><small>EXECUÇÃO · 7 DIAS</small><b>{data.operations.dueTasks7d}</b><span>{data.operations.overdueTasks} vencida(s) · {data.operations.appointments7d} compromisso(s)</span></article></div>
    <div className="founderGrid">
      <article className="founderPanel"><div className="founderPanelTitle"><div><small>MUDOU RECENTEMENTE</small><h3>Leitura da semana</h3></div></div><div className="founderSignals">{data.changes.attention.slice(0,3).map((x,i)=><div key={`a-${i}`} className="attention"><span>!</span><div><b>{x.title}</b><p>{x.detail}</p></div></div>)}{data.changes.wins.slice(0,2).map((x,i)=><div key={`w-${i}`} className="positive"><span>✓</span><div><b>{x.title}</b><p>{x.detail}</p></div></div>)}</div></article>
      <article className="founderPanel"><div className="founderPanelTitle"><div><small>APRENDIZADO FECHADO</small><h3>O que aconteceu depois das ações</h3></div></div>{data.results.length?<div className="founderResults">{data.results.slice(0,3).map(x=><div key={x.id}><span className={`resultTag ${x.status}`}>{statusLabel(x.status)}</span><b>{x.title}</b><p>{x.summary||'Aguardando leitura comparável.'}</p><small>{x.note}</small></div>)}</div>:<div className="founderEmpty">Ainda não há ações com janela suficiente para comparar antes e depois. O NexOffice já está acumulando essa evidência.</div>}</article>
    </div>
    <article className="founderPlan"><div className="founderPlanHead"><div><small>PLANO INTELIGENTE DE 7 DIAS</small><h3>{data.plan.plan?.summary||'Prioridades da semana'}</h3></div><span>{data.plan.items.filter(x=>x.status==='done').length}/{data.plan.items.length} concluídas</span></div><div className="founderPlanList">{data.plan.items.map((item,i)=><div key={item.id} className={`founderPlanItem ${item.status}`}><span className="planIndex">{item.status==='done'?'✓':i+1}</span><div><b>{item.title}</b><p>{item.benefit}</p><small>{item.rationale}</small></div><div className="planActions">{item.status==='done'?<span className="doneLabel">Concluída</span>:item.task_id?<button onClick={()=>onNavigate?.('agenda')}>Ver tarefa</button>:<button className="primary" disabled={busyId===item.id} onClick={()=>void createTask(item)}>{busyId===item.id?'Criando…':'Acompanhar como tarefa'}</button>}{!item.task_id&&item.action_target!=='task'&&<button onClick={()=>onNavigate?.(targetToView(item.action_target))}>Abrir área</button>}</div></div>)}</div></article>
    <footer className="founderFooter"><div><b>{data.activation.summary.value||0}</b><span>ativações chegaram ao primeiro valor</span></div><div><b>{data.activation.summary.clicked||0}</b><span>recomendações foram iniciadas</span></div><div><b>{data.operations.appointmentsToday}</b><span>compromisso(s) hoje</span></div></footer>
  </section>;
}
