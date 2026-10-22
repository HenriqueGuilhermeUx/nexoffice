import {useEffect,useState} from 'react';
import {api,session} from './api';

const NEXA_PJ_PORTAL='https://trynexa.com.br/merchant';

type PjConnectionPreflight={
  structuralBindingPresent:boolean;
  workspaceMembershipVerifiedByNexOffice:true;
  companyKybApproved:false;
  legalRepresentationVerified:false;
  nexaAccountAuthenticated:false;
  corporateWalletConnected:false;
  financialAccess:false;
  balancesVisible:false;
  pixEnabled:false;
  cryptoEnabled:false;
  ssoAvailable:false;
  handoffTokenIssued:false;
  externalEffect:false;
  reason:string;
};

/**
 * Account data MUST come from an independently authenticated, approved and
 * company-scoped Nexa session, never a personal PF wallet or NexOffice ERP
 * ledger. This panel shows only a read-only structural workspace diagnostic.
 * It cannot trigger KYB, wallet provisioning, Pix, USDC or session exchange.
 */
export default function ContaNexa({companyName}:{companyName?:string}){
  const workspaceId=session.workspace();
  const [state,setState]=useState<PjConnectionPreflight|null>(null);
  const [pending,setPending]=useState(true);
  const [unavailable,setUnavailable]=useState(false);

  useEffect(()=>{
    let active=true;
    setState(null);setPending(true);setUnavailable(false);
    if(!workspaceId||!session.token()){
      setPending(false);setUnavailable(true);
      return()=>{active=false};
    }
    void api<PjConnectionPreflight>('/v1/platform/nexa-pj/connection-preflight')
      .then(result=>{
        if(!active)return;
        // Reject malformed or future prematurely permissive contracts.
        if(typeof result?.structuralBindingPresent!=='boolean' ||
           result.workspaceMembershipVerifiedByNexOffice!==true ||
           result.companyKybApproved!==false ||
           result.legalRepresentationVerified!==false ||
           result.nexaAccountAuthenticated!==false ||
           result.corporateWalletConnected!==false ||
           result.financialAccess!==false ||
           result.balancesVisible!==false ||
           result.pixEnabled!==false ||
           result.cryptoEnabled!==false ||
           result.ssoAvailable!==false ||
           result.handoffTokenIssued!==false ||
           result.externalEffect!==false){
          throw new Error('Resposta de integração financeira não confiável');
        }
        setState(result);
      })
      .catch(()=>{if(active){setUnavailable(true);setState(null)}})
      .finally(()=>{if(active)setPending(false)});
    return()=>{active=false};
  },[workspaceId]);

  const connectionLabel=pending?'Verificando vínculo empresarial…':
    unavailable?'Não foi possível verificar o vínculo':
    state?.structuralBindingPresent?'Vínculo de workspace identificado':'Vínculo empresarial não confirmado';

  return <section aria-label="Conta Nexa" style={{display:'grid',gap:20}}>
    <div className="hero">
      <div>
        <p className="eyebrow">NEXA PJ · CONTA EMPRESARIAL</p>
        <h2>Conta Nexa</h2>
        <p>Gestão da empresa e sua Conta Nexa em uma experiência segura.</p>
      </div>
      <div className="heroActions">
        <a className="primary" href={NEXA_PJ_PORTAL} target="_blank" rel="noopener noreferrer">
          Abrir portal Nexa PJ ↗
        </a>
      </div>
    </div>
    <div className="panel" style={{padding:24,display:'grid',gap:9}}>
      <p className="eyebrow">VÍNCULO EMPRESARIAL · SOMENTE LEITURA</p>
      <h3>{connectionLabel}</h3>
      <p>{state?.structuralBindingPresent
        ? 'O NexOffice encontrou um vínculo estrutural com a empresa neste workspace. Isso não é uma aprovação KYB nem autenticação da Conta Nexa.'
        : unavailable
        ? 'O diagnóstico está indisponível. Por segurança, nenhum saldo ou recurso financeiro será exibido; seus dados existentes permanecem preservados.'
        : 'A empresa ainda não possui vínculo Nexa PJ confirmado neste workspace. Nenhuma conta é criada automaticamente.'}</p>
      <small>Para utilizar saldos, extrato, Pix, USDC ou transferências, serão necessárias a aprovação empresarial e a autenticação financeira independente na Nexa.</small>
    </div>
    <div className="twoCol">
      <div className="panel" style={{padding:24}}>
        <p className="eyebrow">IDENTIFICAÇÃO PJ</p>
        <h3>{companyName||'Empresa selecionada'}</h3>
        <p>O nome acima identifica apenas o workspace NexOffice selecionado. Ele não comprova poderes legais, KYB ou titularidade de carteira.</p>
        <p>O acesso empresarial exige verificação independente do representante e dos vínculos entre empresa e conta.</p>
      </div>
      <div className="panel" style={{padding:24}}>
        <p className="eyebrow">SALDOS E EXTRATO</p>
        <h3>Dados financeiros protegidos</h3>
        <p>BRL, USDC, carteiras e movimentações só serão apresentados após autorização financeira por empresa, sem utilizar saldos de pessoa física.</p>
        <a href={NEXA_PJ_PORTAL} target="_blank" rel="noopener noreferrer">Consultar o portal financeiro autenticado ↗</a>
      </div>
    </div>
    <div className="panel" style={{padding:24}}>
      <p className="eyebrow">OPERAÇÕES</p>
      <h3>Compra, transferência, recebimentos e checkout</h3>
      <p>Enquanto o vínculo financeiro não estiver homologado, operações permanecem indisponíveis neste painel. O portal Nexa PJ continua sendo o acesso separado aos recursos efetivamente habilitados na conta.</p>
      <a href={NEXA_PJ_PORTAL} target="_blank" rel="noopener noreferrer">Abrir recursos disponíveis no portal Nexa PJ ↗</a>
    </div>
  </section>;
}
