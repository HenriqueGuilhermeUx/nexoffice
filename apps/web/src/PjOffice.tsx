import './nexa-pj-office.css';

export const PJ_AGENTS=[
  {name:'Maya',role:'Growth e campanhas',area:'marketing',description:'Campanhas, oportunidades e inteligência comercial.'},
  {name:'Sofia',role:'Secretaria e agenda',area:'agenda',description:'Compromissos, confirmações, tarefas e rotina.'},
  {name:'Alex',role:'Atendimento',area:'operations',description:'Conversas, triagem e acompanhamento.'},
  {name:'Clara',role:'CRM e vendas',area:'crm',description:'Clientes, negócios e follow-ups.'},
  {name:'Nico',role:'ERP e operações',area:'finance',description:'Organização financeira e processos.'},
  {name:'Theo',role:'Cobranças e controladoria',area:'finance',description:'Recebíveis, caixa e decisões financeiras.'},
  {name:'Dora',role:'Documentos',area:'documents',description:'Documentos, assinaturas e aprovações.'},
] as const;

export const PJ_SECTORS=[
  'Serviços','Comércio','Saúde','Jurídico','Imobiliário','Educação','Agência e marketing','Tecnologia','Indústria','Outro'
] as const;
const areas=[
  {id:'conta-nexa',label:'Conta empresarial',detail:'Saldo e extrato (conforme autorização)',symbol:'◉'},
  {id:'crm',label:'Comercial',detail:'Clientes, negócios e relacionamento',symbol:'◎'},
  {id:'finance',label:'Financeiro e ERP',detail:'Contas, caixa, cobrança e conciliação',symbol:'▤'},
  {id:'operations',label:'Operações',detail:'Processos e acompanhamento',symbol:'↗'},
  {id:'agenda',label:'Agenda',detail:'Tarefas e compromissos',symbol:'◷'},
  {id:'documents',label:'Documentos',detail:'Arquivos e aprovações',symbol:'▱'},
  {id:'marketing',label:'Marketing',detail:'Campanhas e oportunidades',symbol:'✧'},
  {id:'team',label:'Agentes',detail:'Equipe digital e autonomia',symbol:'✦'},
] as const;

type View='conta-nexa'|'crm'|'finance'|'operations'|'agenda'|'documents'|'marketing'|'team';
export function PjOffice2D({navigate}:{navigate:(view:View)=>void}){
  return <section className="pj-office-page" aria-label="Visão escritório 2D">
    <div className="pj-office-intro"><p className="eyebrow">ESCRITÓRIO 2D</p><h2>Seu negócio, setor por setor.</h2><p>Selecione uma área para abrir seu módulo. As salas são um mapa de navegação, não uma representação de presença ou de operações em tempo real.</p></div>
    <div className="pj-office-map" role="group" aria-label="Áreas do escritório">
      {areas.map(a=><button key={a.id} type="button" className="pj-office-room" onClick={()=>navigate(a.id)} aria-label={`Abrir ${a.label}`}>
        <span aria-hidden="true" className="pj-office-symbol">{a.symbol}</span><strong>{a.label}</strong><small>{a.detail}</small><span className="pj-office-open">Abrir área →</span>
      </button>)}
    </div>
  </section>;
}
export function PjAgentDirectory({navigate}:{navigate:(view:View)=>void}){
  return <section className="pj-office-page" aria-label="Equipe digital Nexa PJ">
    <div className="pj-office-intro"><p className="eyebrow">AGENTES NEXA PJ</p><h2>Conheça sua equipe digital</h2><p>Cada agente tem uma especialidade. Os atalhos abrem o módulo correspondente; disponibilidade de ações e conversas depende das integrações e permissões existentes.</p></div>
    <div className="pj-agent-directory">{PJ_AGENTS.map(a=><article className="pj-agent-tile" key={a.name}><span className="pj-agent-monogram" aria-hidden="true">{a.name[0]}</span><h3>{a.name}</h3><strong>{a.role}</strong><p>{a.description}</p><button type="button" onClick={()=>navigate(a.area as View)}>Abrir área →</button></article>)}</div>
  </section>;
}
