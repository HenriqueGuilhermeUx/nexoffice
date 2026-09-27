import {useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {api,session} from './api';
import './office-view.css';

type Dashboard={finance?:{receivable_minor?:number;overdue_count?:number};crm?:{open_deals?:number};tasks?:{due_tasks?:number};appointments?:{today_appointments?:number}};
type Room={id:string;name:string;agent:string;role:string;icon:string;target:string;actions:string[];status:(d:Dashboard|null)=>string};
const money=(minor:any=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(minor||0)/100);
const rooms:Room[]=[
 {id:'reception',name:'Recepção',agent:'Sofia',role:'Atendimento & agenda',icon:'☎',target:'Agenda & Tarefas',actions:['Agenda','Atendimento','Organizar'],status:d=>`${d?.appointments?.today_appointments||0} compromisso(s) hoje`},
 {id:'sales',name:'Comercial',agent:'Clara',role:'Clientes & oportunidades',icon:'◎',target:'CRM',actions:['Pipeline','Clientes','Follow-ups'],status:d=>`${d?.crm?.open_deals||0} oportunidade(s) aberta(s)`},
 {id:'finance',name:'Financeiro',agent:'Theo',role:'Caixa & recebimentos',icon:'$',target:'Financeiro',actions:['Pix','Cobranças','Conciliação'],status:d=>`${money(d?.finance?.receivable_minor)} a receber`},
 {id:'documents',name:'Documentos',agent:'Dora',role:'Contratos & assinaturas',icon:'▱',target:'Documentos',actions:['Contratos','Assinaturas','Analisar'],status:()=>`Contratos e documentos`},
 {id:'marketing',name:'Marketing',agent:'Maya',role:'Crescimento & estratégia',icon:'✦',target:'Marketing',actions:['Campanhas','Ideias','Analisar'],status:()=>`Crescimento e aquisição`},
 {id:'ops',name:'Operações',agent:'Nico',role:'Execução diária',icon:'⚙',target:'Agenda & Tarefas',actions:['Tarefas','Agenda','Execução'],status:d=>`${d?.tasks?.due_tasks||0} tarefa(s) próxima(s)`},
 {id:'archive',name:'Memória',agent:'Oráculo',role:'Conhecimento & segurança',icon:'◇',target:'Equipe Digital',actions:['Memória','Riscos','Histórico'],status:()=>`Conhecimento da empresa`},
 {id:'meeting',name:'Sala de Reuniões',agent:'Maya',role:'Reunião multiagente',icon:'◉',target:'Equipe Digital',actions:['Chamar agentes','Definir pauta','Abrir reunião'],status:()=>`Discuta decisões com sua equipe de IA`},
 {id:'board',name:'Diretoria',agent:'Maya',role:'Visão executiva',icon:'▲',target:'Central de Comando',actions:['Resumo','Saúde','Prioridades'],status:()=>`Visão geral do negócio`}
];
function nav(match:string){const bs=[...document.querySelectorAll<HTMLButtonElement>('.sidebar nav button')];bs.find(b=>(b.textContent||'').toLowerCase().includes(match.toLowerCase()))?.click()}
export default function OfficeView(){
 const [topbar,setTopbar]=useState<Element|null>(null),[host,setHost]=useState<HTMLElement|null>(null),[mode,setMode]=useState(()=>localStorage.getItem('nexoffice.viewMode')==='office'),[selected,setSelected]=useState<Room|null>(null),[dashboard,setDashboard]=useState<Dashboard|null>(null),[meeting,setMeeting]=useState(false),[participants,setParticipants]=useState<string[]>(['Maya']);
 const authenticated=Boolean(session.token()&&session.workspace());
 useEffect(()=>{const sync=()=>{setTopbar(document.querySelector('.topbar'));const content=document.querySelector<HTMLElement>('.content');if(content){let m=document.getElementById('nexo-office-view-mount');if(!m){m=document.createElement('div');m.id='nexo-office-view-mount';content.prepend(m)}setHost(m)}document.body.classList.toggle('nexoOfficeViewActive',mode&&authenticated)};sync();const o=new MutationObserver(sync);o.observe(document.documentElement,{subtree:true,childList:true});return()=>{o.disconnect();document.body.classList.remove('nexoOfficeViewActive')}},[mode,authenticated]);
 useEffect(()=>{if(mode&&authenticated)void api<Dashboard>('/v1/dashboard').then(setDashboard).catch(()=>setDashboard(null))},[mode,authenticated]);
 const toggle=(office:boolean)=>{setMode(office);localStorage.setItem('nexoffice.viewMode',office?'office':'dashboard');setSelected(null)};
 const people=useMemo(()=>['Maya','Theo','Dora','Clara','Nico','Sofia'],[]);
 if(!authenticated)return null;
 const switcher=topbar?createPortal(<div className="officeSwitcher"><button className={!mode?'active':''} onClick={()=>toggle(false)}>Dashboard</button><button className={mode?'active':''} onClick={()=>toggle(true)}>Escritório</button></div>,topbar):null;
 if(!mode||!host)return <>{switcher}</>;
 return <>{switcher}{createPortal(<section className="officeView">
   <header className="officeViewHead"><div><small>NEXOFFICE · OFFICE VIEW</small><h2>Seu negócio como um escritório vivo.</h2><p>Clique em uma sala para entrar no setor, falar com o agente e abrir as ferramentas daquele trabalho.</p></div><span className="officeLive">● operação conectada</span></header>
   <div className="officeFloor">
    <div className="officeHall"><span>NEXOFFICE</span><small>corredor central</small></div>
    {rooms.map(room=><button key={room.id} className={`officeRoom room-${room.id}`} onClick={()=>{setSelected(room);if(room.id==='meeting')setMeeting(true)}}><span className="roomIcon">{room.icon}</span><div><b>{room.name}</b><small>{room.agent} · {room.role}</small></div><em>{room.status(dashboard)}</em><span className="agentSprite" title={room.agent}>{room.agent[0]}</span></button>)}
   </div>
   {selected&&selected.id!=='meeting'&&<aside className="officeDrawer"><button className="officeDrawerClose" onClick={()=>setSelected(null)}>×</button><span className="officeAgentBig">{selected.agent[0]}</span><small>{selected.name.toUpperCase()}</small><h3>{selected.agent}</h3><p>{selected.role}</p><strong>{selected.status(dashboard)}</strong><div>{selected.actions.map((x,i)=><button key={x} className={i===0?'primary':''} onClick={()=>nav(selected.target)}>{x}</button>)}</div><button className="officeTalk" onClick={()=>nav(selected.target)}>Conversar com {selected.agent} →</button></aside>}
   {meeting&&<div className="meetingBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMeeting(false)}}><section className="meetingRoom"><button className="officeDrawerClose" onClick={()=>setMeeting(false)}>×</button><small>SALA DE REUNIÕES</small><h3>Quem precisa estar nesta conversa?</h3><p>Escolha os agentes. No próximo passo, Maya leva a pauta para a equipe digital usando o contexto real do NexOffice.</p><div className="meetingPeople">{people.map(p=><button key={p} className={participants.includes(p)?'selected':''} onClick={()=>setParticipants(v=>v.includes(p)?(p==='Maya'?v:v.filter(x=>x!==p)):[...v,p])}><span>{p[0]}</span><b>{p}</b></button>)}</div><label>Pauta da reunião<textarea placeholder="Ex.: Quero aumentar vendas sem apertar o caixa."/></label><div className="meetingActions"><button onClick={()=>setMeeting(false)}>Cancelar</button><button className="primary" onClick={()=>{setMeeting(false);nav('Equipe Digital')}}>Abrir reunião com Maya + {Math.max(0,participants.length-1)} agente(s)</button></div></section></div>}
  </section>,host)}</>;
}
