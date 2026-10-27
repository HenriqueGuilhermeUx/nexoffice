import {useState,type FormEvent} from 'react';
import {MAYA_QUICK_INTENTS,mayaRouteFor,routeMayaIntent,type MayaDestination,type MayaRoute} from './personal-assistant-routing';
import './nexa-maya-coordinator.css';

type Agent='expenses'|'financial'|'planning'|'investments'|'shopping'|'simulations'|'payments'|'contracts'|'public_services'|'debt_review'|'legal_support';
type Section='crypto'|'privacy';

export default function NexaMayaCoordinator({onOpenAgent,onOpenSection}:{
 onOpenAgent:(agent:Agent)=>void;
 onOpenSection:(section:Section)=>void;
}){
 const [request,setRequest]=useState('');
 const [route,setRoute]=useState<MayaRoute|null>(null);
 const [feedback,setFeedback]=useState('');
 function choose(next:MayaRoute){setRoute(next);setFeedback('');}
 function resolve(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  const next=routeMayaIntent(request);
  if(!next){setRoute(null);setFeedback('Descreva seu objetivo em até 240 caracteres, sem dados pessoais ou financeiros.');return;}
  choose(next);
 }
 function open(destination:MayaDestination){
  // Never pass the raw user message, token, balances or account IDs.
  if(destination.section==='agents')onOpenAgent(destination.agent);
  else onOpenSection(destination.section);
 }
 return <section className="np-maya-coordinator np-panel" aria-labelledby="np-maya-coordinator-title">
  <span className="np-kicker">MAYA · SUA COORDENADORA NA NEXA PF</span>
  <h2 id="np-maya-coordinator-title">O que você quer resolver?</h2>
  <p>Eu direciono você para o especialista certo dentro da Nexa. Esta etapa usa encaminhamento local por assunto; <strong>não é uma conversa com IA externa</strong> e não envia o que você escreve para outros produtos.</p>
  <form onSubmit={resolve}>
   <label htmlFor="nexa-maya-intent">Descreva apenas o assunto, sem senhas, CPF, chaves ou dados de conta.</label>
   <div className="np-maya-row">
    <input id="nexa-maya-intent" value={request} onChange={e=>{setRequest(e.target.value);setRoute(null);setFeedback('');}}
     maxLength={240} autoComplete="off" placeholder="Ex.: quero organizar minhas despesas" />
    <button className="np-primary" type="submit">Encontrar especialista</button>
   </div>
  </form>
  <div className="np-maya-choices" aria-label="Assuntos frequentes">
   {MAYA_QUICK_INTENTS.map(intent=><button key={intent} type="button" className="np-studio-secondary"
    onClick={()=>{setRequest('');choose(mayaRouteFor(intent));}}>{mayaRouteFor(intent).label}</button>)}
  </div>
  {feedback&&<p className="np-error" role="alert">{feedback}</p>}
  {route&&<div className="np-maya-recommendation" role="status">
    <strong>{route.label}</strong><p>{route.description}</p>
    <button type="button" className="np-primary" onClick={()=>open(route.destination)}>
     {route.destination.section==='crypto'?'Ir para Cripto & Wallet':'Abrir ferramenta disponível'} →
    </button>
  </div>}
  <small className="np-maya-limits">Maya coordena a Nexa PF. Na Nexa Wallet, quem atende é o Assistente Nexa, com login e permissões próprios. Nenhuma solicitação, token ou dado pessoal é transferido para a Wallet. Este encaminhamento não ativa pagamentos, negociações, investimentos ou integrações externas.</small>
 </section>;
}
