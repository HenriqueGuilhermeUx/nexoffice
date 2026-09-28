import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {createPortal} from 'react-dom';
import {api,post} from './api';
import './assistants-workspace.css';

type Role='secretary'|'crm'|'erp'|'controller'|'documents'|'growth';
type Agent={role:Role;name:string;title:string;scope:string;power:string;initial:string};
type Action={label:string;target:string};
type Msg={role:'user'|'assistant';content:string;actions?:Action[];facts?:any};
type Thread={conversationId:string;messages:Msg[]};
type Brief={workspace:{name:string};priorities:Array<{level:string;title:string;detail:string;target:string}>;suggestedPrompts:string[]};
type Tool={id:string;label:string;availability:string;usableNow:boolean;effect:string};
type Capabilities={byAgent?:Partial<Record<Role,Tool[]>>};

const agents:Agent[]=[
  {role:'growth',name:'Maya',title:'Coordenação & Crescimento',scope:'Coordena contexto, oportunidades e crescimento.',power:'Cruza prioridades do negócio, conteúdo, campanhas e próximos passos.',initial:'O que merece minha atenção hoje e onde está a melhor oportunidade?'},
  {role:'controller',name:'Theo',title:'Financeiro',scope:'Caixa, recebíveis, despesas, cobrança e riscos.',power:'Lê o financeiro real e aponta o que receber, pagar e acompanhar.',initial:'Faça uma leitura financeira do negócio e me diga o que exige atenção.'},
  {role:'documents',name:'Dora',title:'Documentos',scope:'Contratos, documentos, assinaturas e prazos.',power:'Encontra documentos, pendências de assinatura e caminhos seguros para agir.',initial:'Quais documentos precisam de atenção e quais próximos passos você sugere?'},
  {role:'crm',name:'Clara',title:'Clientes & CRM',scope:'Leads, pipeline, propostas e relacionamento.',power:'Lê oportunidades reais e ajuda a priorizar follow-ups e clientes.',initial:'Como está meu pipeline e quais oportunidades devo priorizar?'},
  {role:'erp',name:'Nico',title:'Operações',scope:'Tarefas, rotina, execução e organização operacional.',power:'Organiza a execução diária e conecta trabalho, prazos e contexto.',initial:'Resuma a operação e organize minhas próximas ações.'},
  {role:'secretary',name:'Sofia',title:'Recepção & Agenda',scope:'Agenda, compromissos, organização e recepção.',power:'Ajuda a organizar compromissos, rotina e próximos contatos.',initial:'Como está minha agenda e o que preciso organizar primeiro?'}
];
const availability=(value:string)=>value==='ready'?'Pronta':value==='approval_required'?'Com aprovação':value==='external_actions_disabled'?'Protegida':['provider_not_configured','feature_disabled','workspace_not_connected'].includes(value)?'A configurar':'Disponível';

export default function AssistantsWorkspace(){
  const[active,setActive]=useState(false),[host,setHost]=useState<Element|null>(null),[role,setRole]=useState<Role>('growth'),[threads,setThreads]=useState<Partial<Record<Role,Thread>>>({}),[brief,setBrief]=useState<Brief|null>(null),[caps,setCaps]=useState<Capabilities|null>(null),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const sync=()=>{const selected=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');const on=Boolean(selected?.textContent?.includes('Assistentes IA')||selected?.textContent?.includes('Equipe Digital'));setActive(on);setHost(on?document.querySelector('.content'):null)};sync();const timer=setInterval(sync,350);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(active)void load()},[active]);
  const agent=useMemo(()=>agents.find(a=>a.role===role)!,[role]);const thread=threads[role]||{conversationId:'',messages:[]};const tools=(caps?.byAgent?.[role]||[]).filter(t=>t.availability!=='planned'&&t.availability!=='inactive_for_workspace').slice(0,8);
  async function load(){try{const [b,c]=await Promise.all([api<Brief>('/v1/assistant/brief'),api<Capabilities>('/v1/capabilities')]);setBrief(b);setCaps(c)}catch(e:any){setError(e?.message||'Não consegui carregar os Assistentes agora.')}}
  async function send(message=text){const clean=message.trim();if(!clean||busy)return;const before=threads[role]||{conversationId:'',messages:[]};setThreads(cur=>({...cur,[role]:{...before,messages:[...before.messages,{role:'user',content:clean}]}}));setText('');setBusy(true);setError('');try{const result=await post<any>('/v1/assistant/chat',{message:clean,conversationId:before.conversationId||null,agentRole:role});setThreads(cur=>{const latest=cur[role]||{conversationId:'',messages:[]};return{...cur,[role]:{conversationId:result.conversationId,messages:[...latest.messages,{role:'assistant',content:result.message.content,actions:result.actions||[],facts:result.facts||null}]}}})}catch(e:any){setError(e?.message||`Não consegui consultar ${agent.name} agora.`)}finally{setBusy(false)}}
  function follow(action:Action,facts:any){if(action.target==='documents'&&facts?.signatureIntent){const candidates=Array.isArray(facts.candidates)?facts.candidates:[],only=candidates.length===1?candidates[0]:null;sessionStorage.setItem('nexoffice.document.signatureIntent',JSON.stringify({source:'maya',mode:facts.signatureIntent.mode==='icp_brasil'?'icp_brasil':'electronic',suggestedDocumentId:only?.id||null,suggestedDocumentTitle:only?.title||null,createdAt:new Date().toISOString(),humanConfirmationRequired:true,externalEffect:false}))}window.dispatchEvent(new CustomEvent('nexoffice:navigate',{detail:{view:action.target,source:'assistants'}}))}
  function submit(e:FormEvent){e.preventDefault();void send()}
  if(!active||!host)return null;
  return createPortal(<section className="assistantsWorkspace">
    <header className="assistantsHero"><div><p>SEUS ASSISTENTES</p><h2>Uma equipe que entende o seu negócio.</h2><span>Cada especialista lê o contexto real da empresa. Recomendações vêm dos seus dados; ações externas continuam sob seu controle.</span></div><div className="assistantsContext"><b>{brief?.workspace?.name||'Seu workspace'}</b><span>{brief?.priorities?.length||0} prioridade(s) detectada(s)</span><i>Contexto compartilhado</i></div></header>
    <div className="assistantsGrid">{agents.map(a=><button key={a.role} className={a.role===role?'active':''} onClick={()=>{setRole(a.role);setError('')}}><span>{a.name[0]}</span><div><b>{a.name}</b><strong>{a.title}</strong><small>{a.power}</small></div></button>)}</div>
    <div className="assistantWorkbench">
      <aside><div className="assistantIdentity"><span>{agent.name[0]}</span><div><b>{agent.name}</b><strong>{agent.title}</strong><p>{agent.scope}</p></div></div><div className="assistantPower"><small>O QUE ELA CONSEGUE USAR AGORA</small>{tools.length?tools.map(tool=><div key={tool.id}><span className={tool.usableNow?'ready':'guarded'}>•</span><b>{tool.label}</b><em>{availability(tool.availability)}</em></div>):<p>Capacidades internas do NexOffice disponíveis. Integrações adicionais aparecem conforme forem conectadas.</p>}</div><div className="assistantSuggestions"><small>PERGUNTE</small><button onClick={()=>void send(agent.initial)}>{agent.initial}</button>{brief?.suggestedPrompts?.slice(0,2).map(prompt=><button key={prompt} onClick={()=>void send(prompt)}>{prompt}</button>)}</div></aside>
      <main><div className="assistantThread">{thread.messages.length?thread.messages.map((m,i)=><article key={i} className={m.role}><small>{m.role==='user'?'Você':agent.name}</small><p>{m.content}</p>{m.role==='assistant'&&m.actions?.length?<div>{m.actions.map((a,j)=><button key={`${a.target}-${j}`} onClick={()=>follow(a,m.facts)}>{a.label}</button>)}</div>:null}</article>):<div className="assistantEmpty"><span>{agent.name[0]}</span><h3>Converse com {agent.name}</h3><p>{agent.power}</p><button onClick={()=>void send(agent.initial)}>{agent.initial}</button></div>}</div>{error&&<div className="assistantError">{error}</div>}<form onSubmit={submit}><textarea rows={3} value={text} onChange={e=>setText(e.target.value)} placeholder={`Pergunte para ${agent.name} sobre o seu negócio…`}/><button disabled={busy||!text.trim()}>{busy?'Analisando…':'Enviar'}</button></form><footer><span>Dados do workspace</span><span>Sem memória pessoal</span><span>Humano no controle</span></footer></main>
    </div>
  </section>,host);
}
