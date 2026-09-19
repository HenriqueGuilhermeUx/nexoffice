import {useEffect,useState} from 'react';
import {api,session} from './api';
import './command-center-overview.css';

type AreaAction={id:string;title:string;summary:string;priority:string;status:string;autonomy:string;approvalId?:string|null;actionType:string};
type Area={id:string;label:string;attention:number;detail:string;metrics:Record<string,number>;actions?:AreaAction[]};
type Overview={generatedAt:string;pendingApprovals:number;areas:Area[]};
type Intelligence={generatedAt:string;snapshotAt?:string|null;business:Area;finance:Area;marketing:{attention:number;detail:string;metrics:Record<string,number>;actions?:AreaAction[]}};

const icons:Record<string,string>={approvals:'✓',messages:'↗',pix:'₿',business:'◈',finance:'R$',documents:'▱',fiscal:'§',growth:'↗',agenda:'◷',crm:'◎'};
const safeAreas=new Set(['approvals','messages','pix','business','finance','documents','fiscal','growth','agenda','crm']);

function mergeIntelligence(base:Overview,intel:Intelligence|null):Overview{
  if(!intel)return base;
  const areas=base.areas.map(area=>{
    if(area.id!=='growth')return area;
    const extraAttention=Number(intel.marketing?.attention||0),extraActions=intel.marketing?.actions||[];
    return {...area,attention:Number(area.attention||0)+extraAttention,detail:extraAttention?intel.marketing.detail:area.detail,metrics:{...area.metrics,...intel.marketing.metrics},actions:[...extraActions,...(area.actions||[])].slice(0,3)};
  });
  const growthIndex=areas.findIndex(area=>area.id==='growth');
  const insertAt=growthIndex>=0?growthIndex:Math.min(3,areas.length);
  areas.splice(insertAt,0,intel.business,intel.finance);
  return {...base,areas};
}

export default function CommandCenterOverview(){
  const [overview,setOverview]=useState<Overview|null>(null);
  const [active,setActive]=useState(false);
  const [busy,setBusy]=useState(false);
  const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);
  const authenticated=Boolean(session.token()&&session.workspace());

  useEffect(()=>{const timer=setInterval(()=>{setSessionKey(`${session.token()}|${session.workspace()}`);const selected=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');setActive(Boolean(selected?.textContent?.includes('Central de Comando')))},500);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!authenticated||!active){setOverview(null);return}void load();const timer=setInterval(()=>void load(),30000);return()=>clearInterval(timer)},[sessionKey,active]);

  async function load(){setBusy(true);try{const [base,intel]=await Promise.all([api<Overview>('/v1/command/overview'),api<Intelligence>('/v1/command/intelligence').catch(()=>null)]);setOverview(mergeIntelligence(base,intel))}catch{}finally{setBusy(false)}}
  if(!authenticated||!active||!overview)return null;
  const areas=overview.areas.filter(area=>safeAreas.has(area.id));
  const totalAttention=areas.reduce((sum,area)=>sum+Number(area.attention||0),0);

  return <aside className="commandRadar" aria-label="Radar operacional da Central de Comando">
    <div className="commandRadarHead">
      <div><p>NEXOFFICE · RADAR</p><h3>O que precisa da sua atenção</h3><small>{totalAttention?`${totalAttention} sinal(is) priorizado(s) agora`:'Nenhum sinal crítico agora'}</small></div>
      <button onClick={()=>void load()} disabled={busy} aria-label="Atualizar radar">{busy?'…':'↻'}</button>
    </div>
    <div className="commandRadarGrid">{areas.map(area=><article key={area.id} className={`commandRadarCard ${area.attention>0?'attention':''}`}>
      <div className="commandRadarCardTop"><span className="commandRadarIcon">{icons[area.id]||'•'}</span><b>{area.label}</b><strong>{Number(area.attention||0)}</strong></div>
      <p>{area.detail}</p>
      {area.actions?.[0]&&<small title={area.actions[0].summary}>{area.actions[0].title}</small>}
    </article>)}</div>
    <div className="commandRadarFoot"><span>Sinais derivados da operação real</span><span>Humano no controle</span></div>
  </aside>;
}
