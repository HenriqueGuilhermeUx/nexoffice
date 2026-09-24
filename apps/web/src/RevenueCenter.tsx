import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {api,post} from './api';
import MarketingCenter from './MarketingCenter';
import './revenue-center.css';

type Contact={id:string;name:string;phone?:string|null;email?:string|null;company_name?:string|null};
type Deal={id:string;contact_id?:string|null;contact_name?:string|null;title:string;stage:string;value_minor:number|string;next_action?:string|null};
type SmartBotsStatus={
  status:string;provisioned?:boolean;subscriberEligible?:boolean;botStatus?:string|null;billingStatus?:string|null;
  whatsapp?:{connected:boolean;phone?:string|null;autoReply?:boolean;messageWebhookActive?:boolean};
  entitlement?:{status:string;validFrom?:string|null;validUntil?:string|null}|null;
  offer?:{partnerAmountCents:number;regularAmountCents:number;trialDays:number};
};
type MarketingStatus={configured:boolean;provider:string;health?:{contract?:string;capabilities?:string[]};projects?:any[];campaigns?:any[];prospectingCampaigns?:any[];insights?:any};
type CommandAction={id:string;title:string;summary:string;status:string;autonomy:string;agent_role:string;primary_action?:{type?:string;payload?:any}|null;created_at:string};

const money=(minor:any=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(minor||0)/100);
const phone=(value?:string|null)=>String(value||'').replace(/\D/g,'');

export default function RevenueCenter({workspaceId}:{workspaceId:string}){
  const [smartbots,setSmartbots]=useState<SmartBotsStatus|null>(null);
  const [marketing,setMarketing]=useState<MarketingStatus|null>(null);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [deals,setDeals]=useState<Deal[]>([]);
  const [actions,setActions]=useState<CommandAction[]>([]);
  const [selectedContact,setSelectedContact]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState('');
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{if(workspaceId)void load()},[workspaceId]);

  async function load(){
    setError('');
    try{
      const [sb,mkt,crmContacts,crmDeals,commandActions]=await Promise.all([
        api<SmartBotsStatus>('/v1/integrations/smartbots'),
        api<MarketingStatus>('/v1/marketing/status'),
        api<Contact[]>('/v1/crm/contacts'),
        api<Deal[]>('/v1/crm/deals'),
        api<CommandAction[]>('/v1/command/actions')
      ]);
      setSmartbots(sb);setMarketing(mkt);setContacts(crmContacts);setDeals(crmDeals);setActions(commandActions);
      if(!selectedContact){const first=crmContacts.find(item=>phone(item.phone));if(first)setSelectedContact(first.id)}
    }catch(e:any){setError(e?.message||'Não foi possível carregar o Centro de Receita.')}
  }

  const openDeals=useMemo(()=>deals.filter(item=>!['won','lost'].includes(item.stage)),[deals]);
  const pipeline=useMemo(()=>openDeals.reduce((sum,item)=>sum+Number(item.value_minor||0),0),[openDeals]);
  const whatsappContacts=useMemo(()=>contacts.filter(item=>phone(item.phone)),[contacts]);
  const smartActions=useMemo(()=>actions.filter(item=>String(item.primary_action?.type||'').startsWith('message.send')).slice(0,8),[actions]);
  const selected=contacts.find(item=>item.id===selectedContact)||null;
  const modoReady=Boolean(marketing?.configured);
  const smartReady=Boolean(smartbots?.whatsapp?.connected);

  function prefill(contact:Contact){
    setSelectedContact(contact.id);
    setMessage(`Olá, ${contact.name}. Passando para dar continuidade ao nosso contato. Posso te ajudar a avançar no próximo passo?`);
    document.querySelector('.revenueFollowup')?.scrollIntoView({behavior:'smooth',block:'center'});
  }

  async function activateSmartBots(){
    setBusy('activate');setNotice('');setError('');
    const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;
    try{
      const result=await post<any>(`/v1/integrations/smartbots/${smartbots?.provisioned?'handoff':'activate'}`,{});
      if(result?.handoffUrl){if(popup)popup.location.href=result.handoffUrl;else window.location.href=result.handoffUrl}
      else if(popup)popup.close();
      setNotice(smartbots?.provisioned?'Acesso administrativo do SmartBots preparado.':'Ativação do SmartBots iniciada. Depois do onboarding, a rotina diária continua aqui no NexOffice.');
      await load();
    }catch(e:any){if(popup)popup.close();setError(e?.message||'Não foi possível ativar o SmartBots.')}finally{setBusy('')}
  }

  async function prepareFollowup(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!selected||!phone(selected.phone)||!message.trim())return;
    setBusy('followup');setNotice('');setError('');
    try{
      await post('/v1/events',{
        type:'message.send',source:'revenue-center',subjectType:'crm_contact',subjectId:selected.id,
        payload:{channel:'whatsapp',recipient:phone(selected.phone),contactName:selected.name,message:message.trim(),summary:`Follow-up comercial preparado para ${selected.name}.`}
      });
      setNotice('Follow-up preparado no NexOffice e enviado para a governança da Central de Comando. Nenhuma mensagem sai sem as regras de aprovação do workspace.');
      setMessage('');await load();
    }catch(e:any){setError(e?.message||'Não foi possível preparar o follow-up.')}finally{setBusy('')}
  }

  return <div className="revenueCenter">
    <section className="revenueHero">
      <div><p className="eyebrow">NEXOFFICE · REVENUE LOOP</p><h2>Demanda entra. Conversa acontece. Receita aparece.</h2><p>MODO cria e encontra oportunidades; SmartBots atende e faz follow-up; CRM e Financeiro mostram o resultado. O cliente opera tudo pelo NexOffice.</p></div>
      <button onClick={()=>void load()} disabled={Boolean(busy)}>↻ Atualizar</button>
    </section>

    <div className="revenueLoop">
      <article className={modoReady?'ready':''}><span>1</span><div><b>MODO</b><small>Conteúdo, campanhas, radar e prospecção</small></div><em>{modoReady?'motor pronto':'configurar'}</em></article>
      <article><span>2</span><div><b>CRM</b><small>{openDeals.length} oportunidades · {money(pipeline)}</small></div><em>verdade comercial</em></article>
      <article className={smartReady?'ready':''}><span>3</span><div><b>SmartBots</b><small>WhatsApp, atendimento, qualificação e follow-up</small></div><em>{smartReady?'WhatsApp ativo':smartbots?.provisioned?'onboarding':'ativar'}</em></article>
      <article><span>4</span><div><b>Receita</b><small>Conversão, recebíveis e aprendizado do negócio</small></div><em>loop fechado</em></article>
    </div>

    {error&&<div className="revenueError">{error}</div>}{notice&&<div className="revenueNotice">{notice}</div>}

    <div className="revenueGrid">
      <section className="revenuePanel">
        <header><div><p className="eyebrow">SMARTBOTS · NATIVO</p><h3>Atendimento & Follow-up</h3></div><span className={`revenueState ${smartReady?'ready':''}`}>{smartReady?'ativo':smartbots?.provisioned?'ativando':'disponível'}</span></header>
        <div className="smartStatus">
          <div><span>WhatsApp</span><b>{smartReady?'Conectado':'Ainda não conectado'}</b><small>{smartbots?.whatsapp?.phone||'Canal por workspace'}</small></div>
          <div><span>Atendimento automático</span><b>{smartbots?.whatsapp?.autoReply?'Ativo':'Protegido'}</b><small>{smartbots?.whatsapp?.messageWebhookActive?'Webhook operacional':'Aguardando canal'}</small></div>
          <div><span>Base utilizável</span><b>{whatsappContacts.length} contatos</b><small>CRM com telefone/WhatsApp</small></div>
        </div>
        {!smartReady&&<button className="primary" onClick={()=>void activateSmartBots()} disabled={!smartbots?.subscriberEligible||busy==='activate'}>{busy==='activate'?'Preparando…':smartbots?.provisioned?'Concluir / administrar SmartBots':'Ativar SmartBots'}</button>}
        {!smartbots?.subscriberEligible&&<small className="revenueHint">A ativação exige assinatura NexOffice elegível. O vínculo técnico já permanece isolado por workspace.</small>}
      </section>

      <section className="revenuePanel">
        <header><div><p className="eyebrow">PIPELINE</p><h3>Onde agir agora</h3></div><b>{money(pipeline)}</b></header>
        <div className="revenueDeals">{openDeals.slice(0,6).map(deal=>{const contact=contacts.find(item=>item.id===deal.contact_id);return <article key={deal.id}><div><b>{deal.title}</b><span>{deal.contact_name||contact?.name||'Sem contato'} · {deal.stage}</span><small>{deal.next_action||'Sem próxima ação definida'}</small></div><div><strong>{money(deal.value_minor)}</strong>{contact&&phone(contact.phone)&&<button onClick={()=>prefill(contact)}>Follow-up</button>}</div></article>})}{!openDeals.length&&<p className="revenueEmpty">Nenhuma oportunidade aberta agora.</p>}</div>
      </section>
    </div>

    <form className="revenuePanel revenueFollowup" onSubmit={prepareFollowup}>
      <header><div><p className="eyebrow">SMART FOLLOW-UP</p><h3>Preparar contato sem sair do NexOffice</h3></div><span className="revenueState">approval-first</span></header>
      <p className="revenueCopy">Escolha um contato do CRM, escreva a mensagem e envie para a Central de Comando. O SmartBots é o motor de entrega; o NexOffice continua sendo a interface e a governança.</p>
      <div className="followupFields"><label><span>Contato</span><select value={selectedContact} onChange={e=>setSelectedContact(e.target.value)}><option value="">Selecione</option>{whatsappContacts.map(item=><option key={item.id} value={item.id}>{item.name}{item.company_name?` · ${item.company_name}`:''}</option>)}</select></label><label className="wide"><span>Mensagem</span><textarea rows={4} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Ex.: Olá, Maria. Vi que nossa proposta ficou em aberto. Quer que eu te envie os próximos passos?"/></label></div>
      <div className="followupFoot"><small>{selected?.phone?`Destino: ${selected.phone}`:'Selecione um contato com WhatsApp.'} · Ação externa continua sujeita à aprovação e ao gate global.</small><button className="primary" disabled={!selected||!message.trim()||busy==='followup'}>{busy==='followup'?'Preparando…':'Enviar para aprovação'}</button></div>
    </form>

    {smartActions.length>0&&<section className="revenuePanel"><header><div><p className="eyebrow">FILA DE COMUNICAÇÃO</p><h3>Follow-ups preparados</h3></div><span>{smartActions.length}</span></header><div className="smartActionList">{smartActions.map(action=><article key={action.id}><div><b>{action.title}</b><p>{action.summary}</p></div><span>{action.autonomy==='approval_required'?'aguardando aprovação':action.status}</span></article>)}</div></section>}

    <div className="revenueDivider"><span>MODO · AQUISIÇÃO E PRESENÇA</span></div>
    <MarketingCenter workspaceId={workspaceId}/>
  </div>;
}
