import {useEffect,useState} from 'react';
import {api,session} from './api';
import './document-intelligence-center.css';

type DocRef={id:string;provider:string;external_ref:string;title:string;status:string;document_type?:string|null;intelligence_status?:string|null;signature_status?:string|null;contact_name?:string|null;updated_at?:string};
type DocAlert={id?:string;title?:string;message?:string;dueDate?:string;severity?:string;type?:string;documentId?:string};
type Intelligence={success?:boolean;document?:any;intelligence?:{id?:string;status?:string;documentType?:string;classification?:string;summary?:string;parties?:any[];dates?:any[];amounts?:any[];obligations?:any[];confidence?:number};rawTextReturned?:boolean};

type Upcoming={success?:boolean;days?:number;alerts?:DocAlert[]};

const date=(value?:string)=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short'}).format(new Date(`${String(value).slice(0,10)}T12:00:00-03:00`)):'—';
const money=(value:any)=>{const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n):String(value??'—')};

export default function DocumentIntelligenceCenter(){
  const [active,setActive]=useState(false);const [docs,setDocs]=useState<DocRef[]>([]);const [upcoming,setUpcoming]=useState<DocAlert[]>([]);const [selected,setSelected]=useState<DocRef|null>(null);const [intel,setIntel]=useState<Intelligence|null>(null);const [alerts,setAlerts]=useState<DocAlert[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);const authenticated=Boolean(session.token()&&session.workspace());

  useEffect(()=>{const timer=setInterval(()=>{setSessionKey(`${session.token()}|${session.workspace()}`);const button=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');setActive(Boolean(button?.textContent?.includes('Documentos')))},500);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!authenticated||!active){setDocs([]);setUpcoming([]);setSelected(null);setIntel(null);setAlerts([]);return}void load()},[sessionKey,active]);

  async function load(){setBusy(true);setError('');try{const refs=await api<DocRef[]>('/v1/documents');setDocs(refs);try{const result=await api<Upcoming>('/v1/documents/upcoming-expirations?days=60');setUpcoming(Array.isArray(result.alerts)?result.alerts:[])}catch{setUpcoming([])}}catch(e:any){setError(e?.message||'Não consegui carregar os documentos.')}finally{setBusy(false)}}
  async function inspect(doc:DocRef){setSelected(doc);setIntel(null);setAlerts([]);setError('');setBusy(true);try{const [intelligence,docAlerts]=await Promise.all([api<Intelligence>(`/v1/documents/${doc.id}/intelligence`),api<{alerts?:DocAlert[]}>(`/v1/documents/${doc.id}/alerts`)]);setIntel(intelligence);setAlerts(Array.isArray(docAlerts.alerts)?docAlerts.alerts:[])}catch(e:any){setError(e?.message||'A inteligência deste documento ainda não está disponível.')}finally{setBusy(false)}}

  if(!authenticated||!active)return null;
  const data=intel?.intelligence;
  return <aside className="documentIntelligenceCenter" aria-label="Inteligência documental NexOffice">
    <div className="dicHead"><div><p>NEXOFFICE · DORA</p><h3>Inteligência documental</h3><small>DocWallet por trás · arquivos brutos permanecem no motor documental</small></div><button onClick={()=>void load()} disabled={busy}>↻</button></div>
    {error&&<div className="dicError">{error}</div>}
    <section className="dicExpirations"><div><b>Próximos 60 dias</b><span>{upcoming.length} alerta(s)</span></div>{upcoming.length?<div className="dicAlertRail">{upcoming.slice(0,6).map((item,index)=><article key={item.id||`${item.documentId}-${index}`}><b>{item.title||item.message||'Documento exige atenção'}</b><small>{item.dueDate?date(item.dueDate):'prazo identificado'}{item.severity?` · ${item.severity}`:''}</small></article>)}</div>:<p>Nenhum vencimento DocWallet disponível para este workspace agora.</p>}</section>
    <div className="dicBody">
      <section className="dicDocs"><div className="dicTitle"><b>Documentos vinculados</b><span>{docs.length}</span></div>{docs.length?docs.map(doc=><button key={doc.id} className={selected?.id===doc.id?'active':''} onClick={()=>void inspect(doc)} disabled={busy||doc.provider!=='docwallet'}><div><b>{doc.title}</b><small>{doc.document_type||'documento'}{doc.contact_name?` · ${doc.contact_name}`:''}</small></div><span>{doc.provider==='docwallet'?'Ler':'referência'}</span></button>):<div className="dicEmpty">Ainda não há referências documentais neste workspace. Conecte o DocWallet e vincule documentos para a Dora trabalhar sobre eles.</div>}</section>
      <section className="dicDetail">{selected?<><div className="dicDetailHead"><div><p>DOCUMENTO</p><h4>{selected.title}</h4></div><span>{data?.status||selected.intelligence_status||selected.status}</span></div>{busy&&!intel?<div className="dicLoading">Consultando DocWallet…</div>:data?<><div className="dicSummary"><b>{data.classification||data.documentType||selected.document_type||'Documento'}</b><p>{data.summary||'Inteligência estruturada disponível para este documento.'}</p></div><div className="dicFacts"><article><span>Partes</span><b>{data.parties?.length||0}</b></article><article><span>Datas</span><b>{data.dates?.length||0}</b></article><article><span>Valores</span><b>{data.amounts?.length||0}</b></article><article><span>Obrigações</span><b>{data.obligations?.length||0}</b></article></div>{Boolean(data.amounts?.length)&&<div className="dicList"><b>Valores identificados</b>{data.amounts!.slice(0,5).map((item:any,index)=><span key={item.id||index}>{item.label||item.type||'Valor'} <strong>{money(item.amount??item.value)}</strong></span>)}</div>}{Boolean(data.obligations?.length)&&<div className="dicList"><b>Obrigações</b>{data.obligations!.slice(0,6).map((item:any,index)=><span key={item.id||index}>{item.description||item.text||item.label||'Obrigação identificada'}</span>)}</div>}{alerts.length>0&&<div className="dicList attention"><b>Alertas</b>{alerts.slice(0,6).map((item,index)=><span key={item.id||index}>{item.title||item.message||item.type||'Alerta'}{item.dueDate?` · ${date(item.dueDate)}`:''}</span>)}</div>}<div className="dicPrivacy">✓ Texto bruto e arquivo não são retornados ao NexOffice por este bridge.</div></>:<div className="dicEmpty">Selecione novamente quando a análise do DocWallet estiver concluída.</div>}</>:<div className="dicEmpty"><b>Dora ganhou ferramentas reais.</b><p>Selecione um documento para ler classificação, partes, datas, valores, obrigações e alertas estruturados do DocWallet.</p></div>}</section>
    </div>
    <footer><span>Workspace isolado</span><span>Leitura estruturada</span><span>Sem raw text</span></footer>
  </aside>;
}
