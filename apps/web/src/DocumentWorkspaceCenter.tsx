import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {api,post} from './api';
import './document-workspace-center.css';

type Allowance={tier:'included'|'signatures_plus';included:number;used:number;remaining:number;limitReached:boolean;specialPlanRequired:boolean;periodStart:string;nextPeriodStart:string;policy:{perSignatureCharge:false;oneDocumentOneUsage:true;cancelledStillCounts:true;workspacesPlanInferred:false;billingActivated:false}};
type DocRef={id:string;external_ref:string;title:string;status:string;document_type?:string|null;signature_status?:string|null;contact_name?:string|null;metadata?:any;updated_at?:string};
type Usage={id:string;document_ref_id:string;business_operation_id?:string|null;external_signature_request_id:string;status:string;period_start:string;created_at:string;title:string};
type Center={documents:DocRef[];signatureUsage:Usage[];allowance:Allowance;capabilities:{contracts:boolean;templates:boolean;signatures:boolean;intelligence:boolean;docflow:boolean;validation:boolean;certificates:boolean};privacy:any;externalEffect:false};
type SignatureParty={id:string;name:string;email:string;status:string;signedAt?:string|null;url:string};
type Signature={id:string;title:string;status:string;contentHash:string;finalHash:string;totalParties:number;signedCount:number;pendingCount:number;progressPercent:number;parties:SignatureParty[]};

const pct=(n:number,d:number)=>d?Math.min(100,Math.round((n/d)*100)):0;
const date=(value?:string|null)=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short'}).format(new Date(value)):'—';

export default function DocumentWorkspaceCenter(){
  const[data,setData]=useState<Center|null>(null),[selected,setSelected]=useState<DocRef|null>(null),[signature,setSignature]=useState<Signature|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  const pending=useMemo(()=>data?.signatureUsage.filter(item=>item.status==='pending')||[],[data]);
  useEffect(()=>{void load()},[]);

  async function load(){setBusy(true);setError('');try{const next=await api<Center>('/v1/documents/docwallet-center');setData(next)}catch(e:any){setError(e?.message||'Não consegui carregar o centro documental.')}finally{setBusy(false)}}
  async function requestSignature(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!selected)return;const f=new FormData(e.currentTarget);const parties=[1,2,3,4].map(i=>({name:String(f.get(`name${i}`)||'').trim(),email:String(f.get(`email${i}`)||'').trim()})).filter(p=>p.name);if(!parties.length){setError('Informe pelo menos uma pessoa para assinar.');return}setBusy(true);setError('');try{const result=await post<{signature:Signature;allowance:Allowance}>(`/v1/documents/${selected.id}/signatures`,{parties});setSignature(result.signature);setNotice('Documento enviado para assinatura. Os links individuais foram preparados pela DocWallet.');await load()}catch(e:any){setError(e?.message||'Não foi possível solicitar assinatura.')}finally{setBusy(false)}}
  async function inspectSignature(id:string){setBusy(true);setError('');try{const result=await api<{signature:Signature}>(`/v1/documents/signatures/${id}`);setSignature(result.signature)}catch(e:any){setError(e?.message||'Não foi possível atualizar a assinatura.')}finally{setBusy(false)}}
  async function remind(party?:SignatureParty){if(!signature)return;setBusy(true);try{const result=await post<{url:string;message:string}>(`/v1/documents/signatures/${signature.id}/reminder`,{partyId:party?.id||null});if(result.url)await navigator.clipboard.writeText(`${location.origin.replace(/\/$/,'')}${result.url}`).catch(()=>undefined);setNotice(result.url?'Lembrete preparado e link copiado.':'Lembrete preparado.')}catch(e:any){setError(e?.message||'Não foi possível preparar o lembrete.')}finally{setBusy(false)}}

  const quota=data?.allowance;
  return <div className="dwWorkspace">
    <section className="dwWorkspaceHero"><div><p>DOCUMENTOS · DORA + DOCWALLET</p><h2>Documentos que trabalham junto com o seu negócio.</h2><span>Crie contratos, colete assinaturas, acompanhe prazos e transforme documentos em processos sem sair do NexOffice.</span></div>{quota&&<div className="dwQuota"><div><b>{quota.remaining}</b><span>assinaturas restantes</span></div><small>{quota.used} de {quota.included} usadas neste mês</small><div className="dwQuotaBar"><i style={{width:`${pct(quota.used,quota.included)}%`}}/></div>{quota.tier==='included'?<em>6 documentos/mês incluídos no NexOffice</em>:<em>Assinaturas+ ativo · {quota.included}/mês</em>}</div>}</section>

    <div className="dwFeatureGrid">
      <article><i>✎</i><b>Contratos & modelos</b><p>Escolha um modelo, vincule o cliente e crie o contrato com a DocWallet por baixo.</p><small>Use “Novo contrato” nesta tela.</small></article>
      <article><i>✓</i><b>Assinaturas</b><p>Envie para uma ou mais pessoas, acompanhe o progresso e prepare lembretes.</p><small>Sem cobrança avulsa até sua franquia.</small></article>
      <article><i>◈</i><b>Inteligência</b><p>Dora encontra partes, valores, obrigações, renovações, vencimentos e alertas.</p><small>O arquivo bruto continua na DocWallet.</small></article>
      <article><i>⚡</i><b>DocFlow</b><p>Receba, extraia, revise, aprove e arquive documentos como processos.</p><small>Motor DocFlow disponível por baixo da experiência.</small></article>
      <article><i>#</i><b>Validação & certificados</b><p>Hashes e evidências verificáveis continuam sob responsabilidade da DocWallet.</p><small>Sem expor infraestrutura técnica ao cliente.</small></article>
    </div>

    {quota?.limitReached&&<section className="dwPlus"><div><b>Você usou as {quota.included} assinaturas incluídas deste mês.</b><p>Assinaturas+ aumenta a franquia mensal. Não há cobrança automática nem tarifa por assinatura avulsa.</p></div><button onClick={()=>setNotice('Interesse em Assinaturas+ registrado apenas como intenção nesta versão. Nenhuma cobrança foi criada.')}>Quero mais assinaturas</button></section>}
    {error&&<div className="dwCenterError">{error}</div>}{notice&&<div className="dwCenterNotice">{notice}<button onClick={()=>setNotice('')}>×</button></div>}

    <section className="dwDocs"><div className="dwSectionHead"><div><p>MEUS DOCUMENTOS</p><h3>Contratos e documentos vinculados</h3></div><button onClick={()=>void load()} disabled={busy}>Atualizar</button></div>{data?.documents.length?<div className="dwDocGrid">{data.documents.map(doc=>{const use=pending.find(item=>item.document_ref_id===doc.id);return <article key={doc.id}><div><small>{doc.document_type||'documento'}{doc.contact_name?` · ${doc.contact_name}`:''}</small><b>{doc.title}</b><span>{doc.signature_status?`Assinatura: ${doc.signature_status}`:`Status: ${doc.status}`}</span></div><div className="dwDocActions">{use?<button onClick={()=>void inspectSignature(use.external_signature_request_id)}>Acompanhar assinatura</button>:<button disabled={Boolean(quota?.limitReached)} onClick={()=>{setSelected(doc);setSignature(null)}}>Enviar para assinatura</button>}</div></article>})}</div>:<div className="dwEmpty">Ainda não há documentos DocWallet vinculados. Use <b>Novo contrato</b> para começar.</div>}</section>

    {selected&&!signature&&<section className="dwSignatureComposer"><div className="dwSectionHead"><div><p>ASSINATURA</p><h3>{selected.title}</h3><span>Informe quem precisa assinar. Você pode adicionar até quatro pessoas aqui.</span></div><button className="secondary" onClick={()=>setSelected(null)}>Fechar</button></div><form onSubmit={requestSignature}>{[1,2,3,4].map((n,index)=><div className="dwParty" key={n}><label>Nome {index===0?'*':''}<input name={`name${n}`} required={index===0} placeholder={index===0?'Cliente / responsável':'Outra parte (opcional)'}/></label><label>E-mail<input name={`email${n}`} type="email" placeholder="email@empresa.com"/></label></div>)}<footer><small>1 documento enviado = 1 uso da franquia, independentemente da quantidade de pessoas. O conteúdo não passa pelo NexOffice.</small><button disabled={busy||Boolean(quota?.limitReached)}>{busy?'Preparando…':'Enviar para assinatura'}</button></footer></form></section>}

    {signature&&<section className="dwSignatureStatus"><div className="dwSectionHead"><div><p>ASSINATURA EM ANDAMENTO</p><h3>{signature.title}</h3><span>{signature.signedCount} de {signature.totalParties} concluída(s) · {signature.progressPercent}%</span></div><button onClick={()=>void inspectSignature(signature.id)} disabled={busy}>Atualizar</button></div><div className="dwProgress"><i style={{width:`${signature.progressPercent}%`}}/></div><div className="dwSignerList">{signature.parties.map(p=><article key={p.id}><div><b>{p.name}</b><span>{p.email||'Sem e-mail'} · {p.status==='signed'?`assinado ${date(p.signedAt)}`:'pendente'}</span></div>{p.status!=='signed'&&<button onClick={()=>void remind(p)}>Preparar lembrete</button>}</article>)}</div><small className="dwPrivacy">Evidências sensíveis, IP, CPF, desenho da assinatura e geolocalização permanecem na DocWallet. O NexOffice recebe apenas progresso, referências e hashes.</small></section>}
  </div>;
}
