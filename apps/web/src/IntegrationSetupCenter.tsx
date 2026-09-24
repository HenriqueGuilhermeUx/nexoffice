import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {api,post,put,session} from './api';
import './integration-setup-center.css';

type Capability={provider:string;label:string;capabilities:string[];baseUrlConfigured:boolean;credentialConfigured:boolean;state?:{status:string;last_health_status?:string;last_error?:string}|null};
type SmartBots={
  status:string;provisioned?:boolean;subscriberEligible?:boolean;botStatus?:string|null;billingStatus?:string|null;trialEndsAt?:string|null;
  subscription?:{status:string;plan:string;amountCents:number;currentPeriodEnd?:string|null}|null;
  whatsapp?:{connected:boolean;phone?:string|null;autoReply?:boolean;messageWebhookActive?:boolean};
  entitlement?:{status:string;validFrom?:string|null;validUntil?:string|null}|null;
  offer?:{partnerAmountCents:number;regularAmountCents:number;trialDays:number};
  health?:{lastHealthAt?:string|null;lastHealthStatus?:string|null;lastError?:string|null};
};
type TaxAgent={status:string;companyId?:string|null;external_account_ref?:string|null;environment?:'test'|'production';secretConfigured?:boolean};

const copy:Record<string,{purpose:string;scope:string}>={
  docwallet:{purpose:'Document Intelligence, assinatura e confiança digital',scope:'Autorização explícita por workspace; arquivos brutos continuam no DocWallet.'},
  staff:{purpose:'Conversa empresarial e interpretação de contexto',scope:'Somente snapshot empresarial autorizado; memória pessoal do Staff não entra no NexOffice.'},
  smartbots:{purpose:'Atendimento inteligente no site e WhatsApp',scope:'Mesmo Brain da empresa para atendimento, qualificação e oportunidades. O NexOffice mantém governança sobre ações iniciadas aqui.'},
  nextgen:{purpose:'Cobrança, regras e reconciliação',scope:'Rail financeiro permanece protegido; sem Bank Connect nesta fase e execução continua approval-first/idempotente.'},
  modo:{purpose:'Growth, campanhas, Google Ads e inteligência',scope:'OAuth e métricas podem ser reais; ativação, publicação e mudança de orçamento continuam protegidas.'},
  taxagent:{purpose:'NFS-e e motor fiscal',scope:'Company por workspace + secret_ref; emissão continua approval-first.'}
};

function money(cents:number|undefined){return ((Number(cents||0))/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function phoneLabel(value:string|undefined|null){const digits=String(value||'').replace(/\D/g,'');if(digits.length===13&&digits.startsWith('55'))return `+55 ${digits.slice(2,4)} ${digits.slice(4,9)}-${digits.slice(9)}`;if(digits.length===12&&digits.startsWith('55'))return `+55 ${digits.slice(2,4)} ${digits.slice(4,8)}-${digits.slice(8)}`;return value||''}

export default function IntegrationSetupCenter(){
  const [active,setActive]=useState(false);const [catalog,setCatalog]=useState<Capability[]>([]);const [smartbots,setSmartbots]=useState<SmartBots|null>(null);const [taxagent,setTaxAgent]=useState<TaxAgent|null>(null);
  const [botId,setBotId]=useState('');const [clientToken,setClientToken]=useState('');const [companyId,setCompanyId]=useState('');const [environment,setEnvironment]=useState<'test'|'production'>('test');const [secretRef,setSecretRef]=useState('');
  const [connectUrl,setConnectUrl]=useState('');const [busy,setBusy]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);const authenticated=Boolean(session.token()&&session.workspace());
  useEffect(()=>{const timer=setInterval(()=>{setSessionKey(`${session.token()}|${session.workspace()}`);const selected=document.querySelector<HTMLButtonElement>('.sidebar nav button.active');setActive(Boolean(selected?.textContent?.includes('Integrações')))},500);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!authenticated||!active)return;void load()},[sessionKey,active]);
  async function load(){setError('');try{const [caps,sb,ta]=await Promise.all([api<Capability[]>('/v1/integrations/catalog'),api<SmartBots>('/v1/integrations/smartbots'),api<TaxAgent>('/v1/integrations/taxagent')]);setCatalog(caps);setSmartbots(sb);setTaxAgent(ta);setCompanyId(String(ta?.companyId||ta?.external_account_ref||''));setEnvironment(ta?.environment||'test')}catch(e:any){setError(e?.message||'Não foi possível carregar as integrações.')}}
  const ready=useMemo(()=>catalog.filter(item=>item.baseUrlConfigured&&item.credentialConfigured).length,[catalog]);

  async function probe(provider:string){setBusy(provider);setError('');setNotice('');try{const result=await post<any>(`/v1/integrations/${provider}/probe`,{});setNotice(result.ok?`${provider}: conexão validada.`:`${provider}: ${result.error||result.status||'conexão ainda não disponível'}.`);await load()}catch(e:any){setError(e?.message||`Falha ao testar ${provider}.`)}finally{setBusy('')}}
  async function connectDocWallet(){setBusy('docwallet-connect');setError('');setNotice('');try{const result=await post<any>('/v1/integrations/docwallet/connect-token',{});setConnectUrl(result.connectUrl);setNotice('Autorização curta criada. Abra o DocWallet para concluir o vínculo deste workspace.')}catch(e:any){setError(e?.message||'Não foi possível iniciar o vínculo com DocWallet.')}finally{setBusy('')}}
  async function openSmartBots(){
    const action=smartbots?.provisioned?'handoff':'activate';setBusy('smartbots-addon');setError('');setNotice('');
    const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;
    try{
      const result=await post<any>(`/v1/integrations/smartbots/${action}`,{});
      if(!result?.handoffUrl)throw new Error('Acesso ao SmartBots não foi preparado.');
      if(popup)popup.location.href=result.handoffUrl;else window.location.href=result.handoffUrl;
      setNotice(smartbots?.provisioned?'SmartBots aberto em uma nova aba.':'SmartBot preparado. Conclua a ativação na nova aba.');await load();
    }catch(e:any){if(popup)popup.close();setError(e?.message||'Não foi possível abrir o SmartBots.')}finally{setBusy('')}
  }
  async function saveSmartBots(e:FormEvent){e.preventDefault();if(!botId.trim()||!clientToken.trim())return;setBusy('smartbots-save');setError('');setNotice('');try{await put('/v1/integrations/smartbots',{botId:botId.trim(),clientToken:clientToken.trim()});setNotice('SmartBots vinculado e verificado. O Client Token foi usado apenas para confirmar a posse do bot e não foi armazenado no NexOffice.');setBotId('');await load()}catch(err:any){setError(err?.message||'Não foi possível vincular o SmartBots. Confira o Bot ID e o Client Token.')}finally{setClientToken('');setBusy('')}}
  async function saveTaxAgent(e:FormEvent){e.preventDefault();if(!companyId.trim()||!secretRef.trim())return;setBusy('taxagent-save');setError('');try{await put('/v1/integrations/taxagent',{companyId:companyId.trim(),environment,secretRef:secretRef.trim()});setSecretRef('');setNotice('TaxAgent configurado. O NexOffice guardou apenas a referência do secret server-side.');await load()}catch(err:any){setError(err?.message||'Não foi possível configurar o TaxAgent.')}finally{setBusy('')}}
  if(!authenticated||!active)return null;

  return <aside className="integrationSetupCenter" aria-label="Configuração de integrações NexOffice">
    <div className="iscHead"><div><p>AV CAPABILITY HUB</p><h3>Motores do ecossistema</h3><small>{ready}/{catalog.length||6} runtimes preparados</small></div><button onClick={()=>void load()}>↻</button></div>
    <div className="iscGuard">O NexOffice escolhe capacidades; os motores especializados continuam donos dos seus domínios. Secrets ficam no servidor e efeitos externos respeitam governança.</div>
    {error&&<div className="iscError">{error}</div>}{notice&&<div className="iscNotice">{notice}</div>}
    <div className="iscList">{catalog.map(item=>{const info=copy[item.provider]||{purpose:item.capabilities.join(' · '),scope:'Integração por workspace.'};const runtime=item.baseUrlConfigured&&item.credentialConfigured;return <article key={item.provider} className={item.provider==='smartbots'?'iscSmartbotsAddon':''}>
      <div className="iscRow"><div><b>{item.label}</b><small>{info.purpose}</small></div><span className={runtime?'ready':'pending'}>{item.provider==='smartbots'?(smartbots?.whatsapp?.connected?'WhatsApp ativo':smartbots?.provisioned?'ativando':'benefício disponível'):(item.state?.status|| (runtime?'runtime pronto':'runtime pendente'))}</span></div>
      <p>{info.scope}</p>
      {item.provider==='smartbots'?<div className="iscAddonBody">
        <div className="iscAddonPrice"><span>Preço normal <s>{money(smartbots?.offer?.regularAmountCents||14900)}/mês</s></span><strong>{money(smartbots?.offer?.partnerAmountCents||7900)}<small>/mês</small></strong><em>Benefício exclusivo para assinantes NexOffice</em></div>
        <div className="iscAddonBenefits"><span>✓ 7 dias grátis</span><span>✓ Site + WhatsApp</span><span>✓ Qualificação e oportunidades</span><span>✓ Handoff humano</span></div>
        {smartbots?.provisioned&&<div className="iscAddonStatus">
          <b>{smartbots.whatsapp?.connected?'SmartBot conectado':'SmartBot preparado'}</b>
          {smartbots.whatsapp?.connected&&smartbots.whatsapp?.phone&&<span>WhatsApp {phoneLabel(smartbots.whatsapp.phone)}</span>}
          {smartbots.whatsapp?.connected&&<span>{smartbots.whatsapp.autoReply?'Atendimento automático ativo':'Atendimento automático pausado'}</span>}
          {smartbots.entitlement?.status&&<span>Benefício NexOffice: {smartbots.entitlement.status==='paused'?'pausado':smartbots.entitlement.status}</span>}
        </div>}
        <button className="iscAddonCta" onClick={()=>void openSmartBots()} disabled={!runtime||!smartbots?.subscriberEligible||busy==='smartbots-addon'}>{busy==='smartbots-addon'?'Preparando…':smartbots?.provisioned?'Abrir SmartBots':'Ativar SmartBots'}</button>
        {!smartbots?.subscriberEligible&&<small className="iscAddonEligibility">Disponível por R$ 79/mês quando a assinatura NexOffice estiver ativa.</small>}
        <details className="iscAdvanced"><summary>Vínculo manual (administrativo)</summary><form className="iscForm iscSmartbotsForm" onSubmit={saveSmartBots} autoComplete="off"><div className="iscSmartbotsFields"><input value={botId} onChange={e=>setBotId(e.target.value)} placeholder="Bot ID" aria-label="SmartBots Bot ID"/><input type="password" value={clientToken} onChange={e=>setClientToken(e.target.value)} placeholder="Client Token" aria-label="SmartBots Client Token" autoComplete="new-password"/><button disabled={!runtime||busy==='smartbots-save'||!botId.trim()||!clientToken.trim()}>{busy==='smartbots-save'?'Validando…':'Vincular'}</button></div><small className="iscSecurityHint">Fallback técnico. O token só valida a posse e nunca é armazenado no NexOffice.</small></form></details>
      </div>:<><div className="iscMeta"><span>URL {item.baseUrlConfigured?'✓':'—'}</span><span>credencial runtime {item.credentialConfigured?'✓':'—'}</span></div>
      {item.provider==='docwallet'&&<div className="iscActions"><button onClick={()=>void connectDocWallet()} disabled={!runtime||Boolean(busy)}>{busy==='docwallet-connect'?'Gerando…':'Autorizar DocWallet'}</button>{connectUrl&&<a href={connectUrl} target="_blank" rel="noreferrer">Abrir autorização ↗</a>}</div>}
      {item.provider==='taxagent'&&<form className="iscFiscal" onSubmit={saveTaxAgent}><input value={companyId} onChange={e=>setCompanyId(e.target.value)} placeholder="Company ID"/><select value={environment} onChange={e=>setEnvironment(e.target.value as 'test'|'production')}><option value="test">test</option><option value="production">production</option></select><input value={secretRef} onChange={e=>setSecretRef(e.target.value)} placeholder="NOME_DA_VARIAVEL_DO_SECRET"/><button disabled={!runtime||busy==='taxagent-save'}>{busy==='taxagent-save'?'Salvando…':'Configurar'}</button><small>Informe o nome da variável server-side, nunca a chave fiscal.</small></form>}
      {!['docwallet','taxagent'].includes(item.provider)&&<div className="iscActions"><button onClick={()=>void probe(item.provider)} disabled={!item.baseUrlConfigured||Boolean(busy)}>{busy===item.provider?'Testando…':'Testar conexão'}</button><small>Configuração operacional gerenciada no runtime.</small></div>}</>}
      {item.state?.last_error&&<div className="iscInlineError">{item.state.last_error}</div>}
    </article>})}</div>
    <div className="iscFoot"><span>Dados mínimos</span><span>Capabilities por motor</span><span>Efeitos externos protegidos</span></div>
  </aside>;
}
