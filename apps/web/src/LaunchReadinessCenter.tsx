import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {api} from './api';
import './launch-readiness-center.css';

type Status='ready'|'needs_setup'|'needs_configuration'|'degraded';
type Item={id:string;label:string;description:string;status:Status;customerReady:boolean;requiredForLaunch:boolean;detail:string;actionLabel?:string};
type Readiness={workspace:{id:string;name:string};launchReady:boolean;score:number;readyRequired:number;totalRequired:number;items:Item[];generatedAt:string};

const labels:Record<Status,string>={ready:'Pronto',needs_setup:'Concluir configuração',needs_configuration:'Conectar motor',degraded:'Atenção'};
const navFor=(id:string)=>({payments:'Financeiro',documents:'Documentos',marketing:'Crescimento',ai:'Assistentes IA',fiscal:'Integrações',communication:'Integrações',investments:'Financeiro'} as Record<string,string>)[id];
function openArea(id:string){const target=navFor(id);if(!target)return;const buttons=[...document.querySelectorAll<HTMLButtonElement>('.sidebar nav button')];const button=buttons.find(item=>item.textContent?.includes(target));button?.click()}

export default function LaunchReadinessCenter(){
  const[active,setActive]=useState(false),[host,setHost]=useState<Element|null>(null),[data,setData]=useState<Readiness|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const sync=()=>{const selected=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');const on=Boolean(selected?.textContent?.includes('Integrações'));setActive(on);setHost(on?document.querySelector('.content'):null)};sync();const timer=setInterval(sync,350);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(active)void load()},[active]);
  async function load(){setBusy(true);setError('');try{setData(await api<Readiness>('/v1/launch-readiness'))}catch(e:any){setError(e?.message||'Não foi possível verificar a prontidão da plataforma.')}finally{setBusy(false)}}
  if(!active||!host)return null;
  return createPortal(<section className="launchReadiness">
    <header className="launchReadinessHero"><div><p>PRONTIDÃO DO NEXOFFICE</p><h2>Uma empresa inteira. Um NexOffice.</h2><span>O que já funciona de ponta a ponta e o que ainda precisa ser conectado antes do lançamento.</span></div><div className="launchScore"><strong>{data?.score??'—'}%</strong><span>{data?.launchReady?'Pronto para operação completa':'Fechando integrações essenciais'}</span><button onClick={()=>void load()} disabled={busy}>{busy?'Verificando…':'Verificar agora'}</button></div></header>
    {error&&<div className="launchError">{error}</div>}
    {data&&<><div className="launchSummary"><b>{data.readyRequired} de {data.totalRequired} capacidades essenciais prontas</b><span>“Pronto” significa funcionalidade disponível para o cliente, não apenas tela ou código existente.</span></div><div className="launchGrid">{data.items.map(item=><article key={item.id} className={`launchItem ${item.status}`}><div className="launchItemTop"><i aria-hidden="true">{item.status==='ready'?'✓':item.status==='degraded'?'!':'○'}</i><div><b>{item.label}</b><small>{item.requiredForLaunch?'Essencial':'Complementar'}</small></div><em>{labels[item.status]}</em></div><p>{item.description}</p><span>{item.detail}</span>{item.actionLabel&&item.status!=='ready'&&<button onClick={()=>openArea(item.id)}>{item.actionLabel}</button>}</article>)}</div><footer className="launchPrinciples"><b>Premissa comercial</b><span>O cliente vê capacidades do negócio — clientes, dinheiro, documentos, notas, marketing e apoio — enquanto DocWallet, TaxAgent, MODO, NextGen e demais motores ficam por trás da experiência.</span></footer></>}
  </section>,host);
}
