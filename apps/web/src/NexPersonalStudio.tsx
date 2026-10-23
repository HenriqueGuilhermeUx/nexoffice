import {useCallback,useEffect,useState,type FormEvent} from 'react';
import './nex-personal-studio.css';
import {parsePersonalStatement, type StatementRow} from './PersonalStatementParser';

type Section='money'|'spending'|'planning'|'wealth'|'maya';
type ManualAccount={id:string;name:string;institution_name:string;available_minor:string|null;balance_as_of:string|null};
type RecordTx={id:string;description:string;amount_minor:string;booked_at:string;category:string|null;source:string;account_id:string;analysis_role?:'expense'|'income'|'excluded_internal'|'review'|null;analysis_confidence?:string|null;category_origin?:string|null;analysis_rule?:string|null};
type Budget={id:string;category:string;limit_minor:string;spent_minor:string;month:string};
type Goal={id:string;name:string;target_minor:string;saved_minor:string;due_on:string|null;status:string};
type Wealth={id:string;name:string;kind:'asset'|'liability';category:string;amount_minor:string};
type Bill={id:string;name:string;amount_minor:string;next_due_on:string;interval_months:number};
type Insight={kind:string;title:string;detail:string;source:string};
type Studio={
 accounts:ManualAccount[];transactions:RecordTx[];budgets:Budget[];
 goals:Goal[];wealth:Wealth[];bills:Bill[];
 spentByCategory:Array<{category:string;spent_minor:string}>;
 totals:{manualAvailableMinor:string;spentMonthMinor:string;declaredAssetsMinor:string;declaredLiabilitiesMinor:string;declaredNetWorthMinor:string;upcomingBillsMinor:string};
 maya:{mode:string;externalModelCalled:boolean;insights:Insight[]};
 provenance:{accounts:string;expenses:string;verifiedBanking:boolean;note:string};
};
const API=(import.meta as any).env?.VITE_PERSONAL_SINGLE_ORIGIN==='true' ? '' : ((import.meta as any).env?.VITE_API_URL||'http://localhost:4000');
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
function formatMinor(v:string|null|undefined){
 if(v==null)return '—';
 try{const minor=BigInt(v),s=minor<0n?'-':'',abs=minor<0n?-minor:minor;
 return s+'R$ '+(abs/100n).toLocaleString('pt-BR')+','+String(abs%100n).padStart(2,'0');
 }catch{return '—';}
}
function parseAmount(value:string){
 const raw=value.trim().replace(/R\$/gi,'').replace(/\s/g,'');
 if(!raw)throw new Error('Informe um valor.');
 let s=raw;
 if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
 else if(!/^-?\d+(\.\d{1,2})?$/.test(s))throw new Error('Valor inválido.');
 if(!/^-?\d{1,11}(\.\d{1,2})?$/.test(s))throw new Error('Use valores no formato 123,45.');
 const neg=s.startsWith('-');if(neg)s=s.slice(1);
 const [whole,decimal='']=s.split('.');
 return (neg?'-':'')+String(BigInt(whole)*100n+BigInt((decimal+'00').slice(0,2)));
}
function signedAmount(value:string,direction:string){
 const n=BigInt(parseAmount(value)),absolute=n<0n?-n:n;
 if(absolute===0n)throw new Error('O valor da movimentação precisa ser diferente de zero.');
 return String(direction==='expense'?-absolute:absolute);
}
async function request<T>(path:string,token:string,method='GET',data?:unknown):Promise<T>{
 let response:Response;
 try{response=await fetch(API+path,{method,headers:{authorization:'Bearer '+token,...(data!==undefined?{'content-type':'application/json'}:{})},
  ...(data!==undefined?{body:JSON.stringify(data)}:{})});}
 catch{throw new Error('Não foi possível conectar ao Nex Personal. Tente recarregar a página.');}
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(body.message||body.error||'Não foi possível concluir esta ação.');
 return body as T;
}
function field(data:FormData,key:string){return String(data.get(key)||'').trim();}
function Card({title,children}:{title:string;children:React.ReactNode}){return <section className="np-panel np-studio-card"><h2>{title}</h2>{children}</section>;}

export default function NexPersonalStudio({view,token,onChanged}:{view:Section;token:string;onChanged:()=>void}){
 const [data,setData]=useState<Studio|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [selectedAccount,setSelectedAccount]=useState('');
 const [csv,setCsv]=useState<StatementRow[]>([]);
 const [csvName,setCsvName]=useState('');
 const [mayaQuestion,setMayaQuestion]=useState('');
 const [mayaAnswer,setMayaAnswer]=useState('');
 const load=useCallback(async()=>{const next=await request<Studio>('/v1/personal/studio',token);setData(next);setError('');},[token]);
 useEffect(()=>{setLoading(true);void load().catch(e=>setError(e instanceof Error?e.message:'Erro ao carregar.')).finally(()=>setLoading(false));},[load]);
 const accountId=selectedAccount||data?.accounts[0]?.id||'';
 async function action(path:string,method:string,payload?:unknown,success='Informações salvas.'){
  setBusy(true);setError('');setNotice('');
  try{await request(path,token,method,payload);await load();onChanged();setNotice(success);}
  catch(e){setError(e instanceof Error?e.message:'Erro ao salvar.');}
  finally{setBusy(false);}
 }
 function submit(event:FormEvent<HTMLFormElement>,create:(f:FormData)=>{path:string;method:string;payload:unknown;success?:string}){
  event.preventDefault();setError('');const form=event.currentTarget;
  try{const info=create(new FormData(form));void action(info.path,info.method,info.payload,info.success).then(()=>{});}
  catch(e){setError(e instanceof Error?e.message:'Confira os valores informados.');}
 }
 async function readFile(file:File|undefined){
  setCsv([]);setNotice('');setError('');
  if(!file)return;
  if(file.size>350000){setError('O CSV excede 350 KB. Separe em arquivos menores.');return;}
  try{const bytes=new Uint8Array(await file.arrayBuffer());
   const utf=new TextDecoder('utf-8').decode(bytes);
   const content=utf.includes('\uFFFD')?new TextDecoder('windows-1252').decode(bytes):utf;
   setCsv(parsePersonalStatement(content,file.name));setCsvName(file.name);}
  catch(e){setError(e instanceof Error?e.message:'CSV inválido.');}
 }
 async function askMaya(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!mayaQuestion.trim())return;setBusy(true);setError('');
  try{const result=await request<{answer:string}>('/v1/personal/maya/ask',token,'POST',{question:mayaQuestion});setMayaAnswer(result.answer);}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível responder.');}
  finally{setBusy(false);}
 }
 async function importCsv(){
  if(!accountId||!csv.length)return;
  setBusy(true);setError('');setNotice('');
  try{
   const result=await request<{imported:number;duplicates:number}>('/v1/personal/transactions/import',token,'POST',{accountId,rows:csv});
   setCsv([]);setCsvName('');await load();onChanged();
   setNotice(String(result.imported)+' transações importadas; '+String(result.duplicates)+' duplicadas ignoradas. Seu saldo informado não foi alterado.');
  }catch(e){setError(e instanceof Error?e.message:'Importação não concluída.');}
  finally{setBusy(false);}
 }
 if(loading)return <section className="np-panel">Preparando suas finanças pessoais…</section>;
 if(!data)return <section className="np-panel"><p>{error||'Dados ainda não disponíveis.'}</p><button className="np-primary" onClick={()=>{setLoading(true);void load().catch(e=>setError(e instanceof Error?e.message:'Falha de conexão.')).finally(()=>setLoading(false));}}>Tentar novamente</button></section>;
 const common=<>{error&&<p className="np-error" role="alert">{error}</p>}{notice&&<p className="np-studio-success" role="status">{notice}</p>}</>;
 return <div className="np-studio">
 {common}
 {view==='money'&&<>
  <Card title="Contas que você informa">
   <p>Comece sem conectar bancos. Os saldos abaixo são declarações suas, não são certificados pelas instituições.</p>
   {data.accounts.map(a=><div className="np-line" key={a.id}><span><strong>{a.name}</strong><small>{a.institution_name} · Informada por você</small></span><strong>{formatMinor(a.available_minor)}</strong></div>)}
   <form className="np-studio-form" onSubmit={e=>submit(e,f=>({path:'/v1/personal/manual-accounts',method:'POST',payload:{
    name:field(f,'name'),institutionName:field(f,'institutionName')||undefined,balanceMinor:parseAmount(field(f,'balance'))
   },success:'Conta adicionada. Saldo identificado como informado por você.'}))}>
    <label>Nome da conta<input name="name" required maxLength={120} placeholder="Ex.: Conta do dia a dia"/></label>
    <label>Instituição (opcional)<input name="institutionName" maxLength={120} placeholder="Ex.: Banco Azul"/></label>
    <label>Saldo atual informado (R$)<input name="balance" required inputMode="decimal" placeholder="Ex.: 1.250,00"/></label>
    <button className="np-primary" disabled={busy}>Adicionar conta manual</button>
   </form>
   {data.accounts.length>0&&<form className="np-studio-form" onSubmit={e=>submit(e,f=>({path:'/v1/personal/manual-accounts/'+field(f,'id')+'/balance',method:'PUT',payload:{balanceMinor:parseAmount(field(f,'balance'))},success:'Saldo manual atualizado.'}))}>
    <label>Corrigir saldo atual<select name="id" required>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <label>Novo saldo (R$)<input name="balance" required inputMode="decimal"/></label>
    <button disabled={busy} className="np-studio-secondary">Atualizar saldo declarado</button>
   </form>}
  </Card>
  {data.accounts.length>0&&<Card title="Lançar movimentação">
   <p>Registre uma receita ou despesa. O saldo declarado só será ajustado se você marcar a opção.</p>
   <form className="np-studio-form" onSubmit={e=>submit(e,f=>({path:'/v1/personal/transactions/manual',method:'POST',payload:{
    accountId:field(f,'accountId'),bookedOn:field(f,'bookedOn'),description:field(f,'description'),
    category:field(f,'category')||undefined,amountMinor:signedAmount(field(f,'amount'),field(f,'direction')),
    applyToBalance:f.get('applyToBalance')==='on'
   },success:'Movimentação registrada.'}))}>
    <label>Conta<select name="accountId" required>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <label>Tipo<select name="direction"><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
    <label>Data<input type="date" name="bookedOn" defaultValue={today()} required/></label>
    <label>Descrição<input name="description" required placeholder="Ex.: Almoço"/></label>
    <label>Valor (R$)<input name="amount" required inputMode="decimal" placeholder="42,50"/></label>
    <label>Categoria (opcional)<input name="category" placeholder="Alimentação"/></label>
    <label className="np-studio-check"><input type="checkbox" name="applyToBalance"/> Ajustar também o saldo manual da conta</label>
    <button className="np-primary" disabled={busy}>Salvar movimentação</button>
   </form>
  </Card>}
  {data.accounts.length>0&&<Card title="Importar extrato CSV ou OFX">
   <p>Importe CSV (<strong>data;descricao;valor</strong>, com despesas negativas) ou OFX. Confira a prévia; sua posição de saldo informado não será alterada.</p>
   <div className="np-studio-form">
    <label>Conta de destino<select value={accountId} onChange={e=>{setSelectedAccount(e.target.value);setCsv([]);}}>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <label>Arquivo CSV<input type="file" accept=".csv,.ofx,text/csv,application/x-ofx" onChange={e=>void readFile(e.currentTarget.files?.[0])}/></label>
   </div>
   {csv.length>0&&<div className="np-studio-preview"><strong>Prévia: {csvName} — {csv.length} movimentos</strong>
    {csv.slice(0,5).map((r,i)=><div className="np-line" key={i}><span>{r.date} · {r.description}</span><strong>{formatMinor(r.amountMinor)}</strong></div>)}
    <p>{csv.length>5?'Exibindo as primeiras cinco linhas. ':''}Duplicatas são identificadas por data, valor, descrição e referência bancária quando disponível. Lançamentos idênticos sem identificador podem ser confundidos.</p>
    <button className="np-primary" onClick={()=>void importCsv()} disabled={busy}>Confirmar importação</button>
   </div>}
  </Card>}
  <Card title="Categorizar lançamentos">
   <p>Você pode corrigir uma categoria calculada automaticamente após importar seu extrato.</p>
   {data.transactions.length>0&&<form className="np-studio-form" onSubmit={e=>submit(e,f=>({path:'/v1/personal/transactions/'+field(f,'transactionId')+'/category',method:'PATCH',payload:{category:field(f,'category')},success:'Categoria atualizada.'}))}>
    <label>Movimentação<select name="transactionId" required>{data.transactions.slice(0,100).map(t=><option key={t.id} value={t.id}>{t.description.slice(0,35)} · {formatMinor(t.amount_minor)}</option>)}</select></label>
    <label>Nova categoria<input name="category" placeholder="Alimentação" required/></label>
    <button className="np-studio-secondary" disabled={busy}>Salvar categoria</button>
   </form>}
  </Card>
  {data.transactions.some(t=>t.analysis_role==='review')&&<Card title="Movimentações para confirmar">
    <p>Pix, transferências e aplicações podem parecer despesas ou receitas. Revise a finalidade antes que entrem nos totais. Só marque como transferência própria se as contas forem suas.</p>
    <form className="np-studio-form" onSubmit={e=>submit(e,f=>({
      path:'/v1/personal/transactions/'+field(f,'transactionId')+'/classification',
      method:'PATCH',payload:{treatment:field(f,'treatment'),
        confirmOwnTransfer:field(f,'treatment')==='excluded_internal'?f.get('confirmOwnTransfer')==='on':undefined},
      success:'Classificação confirmada. Os totais serão recalculados.'
    }))}>
      <label>Movimentação<select name="transactionId" required>{data.transactions.filter(t=>t.analysis_role==='review').map(t=><option key={t.id} value={t.id}>{t.description.slice(0,55)} · {formatMinor(t.amount_minor)}</option>)}</select></label>
      <label>O que é?<select name="treatment" required defaultValue="review"><option value="review">Manter em análise</option><option value="expense">Despesa real</option><option value="income">Receita real (apenas entradas)</option><option value="excluded_internal">Transferência entre minhas próprias contas</option></select></label>
      <label className="np-studio-check"><input type="checkbox" name="confirmOwnTransfer"/> Confirmo que as contas envolvidas são minhas, se classificar como transferência própria</label>
      <button className="np-studio-secondary" disabled={busy}>Confirmar classificação</button>
    </form>
   </Card>}
   <Card title="Histórico organizado">
   {data.transactions.length===0?<p>Ainda não há movimentações registradas.</p>:data.transactions.slice(0,25).map(t=><div className="np-line" key={t.id}>
    <span><strong>{t.description}</strong><small>{String(t.booked_at).slice(0,10)} · {t.category||'Sem categoria'} · {t.source==='csv'?'CSV':t.source==='manual'?'Manual':'Provedor'} · {t.analysis_role==='review'?'Precisa revisão':t.analysis_role==='excluded_internal'?'Transferência própria':t.category_origin==='user'?'Revisado por você':t.analysis_role?'Categoria sugerida':'Classificação anterior'}</small></span><strong>{formatMinor(t.amount_minor)}</strong>
   </div>)}
  </Card>
 </>}
 {view==='spending'&&<>
   <Card title="Classificação inteligente de transações">
    <p>O motor já sugere categorias para movimentações manuais e extratos CSV/OFX. Pix, transferências e aplicações sem confirmação ficam separados dos gastos até você revisar.</p>
    <div className="np-studio-summary">
      <div>Para revisar<strong>{data.transactions.filter(t=>t.analysis_role==='review').length}</strong><small>Movimentações recentes com finalidade incerta</small></div>
      <div>Com classificação<strong>{data.transactions.filter(t=>['expense','income','excluded_internal'].includes(t.analysis_role||'')).length}</strong><small>Regras automáticas ou decisão do cliente</small></div>
    </div>
    <p>Open Finance e blockchain: adaptadores de prévia preparados, mas <strong>sem banco ou carteira conectados</strong> nesta homologação. Quantidades cripto não são convertidas ficticiamente para reais.</p>
   </Card>
  <div className="np-studio-summary"><div>Gastos registrados no mês<strong>{formatMinor(data.totals.spentMonthMinor)}</strong><small>Parcial: depende do que foi importado ou digitado</small></div></div>
  <Card title="Gastos por categoria">
   {data.spentByCategory.length===0?<p>Adicione movimentações para acompanhar seus gastos.</p>:data.spentByCategory.map(t=><div className="np-line" key={t.category}><span>{t.category}</span><strong>{formatMinor(t.spent_minor)}</strong></div>)}
  </Card>
  <Card title="Orçamentos do mês">
   <form className="np-studio-form" onSubmit={e=>submit(e,f=>({path:'/v1/personal/budgets',method:'POST',payload:{
    month:field(f,'month'),category:field(f,'category'),limitMinor:parseAmount(field(f,'limit'))
   },success:'Orçamento pessoal salvo.'}))}>
    <label>Mês<input name="month" type="month" defaultValue={today().slice(0,7)} required/></label>
    <label>Categoria<input name="category" placeholder="Alimentação" required/></label>
    <label>Limite de gastos (R$)<input name="limit" inputMode="decimal" placeholder="800,00" required/></label>
    <button className="np-primary" disabled={busy}>Definir orçamento</button>
   </form>
   {data.budgets.map(b=>{const use=Math.min(100,Math.round(Number(b.spent_minor)/Number(b.limit_minor)*100));return <div className="np-studio-budget" key={b.id}>
     <div className="np-line"><strong>{b.category}</strong><span>{formatMinor(b.spent_minor)} / {formatMinor(b.limit_minor)}</span></div>
     <div className="np-studio-track"><div style={{width:String(use)+'%'}}/></div>
     {BigInt(b.spent_minor)>BigInt(b.limit_minor)&&<small>Limite informado ultrapassado</small>}
    </div>})}
  </Card>
 </>}
 {view==='planning'&&<>
  <Card title="Metas pessoais">
   <p>O valor reservado para uma meta é informativo e não é somado ao patrimônio para evitar duplicidade.</p>
   <form className="np-studio-form" onSubmit={e=>submit(e,f=>({path:'/v1/personal/goals',method:'POST',payload:{
    name:field(f,'name'),targetMinor:parseAmount(field(f,'target')),savedMinor:parseAmount(field(f,'saved')||'0'),
    dueOn:field(f,'due')||null
   }}))}>
    <label>Meta<input name="name" required placeholder="Reserva de emergência"/></label>
    <label>Quanto precisa (R$)<input name="target" required inputMode="decimal"/></label>
    <label>Já reservado (R$)<input name="saved" inputMode="decimal" defaultValue="0"/></label>
    <label>Prazo (opcional)<input name="due" type="date"/></label>
    <button className="np-primary" disabled={busy}>Criar meta</button>
   </form>
   {data.goals.map(g=><div className="np-studio-goal" key={g.id}><div className="np-line"><span><strong>{g.name}</strong><small>{g.status==='completed'?'Concluída':g.due_on?'Até '+String(g.due_on).slice(0,10):'Sem prazo'}</small></span><span>{formatMinor(g.saved_minor)} / {formatMinor(g.target_minor)}</span></div>
     <form className="np-studio-inline" onSubmit={e=>submit(e,f=>({path:'/v1/personal/goals/'+g.id+'/progress',method:'PUT',payload:{savedMinor:parseAmount(field(f,'saved'))}}))}>
       <label>Atualizar valor reservado (R$)<input name="saved" inputMode="decimal" defaultValue={formatMinor(g.saved_minor).replace('R$ ','')} required/></label>
       <button className="np-studio-secondary" disabled={busy}>Atualizar</button>
     </form></div>)}
  </Card>
  <Card title="Contas e assinaturas a vencer">
   <p>Estes são lembretes. O Nex Personal não debita contas nem autoriza Pix automaticamente.</p>
   <form className="np-studio-form" onSubmit={e=>submit(e,f=>({path:'/v1/personal/bills',method:'POST',payload:{
    name:field(f,'name'),amountMinor:parseAmount(field(f,'amount')),
    nextDueOn:field(f,'due'),intervalMonths:Number(field(f,'interval'))
   }}))}>
    <label>Conta ou assinatura<input name="name" required placeholder="Internet"/></label>
    <label>Valor previsto (R$)<input name="amount" required inputMode="decimal"/></label>
    <label>Próximo vencimento<input name="due" type="date" defaultValue={today()} required/></label>
    <label>Recorrência<select name="interval"><option value="1">Mensal</option><option value="3">Trimestral</option><option value="12">Anual</option><option value="0">Única</option></select></label>
    <button className="np-primary" disabled={busy}>Adicionar lembrete</button>
   </form>
   {data.bills.map(b=><div className="np-line" key={b.id}><span><strong>{b.name}</strong><small>Vence em {String(b.next_due_on).slice(0,10)}</small></span><span><strong>{formatMinor(b.amount_minor)}</strong>
    <button className="np-studio-secondary" disabled={busy} onClick={()=>void action('/v1/personal/bills/'+b.id+'/complete','POST',{},'Lembrete atualizado (nenhum pagamento foi feito).')}>Marcar lembrado/pago</button></span></div>)}
  </Card>
 </>}
 {view==='wealth'&&<>
  <div className="np-studio-summary"><div>Patrimônio líquido declarado<strong>{formatMinor(data.totals.declaredNetWorthMinor)}</strong><small>Contas manuais + bens − dívidas declaradas; visão parcial</small></div></div>
  <Card title="Bens, investimentos e dívidas declarados">
   <p>Cadastre apenas valores que você mesmo conhece. Contas bancárias manuais já entram no total, portanto não duplique aqui.</p>
   <form className="np-studio-form" onSubmit={e=>submit(e,f=>({path:'/v1/personal/wealth',method:'POST',payload:{
    name:field(f,'name'),kind:field(f,'kind'),category:field(f,'category'),amountMinor:parseAmount(field(f,'amount')),currency:'BRL'
   }}))}>
    <label>Descrição<input name="name" required placeholder="Veículo, imóvel ou dívida"/></label>
    <label>Natureza<select name="kind"><option value="asset">Bem / investimento</option><option value="liability">Dívida / obrigação</option></select></label>
    <label>Categoria<input name="category" required placeholder="Imóvel, veículo, empréstimo"/></label>
    <label>Valor estimado (R$)<input name="amount" required inputMode="decimal"/></label>
    <button className="np-primary" disabled={busy}>Salvar item declarado</button>
   </form>
   {data.wealth.map(w=><div className="np-line" key={w.id}><span><strong>{w.name}</strong><small>{w.kind==='liability'?'Passivo':'Ativo'} · {w.category}</small></span><span><strong>{w.kind==='liability'?'-':''}{formatMinor(w.amount_minor)}</strong>
    <button className="np-studio-link" disabled={busy} onClick={()=>{if(window.confirm('Excluir este item do patrimônio?'))void action('/v1/personal/wealth/'+w.id,'DELETE',undefined,'Item excluído.');}}>Excluir</button></span></div>)}
  </Card>
 </>}
 {view==='maya'&&<Card title="Maya · inteligência financeira pessoal">
  <p>Primeira versão baseada em regras e cálculos auditáveis, sem chamada a modelo externo. Usa apenas os lançamentos, saldos e metas que você registrar.</p>
  <form className="np-studio-maya-form" onSubmit={e=>void askMaya(e)}>
   <label htmlFor="np-maya-question">Pergunte à Maya</label>
   <input id="np-maya-question" value={mayaQuestion} onChange={e=>setMayaQuestion(e.target.value)}
    placeholder="Quanto gastei neste mês?" maxLength={400} minLength={3} required/>
   <button className="np-primary" disabled={busy}>Perguntar</button>
  </form>
  {mayaAnswer&&<div className="np-studio-maya-answer"><strong>Maya respondeu</strong><p>{mayaAnswer}</p><small>Resposta informativa, limitada aos seus registros. Sem IA externa.</small></div>}
  {data.maya.insights.map((i,index)=><div className="np-studio-insight" key={index}><div className="np-studio-orb">M</div><div><strong>{i.title}</strong><p>{i.detail.replace(/(-?\d+) centavos/g,(_full,minor:string)=>formatMinor(minor))}</p><small>Fonte: {i.source}</small></div></div>)}
  <div className="np-studio-summary"><div>Contas a vencer (30 dias)<strong>{formatMinor(data.totals.upcomingBillsMinor)}</strong><small>Conforme seus lembretes</small></div><div>Gastos do mês<strong>{formatMinor(data.totals.spentMonthMinor)}</strong><small>Apenas movimentações conhecidas</small></div></div>
  <p className="np-studio-foot">A Maya não realiza pagamentos, não inventa rendimentos e não vende seus dados. Não é aconselhamento financeiro individualizado.</p>
 </Card>}
 </div>;
}
