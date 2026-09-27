import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {api,session} from './api';
import './home-v2.css';

type Dashboard={
  finance?:{income_paid_minor?:number;expense_paid_minor?:number;receivable_minor?:number;payable_minor?:number;overdue_count?:number};
  crm?:{open_deals?:number;open_pipeline_minor?:number};
  approvals?:{pending_approvals?:number};
  tasks?:{due_tasks?:number};
  appointments?:{today_appointments?:number};
};
type Area={id:string;label:string;attention:number;detail:string};
type Overview={areas:Area[];pendingApprovals:number};
type Founder={health?:{score:number|null;summary?:string|null};money?:{overdueMinor:number;overdueCount:number};sales?:{pipelineMinor:number;openDeals:number};operations?:{dueTasks7d:number;overdueTasks:number;appointmentsToday:number}};

const money=(minor:any=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(minor||0)/100);
const assistants=[
  {name:'Maya',initial:'M',role:'Coordenação',text:'Prioridades, estratégia e reuniões com outros agentes.',target:'Equipe Digital',actions:['Conversar','Planejar','Chamar reunião']},
  {name:'Theo',initial:'T',role:'Financeiro',text:'Cobranças, Pix, caixa e conciliação.',target:'Financeiro',actions:['Cobranças','Pix','Conciliação']},
  {name:'Dora',initial:'D',role:'Documentos',text:'Contratos, assinaturas e inteligência documental.',target:'Documentos',actions:['Contratos','Assinaturas','Analisar']},
  {name:'Clara',initial:'C',role:'Clientes',text:'CRM, oportunidades e follow-ups.',target:'CRM',actions:['Clientes','Pipeline','Follow-up']},
  {name:'Nico',initial:'N',role:'Operações',text:'Tarefas, agenda e execução diária.',target:'Agenda & Tarefas',actions:['Tarefas','Agenda','Executar']},
  {name:'Sofia',initial:'S',role:'Recepção',text:'Atendimento, organização e próximos compromissos.',target:'Agenda & Tarefas',actions:['Agenda','Atendimento','Organizar']}
];

function clickNav(match:string){
  const buttons=[...document.querySelectorAll<HTMLButtonElement>('.sidebar nav button')];
  buttons.find(b=>(b.textContent||'').toLowerCase().includes(match.toLowerCase()))?.click();
}

export default function HomeV2(){
  const [host,setHost]=useState<HTMLElement|null>(null);const [active,setActive]=useState(false);const [dashboard,setDashboard]=useState<Dashboard|null>(null);const [overview,setOverview]=useState<Overview|null>(null);const [founder,setFounder]=useState<Founder|null>(null);const [loading,setLoading]=useState(false);
  const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);
  useEffect(()=>{const sync=()=>{const selected=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');const on=Boolean(selected?.textContent?.includes('Central de Comando'));setActive(on);setSessionKey(`${session.token()}|${session.workspace()}`);const content=document.querySelector<HTMLElement>('.content');if(content){let mount=document.getElementById('nexo-home-v2-mount');if(!mount){mount=document.createElement('div');mount.id='nexo-home-v2-mount';content.prepend(mount)}setHost(mount)}document.body.classList.toggle('nexoHomeV2Active',on)};sync();const o=new MutationObserver(sync);o.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});const t=window.setInterval(sync,900);return()=>{o.disconnect();clearInterval(t);document.body.classList.remove('nexoHomeV2Active')}},[]);
  useEffect(()=>{if(!active||!session.token()||!session.workspace())return;void load()},[active,sessionKey]);
  async function load(){setLoading(true);try{const [d,o,f]=await Promise.all([api<Dashboard>('/v1/dashboard').catch(()=>null),api<Overview>('/v1/command/overview').catch(()=>null),api<Founder>('/v1/intelligence/founder-cockpit').catch(()=>null)]);setDashboard(d);setOverview(o);setFounder(f)}finally{setLoading(false)}}
  if(!active||!host)return null;
  const area=(id:string)=>overview?.areas?.find(x=>x.id===id);
  const overdue=Number(founder?.money?.overdueCount??dashboard?.finance?.overdue_count??0);
  const tasks=Number(founder?.operations?.overdueTasks??dashboard?.tasks?.due_tasks??0);
  const approvals=Number(overview?.pendingApprovals??dashboard?.approvals?.pending_approvals??0);
  const docs=Number(area('documents')?.attention||0);
  const attention=approvals+overdue+tasks+docs;
  const score=founder?.health?.score;
  const quick=[['Nova cobrança','Financeiro'],['Novo cliente','CRM'],['Novo contrato','Documentos'],['Nova tarefa','Agenda & Tarefas'],['Chamar reunião','Equipe Digital']];
  return createPortal(<section className="homeV2">
    <div className="homeV2Intro"><div><span>HOJE</span><h2>{attention?`${attention} item${attention===1?'':'s'} pedem sua atenção.`:'Seu negócio está em ordem agora.'}</h2><p>Prioridades, números e sua equipe de IA — sem ruído.</p></div><button onClick={()=>void load()} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button></div>

    <div className="homePriorities">
      <button onClick={()=>clickNav('Equipe Digital')}><span>Aprovações</span><b>{approvals}</b><small>{approvals?'aguardando decisão':'nenhuma pendência'}</small></button>
      <button onClick={()=>clickNav('Financeiro')}><span>Cobranças vencidas</span><b>{overdue}</b><small>{money(founder?.money?.overdueMinor||0)}</small></button>
      <button onClick={()=>clickNav('Documentos')}><span>Documentos</span><b>{docs}</b><small>{docs?'pedem atenção':'em ordem'}</small></button>
      <button onClick={()=>clickNav('Agenda & Tarefas')}><span>Tarefas</span><b>{tasks}</b><small>{tasks?'atrasadas/próximas':'em dia'}</small></button>
      <article><span>Saúde do negócio</span><b>{score==null?'—':`${score}/100`}</b><small>{founder?.health?.summary||'Base em formação'}</small></article>
    </div>

    <section className="homeSummary">
      <div><small>RESUMO DO NEGÓCIO</small><h3>O essencial em 30 segundos.</h3><p>{founder?.health?.summary||'O NexOffice está reunindo operação, caixa, clientes e execução para formar uma leitura objetiva do negócio.'}</p><button className="homePrimary" onClick={()=>clickNav('Equipe Digital')}>Pedir análise à Maya</button></div>
      <div className="homeSummaryNumbers"><article><span>A receber</span><b>{money(dashboard?.finance?.receivable_minor)}</b></article><article><span>Pipeline</span><b>{money(founder?.sales?.pipelineMinor??dashboard?.crm?.open_pipeline_minor)}</b></article><article><span>Compromissos hoje</span><b>{founder?.operations?.appointmentsToday??dashboard?.appointments?.today_appointments??0}</b></article></div>
    </section>

    <div className="homeSectionHead"><div><small>SUA EQUIPE DIGITAL</small><h3>Assistentes IA</h3></div><button onClick={()=>clickNav('Equipe Digital')}>Ver equipe completa →</button></div>
    <div className="homeAgents">{assistants.map((a,i)=><article key={a.name} className={i===0?'lead':''}><div className="homeAgentTop"><span className="homeAgentAvatar">{a.initial}</span><div><b>{a.name}</b><small>{a.role}</small></div>{i===0&&<em>Principal</em>}</div><p>{a.text}</p><div className="homeAgentActions">{a.actions.map((x,j)=><button key={x} onClick={()=>clickNav(a.target)} className={j===0?'main':''}>{x}</button>)}</div></article>)}</div>

    <div className="homeSectionHead"><div><small>ÁREAS DO NEGÓCIO</small><h3>Entre direto no que precisa.</h3></div></div>
    <div className="homeModules"><button onClick={()=>clickNav('Financeiro')}><span>Financeiro</span><b>{money(dashboard?.finance?.receivable_minor)} a receber</b><small>Pix · cobranças · caixa · conciliação</small></button><button onClick={()=>clickNav('CRM')}><span>Clientes</span><b>{founder?.sales?.openDeals??dashboard?.crm?.open_deals??0} oportunidades</b><small>CRM · pipeline · follow-ups</small></button><button onClick={()=>clickNav('Documentos')}><span>Documentos</span><b>{docs} pendências</b><small>Contratos · assinaturas · inteligência</small></button><button onClick={()=>clickNav('Marketing')}><span>Crescimento</span><b>{area('growth')?.attention||0} sinais</b><small>Marketing · campanhas · oportunidades</small></button></div>

    <div className="homeQuick"><span>Ações rápidas</span>{quick.map(([label,target])=><button key={label} onClick={()=>clickNav(target)}>＋ {label}</button>)}</div>
  </section>,host);
}
