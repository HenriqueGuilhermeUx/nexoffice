import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {api,post,session} from './api';
import './digital-team-console.css';

type Role='secretary'|'service'|'crm'|'erp'|'collections'|'controller'|'documents'|'growth';
type Message={role:'user'|'assistant';content:string};
type ConversationState={conversationId:string;messages:Message[]};
type Brief={workspace:{id:string;name:string;vertical?:string};priorities:Array<{level:string;title:string;detail:string;target:string}>};
type AgentTool={id:string;label:string;provider:string;source:string;availability:string;usableNow:boolean;effect:string};
type CapabilityGraph={externalActionsEnabled:boolean;byAgent:Partial<Record<Role,AgentTool[]>>};

const agents:Array<{role:Role;name:string;title:string;scope:string;initial:string}>=[
  {role:'secretary',name:'Sofia',title:'Secretária',scope:'Agenda, tarefas, confirmações e rotina',initial:'Como está minha agenda e o que preciso organizar primeiro?'},
  {role:'service',name:'Alex',title:'Atendimento',scope:'Triagem, respostas e contexto de clientes',initial:'O que precisa de atenção no atendimento agora?'},
  {role:'crm',name:'Clara',title:'CRM',scope:'Pipeline, leads, propostas e follow-ups',initial:'Como está meu pipeline e quais oportunidades devo priorizar?'},
  {role:'erp',name:'Nico',title:'ERP',scope:'Operação, lançamentos e organização',initial:'Resuma a operação do negócio e os próximos pontos administrativos.'},
  {role:'collections',name:'Theo',title:'Cobrança',scope:'Recebíveis, inadimplência e cobrança',initial:'O que tenho para receber e quais cobranças estão vencidas?'},
  {role:'controller',name:'Theo',title:'Controller',scope:'Caixa, despesas, riscos e prioridades',initial:'Faça uma leitura financeira e operacional do negócio.'},
  {role:'documents',name:'Dora',title:'Documentos',scope:'Documentos, análise e assinaturas',initial:'Quais documentos precisam de atenção?'},
  {role:'growth',name:'Maya',title:'Growth',scope:'Growth, campanhas, conteúdo e oportunidades',initial:'Que oportunidades de growth o contexto atual do negócio sugere?'}
];

function toolState(tool:AgentTool){
  if(tool.availability==='ready')return 'pronta';
  if(tool.availability==='approval_required')return 'aprovação';
  if(tool.availability==='external_actions_disabled')return 'protegida';
  if(['provider_not_configured','feature_disabled','workspace_not_connected'].includes(tool.availability))return 'configurar';
  return tool.availability.replaceAll('_',' ');
}

export default function DigitalTeamConsole(){
  const [active,setActive]=useState(false);const [role,setRole]=useState<Role>('secretary');const [threads,setThreads]=useState<Partial<Record<Role,ConversationState>>>({});
  const [text,setText]=useState('');const [brief,setBrief]=useState<Brief|null>(null);const [capabilityGraph,setCapabilityGraph]=useState<CapabilityGraph|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);const authenticated=Boolean(session.token()&&session.workspace());
  const agent=useMemo(()=>agents.find(item=>item.role===role)!,[role]);const thread=threads[role]||{conversationId:'',messages:[]};
  const tools=useMemo(()=>(capabilityGraph?.byAgent?.[role]||[]).filter(item=>item.availability!=='planned'&&item.availability!=='inactive_for_workspace').slice(0,6),[capabilityGraph,role]);

  useEffect(()=>{const timer=setInterval(()=>{setSessionKey(`${session.token()}|${session.workspace()}`);const selected=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');setActive(Boolean(selected?.textContent?.includes('Equipe Digital')))},500);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!authenticated||!active){setBrief(null);setCapabilityGraph(null);return}void loadBrief()},[sessionKey,active]);
  async function loadBrief(){try{setBrief(await api<Brief>('/v1/assistant/brief'))}catch{}try{setCapabilityGraph(await api<CapabilityGraph>('/v1/capabilities'))}catch{setCapabilityGraph(null)}}

  async function send(message=text){const clean=message.trim();if(!clean||busy)return;setBusy(true);setError('');const before=threads[role]||{conversationId:'',messages:[]};setThreads(current=>({...current,[role]:{...before,messages:[...before.messages,{role:'user',content:clean}]}}));setText('');try{const result=await post<any>('/v1/assistant/chat',{message:clean,conversationId:before.conversationId||null,agentRole:role});setThreads(current=>{const latest=current[role]||{conversationId:'',messages:[]};return {...current,[role]:{conversationId:result.conversationId,messages:[...latest.messages,{role:'assistant',content:result.message.content}]}}})}catch(e:any){setError(e?.message||'Não consegui consultar este especialista agora.')}finally{setBusy(false)}}
  function submit(e:FormEvent){e.preventDefault();void send()}
  if(!authenticated||!active)return null;

  return <aside className="digitalTeamConsole" aria-label="Equipe Digital NexOffice">
    <div className="digitalTeamHead"><div><p>NEXOFFICE · EQUIPE DIGITAL</p><h3>{brief?.workspace?.name||'Seu negócio'}</h3><small>Especialistas sobre o mesmo contexto empresarial</small></div><span className="digitalTeamLive">● ativo</span></div>
    <div className="digitalTeamAgents">{agents.map(item=><button key={item.role} className={role===item.role?'active':''} onClick={()=>{setRole(item.role);setError('')}} title={item.scope}><span>{item.name[0]}</span><b>{item.name}</b><small>{item.title}</small></button>)}</div>
    <div className="digitalTeamAgentIntro"><div className="digitalTeamAvatar">{agent.name[0]}</div><div><b>{agent.name} · {agent.title}</b><p>{agent.scope}</p></div></div>
    {tools.length>0&&<div className="digitalTeamTools"><small>FERRAMENTAS DESTA IA</small><div>{tools.map(tool=><span key={tool.id} className={tool.availability==='ready'?'ready':'guarded'} title={`${tool.source} · ${tool.availability}`}><b>{tool.label}</b><em>{toolState(tool)}</em></span>)}</div></div>}
    <div className="digitalTeamThread">{thread.messages.length?thread.messages.map((message,index)=><div key={index} className={`digitalTeamMessage ${message.role}`}><small>{message.role==='user'?'Você':`${agent.name} · ${agent.title}`}</small><p>{message.content}</p></div>):<div className="digitalTeamEmpty"><p>Converse diretamente com {agent.name}. Ela/ele usa o contexto real do workspace e pode recorrer às ferramentas mostradas acima; ações externas continuam sujeitas às políticas de governança.</p><button onClick={()=>void send(agent.initial)}>{agent.initial}</button></div>}</div>
    {error&&<div className="digitalTeamError">{error}</div>}
    <form className="digitalTeamComposer" onSubmit={submit}><textarea value={text} onChange={e=>setText(e.target.value)} placeholder={`Pergunte para ${agent.name}…`} rows={2}/><button disabled={busy||!text.trim()}>{busy?'…':'Enviar'}</button></form>
    <div className="digitalTeamFoot"><span>Contexto compartilhado</span><span>Capabilities por função</span><span>Approval-first</span></div>
  </aside>;
}
