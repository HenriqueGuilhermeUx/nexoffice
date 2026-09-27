import {useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {session} from './api';
import './shell-ux-enhancements.css';

type Destination={label:string;description:string;match:string;icon:string};
const destinations:Destination[]=[
  {label:'Hoje',description:'Prioridades, decisões e resumo do negócio.',match:'Central de Comando',icon:'◈'},
  {label:'Clientes',description:'CRM, contatos e oportunidades.',match:'CRM',icon:'◎'},
  {label:'Financeiro',description:'Receitas, cobranças, Pix e conciliação.',match:'Financeiro',icon:'▤'},
  {label:'Pix',description:'Configurar recebimento, gerar cobrança e acompanhar repasses.',match:'Financeiro',icon:'$'},
  {label:'Documentos',description:'Contratos, assinaturas e inteligência documental.',match:'Documentos',icon:'▱'},
  {label:'Operação',description:'Agenda, tarefas e execução diária.',match:'Agenda & Tarefas',icon:'◷'},
  {label:'Crescimento',description:'Marketing, campanhas e oportunidades.',match:'Marketing',icon:'↗'},
  {label:'Assistentes IA',description:'Maya e equipe digital especializada.',match:'Equipe Digital',icon:'✦'},
  {label:'Integrações',description:'Conectores e serviços externos.',match:'Integrações',icon:'⇄'},
  {label:'Empresa',description:'Acessos, workspace e configurações.',match:'Empresa & Acessos',icon:'⚙'}
];

function clickNav(match:string){
  const buttons=[...document.querySelectorAll<HTMLButtonElement>('.sidebar nav button')];
  const target=buttons.find(b=>b.textContent?.toLowerCase().includes(match.toLowerCase()));
  target?.click();
}
function ensurePixSlot(){
  const content=document.querySelector<HTMLElement>('.content');
  const title=document.querySelector<HTMLElement>('.topbar h1')?.textContent||'';
  if(!content)return null;
  if(!title.toLowerCase().includes('financeiro')){
    content.querySelectorAll('.financePixSlot').forEach(x=>x.remove());
    return null;
  }
  let slot=content.querySelector<HTMLElement>('.financePixSlot');
  if(!slot){slot=document.createElement('div');slot.className='financePixSlot';content.prepend(slot)}
  return slot;
}
function looksFloating(el:HTMLElement){
  const own=getComputedStyle(el);const parent=el.parentElement?getComputedStyle(el.parentElement):null;
  return ['fixed','absolute','sticky'].includes(own.position)||Boolean(parent&&['fixed','absolute'].includes(parent.position));
}
function cleanLegacyFloaters(){
  document.body.classList.add('nexoCleanShell');
  const exact=['Conhecimento & Segurança','Investimentos & Mercados','Visão financeira','Módulos','Radar de Hoje','Saúde do Negócio','Trajetória','Extrato','Copiloto'];
  document.querySelectorAll<HTMLElement>('button,a').forEach(el=>{
    const text=(el.textContent||'').replace(/\s+/g,' ').trim();
    const isOfficial=Boolean(el.closest('.nexoSearchOverlay,.homeV2,.officeView,.receiveOverlay'));
    const legacyExact=exact.some(label=>text===label||text.includes(label));
    const legacyMarketing=text==='Marketing'&&looksFloating(el);
    if(!isOfficial&&(legacyExact||legacyMarketing))el.classList.add('nexoLegacyFloater');
  });
  document.querySelectorAll<HTMLElement>('[class*="launcher"],[class*="Launcher"],[class*="dock"],[class*="Dock"],[class*="floating"],[class*="Floating"]').forEach(el=>{
    if(el.closest('.nexoSearchOverlay,.homeV2,.officeView,.receiveOverlay'))return;
    const text=(el.textContent||'').replace(/\s+/g,' ').trim();
    if(/Marketing|Extrato|Copiloto|Radar de Hoje|Saúde do Negócio|Trajetória|Conhecimento & Segurança|Investimentos & Mercados/.test(text))el.classList.add('nexoLegacyFloater');
  });
  const navButtons=[...document.querySelectorAll<HTMLButtonElement>('.sidebar nav button')];
  const keep=['Central de Comando','CRM','Financeiro','Agenda & Tarefas','Documentos','Equipe Digital','Marketing','Integrações','Empresa & Acessos'];
  navButtons.forEach(b=>{b.style.display=keep.some(x=>(b.textContent||'').includes(x))?'':'none'});
}
function enhanceProBanner(){
  const candidates=[...document.querySelectorAll<HTMLElement>('button,a')].filter(el=>(el.textContent||'').includes('Assinar NexOffice Pro'));
  for(const cta of candidates){
    const banner=cta.closest<HTMLElement>('div');if(!banner)continue;
    banner.classList.add('nexoProBanner');
    if(localStorage.getItem('nexoffice.proBanner.dismissed')==='1'){banner.style.display='none';continue}
    if(!banner.querySelector('.nexoProClose')){const close=document.createElement('button');close.className='nexoProClose';close.type='button';close.textContent='×';close.title='Fechar oferta';close.onclick=()=>{localStorage.setItem('nexoffice.proBanner.dismissed','1');banner.style.display='none'};banner.appendChild(close)}
  }
}

export default function ShellUXEnhancements(){
  const [topbar,setTopbar]=useState<Element|null>(null);const [open,setOpen]=useState(false);const [query,setQuery]=useState('');
  const results=useMemo(()=>{const q=query.trim().toLowerCase();if(!q)return destinations;return destinations.filter(x=>`${x.label} ${x.description}`.toLowerCase().includes(q))},[query]);
  useEffect(()=>{
    let pixHandled=false;
    const sync=()=>{
      setTopbar(document.querySelector('.topbar'));
      cleanLegacyFloaters();enhanceProBanner();
      const wantsPix=new URLSearchParams(location.search).get('pix')==='1';
      if(wantsPix&&session.token()){
        const title=document.querySelector('.topbar h1')?.textContent||'';
        if(!title.toLowerCase().includes('financeiro'))clickNav('Financeiro');
        const slot=ensurePixSlot();if(slot&&!pixHandled){pixHandled=true;setTimeout(()=>slot.scrollIntoView({behavior:'smooth',block:'start'}),250)}
      } else ensurePixSlot();
    };
    sync();const obs=new MutationObserver(sync);obs.observe(document.documentElement,{subtree:true,childList:true});const id=window.setInterval(sync,700);
    const keys=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setOpen(true)}if(e.key==='Escape')setOpen(false)};window.addEventListener('keydown',keys);
    return()=>{obs.disconnect();window.clearInterval(id);window.removeEventListener('keydown',keys);document.body.classList.remove('nexoCleanShell')}
  },[]);
  const go=(d:Destination)=>{clickNav(d.match);setOpen(false);setQuery('');setTimeout(()=>{const slot=ensurePixSlot();if(d.label==='Pix')slot?.scrollIntoView({behavior:'smooth',block:'start'})},100)};
  return <>
    {topbar&&createPortal(<button className="nexoGlobalSearch" onClick={()=>setOpen(true)}><span>⌕</span><span>Buscar clientes, cobranças, documentos, telas…</span><kbd>Ctrl K</kbd></button>,topbar)}
    {open&&createPortal(<div className="nexoSearchOverlay" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="nexoSearchPanel"><header><span>⌕</span><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="O que você quer encontrar?"/><kbd>Esc</kbd></header><div className="nexoSearchResults">{results.map(d=><button key={d.label} onClick={()=>go(d)}><span className="nexoSearchIcon">{d.icon}</span><span><b>{d.label}</b><small>{d.description}</small></span><em>↵</em></button>)}{!results.length&&<p>Nenhum resultado. Tente “Pix”, “clientes”, “documentos” ou “Maya”.</p>}</div><footer>Busca global do NexOffice · módulos e assistentes em um só lugar</footer></section></div>,document.body)}
  </>;
}
