import {useEffect,useState} from 'react';
import {api,session} from './api';
import './nexa-pj-banking.css';

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
type ErpFinanceOverview={
  receivable_minor?:number|string;
  payable_minor?:number|string;
};
const formatErpMoney=(minor?:number|string)=>{
  if(minor===undefined||minor===null||minor==='')return '—';
  const value=Number(minor);
  if(!Number.isFinite(value))return '—';
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})
    .format(value/100);
};
const navigateErp=(view:'command'|'finance'|'crm'|'operations'|'agents-pj'|'office-2d'|'documents'|'agenda')=>{
  window.dispatchEvent(new CustomEvent('nexoffice:navigate',{detail:{view}}));
};
export default function ContaNexa({
  companyName,erpFinance,
}:{companyName?:string;erpFinance?:ErpFinanceOverview}){
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

  return <section className="pj-connect" aria-label="Conta Nexa: banco empresarial e ERP">
    <div className="pj-connect-hero">
      <small>NEXA PJ / CONTA + ERP + INTELIGÊNCIA</small>
      <h2>O dinheiro e a operação da sua empresa. No mesmo lugar.</h2>
      <p>Conta Nexa, financeiro e ERP em uma visão única. Os indicadores do ERP abaixo pertencem ao workspace selecionado; saldos bancários e transações continuam protegidos até a aprovação e autenticação independente da conta PJ.</p>
      <div className="pj-connect-actions">
        <a href={NEXA_PJ_PORTAL} target="_blank" rel="noopener noreferrer">Acessar Conta Nexa ↗</a>
        <button type="button" onClick={()=>navigateErp('finance')}>Abrir Financeiro e ERP →</button>
        <button type="button" onClick={()=>navigateErp('agents-pj')}>Conhecer os 7 agentes →</button>
        <button type="button" onClick={()=>navigateErp('office-2d')}>Explorar Escritório 2D →</button>
      </div>
    </div>
    <div className="pj-bank-workspace" aria-label="Central financeira da empresa">
      <div className="pj-bank-workspace-heading">
        <div><small className="eyebrow">CONTA EMPRESARIAL</small><h3>Seu centro financeiro</h3>
          <p>Conta bancária e gestão no mesmo painel. Os serviços bancários são liberados somente após a verificação da empresa.</p>
        </div>
        <span className="pj-bank-readiness" role="status">{state?.structuralBindingPresent?'Vínculo identificado · aprovação pendente':'Conta PJ ainda não habilitada'}</span>
      </div>
      <div className="pj-bank-quick-actions" aria-label="Atalhos financeiros com habilitação pendente">
        {(['Receber','Pagar','Transferir','Extrato'] as const).map(label=>
          <button key={label} type="button" disabled aria-disabled="true" title="Disponível somente após KYB, autorização do representante e autenticação PJ">{label} <span>🔒</span></button>
        )}
        <button type="button" onClick={()=>navigateErp('finance')}>Cobranças e ERP <span>→</span></button>
      </div>
      <p className="pj-banking-lock-note" role="status">Recebimentos, pagamentos, transferências e extrato bancário ficam indisponíveis neste ERP até a habilitação da Conta Nexa PJ. A gestão financeira administrativa continua disponível.</p>
      <div className="pj-bank-activity" aria-label="Movimentações da Conta Nexa">
        <div><h4>Movimentações da conta</h4><p>O extrato bancário da empresa aparece aqui somente após integração, aprovação e sessão PJ independente.</p></div>
        <span>Sem acesso financeiro autorizado</span>
      </div>
    </div>
    <div className="pj-connect-kpis" aria-label="Resumo de Conta Nexa e ERP">
      <div className="pj-connect-kpi">
        <small>Saldo Conta Nexa · BRL</small><strong>—</strong><em>Exige login e liberação financeira</em>
      </div>
      <div className="pj-connect-kpi">
        <small>Saldo Conta Nexa · USDC</small><strong>—</strong><em>Carteira PJ não conectada</em>
      </div>
      <div className="pj-connect-kpi">
        <small>Contas a receber · ERP</small>
        <strong>{formatErpMoney(erpFinance?.receivable_minor)}</strong>
        <em>Dados do workspace selecionado</em>
      </div>
      <div className="pj-connect-kpi">
        <small>Contas a pagar · ERP</small>
        <strong>{formatErpMoney(erpFinance?.payable_minor)}</strong>
        <em>Dados do workspace selecionado</em>
      </div>
    </div>
    <section className="pj-premium-connectors" aria-label="Ecossistema financeiro Nexa PJ">
      <div className="pj-bank-workspace-heading"><div><small className="eyebrow">VISÃO FINANCEIRA GLOBAL DA EMPRESA</small><h3>Seu patrimônio e suas obrigações em uma só visão</h3><p>Arquitetura preparada para conectar instituições financeiras, investimentos e carteiras; acesso a dados reais somente com autorização e identidade PJ verificadas.</p></div><span className="pj-bank-readiness">Conexões em preparação</span></div>
      <div className="pj-premium-grid">
        {[
          {name:'Open Finance',description:'Contas, saldos e transações de instituições autorizadas, mediante consentimento empresarial.',status:'Aguardando parceiro e consentimento'},
          {name:'Carteira Nexa / Privy',description:'Criação ou associação de carteira empresarial após KYB e vínculo de titularidade, sem usar carteira PF.',status:'Aguardando autenticação PJ'},
          {name:'Carteiras externas',description:'MetaMask e outras carteiras compatíveis, após prova de controle e validação do vínculo corporativo.',status:'Conexão PJ não habilitada'},
          {name:'Investimentos consolidados',description:'Posições em instituições conectadas, separadas por fonte, moeda e data de atualização.',status:'Sem fonte autorizada'},
          {name:'Dívidas e obrigações',description:'Empréstimos e compromissos externos, separados dos lançamentos administrativos no ERP.',status:'Aguardando fontes externas'},
          {name:'Agentics financeiro',description:'Consultas contextuais e propostas de ações com confirmação humana, trilha de auditoria e permissões.',status:'Pagamentos e ordens bloqueados'},
        ].map(item=><article className="pj-premium-card" key={item.name}><h4>{item.name}</h4><p>{item.description}</p><small role="status">{item.status}</small></article>)}
      </div>
      <p className="pj-banking-lock-note">Sem consentimento válido e vínculo empresarial aprovado, a Nexa PJ não consulta instituições externas, não cria carteiras, não importa posições e não inicia pagamentos.</p>
    </section>
    <div className="pj-connect-layout">
      <div className="pj-connect-panel">
        <small className="eyebrow">IDENTIDADE EMPRESARIAL</small>
        <h3>{companyName||'Empresa selecionada'}</h3>
        <div className="pj-connect-status" role="status">{connectionLabel}</div>
        <p>{state?.structuralBindingPresent
          ? 'O vínculo estrutural deste workspace foi identificado. Isso não significa que a pessoa jurídica tenha sido aprovada pela Nexa nem que exista autorização para consultar saldos.'
          : unavailable
          ? 'Não foi possível conferir o vínculo empresarial. Por segurança, nenhum dado bancário será exibido.'
          : pending
          ? 'Conferindo permissões de acesso ao workspace.'
          : 'Nenhum vínculo empresarial financeiro foi confirmado para este workspace.'}</p>
        <p>O acesso financeiro requer validação do representante, CNPJ e documentos, além de autenticação da Conta Nexa.</p>
      </div>
      <div className="pj-connect-panel">
        <small className="eyebrow">FINANCEIRO & ERP+</small>
        <h3>Do recebível ao caixa, sem perder o controle.</h3>
        <p>Contas, cobranças, conciliação e relatórios empresariais já pertencem ao seu workspace de gestão. A conexão bancária é uma etapa separada e não mistura a carteira PF com a PJ.</p>
        <div className="pj-connect-actions">
          <button type="button" onClick={()=>navigateErp('finance')}>Ir para Financeiro →</button>
          <button type="button" onClick={()=>navigateErp('crm')}>Abrir Clientes e CRM →</button>
        </div>
      </div>
      <div className="pj-connect-panel">
        <small className="eyebrow">COBRANÇAS E MOVIMENTAÇÕES</small>
        <h3>Operação financeira com autorização.</h3>
        <p>Extrato, transferências, compra/conversão e recursos Pix/USDC são consultados ou operados no portal Nexa com autenticação própria, conforme o que for habilitado para a empresa.</p>
        <div className="pj-connect-actions">
          <a href={NEXA_PJ_PORTAL} target="_blank" rel="noopener noreferrer">Abrir portal financeiro ↗</a>
        </div>
      </div>
      <div className="pj-connect-panel">
        <small className="eyebrow">INTELIGÊNCIA DA EMPRESA</small>
        <h3>O próximo passo começa com contexto.</h3>
        <p>Central de comando, clientes, contratos, tarefas, operação e equipe digital organizados no mesmo ERP, sem inventar saldos bancários ou executar ordens financeiras.</p>
        <div className="pj-connect-actions">
          <button type="button" onClick={()=>navigateErp('command')}>Ver visão geral →</button>
          <button type="button" onClick={()=>navigateErp('operations')}>Acessar operação →</button>
        </div>
      </div>
    </div>
    <div className="pj-connect-note">
      <strong>Proteção de contas PF e PJ.</strong> Esta tela mostra dados do ERP somente do workspace autenticado. Os saldos bancários não são estimados a partir do ledger empresarial, e nenhuma compra, transferência, Pix, conexão de carteira ou SSO é iniciada por este painel. Toda função financeira depende de vínculo PJ comprovado e sessão Nexa separada.
    </div>
  </section>;
}
