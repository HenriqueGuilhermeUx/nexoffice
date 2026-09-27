import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {api,session} from './api';
import './home-v2.css';

type Dashboard={
  finance?:{receivable_minor?:number;overdue_count?:number};
  crm?:{open_deals?:number;open_pipeline_minor?:number};
  appointments?:{today_appointments?:number};
};
type Area={id:string;attention:number};
type Overview={areas:Area[];pendingApprovals:number};
type Founder={health?:{score:number|null;summary?:string|null};money?:{overdueMinor:number;overdueCount:number};sales?:{pipelineMinor:number;openDeals:number};operations?:{overdueTasks:number;appointmentsToday:number}};

const money=(minor:any=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(minor||0)/100);
const assistants=[
  {name:'Maya',initial:'M',role:'Coordenação',target:'Equipe Digital'},
  {name:'Theo',initial:'T',role:'Financeiro',target:'Financeiro'},
  {name:'Dora',initial:'D',role:'Documentos',target:'Documentos'},
  {name:'Clara',initial:'C',role:'Clientes',target:'CRM'},
  {name:'Nico',initial:'N',role:'Operações',target:'Agenda & Tarefas'},
  {name:'Sofia',initial:'S',role:'Recepção',target:'Agenda & Tarefas'}
];

function clickNav(match:string){
  const buttons=[...document.querySelectorAll<HTMLButtonElement>('.sidebar nav button')];
  buttons.find(b=>(b.textContent||'').toLowerCase().includes(match.toLowerCase()))?.click();
}

export default function HomeV2(){
  const[host,setHost]=useState<HTMLElement|null>(null),[active,setActive]=useState(false),[dashboard,setDashboard]=useState<Dashboard|null>(null),[overview,setOverview]=useState<Overview|null>(null),[founder,setFounder]=useState<Founder|null>(null),[loading,setLoading]=useState(false);
  const[sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);
  useEffect(()=>{const sync=()=>{const selected=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');const on=Boolean(selected?.textContent?.includes('Central de Comando'));setActive(on);setSessionKey(`${session.token()}|${session.workspace()}`);const content=document.querySelector<HTMLElement>('.content');if(content){let mount=document.getElementById('nexo-home-v2-mount');if(!mount){mount=document.createElement('div');mount.id='nexo-home-v2-mount';content.prepend(mount)}setHost(mount)}document.body.classList.toggle('nexoHomeV2Active',on)};sync();const o=new MutationObserver(sync);o.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});const t=window.setInterval(sync,900);return()=>{o.disconnect();clearInterval(t);document.body.classList.remove('nexoHomeV2Active')}},[]);
  useEffect(()=>{if(active&&session.token()&&session.workspace())void load()},[active,sessionKey]);
  async function load(){setLoading(true);try{const[d,o,f]=await Promise.all([api<Dashboard>('/v1/dashboard').catch(()=>null),api<Overview>('/v1/command/overview').catch(()=>null),api<Founder>('/v1/intelligence/founder-cockpit').catch(()=>null)]);setDashboard(d);setOverview(o);setFounder(f)}finally{setLoading(false)}}
  if(!active||!host)return null;
  const area=(id:string)=>overview?.areas?.find(x=>x.id===id);
  const overdue=Number(founder?.money?.overdueCount??dashboard?.finance?.overdue_count??0);
  const approvals=Number(overview?.pendingApprovals||0);
  const tasks=Number(founder?.operations?.overdueTasks||0);
  const docs=Number(area('documents')?.attention||0);
  const attention=approvals+overdue+tasks+docs;
  const score=founder?.health?.score;

  return createPortal(<section className="homeV3">
    <section className="homeMayaHero">
      <div className="homeMayaIdentity"><span className="homeMayaAvatar">M</span><div><small>MAYA · SUA COORDENADORA</small><h2>{attention?`${attention} item${attention===1?'':'s'} merecem sua atenção hoje.`:'Tudo sob controle por enquanto.'}</h2><p>{founder?.health?.summary||'Eu organizo clientes, financeiro, documentos e operação para você decidir o que importa.'}</p></div></div>
      <div className="homeMayaActions"><button className="primary" onClick={()=>clickNav('Equipe Digital')}>Conversar com Maya</button><button onClick={()=>clickNav('Equipe Digital')}>Chamar reunião</button><button className="icon" onClick={()=>void load()} disabled={loading} title="Atualizar">{loading?'…':'↻'}</button></div>
    </section>

    <section className="homePulse" aria-label="Resumo do negócio">
      <button onClick={()=>clickNav('Financeiro')}><span>A receber</span><b>{money(dashboard?.finance?.receivable_minor)}</b><small>{overdue?`${overdue} vencida${overdue===1?'':'s'}`:'sem vencidos'}</small></button>
      <button onClick={()=>clickNav('CRM')}><span>Pipeline</span><b>{money(founder?.sales?.pipelineMinor??dashboard?.crm?.open_pipeline_minor)}</b><small>{founder?.sales?.openDeals??dashboard?.crm?.open_deals??0} oportunidades</small></button>
      <button onClick={()=>clickNav('Agenda & Tarefas')}><span>Hoje</span><b>{founder?.operations?.appointmentsToday??dashboard?.appointments?.today_appointments??0}</b><small>compromissos</small></button>
      <button onClick={()=>clickNav('Equipe Digital')}><span>Saúde</span><b>{score==null?'—':score}</b><small>{score==null?'base em formação':'de 100'}</small></button>
    </section>

    <section className="homeTeamSection">
      <header><div><small>EQUIPE DIGITAL</small><h3>Seis especialistas. Uma empresa.</h3></div><button onClick={()=>clickNav('Equipe Digital')}>Ver equipe →</button></header>
      <div className="homeTeamStrip">{assistants.map((a,i)=><button key={a.name} className={i===0?'lead':''} onClick={()=>clickNav(a.target)}><span className="agentDot">{a.initial}</span><span><b>{a.name}</b><small>{a.role}</small></span><em>→</em></button>)}</div>
    </section>

    <section className="homeAreasSection">
      <header><small>ÁREAS</small><h3>Entre direto no trabalho.</h3></header>
      <div className="homeAreas">
        <button onClick={()=>clickNav('CRM')}><span>Clientes</span><small>CRM · oportunidades · follow-up</small><em>→</em></button>
        <button onClick={()=>clickNav('Financeiro')}><span>Financeiro</span><small>Pix · cobranças · caixa · conciliação</small><em>→</em></button>
        <button onClick={()=>clickNav('Documentos')}><span>Documentos</span><small>Contratos · assinaturas · inteligência</small><em>→</em></button>
        <button onClick={()=>clickNav('Marketing')}><span>Crescimento</span><small>Marketing · campanhas · oportunidades</small><em>→</em></button>
      </div>
    </section>
  </section>,host);
}
