import {useEffect, useMemo, useState} from 'react';

type Action = {id:string; agent_role:string; title:string; summary:string; priority:string; autonomy:string; status:string};
type Deal = {id:string; title:string; stage:string; value_minor:number; contact_name?:string; next_action?:string};
type Dashboard = {crm?:{deals:number;open_deals:number;open_pipeline_minor:number}; finance?:{income_paid_minor:number;expense_paid_minor:number;receivable_minor:number;overdue_count:number}; command?:{open_actions:number}; approvals?:{pending_approvals:number}};

const apiUrl=(import.meta as any).env?.VITE_API_URL||'';
const workspace=(import.meta as any).env?.VITE_WORKSPACE_ID||localStorage.getItem('nexoffice.workspace')||'';

const demoActions:Action[]=[
  {id:'a1',agent_role:'secretary',title:'Horário liberado às 15h',summary:'Uma reunião foi cancelada. Há duas pessoas na lista de espera que podem ocupar o horário.',priority:'normal',autonomy:'approval_required',status:'open'},
  {id:'a2',agent_role:'collections',title:'3 recebimentos vencidos',summary:'R$ 4.700 estão vencidos. Posso iniciar a régua amigável de cobrança.',priority:'high',autonomy:'approval_required',status:'open'},
  {id:'a3',agent_role:'crm',title:'7 leads precisam de follow-up',summary:'Há oportunidades sem contato há mais de três dias.',priority:'high',autonomy:'notify',status:'open'},
  {id:'a4',agent_role:'growth',title:'Campanha performando acima da média',summary:'O custo por lead caiu 24%. O MODO recomenda manter o orçamento atual.',priority:'normal',autonomy:'approval_required',status:'open'}
];
const demoDeals:Deal[]=[
  {id:'d1',title:'Almeida & Torres',stage:'lead',value_minor:350000,next_action:'Primeiro contato'},
  {id:'d2',title:'Clínica Horizonte',stage:'qualified',value_minor:590000,next_action:'Agendar demonstração'},
  {id:'d3',title:'Loja Norte',stage:'proposal',value_minor:790000,next_action:'Retomar proposta sexta'}
];

const money=(minor=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(minor)/100);
const agentName=(role:string)=>({secretary:'Sofia · Secretária',service:'Alex · Atendimento',crm:'Clara · CRM',erp:'Nico · ERP',collections:'Theo · Cobrança',controller:'Theo · Controller',documents:'Dora · Documentos',growth:'Maya · Growth'} as Record<string,string>)[role]||role;

async function get<T>(path:string):Promise<T>{
  if(!apiUrl||!workspace) throw new Error('demo');
  const r=await fetch(`${apiUrl}${path}`,{headers:{'x-workspace-id':workspace}});
  if(!r.ok)throw new Error(await r.text());return r.json();
}

export default function App(){
  const [view,setView]=useState('command');
  const [dashboard,setDashboard]=useState<Dashboard>({crm:{deals:18,open_deals:14,open_pipeline_minor:4270000},finance:{income_paid_minor:2840000,expense_paid_minor:1190000,receivable_minor:870000,overdue_count:3},command:{open_actions:8},approvals:{pending_approvals:4}});
  const [actions,setActions]=useState<Action[]>(demoActions);
  const [deals,setDeals]=useState<Deal[]>(demoDeals);
  const [demo,setDemo]=useState(true);

  useEffect(()=>{(async()=>{try{const [d,a,c]=await Promise.all([get<Dashboard>('/v1/dashboard'),get<Action[]>('/v1/command/actions'),get<Deal[]>('/v1/crm/deals')]);setDashboard(d);setActions(a);setDeals(c);setDemo(false)}catch{setDemo(true)}})()},[]);

  const openPipeline=dashboard.crm?.open_pipeline_minor||0;
  const balance=(dashboard.finance?.income_paid_minor||0)-(dashboard.finance?.expense_paid_minor||0);
  const nav=[['command','Central de Comando','◈'],['crm','CRM','◎'],['finance','Financeiro','▤'],['agenda','Agenda & Tarefas','◷'],['documents','Documentos','▱'],['team','Equipe Digital','✦'],['integrations','Integrações','⇄']];

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandMark">N</div><div><strong>NexOffice</strong><small>Business Operating System</small></div></div>
      <nav>{nav.map(([key,label,icon])=><button key={key} className={view===key?'active':''} onClick={()=>setView(key)}><span>{icon}</span>{label}</button>)}</nav>
      <div className="sideFoot"><div className="statusDot"/> Core v0.1 · {demo?'Demo':'Live'}</div>
    </aside>
    <main>
      <header className="topbar"><div><p className="eyebrow">NEXOFFICE</p><h1>{title(view)}</h1><p>O sistema operacional do seu negócio.</p></div><button className="workspace">Minha empresa⌄</button></header>
      <section className="content">{renderView()}</section>
    </main>
  </div>;

  function renderView(){
    if(view==='command')return <>
      <div className="hero"><div><p className="eyebrow">BOM DIA</p><h2>Seu negócio está operando. Você tem {actions.length} pontos para acompanhar.</h2><p>A equipe digital organiza o que aconteceu, o que exige decisão e o que pode ser executado automaticamente.</p></div><button className="primary">Conversar com o NexOffice</button></div>
      <div className="kpis">
        <Kpi label="Pipeline aberto" value={money(openPipeline)} hint={`${dashboard.crm?.open_deals||0} oportunidades`}/>
        <Kpi label="Saldo realizado" value={money(balance)} hint="receitas − despesas"/>
        <Kpi label="A receber" value={money(dashboard.finance?.receivable_minor||0)} hint={`${dashboard.finance?.overdue_count||0} vencidos`}/>
        <Kpi label="Decisões pendentes" value={String(dashboard.approvals?.pending_approvals||0)} hint="aprovações humanas"/>
      </div>
      <div className="twoCol"><div className="panel"><div className="sectionHead"><div><p className="eyebrow">AÇÃO INBOX</p><h3>O que precisa de você</h3></div><span>{actions.length}</span></div><div className="actionList">{actions.map(a=><ActionCard key={a.id} action={a}/>)}</div></div>
      <div className="panel"><div className="sectionHead"><div><p className="eyebrow">PULSO DO NEGÓCIO</p><h3>Agora</h3></div></div><Pulse label="CRM" value={`${dashboard.crm?.open_deals||0} negócios abertos`} detail={money(openPipeline)}/><Pulse label="Financeiro" value={`${dashboard.finance?.overdue_count||0} cobranças vencidas`} detail={money(dashboard.finance?.receivable_minor||0)}/><Pulse label="Equipe Digital" value={`${dashboard.command?.open_actions||0} ações em andamento`} detail="8 agentes disponíveis"/><Pulse label="Documentos" value="2 aguardando assinatura" detail="DocWallet conectado"/></div></div>
    </>;
    if(view==='crm')return <CRM deals={deals}/>;
    if(view==='finance')return <Module title="Financeiro & ERP Lite" text="Contas a receber, contas a pagar, receitas, despesas, recorrências, cobrança e visão de caixa em uma única camada operacional." cards={['A receber','A pagar','Fluxo de caixa','Cobranças','Categorias','Conciliação']}/>;
    if(view==='agenda')return <Module title="Agenda & Tarefas" text="Compromissos, confirmações, lembretes, lista de espera e tarefas conectadas ao CRM e à Secretária Digital." cards={['Hoje','Agenda','Lista de espera','Tarefas','Lembretes','Automação']}/>;
    if(view==='documents')return <Module title="Documentos" text="A camada DocWallet será usada para leitura, extração, assinatura, aprovação e acompanhamento documental sem duplicar infraestrutura." cards={['Arquivos','Assinaturas','Aprovações','Extração','Pendências','Modelos']}/>;
    if(view==='team')return <Team/>;
    return <Module title="Integrações" text="NexOffice conecta capabilities AV e sistemas externos por adapters e eventos." cards={['DocWallet','SmartBots','Staff','NextGen','MODO','TaxAgent','NexJud','MyDataMed','SindCopilot','Commerce']}/>;
  }
}

function Kpi({label,value,hint}:{label:string;value:string;hint:string}){return <div className="kpi"><span>{label}</span><b>{value}</b><small>{hint}</small></div>}
function Pulse({label,value,detail}:{label:string;value:string;detail:string}){return <div className="pulse"><div><b>{label}</b><span>{value}</span></div><small>{detail}</small></div>}
function ActionCard({action}:{action:Action}){const [done,setDone]=useState(false);if(done)return null;return <article className={`action ${action.priority}`}><div className="agent">{agentName(action.agent_role)}</div><h4>{action.title}</h4><p>{action.summary}</p><div className="buttons"><button className="primary" onClick={()=>setDone(true)}>Aprovar</button><button onClick={()=>setDone(true)}>Agora não</button><button>Conversar</button></div></article>}
function CRM({deals}:{deals:Deal[]}){const stages=['lead','qualified','meeting','proposal','won'];const labels:Record<string,string>={lead:'Lead',qualified:'Qualificado',meeting:'Reunião',proposal:'Proposta',won:'Ganho'};return <><div className="moduleIntro"><p className="eyebrow">CRM CORE</p><h2>Relacionamento comercial único</h2><p>Leads, clientes, histórico, atividades e oportunidades compartilham a mesma identidade em todo o ecossistema.</p><button className="primary">+ Novo contato</button></div><div className="kanban">{stages.map(s=><div className="column" key={s}><div className="columnHead"><b>{labels[s]}</b><span>{deals.filter(d=>d.stage===s).length}</span></div>{deals.filter(d=>d.stage===s).map(d=><article className="deal" key={d.id}><b>{d.title}</b><span>{money(d.value_minor)}</span><small>{d.next_action||'Sem próxima ação'}</small></article>)}</div>)}</div></>}
function Team(){const agents=[['Sofia','Secretária','Agenda, confirmações, remarcações e rotina.'],['Alex','Atendimento','Conversas, triagem e respostas.'],['Clara','CRM','Pipeline, follow-ups e relacionamento.'],['Nico','ERP','Lançamentos e organização operacional.'],['Theo','Cobrança & Controller','Recebíveis, inadimplência, caixa e alertas.'],['Dora','Documentos','Leitura, assinatura e aprovações.'],['Maya','Growth','Conteúdo, campanhas e oportunidades.']];return <><div className="moduleIntro"><p className="eyebrow">EQUIPE DIGITAL</p><h2>Especialistas sobre a mesma memória empresarial</h2><p>Cada agente tem um papel. Todos trabalham sobre CRM, agenda, financeiro, documentos e eventos do mesmo workspace.</p></div><div className="agentGrid">{agents.map(([name,role,text])=><article className="agentCard" key={name}><div className="avatar">{name[0]}</div><div><h3>{name}</h3><b>{role}</b><p>{text}</p><button>Conversar</button></div></article>)}</div></>}
function Module({title,text,cards}:{title:string;text:string;cards:string[]}){return <><div className="moduleIntro"><p className="eyebrow">NEXOFFICE CORE</p><h2>{title}</h2><p>{text}</p></div><div className="moduleGrid">{cards.map(c=><article key={c}><div className="moduleIcon">◇</div><h3>{c}</h3><p>Estrutura pronta para conectar dados, ações e agentes.</p><button>Abrir →</button></article>)}</div></>}
function title(view:string){return ({command:'Central de Comando',crm:'CRM',finance:'Financeiro',agenda:'Agenda & Tarefas',documents:'Documentos',team:'Equipe Digital',integrations:'Integrações'} as Record<string,string>)[view]||'NexOffice'}
