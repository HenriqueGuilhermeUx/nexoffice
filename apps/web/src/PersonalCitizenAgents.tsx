import {useState,type FormEvent} from 'react';
import {brl,citizenGuide,debtNegotiationDraft,debtScenario,legalChecklist,parseMoney,type CitizenTask,type LegalTopic} from './PersonalCitizenHelpers';
import './nex-personal-citizen.css';

export type CitizenAgent='public_services'|'debt_review'|'legal_support';
const STATE_OPTIONS=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const EXTERNAL_LINKS={
 registrato:'https://www.bcb.gov.br/cidadaniafinanceira/registrato',
 serasa:'https://www.serasa.com.br/limpa-nome-online',
 anpd:'https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados'
};
function VerifiedLink({url,children}:{url:string;children:React.ReactNode}){
 return <a href={url} target="_blank" rel="noopener noreferrer" className="np-citizen-official-link">{children} <span aria-hidden="true">↗</span></a>;
}
async function copyDraft(text:string,setNotice:(s:string)=>void){
 try{await navigator.clipboard.writeText(text);setNotice('Texto copiado. Confira e escolha você mesmo o destinatário.');}
 catch{setNotice('Selecione e copie o texto manualmente.');}
}
export default function PersonalCitizenAgents({agent}:{agent:CitizenAgent}){
 const [city,setCity]=useState('');
 const [state,setState]=useState('SP');
 const [task,setTask]=useState<CitizenTask>('iptu');
 const [guide,setGuide]=useState<ReturnType<typeof citizenGuide>|null>(null);
 const [creditor,setCreditor]=useState('');
 const [claimed,setClaimed]=useState('');
 const [upfront,setUpfront]=useState('');
 const [installment,setInstallment]=useState('');
 const [count,setCount]=useState('0');
 const [monthlyBudget,setMonthlyBudget]=useState('');
 const [review,setReview]=useState<{totalMinor:bigint;differenceMinor:bigint;cheaperNominal:boolean;monthlyAffordable:boolean|null;caveat:string}|null>(null);
 const [draft,setDraft]=useState('');
 const [legalTopic,setLegalTopic]=useState<LegalTopic>('contracts');
 const [legalBody,setLegalBody]=useState('');
 const [legalResult,setLegalResult]=useState<ReturnType<typeof legalChecklist>|null>(null);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 function calculate(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');setNotice('');setDraft('');
  try{
   const initial=upfront.trim()?parseMoney(upfront):0n;
   const each=installment.trim()?parseMoney(installment):0n;
   const n=Number(count);
   if(!Number.isInteger(n)||n<0||n>120)throw new Error('Quantidade de parcelas inválida.');
   const monthly=monthlyBudget.trim()?parseMoney(monthlyBudget):undefined;
   const claimedMinor=parseMoney(claimed);
   const outcome=debtScenario({claimedMinor,upfrontMinor:initial,installments:n,installmentMinor:each,monthlyFreeMinor:monthly});
   setReview(outcome);
   if(creditor.trim())setDraft(debtNegotiationDraft(creditor,claimedMinor,outcome.totalMinor));
  }catch(e){setReview(null);setError(e instanceof Error?e.message:'Confira os valores.');}
 }
 return <div className="np-citizen-tool">
  <div className="np-citizen-privacy"><span aria-hidden="true">🔒</span><strong>Cálculo local e confidencial.</strong> O conteúdo desta ferramenta não é enviado para a API, a publicidade ou outros aplicativos. Não cole senhas, CPF ou informações de terceiros.</div>
  {agent==='public_services'&&<>
   <div className="np-citizen-lead"><span className="np-kicker">THEO · SERVIÇOS PÚBLICOS</span><h3>Encontre o caminho certo para resolver.</h3><p>IPTU, identidade, alvará e Detran. O Theo apresenta o roteiro inicial e encaminha para órgãos oficiais; nunca solicita documentos ou senhas governamentais.</p></div>
   <form className="np-citizen-form" onSubmit={e=>{e.preventDefault();setError('');setGuide(citizenGuide(task,city,state));}}>
    <label>O que deseja fazer?<select value={task} onChange={e=>{setTask(e.target.value as CitizenTask);setGuide(null);}}>
      <option value="iptu">Emitir 2ª via de IPTU</option><option value="identity">Agendar nova identidade (CIN)</option>
      <option value="construction">Solicitar alvará de construção</option><option value="vehicle">Serviços do Detran</option>
    </select></label>
    <label>Sua cidade (opcional)<input value={city} onChange={e=>{setCity(e.target.value.slice(0,70));setGuide(null);}} maxLength={70} placeholder="Ex.: Santos"/></label>
    <label>UF<select value={state} onChange={e=>{setState(e.target.value);setGuide(null);}}>{STATE_OPTIONS.map(uf=><option key={uf}>{uf}</option>)}</select></label>
    <button type="submit" className="np-primary">Ver orientação</button>
   </form>
   {guide&&<div className="np-citizen-result" role="status"><h3>{guide.title}</h3><ol>{guide.steps.map(step=><li key={step}>{step}</li>)}</ol>
     {guide.officialLinks.map(link=><VerifiedLink url={link.url} key={link.url}>{link.title}</VerifiedLink>)}
     <p className="np-citizen-warning">{guide.caution}</p>
   </div>}
   <p className="np-citizen-small">Municípios possuem sistemas e exigências diferentes. Não inventamos links municipais nem emitimos guias. Confira sempre o domínio oficial do órgão.</p>
  </>}
  {agent==='debt_review'&&<>
   <div className="np-citizen-lead"><span className="np-kicker">JOCA · DÍVIDAS E NEGOCIAÇÃO</span><h3>Compare antes de aceitar qualquer acordo.</h3><p>Analise o custo nominal e o impacto mensal de uma proposta informada por você. Nenhum dado do seu CPF é consultado, e não existe oferta Serasa integrada nesta fase.</p></div>
   <div className="np-citizen-links">
    <VerifiedLink url={EXTERNAL_LINKS.registrato}>Consultar dívidas financeiras no Banco Central</VerifiedLink>
    <VerifiedLink url={EXTERNAL_LINKS.serasa}>Ver ofertas no Serasa Limpa Nome</VerifiedLink>
   </div>
   <form className="np-citizen-form" onSubmit={calculate}>
    <label>Empresa credora (opcional para simular)<input value={creditor} maxLength={100} onChange={e=>setCreditor(e.target.value)} placeholder="Ex.: Banco de exemplo"/></label>
    <label>Valor da dívida cobrada (R$)<input value={claimed} onChange={e=>setClaimed(e.target.value)} placeholder="Ex.: 8.500,00" inputMode="decimal" required/></label>
    <label>Entrada do acordo (R$)<input value={upfront} onChange={e=>setUpfront(e.target.value)} placeholder="Ex.: 500,00 (ou deixe vazio)" inputMode="decimal"/></label>
    <label>Número de parcelas<input type="number" min="0" max="120" value={count} onChange={e=>setCount(e.target.value)}/></label>
    <label>Valor de cada parcela (R$)<input value={installment} onChange={e=>setInstallment(e.target.value)} placeholder="Ex.: 250,00" inputMode="decimal"/></label>
    <label>Quanto sobra no orçamento por mês (R$, opcional)<input value={monthlyBudget} onChange={e=>setMonthlyBudget(e.target.value)} placeholder="Ex.: 400,00" inputMode="decimal"/></label>
    <button className="np-primary" type="submit">Comparar proposta</button>
   </form>
   {review&&<div className="np-citizen-result" role="status">
    <h3>Custo nominal do acordo: {brl(review.totalMinor)}</h3>
    <p>{review.differenceMinor>=0n?'Diferença nominal frente à cobrança original: '+brl(review.differenceMinor):
      'A proposta custa '+brl(-review.differenceMinor)+' a mais que o valor originalmente informado.'}</p>
    {review.monthlyAffordable!==null&&<p>{review.monthlyAffordable?'A parcela cabe no valor mensal disponível que você informou.':'A parcela supera o valor mensal disponível que você informou.'} Isso não avalia suas despesas essenciais ou sua segurança financeira.</p>}
    <p className="np-citizen-warning">{review.caveat} Exija demonstrativo e documento formal antes de aceitar.</p>
   </div>}
   {draft&&<div className="np-citizen-draft"><div><strong>Mensagem para solicitar proposta formal</strong><button type="button" className="np-studio-secondary" onClick={()=>void copyDraft(draft,setNotice)}>Copiar</button></div>
    <textarea readOnly value={draft} rows={14} aria-label="Solicitação formal ao credor"/>
    <small>Nenhuma mensagem foi enviada. Confirme o credor em canal oficial; não efetue Pix a intermediários desconhecidos.</small>
   </div>}
   <p className="np-citizen-small">O relatório SCR do Registrato mostra dívidas bancárias declaradas ao BC, mas pode ter defasagem. A Serasa exibe somente acordos efetivamente oferecidos por parceiros. Nenhum desses serviços está conectado automaticamente à Nexa.</p>
  </>}
  {agent==='legal_support'&&<>
   <div className="np-citizen-lead"><span className="np-kicker">BELLA · ORIENTAÇÃO JURÍDICA INICIAL</span><h3>Entenda o assunto antes de tomar uma decisão.</h3><p>Revisão inicial de pontos de atenção em contratos, cobranças, condomínio e trabalho. A tecnologia jurídica do grupo poderá integrar esta experiência depois de uma revisão de segurança.</p></div>
   <form className="np-citizen-form" onSubmit={e=>{e.preventDefault();setError('');setLegalResult(legalChecklist(legalTopic,legalBody));}}>
    <label>Assunto<select value={legalTopic} onChange={e=>{setLegalTopic(e.target.value as LegalTopic);setLegalResult(null);}}>
     <option value="contracts">Contratos e cláusulas</option><option value="debt">Cobranças e renegociação</option>
     <option value="condo">Condomínio e assembleias</option><option value="labor">Questões trabalhistas</option>
    </select></label>
    <label className="np-citizen-wide">Trecho sem informações pessoais (opcional)<textarea value={legalBody} onChange={e=>{setLegalBody(e.target.value.slice(0,4000));setLegalResult(null);}} rows={5} maxLength={4000} placeholder="Cole apenas cláusulas não sensíveis. Nada é transmitido. Sem documento, a Bella apresenta um checklist geral."/></label>
    <button type="submit" className="np-primary">Ver pontos de atenção</button>
   </form>
   {legalResult&&<div className="np-citizen-result" role="status">
    <h3>{legalResult.reviewed?'Tópicos que merecem conferência':'Checklist inicial'}</h3>
    <p>{legalResult.reviewed?'Não identifiquei referência textual clara a estes temas. Isso não significa que estejam ausentes do documento completo.':'Para este assunto, procure documentos e orientações sobre:'}</p>
    <ul>{legalResult.missing.length?legalResult.missing.map(item=><li key={item}>{item}</li>):<li>O trecho menciona os termos principais pesquisados. Leia o conteúdo integral e confirme sua validade.</li>}</ul>
    <p className="np-citizen-warning">{legalResult.disclaimer}</p>
   </div>}
   <p className="np-citizen-small">A Bella não consulta processos, decide a validade de cláusulas, protocola petições ou substitui um advogado. O apoio avançado da plataforma jurídica dependerá de integração segura e de responsabilidade profissional.</p>
  </>}
  {error&&<p className="np-error" role="alert">{error}</p>}
  {notice&&<p className="np-studio-success" role="status">{notice}</p>}
 </div>;
}
