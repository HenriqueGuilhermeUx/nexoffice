import {useEffect,useState} from 'react';
import {api,post,session} from './api';

type Nr1Info={
  product:string;
  suite:string;
  status:string;
  businessName:string;
  vertical:string;
  capabilities:string[];
  access:{mode:string;sso:boolean;cnpjRequiredForCompanyOnboarding:boolean};
  privacy:{sharedWithNr1Check:string[];neverSharedByThisBridge:string[];note:string};
};

type Launch={url:string;product:string;suite:string;sharedFields:string[];sso:boolean};

export default function NR1CheckAccessCenter(){
  const [sessionKey,setSessionKey]=useState(()=>`${session.token()}|${session.workspace()}`);
  const authenticated=Boolean(session.token()&&session.workspace());
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState<Nr1Info|null>(null);

  useEffect(()=>{const timer=setInterval(()=>{const next=`${session.token()}|${session.workspace()}`;setSessionKey(prev=>prev===next?prev:next)},700);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!authenticated){setOpen(false);setInfo(null);return}if(open&&!info)void load()},[sessionKey,open]);

  async function load(){setBusy(true);setError('');try{setInfo(await api<Nr1Info>('/v1/ecosystem/nr1check'))}catch(e:any){setError(e?.message||'Não foi possível carregar o NR1Check.')}finally{setBusy(false)}}
  async function launch(){setBusy(true);setError('');try{const result=await post<Launch>('/v1/ecosystem/nr1check/launch',{});const popup=window.open(result.url,'_blank','noopener,noreferrer');if(!popup)setError('Seu navegador bloqueou a nova janela. Permita pop-ups do NexOffice e tente novamente.')}catch(e:any){setError(e?.message||'Não foi possível abrir o NR1Check.')}finally{setBusy(false)}}

  if(!authenticated)return null;
  return <>
    <button className="nr1AccessLauncher" onClick={()=>setOpen(true)} aria-label="Abrir NR1Check"><span>🛡</span><b>NR-1</b></button>
    {open&&<div className="nr1AccessBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <section className="nr1AccessPanel" aria-label="NR1Check by MindCompliance">
        <header><div><small>ECOSSISTEMA NEXOFFICE</small><h2>NR1Check <span>by MindCompliance</span></h2></div><button onClick={()=>setOpen(false)} aria-label="Fechar">×</button></header>
        {busy&&!info&&<div className="nr1AccessLoading"/>}
        {error&&<div className="nr1AccessError">{error}</div>}
        {info&&<div className="nr1AccessBody">
          <div className="nr1AccessHero"><div><span className="nr1AccessBadge">Disponível para sua empresa</span><h3>Organize a NR-1 sem misturar seus dados sensíveis com a gestão do dia a dia.</h3><p>O NR1Check cuida do diagnóstico e da operação de compliance. O MindCompliance mantém riscos, planos de ação, responsáveis, prazos, evidências e documentos em acompanhamento contínuo.</p></div><div className="nr1AccessShield">🛡</div></div>
          <div className="nr1AccessGrid">{info.capabilities.map(item=><article key={item}><span>✓</span><p>{item}</p></article>)}</div>
          <div className="nr1PrivacyBox"><div><b>Privacidade por desenho</b><p>{info.privacy.note}</p></div><ul><li>O NexOffice envia apenas referência do workspace, nome da empresa e setor.</li><li>Funcionários, CPF, denúncias, respostas psicossociais, saúde e documentos brutos não passam por esta ponte.</li><li>O CNPJ real continua sendo informado e confirmado dentro do NR1Check.</li></ul></div>
          <div className="nr1AccessFooter"><div><small>EMPRESA</small><b>{info.businessName||'Seu workspace NexOffice'}</b><span>Acesso inicial com autenticação própria do NR1Check. SSO será habilitado apenas quando o contrato seguro entre os produtos estiver configurado.</span></div><button className="nr1AccessPrimary" disabled={busy} onClick={launch}>{busy?'Abrindo…':'Abrir NR1Check →'}</button></div>
        </div>}
      </section>
    </div>}
  </>;
}
