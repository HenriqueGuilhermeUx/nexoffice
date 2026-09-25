import {useEffect,useMemo,useState} from 'react';
import {api,session} from './api';
import './contract-creator.css';

type Template={id:string;name:string;category:string};
type TemplatesResponse={configured:boolean;provider:string;templates:Template[];contentStoredInDocWalletOnly:boolean;externalEffects:boolean};
type CreatedResponse={contract:{id:string;title:string;type:string;status:string;contentHash:string};document:{id:string;title:string;external_ref:string};privacy:{contentStoredInDocWalletOnly:boolean;rawContentPersistedInNexOffice:boolean};signatureRequested:boolean;externalEffects:boolean};

export default function ContractCreator(){
  const [active,setActive]=useState(false),[open,setOpen]=useState(false),[templates,setTemplates]=useState<Template[]>([]),[templateId,setTemplateId]=useState(''),[partyA,setPartyA]=useState(''),[partyB,setPartyB]=useState(''),[description,setDescription]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[created,setCreated]=useState<CreatedResponse|null>(null);
  const authenticated=Boolean(session.token()&&session.workspace());
  const selected=useMemo(()=>templates.find(item=>item.id===templateId)||null,[templates,templateId]);

  useEffect(()=>{const timer=setInterval(()=>{const button=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');setActive(Boolean(button?.textContent?.includes('Documentos')))},400);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!open||!authenticated)return;void loadTemplates()},[open,authenticated]);

  async function loadTemplates(){setBusy(true);setError('');try{const result=await api<TemplatesResponse>('/v1/contracts/templates');const next=Array.isArray(result.templates)?result.templates:[];setTemplates(next);setTemplateId(current=>current||next[0]?.id||'')}catch(e:any){setError(e?.message||'Não consegui carregar os modelos da DocWallet.')}finally{setBusy(false)}}
  async function create(){if(!templateId||!partyA.trim()||!partyB.trim()||!description.trim())return;setBusy(true);setError('');setCreated(null);try{const result=await api<CreatedResponse>('/v1/contracts/create',{method:'POST',body:JSON.stringify({templateId,partyA:partyA.trim(),partyB:partyB.trim(),description:description.trim(),idempotencyKey:crypto.randomUUID()})});setCreated(result)}catch(e:any){setError(e?.message||'Não consegui criar o contrato.')}finally{setBusy(false)}}
  function close(){setOpen(false);setError('');setCreated(null)}

  if(!authenticated||!active)return null;
  return <>
    <button className="contractCreatorTrigger" onClick={()=>setOpen(true)}><span>＋</span>Novo contrato</button>
    {open&&<div className="contractCreatorBackdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)close()}}>
      <section className="contractCreatorModal" role="dialog" aria-modal="true" aria-label="Criar contrato com DocWallet">
        <header><div><p>NEXOFFICE · DOCWALLET</p><h3>Criar contrato</h3><small>O texto fica na DocWallet; o NexOffice guarda apenas referência, status e hashes.</small></div><button onClick={close} aria-label="Fechar">×</button></header>
        {error&&<div className="contractCreatorError">{error}</div>}
        {created?<div className="contractCreatorSuccess"><span>✓</span><div><b>{created.contract.title}</b><p>Rascunho criado na DocWallet e vinculado ao workspace.</p><small>Hash {created.contract.contentHash?.slice(0,16)}… · assinatura não solicitada</small></div><button onClick={()=>{setCreated(null);setDescription('')}}>Criar outro</button></div>:<div className="contractCreatorBody">
          <label><span>Modelo</span><select value={templateId} onChange={event=>setTemplateId(event.target.value)} disabled={busy}>{templates.map(item=><option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></label>
          {selected&&<div className="contractCreatorTemplate"><b>{selected.name}</b><span>Modelo oficial disponível no motor DocWallet.</span></div>}
          <div className="contractCreatorGrid"><label><span>Parte A</span><input value={partyA} onChange={event=>setPartyA(event.target.value)} placeholder="Sua empresa / contratante" maxLength={255}/></label><label><span>Parte B</span><input value={partyB} onChange={event=>setPartyB(event.target.value)} placeholder="Cliente / fornecedor" maxLength={255}/></label></div>
          <label><span>Objeto / condições principais</span><textarea value={description} onChange={event=>setDescription(event.target.value)} placeholder="Descreva o serviço, bem, parceria, obrigação ou condições que o contrato deve registrar." maxLength={8000}/><small>{description.length}/8000</small></label>
          <div className="contractCreatorNotice"><b>Sem envio automático.</b><span>Criar o rascunho não pede assinatura, não publica, não cobra e não ativa blockchain. Você revisa antes dos próximos passos.</span></div>
          <footer><button className="secondary" onClick={close}>Cancelar</button><button className="primary" disabled={busy||!templateId||!partyA.trim()||!partyB.trim()||!description.trim()} onClick={()=>void create()}>{busy?'Criando…':'Criar rascunho na DocWallet'}</button></footer>
        </div>}
      </section>
    </div>}
  </>;
}
