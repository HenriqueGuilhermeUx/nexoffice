import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {api,patch,post,session} from './api';

type SetupStep={key:string;title:string;detail:string;done:boolean;action:string};
type Readiness={
  workspace:{id:string;name:string;slug:string;vertical:string;plan:string;status:string;timezone:string;currency:string};
  completionPct:number;completed:number;total:number;operationalReady:boolean;next:SetupStep|null;steps:SetupStep[];
  metrics:{contacts:number;deals:number;tasks:number;appointments:number;ledgerEntries:number;members:number;pendingInvites:number;financeAccounts:number;connectedIntegrations:number};
  safety:{externalActionsEnabled:boolean};
};
type Contact={id:string;name:string;email?:string};

const values=(event:FormEvent<HTMLFormElement>)=>Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
const iso=(value:string)=>value?new Date(value).toISOString():null;
const labelForVertical=(value:string)=>({general:'Geral',legal:'Jurídico',health:'Saúde',condo:'Condomínios',commerce:'Comércio'} as Record<string,string>)[value]||value;

export default function StandaloneSetup(){
  const [readiness,setReadiness]=useState<Readiness|null>(null);
  const [open,setOpen]=useState(false);
  const [action,setAction]=useState<string|null>(null);
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [inviteUrl,setInviteUrl]=useState('');
  const [dirty,setDirty]=useState(false);

  const dismissedKey=readiness?`nexoffice.setup.dismissed.${readiness.workspace.id}`:'';

  const load=async(autoOpen=true)=>{
    if(!session.token()||!session.workspace()){setReadiness(null);return false}
    try{
      const next=await api<Readiness>('/v1/standalone/readiness');
      setReadiness(next);
      if(autoOpen&&!next.operationalReady){
        const reopen=localStorage.getItem(`nexoffice.setup.reopen.${next.workspace.id}`)==='1';
        const dismissed=localStorage.getItem(`nexoffice.setup.dismissed.${next.workspace.id}`)==='1';
        if(reopen){localStorage.removeItem(`nexoffice.setup.reopen.${next.workspace.id}`);setOpen(true)}
        else if(!dismissed)setOpen(true);
      }
      return true;
    }catch{return false}
  };

  useEffect(()=>{
    let active=true;
    const probe=async()=>{if(!active)return;await load(true)};
    probe();
    const timer=window.setInterval(()=>{if(!readiness&&session.token())probe()},1800);
    return()=>{active=false;window.clearInterval(timer)};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const nextStep=useMemo(()=>readiness?.steps.find(step=>!step.done)||null,[readiness]);

  const close=()=>{
    if(readiness&&dismissedKey)localStorage.setItem(dismissedKey,'1');
    setOpen(false);setAction(null);setError('');setNotice('');
    if(dirty)window.location.reload();
  };

  const begin=async(step:SetupStep)=>{
    setError('');setNotice('');setInviteUrl('');
    if(step.action==='workspace'||step.action==='finance'){setAction(null);return}
    if(step.action==='deal'){
      const list=await api<Contact[]>('/v1/crm/contacts').catch(()=>[]);
      setContacts(list);
      if(!list.length){setAction('contact');setNotice('Cadastre um contato primeiro; depois criaremos a oportunidade.');return}
    }
    setAction(step.action);
  };

  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setBusy(true);setError('');setNotice('');
    const form=values(event);
    try{
      if(action==='workspace-edit'){
        await patch('/v1/workspace',{name:form.name,timezone:form.timezone||'America/Sao_Paulo',currency:(form.currency||'BRL').toUpperCase()});
        setNotice('Dados da empresa atualizados.');
      }else if(action==='contact'){
        await post('/v1/crm/contacts',{kind:form.kind||'company',name:form.name,email:form.email||null,phone:form.phone||null,companyName:form.companyName||null,source:'nexoffice-setup',tags:['setup']});
        setNotice('Primeiro contato cadastrado.');
      }else if(action==='deal'){
        await post('/v1/crm/deals',{contactId:form.contactId||null,title:form.title,stage:'lead',valueMinor:Math.round(Number(form.value||0)*100),source:'nexoffice-setup',nextAction:form.nextAction||null});
        setNotice('Oportunidade criada e pipeline ativado.');
      }else if(action==='task'){
        await post('/v1/tasks',{title:form.title,description:form.description||null,priority:form.priority||'normal',dueAt:iso(form.dueAt),contactId:null});
        setNotice('Tarefa criada para a rotina operacional.');
      }else if(action==='ledger'){
        await post('/v1/ledger',{direction:form.direction||'income',category:form.category||'operacional',description:form.description,amountMinor:Math.round(Number(form.amount||0)*100),status:'open',dueAt:iso(form.dueAt),contactId:null,accountId:null});
        setNotice('Lançamento financeiro criado.');
      }else if(action==='team'){
        const result=await post<any>('/v1/members/invite',{email:form.email,role:form.role||'member'});
        setInviteUrl(result.inviteUrl||'');
        setNotice('Convite criado. Copie o link abaixo e envie para a pessoa.');
      }
      setDirty(true);
      await load(false);
      if(action!=='team')setAction(null);
    }catch(e:any){setError(e?.message||'Não foi possível concluir esta etapa.')}
    finally{setBusy(false)}
  };

  if(!readiness)return null;
  const pct=readiness.completionPct;

  return <>
    <button className={`setupFab ${readiness.operationalReady?'ready':''}`} onClick={()=>{setOpen(true);setAction(null);setError('');setNotice('')}}>
      <span className="setupFabRing" style={{'--setup-progress':`${pct*3.6}deg`} as any}><b>{pct}%</b></span>
      <span><strong>{readiness.operationalReady?'Operação pronta':'Configurar NexOffice'}</strong><small>{readiness.operationalReady?'Revisar checklist':nextStep?.title||'Continuar configuração'}</small></span>
    </button>

    {open&&<div className="setupOverlay" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}>
      <section className="setupDrawer">
        <button className="setupClose" onClick={close}>×</button>
        <div className="setupHeader">
          <p className="eyebrow">NEXOFFICE SETUP</p>
          <h2>{readiness.operationalReady?'Seu NexOffice está operacional.':'Coloque seu NexOffice para trabalhar.'}</h2>
          <p>{readiness.workspace.name} · {labelForVertical(readiness.workspace.vertical)} · {readiness.completed}/{readiness.total} etapas</p>
          <div className="setupProgress"><span style={{width:`${pct}%`}}/></div>
          <div className={`setupSafety ${readiness.safety.externalActionsEnabled?'warning':''}`}>{readiness.safety.externalActionsEnabled?'Efeitos externos estão habilitados neste ambiente.':'Staging seguro · efeitos externos permanecem desligados.'}</div>
          <button className="setupTextButton" onClick={()=>setAction('workspace-edit')}>Editar dados da empresa</button>
        </div>

        {error&&<div className="setupError">{error}</div>}
        {notice&&<div className="setupNotice">{notice}</div>}
        {inviteUrl&&<div className="setupInvite"><input readOnly value={inviteUrl}/><button onClick={()=>navigator.clipboard?.writeText(inviteUrl)}>Copiar link</button></div>}

        {action?<div className="setupAction"><button className="setupBack" onClick={()=>{setAction(null);setError('');setNotice('')}}>← Voltar ao checklist</button><SetupForm action={action} readiness={readiness} contacts={contacts} busy={busy} submit={submit}/></div>:<div className="setupChecklist">
          {readiness.steps.map((step,index)=><article className={step.done?'done':''} key={step.key}>
            <div className="setupStepIcon">{step.done?'✓':index+1}</div>
            <div><h3>{step.title}</h3><p>{step.detail}</p></div>
            {!step.done&&step.action!=='workspace'&&step.action!=='finance'&&<button onClick={()=>begin(step)}>Fazer agora</button>}
            {step.done&&<span className="setupDone">Concluído</span>}
          </article>)}
          {readiness.operationalReady&&<div className="setupReadyCard"><b>Base standalone validada no seu workspace.</b><p>Agora você já pode operar CRM, tarefas, financeiro, equipe e Central de Comando sem depender dos produtos verticais.</p></div>}
        </div>}
      </section>
    </div>}
  </>;
}

function SetupForm({action,readiness,contacts,busy,submit}:{action:string;readiness:Readiness;contacts:Contact[];busy:boolean;submit:(event:FormEvent<HTMLFormElement>)=>Promise<void>}){
  if(action==='workspace-edit')return <form onSubmit={submit}><h3>Dados da empresa</h3><label>Nome<input name="name" defaultValue={readiness.workspace.name} required/></label><label>Fuso horário<input name="timezone" defaultValue={readiness.workspace.timezone||'America/Sao_Paulo'} required/></label><label>Moeda<input name="currency" defaultValue={readiness.workspace.currency||'BRL'} maxLength={3} required/></label><button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar empresa'}</button></form>;
  if(action==='contact')return <form onSubmit={submit}><h3>Primeiro contato</h3><p>Cadastre um cliente, lead ou parceiro real. Nada de dados fictícios.</p><label>Tipo<select name="kind"><option value="company">Empresa</option><option value="person">Pessoa</option></select></label><label>Nome<input name="name" required/></label><label>Empresa / organização<input name="companyName"/></label><label>E-mail<input name="email" type="email"/></label><label>Telefone / WhatsApp<input name="phone"/></label><button className="primary" disabled={busy}>{busy?'Salvando…':'Cadastrar contato'}</button></form>;
  if(action==='deal')return <form onSubmit={submit}><h3>Primeira oportunidade</h3><label>Contato<select name="contactId" required>{contacts.map(contact=><option value={contact.id} key={contact.id}>{contact.name}</option>)}</select></label><label>Oportunidade<input name="title" placeholder="Ex.: Implantação NexOffice" required/></label><label>Valor potencial (R$)<input name="value" type="number" min="0" step="0.01"/></label><label>Próxima ação<input name="nextAction" placeholder="Ex.: Enviar proposta"/></label><button className="primary" disabled={busy}>{busy?'Salvando…':'Criar oportunidade'}</button></form>;
  if(action==='task')return <form onSubmit={submit}><h3>Primeira tarefa</h3><label>Tarefa<input name="title" placeholder="Ex.: Revisar pipeline amanhã" required/></label><label>Descrição<input name="description"/></label><label>Prioridade<select name="priority"><option value="normal">Normal</option><option value="high">Alta</option><option value="critical">Crítica</option><option value="low">Baixa</option></select></label><label>Prazo<input name="dueAt" type="datetime-local"/></label><button className="primary" disabled={busy}>{busy?'Salvando…':'Criar tarefa'}</button></form>;
  if(action==='ledger')return <form onSubmit={submit}><h3>Primeiro lançamento financeiro</h3><label>Tipo<select name="direction"><option value="income">Receita</option><option value="expense">Despesa</option></select></label><label>Descrição<input name="description" placeholder="Ex.: Mensalidade cliente" required/></label><label>Categoria<input name="category" defaultValue="operacional" required/></label><label>Valor (R$)<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Vencimento<input name="dueAt" type="datetime-local"/></label><button className="primary" disabled={busy}>{busy?'Salvando…':'Criar lançamento'}</button></form>;
  if(action==='team')return <form onSubmit={submit}><h3>Convide sua equipe</h3><label>E-mail<input name="email" type="email" required/></label><label>Perfil<select name="role"><option value="member">Membro</option><option value="admin">Administrador</option><option value="viewer">Somente leitura</option></select></label><button className="primary" disabled={busy}>{busy?'Criando convite…':'Gerar convite'}</button></form>;
  return null;
}
