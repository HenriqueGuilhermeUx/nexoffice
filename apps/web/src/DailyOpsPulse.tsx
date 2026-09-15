import {useEffect,useState} from 'react';
import {api,post,session} from './api';
import './daily-ops-pulse.css';

type Overview={appointmentConfirmationsDue:number;staleDeals:number;openAutomationActions:number;firstOutboundRequiresHumanApproval:boolean};
type ScanResult={created:number;reused:number;outboundApprovals:number;internalReviews:number};

export default function DailyOpsPulse(){
  const [overview,setOverview]=useState<Overview|null>(null);const [busy,setBusy]=useState(false);const [note,setNote]=useState('');const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);
  const authenticated=Boolean(session.token()&&session.workspace());
  useEffect(()=>{const timer=setInterval(()=>setSessionKey(`${session.token()}|${session.workspace()}`),1000);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!authenticated){setOverview(null);return}void load();const timer=setInterval(()=>void load(),60000);return()=>clearInterval(timer)},[sessionKey]);
  async function load(){try{setOverview(await api<Overview>('/v1/automations/overview'))}catch{}}
  async function prepare(){setBusy(true);setNote('');try{const result=await post<ScanResult>('/v1/automations/scan',{appointments:true,crm:true,maxPerType:30});setNote(result.created?`${result.created} ação(ões) preparada(s) pela equipe digital.`:'A rotina já estava preparada.');await load();openCommand()}catch(e:any){setNote(e?.message||'Não foi possível preparar a rotina agora.')}finally{setBusy(false)}}
  function openCommand(){const button=[...document.querySelectorAll<HTMLButtonElement>('.sidebar nav button')].find(b=>b.textContent?.includes('Central de Comando'));button?.click()}
  if(!authenticated||!overview)return null;
  const due=Number(overview.appointmentConfirmationsDue||0)+Number(overview.staleDeals||0),open=Number(overview.openAutomationActions||0);
  if(due===0&&open===0&&!note)return null;
  return <div className="dailyOpsPulse" aria-live="polite">
    <div className="dailyOpsAgents"><span>S</span><span>C</span></div>
    <div className="dailyOpsText"><b>Sofia + Clara</b>{due>0?<small>{overview.appointmentConfirmationsDue||0} confirmação(ões) · {overview.staleDeals||0} follow-up(s)</small>:<small>{open} ação(ões) já preparada(s)</small>}{note&&<em>{note}</em>}</div>
    {due>0?<button onClick={prepare} disabled={busy}>{busy?'Preparando…':'Preparar rotina'}</button>:<button onClick={openCommand}>Abrir Central</button>}
  </div>;
}
