import {useEffect,useLayoutEffect,useMemo,useState} from 'react';
import {api,session} from './api';
import './product-discovery.css';

type Readiness={workspace:{id:string;name:string};completionPct:number;operationalReady:boolean;metrics:{contacts:number;deals:number;tasks:number;ledgerEntries:number;members:number;connectedIntegrations:number}};
type CapabilityGraph={summary:{total:number;ready:number;approvalRequired:number;planned:number};capabilities:Array<{id:string;label:string;provider:string;availability:string;usableNow:boolean}>};
type BackupState={agents:Array<{id:string;status:string;lastSeenAt?:string|null}>;profiles:Array<{id:string;status:string;lastBackupAt?:string|null;verificationStatus?:string|null}>};
type InvestmentHealth={configured:boolean;provider:string;capabilities?:string[]};
type CapabilityState='active'|'available'|'connect'|'planned';
type Tile={id:string;icon:string;title:string;description:string;state:CapabilityState;detail:string};

const tour=[
  {k:'command',eyebrow:'01 · CENTRAL DE COMANDO',title:'Este é o seu negócio agora.',text:'O NexOffice reúne prioridades, riscos, tarefas, cobranças, documentos e decisões para você não precisar descobrir onde procurar.',chips:['O que aconteceu','O que atrasou','Onde existe risco','Qual é a próxima ação']},
  {k:'team',eyebrow:'02 · EQUIPE DIGITAL',title:'Você ganhou uma equipe que compartilha contexto.',text:'Sofia organiza. Clara acompanha oportunidades. Theo olha recebíveis. Dora cuida de documentos. Maya conecta capacidades e crescimento.',chips:['Sofia · Secretária','Clara · CRM','Theo · Financeiro','Dora · Documentos','Maya · Orquestração']},
  {k:'knowledge',eyebrow:'03 · MEMÓRIA EMPRESARIAL',title:'Pergunte à sua própria empresa.',text:'O NexOffice consulta memória operacional e inteligência estruturada sem inventar resposta quando não encontra evidência suficiente.',chips:['O que mudou hoje?','Quem preciso cobrar?','Qual oportunidade está parada?','Que documento exige atenção?']},
  {k:'lineage',eyebrow:'04 · OPERAÇÃO CONECTADA',title:'O trabalho deixa de quebrar entre sistemas.',text:'Cliente, venda, contrato, trabalho, fiscal, cobrança, pagamento e resultado podem continuar ligados numa mesma linha operacional.',chips:['CRM','DocWallet','TaxAgent','Cobrança','Network']},
  {k:'memory',eyebrow:'05 · QUANTO MAIS USA, MAIS CONTEXTO EXISTE',title:'O NexOffice começa a lembrar junto com você.',text:'Briefing, inteligência, documentos, mudanças, backup e integrações transformam uso diário em contexto operacional útil.',chips:['Briefing','O que mudou?','Backup','Inteligência','Integrações']}
];

function stateLabel(state:CapabilityState){return state==='active'?'Ativo':state==='available'?'Disponível':state==='connect'?'Conectar':'Em evolução'}

export default function ProductDiscovery(){
  const workspaceId=session.workspace();
  const authenticated=Boolean(session.token()&&workspaceId);
  const completedKey=workspaceId?`nexoffice.discovery.completed.${workspaceId}`:'';
  const setupDismissedKey=workspaceId?`nexoffice.setup.dismissed.${workspaceId}`:'';
  const [readiness,setReadiness]=useState<Readiness|null>(null),[graph,setGraph]=useState<CapabilityGraph|null>(null),[backup,setBackup]=useState<BackupState|null>(null),[investment,setInvestment]=useState<InvestmentHealth|null>(null);
  const [open,setOpen]=useState(false),[mode,setMode]=useState<'tour'|'map'>('tour'),[step,setStep]=useState(0),[busy,setBusy]=useState(false);
  const completed=authenticated&&completedKey?localStorage.getItem(completedKey)==='1':false;

  useLayoutEffect(()=>{
    if(!authenticated||!workspaceId)return;
    if(!completed&&setupDismissedKey)localStorage.setItem(setupDismissedKey,'1');
  },[authenticated,workspaceId,completed,setupDismissedKey]);

  useEffect(()=>{
    if(!authenticated)return;
    void load();
    if(!completed)setOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authenticated,workspaceId]);

  async function load(){setBusy(true);try{
    const [r,g,b,i]=await Promise.all([
      api<Readiness>('/v1/standalone/readiness').catch(()=>null),
      api<CapabilityGraph>('/v1/capabilities').catch(()=>null),
      api<BackupState>('/v1/security/backups').catch(()=>null),
      api<InvestmentHealth>('/v1/investments/health').catch(()=>null)
    ]);setReadiness(r);setGraph(g);setBackup(b);setInvestment(i);
  }finally{setBusy(false)}}

  const tiles=useMemo<Tile[]>(()=>{
    const metrics=readiness?.metrics;
    const graphReady=(provider:string)=>Boolean(graph?.capabilities.some(item=>item.provider===provider&&item.usableNow));
    const docwallet=graphReady('docwallet');
    const taxagent=graphReady('taxagent');
    const modo=graphReady('modo');
    const backupActive=Boolean(backup?.profiles?.some(item=>item.status==='active'));
    return [
      {id:'command',icon:'⌁',title:'Central de Comando',description:'Prioridades, riscos, decisões e operação num lugar só.',state:'active',detail:'Nativo do NexOffice'},
      {id:'team',icon:'✦',title:'Equipe Digital',description:'Especialistas por função trabalhando sobre o mesmo contexto.',state:'active',detail:'Sofia, Clara, Theo, Dora e Maya'},
      {id:'crm',icon:'◎',title:'CRM & Operação',description:'Clientes, oportunidades, tarefas e continuidade comercial.',state:(metrics?.contacts||0)>0?'active':'available',detail:(metrics?.contacts||0)>0?`${metrics?.contacts} contato(s) na base`:'Pronto para usar'},
      {id:'finance',icon:'◫',title:'Financeiro & Cobranças',description:'Recebíveis, despesas, conciliação e inteligência financeira.',state:(metrics?.ledgerEntries||0)>0?'active':'available',detail:(metrics?.ledgerEntries||0)>0?'Já recebendo dados':'Pronto para usar'},
      {id:'knowledge',icon:'?',title:'Pergunte à empresa',description:'Memória operacional com evidências e limites de confiança.',state:'active',detail:'Sem LLM externo no V1'},
      {id:'documents',icon:'▤',title:'DocWallet',description:'Contratos, assinaturas, inteligência e processos documentais.',state:docwallet?'active':'connect',detail:docwallet?'Bridge disponível':'Conectar DocWallet'},
      {id:'investments',icon:'↗',title:'Investimentos & Mercados',description:'Radar, macro, notícias e calculadoras via F-Insight.',state:investment?.configured?'active':'connect',detail:investment?.configured?'F-Insight conectado':'Conectar bridge F-Insight'},
      {id:'fiscal',icon:'#',title:'Fiscal',description:'Readiness, emissão e lineage fiscal via TaxAgent.',state:taxagent?'active':'connect',detail:taxagent?'TaxAgent disponível':'Conectar TaxAgent'},
      {id:'marketing',icon:'⚡',title:'Marketing & Growth',description:'Conteúdo, inteligência de mercado e prospecção via MODO.',state:modo?'active':'connect',detail:modo?'MODO disponível':'Conectar MODO'},
      {id:'network',icon:'◇',title:'Rede de Profissionais',description:'Encontrar, contratar e acompanhar trabalho especializado.',state:'available',detail:'Network NexOffice'},
      {id:'backup',icon:'⛨',title:'Backup Empresarial',description:'Restic local com storage do próprio cliente e verificação.',state:backupActive?'active':'available',detail:backupActive?'Backup ativo':'Configuração opcional'},
      {id:'compliance',icon:'✓',title:'Compliance & Segurança',description:'Permissões, governança, trilhas e fronteiras de dados.',state:'active',detail:'Nativo do workspace'}
    ];
  },[readiness,graph,backup,investment]);

  function finish(){if(!workspaceId)return;localStorage.setItem(completedKey,'1');localStorage.removeItem(setupDismissedKey);localStorage.setItem(`nexoffice.setup.reopen.${workspaceId}`,'1');setOpen(false);window.location.reload()}
  if(!authenticated)return null;
  const current=tour[step];

  return <>
    <button className="productDiscoveryFab" onClick={()=>{setMode('map');setOpen(true);void load()}}>✨ <span>Descobrir o NexOffice</span></button>
    {open&&<div className="productDiscoveryOverlay" onMouseDown={e=>{if(e.target===e.currentTarget&&completed)setOpen(false)}}>
      <section className="productDiscoveryShell">
        <header><div><small>NEXOFFICE · DESCOBERTA</small><h2>{mode==='tour'?'Conheça seu NexOffice':'Mapa de Capacidades'}</h2><p>{readiness?.workspace?.name||'Seu workspace'} · {busy?'atualizando…':mode==='tour'?`${step+1} de ${tour.length}`:`${tiles.filter(t=>t.state==='active').length} capacidades ativas`}</p></div>{completed&&<button onClick={()=>setOpen(false)}>×</button>}</header>
        {mode==='tour'?<div className="productTour">
          <div className="productTourProgress">{tour.map((item,index)=><i key={item.k} className={index<=step?'active':''}/>)}</div>
          <div className="productTourCard"><p>{current.eyebrow}</p><h3>{current.title}</h3><span>{current.text}</span><div>{current.chips.map(item=><b key={item}>{item}</b>)}</div></div>
          <footer><button className="secondary" disabled={step===0} onClick={()=>setStep(v=>Math.max(0,v-1))}>← Voltar</button><button className="secondary" onClick={()=>setMode('map')}>Ver mapa completo</button>{step<tour.length-1?<button className="primary" onClick={()=>setStep(v=>v+1)}>Continuar →</button>:<button className="primary" onClick={finish}>Agora vamos configurar →</button>}</footer>
        </div>:<div className="productCapabilityMap">
          <div className="productMapIntro"><div><p>SEU NEXOFFICE</p><h3>Você não precisa ativar tudo de uma vez.</h3><span>O núcleo já funciona sozinho. As capacidades especializadas aparecem conforme fazem sentido para sua empresa.</span></div><div className="productMapStats"><b>{tiles.filter(t=>t.state==='active').length}</b><span>ativas agora</span><b>{tiles.filter(t=>t.state==='available').length}</b><span>prontas para usar</span></div></div>
          <div className="productMapGrid">{tiles.map(tile=><article key={tile.id} className={tile.state}><div><i>{tile.icon}</i><em>{stateLabel(tile.state)}</em></div><h4>{tile.title}</h4><p>{tile.description}</p><small>{tile.detail}</small></article>)}</div>
          <div className="productMapLegend"><span><i className="active"/>Ativo</span><span><i className="available"/>Disponível</span><span><i className="connect"/>Precisa conectar</span><span><i className="planned"/>Em evolução</span></div>
          <footer>{!completed&&<button className="secondary" onClick={()=>setMode('tour')}>← Voltar ao tour</button>}<button className="primary" onClick={()=>completed?setOpen(false):finish()}>{completed?'Fechar mapa':'Configurar meu NexOffice →'}</button></footer>
        </div>}
      </section>
    </div>}
  </>;
}
