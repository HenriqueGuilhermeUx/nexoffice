import {useEffect,useState} from 'react';
import {api,session} from './api';
import './command-center-overview.css';

type AreaAction={id:string;title:string;summary:string;priority:string;status:string;autonomy:string;approvalId?:string|null;actionType:string};
type Area={id:string;label:string;attention:number;detail:string;metrics:Record<string,number>;actions?:AreaAction[]};
type Overview={generatedAt:string;pendingApprovals:number;areas:Area[]};

const icons:Record<string,string>={approvals:'✓',messages:'↗',pix:'₿',documents:'▱',fiscal:'§',growth:'↗',agenda:'◷',crm:'◎'};
const safeAreas=new Set(['approvals','messages','pix','documents','fiscal','growth','agenda','crm']);

export default function CommandCenterOverview(){
  const [overview,setOverview]=useState<Overview|null>(null);
  const [active,setActive]=useState(false);
  const [busy,setBusy]=useState(false);
  const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);
  const authenticated=Boolean(session.token()&&session.workspace());

  useEffect(()=>{const timer=setInterval(()=>{setSessionKey(`${session.token()}|${session.workspace()}`);const selected=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');setActive(Boolean(selected?.textContent?.includes('Central de Comando')))},500);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!authenticated||!active){setOverview(null);return}void load();const timer=setInterval(()=>void load(),30000);return()=>clearInterval(timer)},[sessionKey,active]);

  async function load(){setBusy(true);try{setOverview(await api<Overview>('/v1/command/overview'))}catch{}finally{setBusy(false)}}
  if(!authenticated||!active||!overview)return null;
  const areas=overview.areas.filter(area=>safeAreas.has(area.id));
  const totalAttention=areas.reduce((sum,area)=>sum+Number(area.attention||0),0);

  return <aside className="commandRadar" aria-label="Radar operacional da Central de Comando">
    <div className="commandRadarHead">
      <div><p>NEXOFFICE · RADAR</p><h3>Operação em um olhar</h3><small>{totalAttention?`${totalAttention} sinal(is) pedem atenção`:'Nenhum sinal crítico agora'}</small></div>
      <button onClick={()=>void load()} disabled={busy} aria-label="Atualizar radar">{busy?'…':'↻'}</button>
    </div>
    <div className="commandRadarGrid">{areas.map(area=><article key={area.id} className={`commandRadarCard ${area.attention>0?'attention':''}`}>
      <div className="commandRadarCardTop"><span className="commandRadarIcon">{icons[area.id]||'•'}</span><b>{area.label}</b><strong>{Number(area.attention||0)}</strong></div>
      <p>{area.detail}</p>
      {area.actions?.[0]&&<small>{area.actions[0].title}</small>}
    </article>)}</div>
    <div className="commandRadarFoot"><span>Approval-first ativo</span><span>Somente visão operacional</span></div>
  </aside>;
}
