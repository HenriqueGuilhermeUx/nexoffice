import {useEffect,useMemo,useState} from 'react';
import {api,session} from './api';
import './contract-creator.css';

type Template={id:string;name:string;category:string};
type Contact={id:string;name:string;company_name?:string|null};
type Deal={id:string;contact_id?:string|null;title:string;stage:string;value_minor:number|string};
type TemplatesResponse={configured:boolean;provider:string;templates:Template[];contentStoredInDocWalletOnly:boolean;externalEffects:boolean};
type CreatedResponse={contract:{id:string;title:string;type:string;status:string;contentHash:string};document:{id:string;title:string;external_ref:string};operation?:{id:string;title:string;status:string;amount_minor:number|string}|null;privacy:{contentStoredInDocWalletOnly:boolean;rawContentPersistedInNexOffice:boolean};signatureRequested:boolean;externalEffects:boolean};

const money=(minor:any=0)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(minor||0)/100);
const toIso=(value:string)=>value?new Date(value).toISOString():null;

export default function ContractCreator(){
  const [active,setActive]=useState(false),[open,setOpen]=useState(false),[templates,setTemplates]=useState<Template[]>([]),[contacts,setContacts]=useState<Contact[]>([]),[deals,setDeals]=useState<Deal[]>([]),[templateId,setTemplateId]=useState(''),[partyA,setPartyA]=useState(''),[partyB,setPartyB]=useState(''),[description,setDescription]=useState(''),[contactId,setContactId]=useState(''),[dealId,setDealId]=useState(''),[amount,setAmount]=useState(''),[dueAt,setDueAt]=useState(''),[createOperation,setCreateOperation]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[created,setCreated]=useState<CreatedResponse|null>(null);
  const authenticated=Boolean(session.token()&&session.workspace());
  const selected=useMemo(()=>templates.find(item=>item.id===templateId)||null,[templates,templateId]);
  const selectedContact=useMemo(()=>contacts.find(item=>item.id===contactId)||null,[contacts,contactId]);
  const eligibleDeals=useMemo(()=>deals.filter(item=>item.stage!=='lost'&&(!contactId||!item.contact_id||item.contact_id===contactId)),[deals,contactId]);

  useEffect(()=>{const timer=setInterval(()=>{const button=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');setActive(Boolean(button?.textContent?.includes('Documentos')))},400);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!open||!authenticated)return;void loadContext()},[open,authenticated]);
  useEffect(()=>{if(selectedContact&&(!partyB.trim()||contacts.some(c=>c.name===partyB)))setPartyB(selectedContact.company_name||selectedContact.name)},[contactId]);
  useEffect(()=>{if(dealId&&!eligibleDeals.some(item=>item.id===dealId))setDealId('')},[contactId,eligibleDeals]);

  async function loadContext(){setBusy(true);setError('');try{const [t,c,d]=await Promise.all([api<TemplatesResponse>('/v1/contracts/templates'),api<Contact[]>('/v1/crm/contacts'),api<Deal[]>('/v1/crm/deals')]);const next=Array.isArray(t.templates)?t.templates:[];setTemplates(next);setTemplateId(current=>current||next[0]?.id||'');setContacts(c);setDeals(d)}catch(e:any){setError(e?.message||'Não consegui carregar os modelos/contexto da DocWallet.')}finally{setBusy(false)}}
  async function create(){if(!templateId||!partyA.trim()||!partyB.trim()||!description.trim())return;if(createOperation&&!contactId){setError('Escolha um cliente para criar também a Operação Comercial.');return}setBusy(true);setError('');setCreated(null);try{const result=await api<CreatedResponse>('/v1/contracts/create',{method:'POST',body:JSON.stringify({templateId,partyA:partyA.trim(),partyB:partyB.trim(),description:description.trim(),contactId:contactId||null,createBusinessOperation:createOperation,dealId:createOperation?(dealId||null):null,amountMinor:createOperation?Math.round(Number(amount||0)*100):null,dueAt:createOperation?toIso(dueAt):null,idempotencyKey:crypto.randomUUID()})});setCreated(result)}catch(e:any){setError(e?.message||'Não consegui criar o contrato.')}finally{setBusy(false)}}
  function reset(){setCreated(null);setDescription('');setDealId('');setAmount('');setDueAt('')}
  function close(){setOpen(false);setError('');setCreated(null)}

  if(!authenticated||!active)return null;
  return <>
    <button className="contractCreatorTrigger" onClick={()=>setOpen(true)}><span>＋</span>Novo contrato</button>
    {open&&<div className="contractCreatorBackdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)close()}}>
      <section className="contractCreatorModal" role="dialog" aria-modal="true" aria-label="Criar contrato com DocWallet">
        <header><div><p>NEXOFFICE · DOCWALLET</p><h3>Criar contrato</h3><small>DocWallet guarda o contrato. NexOffice guarda referência e, se você quiser, inicia a Operação Comercial.</small></div><button onClick={close} aria-label="Fechar">×</button></header>
        {error&&<div className="contractCreatorError">{error}</div>}
        {created?<div className="contractCreatorSuccess"><span>✓</span><div><b>{created.contract.title}</b><p>Rascunho criado na DocWallet e vinculado ao workspace.</p>{created.operation&&<p><strong>Operação Comercial criada:</strong> {money(created.operation.amount_minor)} · {created.operation.status}</p>}<small>Hash {created.contract.contentHash?.slice(0,16)}… · assinatura não solicitada · conteúdo bruto fora do NexOffice</small></div><button onClick={reset}>Criar outro</button></div>:<div className="contractCreatorBody">
          <label><span>Modelo</span><select value={templateId} onChange={event=>setTemplateId(event.target.value)} disabled={busy}>{templates.map(item=><option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></label>
          {selected&&<div className="contractCreatorTemplate"><b>{selected.name}</b><span>Modelo oficial disponível no motor DocWallet.</span></div>}
          <label><span>Cliente / contato no NexOffice</span><select value={contactId} onChange={event=>setContactId(event.target.value)}><option value="">Sem contato vinculado</option>{contacts.map(item=><option key={item.id} value={item.id}>{item.name}{item.company_name?` · ${item.company_name}`:''}</option>)}</select></label>
          <div className="contractCreatorGrid"><label><span>Parte A</span><input value={partyA} onChange={event=>setPartyA(event.target.value)} placeholder="Sua empresa / contratante" maxLength={255}/></label><label><span>Parte B</span><input value={partyB} onChange={event=>setPartyB(event.target.value)} placeholder="Cliente / fornecedor" maxLength={255}/></label></div>
          <label><span>Objeto / condições principais</span><textarea value={description} onChange={event=>setDescription(event.target.value)} placeholder="Descreva o serviço, bem, parceria, obrigação ou condições que o contrato deve registrar." maxLength={8000}/><small>{description.length}/8000</small></label>
          <div className="contractCreatorOperation"><label className="contractCreatorToggle"><input type="checkbox" checked={createOperation} onChange={event=>setCreateOperation(event.target.checked)}/><span><b>Criar também Operação Comercial</b><small>O contrato já nasce ligado à cadeia Nota → Cobrança → Comunicação → Recebido.</small></span></label>{createOperation&&<div className="contractCreatorGrid"><label><span>Oportunidade</span><select value={dealId} onChange={event=>setDealId(event.target.value)}><option value="">Sem oportunidade</option>{eligibleDeals.map(item=><option key={item.id} value={item.id}>{item.title} · {money(item.value_minor)}</option>)}</select></label><label><span>Valor contratado (R$)</span><input type="number" min="0" step="0.01" value={amount} onChange={event=>setAmount(event.target.value)} placeholder="0,00"/></label><label><span>Vencimento</span><input type="datetime-local" value={dueAt} onChange={event=>setDueAt(event.target.value)}/></label></div>}</div>
          <div className="contractCreatorNotice"><b>Sem efeito automático.</b><span>Criar o rascunho não pede assinatura, não emite nota, não cobra e não publica. A Operação Comercial apenas organiza os próximos passos, todos governados separadamente.</span></div>
          <footer><button className="secondary" onClick={close}>Cancelar</button><button className="primary" disabled={busy||!templateId||!partyA.trim()||!partyB.trim()||!description.trim()||(createOperation&&!contactId)} onClick={()=>void create()}>{busy?'Criando…':createOperation?'Criar contrato + operação':'Criar rascunho na DocWallet'}</button></footer>
        </div>}
      </section>
    </div>}
  </>;
}
