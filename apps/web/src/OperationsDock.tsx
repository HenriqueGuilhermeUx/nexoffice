import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {api,post,session} from './api';

type Tab='assistant'|'documents'|'collections'|'integrations';
type AssistantBrief={workspace:{id:string;name:string};pulse:any;priorities:Array<{level:string;title:string;detail:string;target:string}>;suggestedPrompts:string[]};
type ChatMessage={id?:string;role:'user'|'assistant';content:string;created_at?:string;metadata?:any};
type DocumentRef={id:string;title:string;provider:string;external_ref:string;status:string;document_type?:string;contact_name?:string;intelligence_status:string;signature_status:string;sync_error?:string};
type Collections={summary:{overdue_count:number;overdue_minor:number|string};receivables:Array<{id:string;description:string;amount_minor:number|string;due_at:string;contact_name?:string;days_overdue:number;email?:string;phone?:string}>;attempts:any[]};
type Capability={provider:string;label:string;capabilities:string[];baseUrlConfigured:boolean;credentialConfigured:boolean;state?:{status:string;last_health_status?:string;last_error?:string}|null};

const money=(minor:any=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(minor||0)/100);
const date=(value?:string)=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short'}).format(new Date(value)):'—';
const tabLabel:Record<Tab,string>={assistant:'Assistente',documents:'Documentos',collections:'Cobrança',integrations:'Integrações'};

export default function OperationsDock(){
  const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);
  const [open,setOpen]=useState(false);const [tab,setTab]=useState<Tab>('assistant');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [brief,setBrief]=useState<AssistantBrief|null>(null);const [conversationId,setConversationId]=useState('');const [messages,setMessages]=useState<ChatMessage[]>([]);const [message,setMessage]=useState('');
  const [documents,setDocuments]=useState<DocumentRef[]>([]);const [collections,setCollections]=useState<Collections|null>(null);const [catalog,setCatalog]=useState<Capability[]>([]);
  const authenticated=Boolean(session.token()&&session.workspace());

  useEffect(()=>{const timer=setInterval(()=>{const next=`${session.token()}|${session.workspace()}`;setSessionKey(prev=>prev===next?prev:next)},700);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!authenticated){setOpen(false);return}if(open)load(tab)},[sessionKey,open,tab]);

  async function load(next:Tab){setBusy(true);setError('');try{
    if(next==='assistant')setBrief(await api<AssistantBrief>('/v1/assistant/brief'));
    if(next==='documents')setDocuments(await api<DocumentRef[]>('/v1/documents'));
    if(next==='collections')setCollections(await api<Collections>('/v1/collections/overview'));
    if(next==='integrations')setCatalog(await api<Capability[]>('/v1/integrations/catalog'));
  }catch(e:any){setError(e?.message||'Não foi possível carregar esta área.')}finally{setBusy(false)}}

  async function send(text=message){const clean=text.trim();if(!clean)return;setBusy(true);setError('');setMessages(m=>[...m,{role:'user',content:clean}]);setMessage('');try{const result=await post<any>('/v1/assistant/chat',{message:clean,conversationId:conversationId||null});setConversationId(result.conversationId);setMessages(m=>[...m,{role:'assistant',content:result.message.content,metadata:{actions:result.actions}}])}catch(e:any){setError(e?.message||'Não consegui responder agora.')}finally{setBusy(false)}}

  async function addDocument(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget),externalRef=String(f.get('externalRef')||'').trim(),title=String(f.get('title')||'').trim(),documentType=String(f.get('documentType')||'').trim();if(!externalRef||!title)return;setBusy(true);try{await post('/v1/documents',{provider:'docwallet',externalRef,title,documentType:documentType||null,status:'linked'});(e.currentTarget as HTMLFormElement).reset();await load('documents')}catch(err:any){setError(err.message)}finally{setBusy(false)}}
  async function analyze(id:string){setBusy(true);try{await post(`/v1/documents/${id}/analyze`,{});await load('documents')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  async function signature(id:string){const email=window.prompt('E-mail do signatário (opcional):')||'';const name=window.prompt('Nome do signatário:')||'';setBusy(true);try{await post(`/v1/documents/${id}/signature-request`,{signers:name?[{name,email:email||undefined}]:[]});await load('documents')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  async function scanCollections(){setBusy(true);try{await post('/v1/collections/scan',{});await load('collections')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  async function createCharge(id:string){setBusy(true);try{await post(`/v1/collections/ledger/${id}/create-charge`,{});await load('collections')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  async function probe(provider:string){setBusy(true);try{await post(`/v1/integrations/${provider}/probe`,{});await load('integrations')}catch(e:any){setError(e.message)}finally{setBusy(false)}}

  function navigate(target:string){const labels:Record<string,string>={command:'Central de Comando',crm:'CRM',finance:'Financeiro',agenda:'Agenda',documents:'Documentos',integrations:'Integrações',team:'Equipe Digital'};const label=labels[target]||target;const button=[...document.querySelectorAll<HTMLButtonElement>('.sidebar nav button')].find(b=>b.textContent?.includes(label));button?.click();setOpen(false)}

  const title=useMemo(()=>tabLabel[tab],[tab]);
  if(!authenticated)return null;
  return <>
    <button className={`opsLauncher ${open?'open':''}`} onClick={()=>setOpen(v=>!v)} aria-label="Abrir NexOffice Copilot"><span className="opsSpark">✦</span><span>Copiloto</span></button>
    {open&&<div className="opsDock" role="dialog" aria-label="NexOffice Copilot">
      <div className="opsHead"><div><p>NEXOFFICE</p><h3>{title}</h3></div><button onClick={()=>setOpen(false)}>×</button></div>
      <div className="opsTabs">{(['assistant','documents','collections','integrations'] as Tab[]).map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{tabLabel[t]}</button>)}</div>
      {busy&&<div className="opsBusy"/>}{error&&<div className="opsError">{error}<button onClick={()=>setError('')}>×</button></div>}
      <div className="opsBody">{tab==='assistant'?<Assistant brief={brief} messages={messages} message={message} setMessage={setMessage} send={send} busy={busy} navigate={navigate}/>:tab==='documents'?<Documents documents={documents} add={addDocument} analyze={analyze} signature={signature}/>:tab==='collections'?<CollectionsView data={collections} scan={scanCollections} charge={createCharge}/>:<Integrations catalog={catalog} probe={probe}/>}</div>
    </div>}
  </>;
}

function Assistant({brief,messages,message,setMessage,send,busy,navigate}:{brief:AssistantBrief|null;messages:ChatMessage[];message:string;setMessage:(v:string)=>void;send:(v?:string)=>void;busy:boolean;navigate:(v:string)=>void}){
  return <div className="opsAssistant">
    {!messages.length&&<><div className="opsWelcome"><b>{brief?.workspace?.name||'Seu negócio'}</b><p>Posso ler o estado operacional do NexOffice e responder usando CRM, financeiro, agenda, tarefas e documentos.</p></div>{brief?.priorities?.length?<div className="opsPriorities">{brief.priorities.slice(0,4).map((p,i)=><button key={i} onClick={()=>navigate(p.target)}><span className={`dot ${p.level}`}/><div><b>{p.title}</b><small>{p.detail}</small></div><i>→</i></button>)}</div>:null}<div className="opsPrompts">{brief?.suggestedPrompts?.map(p=><button key={p} onClick={()=>send(p)}>{p}</button>)}</div></>}
    {messages.length>0&&<div className="opsThread">{messages.map((m,i)=><div key={i} className={`opsMessage ${m.role}`}><small>{m.role==='user'?'Você':'NexOffice'}</small><p>{m.content}</p>{m.metadata?.actions?.map((a:any)=><button key={a.label} onClick={()=>navigate(a.target)}>{a.label} →</button>)}</div>)}</div>}
    <form className="opsComposer" onSubmit={e=>{e.preventDefault();send()}}><textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Pergunte sobre seu negócio…" rows={2}/><button disabled={busy||!message.trim()}>Enviar</button></form>
  </div>
}

function Documents({documents,add,analyze,signature}:{documents:DocumentRef[];add:(e:FormEvent<HTMLFormElement>)=>void;analyze:(id:string)=>void;signature:(id:string)=>void}){
  return <div><div className="opsSection"><b>Vincular documento DocWallet</b><small>NexOffice guarda somente referência, status e metadados seguros — nunca o arquivo bruto.</small></div><form className="opsMiniForm" onSubmit={add}><input name="title" placeholder="Título" required/><input name="externalRef" placeholder="ID no DocWallet" required/><input name="documentType" placeholder="Tipo (contrato, proposta…)"/><button>Vincular</button></form><div className="opsList">{documents.length?documents.map(d=><article key={d.id}><div className="opsRowTop"><div><b>{d.title}</b><small>{d.document_type||'Documento'} · {d.provider}</small></div><Status value={d.status}/></div><div className="opsMeta"><span>Análise: <b>{friendly(d.intelligence_status)}</b></span><span>Assinatura: <b>{friendly(d.signature_status)}</b></span></div>{d.sync_error&&<small className="opsWarn">{d.sync_error}</small>}<div className="opsActions"><button onClick={()=>analyze(d.id)}>Analisar</button><button onClick={()=>signature(d.id)}>Solicitar assinatura</button></div></article>):<Empty text="Nenhum documento vinculado ainda."/>}</div></div>
}

function CollectionsView({data,scan,charge}:{data:Collections|null;scan:()=>void;charge:(id:string)=>void}){
  return <div><div className="opsMetrics"><div><span>Vencidos</span><b>{data?.summary?.overdue_count||0}</b></div><div><span>Valor vencido</span><b>{money(data?.summary?.overdue_minor)}</b></div></div><div className="opsSection split"><div><b>Régua de cobrança</b><small>Identifica vencidos e prepara contatos com aprovação humana.</small></div><button onClick={scan}>Escanear agora</button></div><div className="opsList">{data?.receivables?.length?data.receivables.map(r=><article key={r.id}><div className="opsRowTop"><div><b>{r.contact_name||r.description}</b><small>{r.description} · venceu {date(r.due_at)}</small></div><strong>{money(r.amount_minor)}</strong></div><div className="opsMeta"><span>{r.days_overdue} dia(s) vencido</span><span>{r.phone?'WhatsApp ✓':''} {r.email?'E-mail ✓':''}</span></div><div className="opsActions"><button onClick={()=>charge(r.id)}>Preparar cobrança Pix</button></div></article>):<Empty text="Nenhum recebível vencido."/>}</div></div>
}

function Integrations({catalog,probe}:{catalog:Capability[];probe:(provider:string)=>void}){
  return <div><div className="opsSection"><b>AV Integration Hub</b><small>As credenciais ficam no runtime. Esta tela mostra apenas disponibilidade e saúde das capabilities.</small></div><div className="opsList">{catalog.map(c=><article key={c.provider}><div className="opsRowTop"><div><b>{c.label}</b><small>{c.capabilities.join(' · ')}</small></div><Status value={c.state?.status||(!c.baseUrlConfigured?'not_configured':'ready')}/></div><div className="opsMeta"><span>URL {c.baseUrlConfigured?'✓':'—'}</span><span>Credencial {c.credentialConfigured?'✓':'—'}</span></div>{c.state?.last_error&&<small className="opsWarn">{c.state.last_error}</small>}<div className="opsActions"><button onClick={()=>probe(c.provider)} disabled={!c.baseUrlConfigured}>Testar conexão</button></div></article>)}</div></div>
}

function Status({value}:{value:string}){return <span className={`opsStatus ${value}`}>{friendly(value)}</span>}
function Empty({text}:{text:string}){return <div className="opsEmpty">{text}</div>}
function friendly(v?:string){const map:Record<string,string>={not_requested:'Não solicitado',queued:'Na fila',processing:'Processando',completed:'Concluído',requested:'Solicitada',signed:'Assinado',active:'Ativo',linked:'Vinculado',draft:'Rascunho',connected:'Conectado',error:'Erro',not_configured:'Não configurado',ready:'Pronto',disconnected:'Desconectado'};return map[v||'']||v||'—'}
