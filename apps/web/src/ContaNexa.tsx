import React from 'react';

const NEXA_PJ_PORTAL='https://trynexa.com.br/merchant';
/**
 * Financial data must come from a server-verified Nexa PJ company session,
 * NEVER from NexOffice ledger or guessed balances.
 * Until a signed tenant handoff is enabled, open the existing official portal.
 */
export default function ContaNexa({companyName}:{companyName?:string}){
  return <section aria-label="Conta Nexa" style={{display:'grid',gap:20}}>
    <div className="hero">
      <div>
        <p className="eyebrow">NEXA PJ · CONTA EMPRESARIAL</p>
        <h2>Conta Nexa</h2>
        <p>Conta da empresa, movimentações e operações financeiras em um só lugar.</p>
      </div>
      <div className="heroActions">
        <a className="primary" href={NEXA_PJ_PORTAL} target="_blank" rel="noopener noreferrer">Abrir portal Nexa PJ ↗</a>
      </div>
    </div>
    <div className="twoCol">
      <div className="panel" style={{padding:24}}>
        <p className="eyebrow">IDENTIFICAÇÃO PJ</p>
        <h3>{companyName || 'Empresa selecionada'}</h3>
        <p>A identificação financeira (CNPJ, cadastro, KYC e carteira vinculada) deve ser consultada na Conta Nexa autenticada.</p>
        <p>O workspace NexOffice não concede, sozinho, acesso a saldos ou movimentações da Nexa.</p>
      </div>
      <div className="panel" style={{padding:24}}>
        <p className="eyebrow">SALDOS E EXTRATO</p>
        <h3>Consulte seus valores reais</h3>
        <p>BRL, USDC, carteira e histórico são exibidos exclusivamente pelo serviço financeiro Nexa após autenticação PJ.</p>
        <a href={NEXA_PJ_PORTAL} target="_blank" rel="noopener noreferrer">Consultar conta e movimentações ↗</a>
      </div>
    </div>
    <div className="panel" style={{padding:24}}>
      <p className="eyebrow">OPERAÇÕES</p>
      <h3>Compra, transferência, recebimentos e checkout</h3>
      <p>Acesse os fluxos já existentes na Nexa PJ. Operações dependem das permissões e da disponibilidade real da sua conta; nenhuma operação é disparada a partir deste painel.</p>
      <a href={NEXA_PJ_PORTAL} target="_blank" rel="noopener noreferrer">Acessar funcionalidades financeiras disponíveis ↗</a>
    </div>
  </section>;
}
