import {useEffect,useState} from 'react';
import {api,post,session} from './api';

type Priority={source:string;severity:string;title:string;reason:string;action:string;dimension:string;signalId?:string|null};
type Driver={type:string;key:string;label:string;delta:number;direction:'better'|'worse'|'neutral';text:string};
type SectorMetric={key:string;label:string;value:string;quality:'automatic'|'informed'};
type SectorInsight={level:'good'|'attention'|'info';title:string;message:string};
type Radar={generatedAt:string;status:string;score:number|null;scoreDelta:number|null;trend:string;drivers:Driver[];priorities:Priority[];knowledge:{percent:number;missing:string[]};recurring:{monthlyIncomeMinor:number;monthlyExpenseMinor:number;incomeSharePct:number|null;activeIncomeRules:number;expiring60Days:number};sector:{kind:string;metrics:SectorMetric[];insights:SectorInsight[]};snapshotAt?:string|null};

const sectorNames:Record<string,string>={general:'seu negócio',services:'serviços',professional_services:'serviços profissionais',health:'saúde',beauty:'beleza e bem-estar',commerce:'comércio',restaurant:'alimentação',education:'educação',automotive:'automotivo',real_estate:'imobiliário',creator:'criação de conteúdo'};

export default function BusinessRadarCenter(){
  const [open,setOpen]=useState(false);const [radar,setRadar]=useState<Radar|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [actionBusy,setActionBusy]=useState<number|null>(null);const [actionMessage,setActionMessage]=useState('');
  const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);const authenticated=Boolean(session.token()&&session.workspace());
  useEffect(()=>{const timer=setInterval(()=>{const key=`${session.token()}|${session.workspace()}`;setSessionKey(prev=>prev===key?prev:key)},700);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!authenticated){setOpen(false);setRadar(null);return}void load()},[sessionKey]);
  async function load(){setBusy(true);setError('');try{setRadar(await api<Radar>('/v1/intelligence/radar'))}catch(e:any){setError(e?.message||'Não foi possível montar seu radar.')}finally{setBusy(false)}}
  async function createAction(index:number){setActionBusy(index);setActionMessage('');setError('');try{const r=await post<any>('/v1/intelligence/actions/task',{priorityIndex:index});setActionMessage(`Tarefa criada: ${r?.task?.title||'prioridade do Radar'}. O NexOffice vai acompanhar o resultado.`)}catch(e:any){setError(e?.message||'Não foi possível criar a tarefa.')}finally{setActionBusy(null)}}
  if(!authenticated)return null;
  const attention=(radar?.priorities||[]).filter(x=>x.severity==='critical'||x.severity==='attention').length;
  return <>
    <button className={`businessRadarLauncher ${attention?'hasAttention':''}`} onClick={()=>setOpen(true)}><span>◈</span><b>Radar de Hoje</b>{radar?.score!==null&&radar?.score!==undefined?<strong>{radar.score}</strong>:null}</button>
    {open&&<div className="businessRadarBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="businessRadarPanel">
      <header className="businessRadarHeader"><div><small>NEXOFFICE · RADAR DO NEGÓCIO</small><h2>O que merece sua atenção hoje</h2><p>Prioridades, mudanças e sinais do seu negócio em linguagem simples.</p></div><div className="businessRadarActions"><button onClick={()=>void load()} disabled={busy}>{busy?'Atualizando…':'Atualizar'}</button><button className="close" onClick={()=>setOpen(false)}>×</button></div></header>
      {error&&<div className="businessRadarError">{error}</div>}{actionMessage&&<div className="businessRadarSuccess">{actionMessage}</div>}
      <div className="businessRadarBody">{radar?<>
        <section className="businessRadarScore"><div><small>SAÚDE DO NEGÓCIO</small><b>{radar.score??'—'}<i>/100</i></b><span>{radar.scoreDelta===null?'Primeira comparação':`${radar.scoreDelta>0?'+':''}${radar.scoreDelta} ponto(s) desde a leitura anterior`}</span></div><div><small>CONHECIMENTO DO NEGÓCIO</small><b>{radar.knowledge?.percent??0}<i>%</i></b><span>{radar.knowledge?.percent>=70?'Boa base para interpretar sua empresa':'Quanto mais você usa o NexOffice, melhor fica a leitura'}</span></div></section>

        <section className="businessRadarSection"><div className="businessRadarTitle"><div><small>PRIORIDADES</small><h3>As coisas mais importantes agora</h3></div><span>{radar.priorities.length}</span></div><div className="businessRadarPriorities">{radar.priorities.length?radar.priorities.map((p,i)=><article key={`${p.title}-${i}`} className={p.severity}><div className="priorityNumber">{i+1}</div><div><b>{p.title}</b><p>{p.reason}</p><div className="priorityAction"><small>Próximo passo</small><span>{p.action}</span><button className="priorityTaskButton" disabled={actionBusy!==null} onClick={()=>void createAction(i)}>{actionBusy===i?'Criando…':'Criar tarefa e acompanhar'}</button></div></div></article>):<div className="businessRadarEmpty">Nenhuma prioridade importante agora. Continue registrando sua operação.</div>}</div></section>

        <section className="businessRadarSection"><div className="businessRadarTitle"><div><small>O QUE MUDOU</small><h3>Por que seu índice se movimentou</h3></div></div>{radar.drivers.length?<div className="businessRadarDrivers">{radar.drivers.map(d=><article key={`${d.type}-${d.key}`} className={d.direction}><span>{d.direction==='better'?'↑':d.direction==='worse'?'↓':'→'}</span><div><b>{d.label}</b><p>{d.text}</p></div></article>)}</div>:<div className="businessRadarEmpty">Ainda não há histórico suficiente para explicar mudanças. A comparação fica melhor a cada nova leitura.</div>}</section>

        <section className="businessRadarSection"><div className="businessRadarTitle"><div><small>SEU MODELO DE NEGÓCIO</small><h3>Indicadores úteis para {sectorNames[radar.sector.kind]||'sua empresa'}</h3></div></div><div className="businessRadarMetrics">{radar.sector.metrics.map(m=><article key={m.key}><small>{m.label}</small><b>{m.value}</b><span>{m.quality==='automatic'?'Calculado pelo NexOffice':'Informado pela empresa'}</span></article>)}</div><div className="businessRadarSectorInsights">{radar.sector.insights.map((x,i)=><article key={`${x.title}-${i}`} className={x.level}><b>{x.title}</b><p>{x.message}</p></article>)}</div></section>

        {radar.knowledge?.missing?.length>0&&<section className="businessRadarSection"><div className="businessRadarTitle"><div><small>MAIS PRECISÃO</small><h3>O que pode melhorar nossa leitura</h3></div></div><div className="businessRadarMissing">{radar.knowledge.missing.slice(0,5).map(x=><span key={x}>+ {x}</span>)}</div></section>}
        <footer>O Radar ajuda na gestão e não representa aprovação, negativa ou oferta de crédito.</footer>
      </>:<div className="businessRadarEmpty">Preparando o radar da empresa…</div>}</div>
    </section></div>}
  </>;
}
