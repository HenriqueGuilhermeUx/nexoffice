import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';

const pillars=[
  {icon:'⌁',title:'Comando',text:'Central de Comando, Briefing Executivo, prioridades e “O que mudou?” chegam até você.'},
  {icon:'✦',title:'Equipe Digital',text:'Sofia, Clara, Theo, Dora, Maya e especialistas trabalham sobre o mesmo contexto.'},
  {icon:'◫',title:'Conhecimento',text:'Pergunte à empresa, memória operacional, documentos inteligentes e contratos com DocWallet.'},
  {icon:'↗',title:'Dinheiro',text:'Financeiro, cobranças, conciliação, inteligência financeira e Radar F-Insight.'},
  {icon:'⚡',title:'Execução',text:'CRM, tarefas, contratos, assinaturas, fiscal, marketing, prospecção e automações.'},
  {icon:'◎',title:'Ecossistema & Segurança',text:'Network de profissionais, compliance, permissões e backup empresarial verificável.'}
];

const lineage=['Cliente','Venda','Contrato','Trabalho','Nota','Cobrança','Pagamento','Resultado','Memória'];

export default function MarketingDiscoveryBridge(){
  const[target,setTarget]=useState<Element|null>(null);
  useEffect(()=>{
    const find=()=>setTarget(document.querySelector('.marketingPage .mkBridge'));
    find();
    const observer=new MutationObserver(find);observer.observe(document.documentElement,{subtree:true,childList:true});
    return()=>observer.disconnect();
  },[]);
  if(!target)return null;
  return createPortal(<div className="mkUniverse">
    <div className="mkUniverseHead"><span>UMA EMPRESA INTEIRA. UM NEXOFFICE.</span><h3>Seu negócio já usa ferramentas demais. O NexOffice faz o trabalho conversar.</h3><p>Você vê uma operação só. Por baixo, motores especializados cuidam de documentos, mercado, fiscal, marketing, conhecimento, segurança e execução.</p></div>
    <div className="mkUniverseGrid">{pillars.map(item=><article key={item.title}><i>{item.icon}</i><b>{item.title}</b><p>{item.text}</p></article>)}</div>
    <div className="mkLineage"><small>DO PRIMEIRO CONTATO À MEMÓRIA DO NEGÓCIO</small><div>{lineage.map((item,index)=><span key={item}>{item}{index<lineage.length-1&&<em>→</em>}</span>)}</div></div>
  </div>,target);
}
