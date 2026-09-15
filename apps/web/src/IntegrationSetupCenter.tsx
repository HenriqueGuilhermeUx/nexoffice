import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {api,post,put,session} from './api';
import './integration-setup-center.css';

type Capability={provider:string;label:string;capabilities:string[];baseUrlConfigured:boolean;credentialConfigured:boolean;state?:{status:string;last_health_status?:string;last_error?:string}|null};
type SmartBots={status:string;botId?:string|null;external_account_ref?:string|null};
type TaxAgent={status:string;companyId?:string|null;external_account_ref?:string|null;environment?:'test'|'production';secretConfigured?:boolean};

const copy:Record<string,{purpose:string;scope:string}>={
  docwallet:{purpose:'Documentos, OCR, inteligência e assinatura',scope:'Autorização explícita por workspace; arquivos brutos continuam no DocWallet.'},
  staff:{purpose:'Conversa, voz e contexto empresarial',scope:'Runtime compartilhado; somente contexto empresarial do workspace.'},
  smartbots:{purpose:'WhatsApp, atendimento e follow-up',scope:'Bot vinculado por workspace; outbound exige aprovação humana comprovada.'},
  nextgen:{purpose:'Cobrança Pix e reconciliação',scope:'Runtime compartilhado; cobrança continua approval-first e idempotente.'},
  modo:{purpose:'Growth, campanhas e conteúdo',scope:'Bridge planning-only; não publica nem altera orçamento.'},
  taxagent:{purpose:'NFS-e e motor fiscal',scope:'Company por workspace + secret_ref; emissão continua approval-first.'}
};

export default function IntegrationSetupCenter(){
  const [active,setActive]=useState(false);const [catalog,setCatalog]=useState<Capability[]>([]);const [smartbots,setSmartbots]=useState<SmartBots|null>(null);const [taxagent,setTaxAgent]=useState<TaxAgent|null>(null);
  const [botId,setBotId]=useState('');const [companyId,setCompanyId]=useState('');const [environment,setEnvironment]=useState<'test'|'production'>('test');const [secretRef,setSecretRef]=useState('');
  const [connectUrl,setConnectUrl]=useState('');const [busy,setBusy]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);const authenticated=Boolean(session.token()&&session.workspace());
  useEffect(()=>{const timer=setInterval(()=>{setSessionKey(`${session.token()}|${session.workspace()}`);const selected=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');setActive(Boolean(selected?.textContent?.includes('Integrações')))},500);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!authenticated||!active)return;void load()},[sessionKey,active]);
  async function load(){setError('');try{const [caps,sb,ta]=await Promise.all([api<Capability[]>('/v1/integrations/catalog'),api<SmartBots>('/v1/integrations/smartbots'),api<TaxAgent>('/v1/integrations/taxagent')]);setCatalog(caps);setSmartbots(sb);setTaxAgent(ta);setBotId(String(sb?.botId||sb?.external_account_ref||''));setCompanyId(String(ta?.companyId||ta?.external_account_ref||''));setEnvironment(ta?.environment||'test')}catch(e:any){setError(e?.message||'Não foi possível carregar as integrações.')}}
  const ready=useMemo(()=>catalog.filter(item=>item.baseUrlConfigured&&item.credentialConfigured).length,[catalog]);

  async function probe(provider:string){setBusy(provider);setError('');setNotice('');try{const result=await post<any>(`/v1/integrations/${provider}/probe`,{});setNotice(result.ok?`${provider}: conexão validada.`:`${provider}: ${result.error||result.status||'conexão ainda não disponível'}.`);await load()}catch(e:any){setError(e?.message||`Falha ao testar ${provider}.`)}finally{setBusy('')}}
  async function connectDocWallet(){setBusy('docwallet-connect');setError('');setNotice('');try{const result=await post<any>('/v1/integrations/docwallet/connect-token',{});setConnectUrl(result.connectUrl);setNotice('Autorização curta criada. Abra o DocWallet para concluir o vínculo deste workspace.')}catch(e:any){setError(e?.message||'Não foi possível iniciar o vínculo com DocWallet.')}finally{setBusy('')}}
  async function saveSmartBots(e:FormEvent){e.preventDefault();if(!botId.trim())return;setBusy('smartbots-save');setError('');try{await put('/v1/integrations/smartbots',{botId:botId.trim()});setNotice('SmartBots vinculado a este workspace.');await load()}catch(err:any){setError(err?.message||'Não foi possível vincular o SmartBots.')}finally{setBusy('')}}
  async function saveTaxAgent(e:FormEvent){e.preventDefault();if(!companyId.trim()||!secretRef.trim())return;setBusy('taxagent-save');setError('');try{await put('/v1/integrations/taxagent',{companyId:companyId.trim(),environment,secretRef:secretRef.trim()});setSecretRef('');setNotice('TaxAgent configurado. O NexOffice guardou apenas a referência do secret server-side.');await load()}catch(err:any){setError(err?.message||'Não foi possível configurar o TaxAgent.')}finally{setBusy('')}}
  if(!authenticated||!active)return null;

  return <aside className="integrationSetupCenter" aria-label="Configuração de integrações NexOffice">
    <div className="iscHead"><div><p>AV INTEGRATION HUB</p><h3>Configuração guiada</h3><small>{ready}/{catalog.length||6} capabilities com runtime preparado</small></div><button onClick={()=>void load()}>↻</button></div>
    <div className="iscGuard">Secrets ficam no servidor. O navegador recebe apenas status, referências seguras e fluxos explícitos de autorização.</div>
    {error&&<div className="iscError">{error}</div>}{notice&&<div className="iscNotice">{notice}</div>}
    <div className="iscList">{catalog.map(item=>{const info=copy[item.provider]||{purpose:item.capabilities.join(' · '),scope:'Integração por workspace.'};const runtime=item.baseUrlConfigured&&item.credentialConfigured;return <article key={item.provider}>
      <div className="iscRow"><div><b>{item.label}</b><small>{info.purpose}</small></div><span className={runtime?'ready':'pending'}>{item.state?.status|| (runtime?'runtime pronto':'runtime pendente')}</span></div>
      <p>{info.scope}</p><div className="iscMeta"><span>URL {item.baseUrlConfigured?'✓':'—'}</span><span>credencial runtime {item.credentialConfigured?'✓':'—'}</span></div>
      {item.provider==='docwallet'&&<div className="iscActions"><button onClick={()=>void connectDocWallet()} disabled={!runtime||Boolean(busy)}>{busy==='docwallet-connect'?'Gerando…':'Autorizar DocWallet'}</button>{connectUrl&&<a href={connectUrl} target="_blank" rel="noreferrer">Abrir autorização ↗</a>}</div>}
      {item.provider==='smartbots'&&<form className="iscForm" onSubmit={saveSmartBots}><label>Bot deste workspace</label><div><input value={botId} onChange={e=>setBotId(e.target.value)} placeholder="botId"/><button disabled={!runtime||busy==='smartbots-save'}>{busy==='smartbots-save'?'Salvando…':'Vincular'}</button></div></form>}
      {item.provider==='taxagent'&&<form className="iscFiscal" onSubmit={saveTaxAgent}><input value={companyId} onChange={e=>setCompanyId(e.target.value)} placeholder="Company ID"/><select value={environment} onChange={e=>setEnvironment(e.target.value as 'test'|'production')}><option value="test">test</option><option value="production">production</option></select><input value={secretRef} onChange={e=>setSecretRef(e.target.value)} placeholder="NOME_DA_VARIAVEL_DO_SECRET"/><button disabled={!runtime||busy==='taxagent-save'}>{busy==='taxagent-save'?'Salvando…':'Configurar'}</button><small>Informe o nome da variável server-side, nunca a chave fiscal.</small></form>}
      {!['docwallet','smartbots','taxagent'].includes(item.provider)&&<div className="iscActions"><button onClick={()=>void probe(item.provider)} disabled={!item.baseUrlConfigured||Boolean(busy)}>{busy===item.provider?'Testando…':'Testar conexão'}</button><small>Configuração operacional gerenciada no runtime.</small></div>}
      {item.state?.last_error&&<div className="iscInlineError">{item.state.last_error}</div>}
    </article>})}</div>
    <div className="iscFoot"><span>WhatsApp · approval-first</span><span>Pix · approval-first</span><span>Fiscal · approval-first</span></div>
  </aside>;
}
