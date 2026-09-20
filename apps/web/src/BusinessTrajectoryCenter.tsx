import {useEffect,useState} from 'react';
import {api,post,session} from './api';

type Movement={code:string;severity:'attention'|'critical';title:string;whatChanged:string;whyItMatters:string;action:string;horizonDays:number;runDate:string};
type Trajectory={available:boolean;generatedAt?:string|null;movements:Movement[];message:string;note:string};

export default function BusinessTrajectoryCenter(){
  const [open,setOpen]=useState(false);const [data,setData]=useState<Trajectory|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);const authenticated=Boolean(session.token()&&session.workspace());
  useEffect(()=>{const timer=setInterval(()=>{const key=`${session.token()}|${session.workspace()}`;setSessionKey(prev=>prev===key?prev:key)},700);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!authenticated){setOpen(false);setData(null);return}void load(false)},[sessionKey]);
  async function load(refresh:boolean){setBusy(true);setError('');try{setData(refresh?await post<Trajectory>('/v1/intelligence/trajectory/refresh',{}):await api<Trajectory>('/v1/intelligence/trajectory'))}catch(e:any){setError(e?.message||'Não foi possível montar a trajetória do negócio.')}finally{setBusy(false)}}
  if(!authenticated)return null;
  const count=data?.movements?.length||0;
  return <>
    <button className={`businessTrajectoryLauncher ${count?'hasMovement':''}`} onClick={()=>setOpen(true)}><span>↗</span><b>Trajetória</b>{count?<strong>{count}</strong>:null}</button>
    {open&&<div className="businessTrajectoryBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="businessTrajectoryPanel">
      <header><div><small>NEXOFFICE · TRAJETÓRIA DO NEGÓCIO</small><h2>Mudanças antes de chegarem ao caixa</h2><p>O NexOffice compara sua empresa com ela mesma e procura mudanças de comportamento que merecem ação.</p></div><div className="trajectoryActions"><button onClick={()=>void load(true)} disabled={busy}>{busy?'Atualizando…':'Atualizar'}</button><button className="close" onClick={()=>setOpen(false)}>×</button></div></header>
      {error&&<div className="trajectoryError">{error}</div>}
      <div className="trajectoryBody">{data?<>
        <section className="trajectorySummary"><div><small>LEITURA ATUAL</small><h3>{data.message}</h3><p>{count?`${count} mudança(s) relevante(s) encontrada(s) com os dados disponíveis.`:'Continue usando o NexOffice. Quanto mais histórico existe, melhor fica a comparação.'}</p></div></section>
        {count?<div className="trajectoryList">{data.movements.map((m,i)=><article key={`${m.code}-${i}`} className={m.severity}><div className="trajectorySignalHead"><span>{m.severity==='critical'?'AGIR AGORA':'ACOMPANHAR'}</span><small>janela aproximada: {m.horizonDays} dias</small></div><h3>{m.title}</h3><p>{m.whatChanged}</p><div className="trajectoryExplain"><b>Por que isso importa</b><span>{m.whyItMatters}</span></div><div className="trajectoryAction"><b>Próximo passo</b><span>{m.action}</span></div></article>)}</div>:<div className="trajectoryEmpty">Nenhuma deterioração temporal importante foi detectada agora.</div>}
        <footer>{data.note}</footer>
      </>:<div className="trajectoryEmpty">Preparando a primeira trajetória…</div>}</div>
    </section></div>}
  </>;
}
