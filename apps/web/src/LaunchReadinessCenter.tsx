import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {api,post} from './api';
import './launch-readiness-center.css';

type Status='ready'|'needs_setup'|'needs_configuration'|'degraded';
type Item={id:string;label:string;description:string;status:Status;customerReady:boolean;requiredForLaunch:boolean;detail:string;actionLabel?:string};
type Readiness={workspace:{id:string;name:string};launchReady:boolean;score:number;readyRequired:number;totalRequired:number;items:Item[];generatedAt:string};

const labels:Record<Status,string>={ready:'Pronto',needs_setup:'Concluir configuração',needs_configuration:'Conectar capacidade',degraded:'Atenção'};
const navFor=(id:string)=>({payments:'Financeiro',documents:'Documentos',marketing:'Crescimento',ai:'Assistentes IA',fiscal:'Financeiro',communication:'Integrações',investments:'Financeiro'} as Record<string,string>)[id];
function openArea(id:string){const target=navFor(id);if(!target)return;const buttons=[...document.querySelectorAll<HTMLButtonElement>('.sidebar nav button')];const button=buttons.find(item=>item.textContent?.includes(target));button?.click();if(id==='fiscal')setTimeout(()=>document.querySelector('.fiscalWorkspace')?.scrollIntoView({behavior:'smooth',block:'start'}),180)}

export default function LaunchReadinessCenter(){
  const[active,setActive]=useState(false),[host,setHost]=useState<Element|null>(null),[data,setData]=useState<Readiness|null>(null),[busy,setBusy]=useState(false),[actionBusy,setActionBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{const sync=()=>{const selected=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');const on=Boolean(selected?.textContent?.includes('Integrações'));setActive(on);setHost(on?document.querySelector('.content'):null)};sync();const timer=setInterval(sync,350);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(active)void load()},[active]);
  async function load(){setBusy(true);setError('');try{setData(await api<Readiness>('/v1/launch-readiness'))}catch(e:any){setError(e?.message||'Não foi possível verificar a prontidão da plataforma.')}finally{setBusy(false)}}
  async function act(item:Item){
    setError('');setNotice('');
    if(item.id==='fiscal'){
      setActionBusy('fiscal');
      try{await post('/v1/integrations/taxagent/activate',{});setNotice('Fiscal conectado. A emissão continua protegida por revisão e aprovação.');await load()}catch(e:any){setError(e?.message||'Não foi possível conectar o Fiscal agora.')}finally{setActionBusy('')}
      return;
    }
    if(item.id==='communication'){
      setActionBusy('communication');
      const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;
      try{
        const result=await post<any>('/v1/integrations/smartbots/activate',{});
        if(result?.handoffUrl){if(popup)popup.location.href=result.handoffUrl;else window.location.href=result.handoffUrl}else if(popup)popup.close();
        setNotice('Bot preparado e vinculado à empresa. Se houver onboarding pendente, conclua na nova aba.');await load();
      }catch(e:any){if(popup)popup.close();setError(e?.message||'Não foi possível ativar o Bot agora.')}finally{setActionBusy('')}
      return;
    }
    openArea(item.id);
  }
  function actionText(item:Item){if(item.id==='fiscal')return actionBusy==='fiscal'?'Conectando…':'Conectar Fiscal';if(item.id==='communication')return actionBusy==='communication'?'Preparando…':'Ativar Bot';return item.actionLabel||'Abrir'}
  if(!active||!host)return null;
  return createPortal(<section className="launchReadiness">
    <header className="launchReadinessHero"><div><p>PRONTIDÃO DO NEXOFFICE</p><h2>Uma empresa inteira. Um NexOffice.</h2><span>O que já funciona de ponta a ponta e o que ainda precisa ser concluído antes do lançamento.</span></div><div className="launchScore"><strong>{data?.score??'—'}%</strong><span>{data?.launchReady?'Pronto para operação completa':'Fechando capacidades essenciais'}</span><button onClick={()=>void load()} disabled={busy}>{busy?'Verificando…':'Verificar agora'}</button></div></header>
    {error&&<div className="launchError">{error}</div>}{notice&&<div className="launchNotice">{notice}</div>}
    {data&&<><div className="launchSummary"><b>{data.readyRequired} de {data.totalRequired} capacidades essenciais prontas</b><span>“Pronto” significa uma jornada utilizável pelo cliente, não apenas uma tela ou integração cadastrada.</span></div><div className="launchGrid">{data.items.map(item=><article key={item.id} className={`launchItem ${item.status}`}><div className="launchItemTop"><i aria-hidden="true">{item.status==='ready'?'✓':item.status==='degraded'?'!':'○'}</i><div><b>{item.label}</b><small>{item.requiredForLaunch?'Essencial':'Complementar'}</small></div><em>{labels[item.status]}</em></div><p>{item.description}</p><span>{item.detail}</span>{item.actionLabel&&item.status!=='ready'&&<button onClick={()=>void act(item)} disabled={Boolean(actionBusy)}>{actionText(item)}</button>}</article>)}</div><footer className="launchPrinciples"><b>Premissa comercial</b><span>O cliente enxerga clientes, dinheiro, documentos, notas, crescimento e apoio. A infraestrutura especializada trabalha por trás, com aprovação humana nas ações externas.</span></footer></>}
  </section>,host);
}
