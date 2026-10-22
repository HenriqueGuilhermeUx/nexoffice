import React from 'react';
import './nexa-pj-banking.css';

/** Safe pre-auth gateway for PJ-branded builds.
 * No NexOffice session, financial wallet, tenant data, token or ERP
 * application is mounted before the verified backend handoff exists.
 */
export default function NexaPjAccessGate(){
 const features=[
  ['Conta Nexa','Identidade PJ, saldos e operações após autenticação e liberação'],
  ['Financeiro e ERP','Caixa, contas a pagar e receber, cobranças e conciliação'],
  ['CRM e vendas','Clientes, oportunidades, propostas e contratos'],
  ['Central de comando','Indicadores, prioridades e visão completa do negócio'],
  ['Agenda e tarefas','Compromissos, responsáveis e próximas ações'],
  ['Documentos e contratos','Gestão documental, propostas e arquivos empresariais'],
  ['Marketing e automações','Campanhas, comunicação e rotinas integradas'],
  ['Inteligência empresarial','Insights e equipe digital com decisões humanas'],
 ];
 return <div className="nexa-pj-gate">
  <header className="nexa-pj-gate-header">
    <div className="nexa-pj-gate-logo">N</div>
    <b>Nexa PJ</b>
    <a href="https://trynexa.com.br/pj">Sobre a Nexa PJ ↗</a>
  </header>
  <main className="nexa-pj-gate-main">
    <section className="nexa-pj-gate-intro" aria-label="Nexa PJ: conta empresarial e ERP">
      <div className="nexa-pj-gate-intro-copy">
        <p className="eyebrow">CONTA EMPRESARIAL · ERP+ · INTELIGÊNCIA</p>
        <h1>O poder de um ERP. <span>A experiência de um banco digital.</span></h1>
        <p>Seu negócio precisa de uma visão só: dinheiro, cobranças, clientes, processos e decisões no mesmo ambiente. A Nexa PJ reúne a Conta Nexa e todas as capacidades de gestão empresarial.</p>
        <div className="nexa-pj-gate-actions">
          <a href="https://trynexa.com.br/pj#abrir-conta">Conhecer a abertura PJ</a>
          <a href="https://trynexa.com.br/merchant">Já tenho Conta Nexa</a>
        </div>
        <div className="nexa-pj-gate-motifs">
          <span>Empresa e responsável validados</span>
          <span>Financeiro por habilitação</span>
          <span>Permissões por workspace</span>
        </div>
        <div className="nexa-pj-gate-note">
          <strong>Acesso integrado em homologação</strong>
          <p>O ambiente administrativo e a Conta Nexa utilizam controles próprios. Crie seu cadastro, envie o CNPJ e contrato social ou equivalente, conclua a Didit PF e aguarde a análise manual. A Conta Nexa e o ERP não são liberados por um simples acesso à página. A movimentação financeira depende de habilitação independente.</p>
        </div>
      </div>
      <div aria-label="Prévia ilustrativa do painel empresarial Nexa PJ">
        <div className="nexa-pj-mini-suite">
          <div className="nexa-pj-mini-top">
            <b>N · Nexa PJ</b><small>Workspace empresarial · prévia</small>
          </div>
          <div className="nexa-pj-mini-main">
            <div className="nexa-pj-mini-rail" aria-hidden="true">
              <span className="active">◈ Visão geral</span>
              <span>▣ Conta Nexa</span>
              <span>▤ Financeiro</span>
              <span>◎ CRM</span>
              <span>↗ Cobranças</span>
              <span>◷ Operações</span>
              <span>✦ Inteligência</span>
            </div>
            <div className="nexa-pj-mini-content">
              <small className="nexa-pj-mini-overline">Painel integrado</small>
              <h3 style={{fontSize:19,margin:'8px 0 4px'}}>Sua empresa, em tempo real</h3>
              <div className="nexa-pj-mini-account">
                <small>Conta Nexa · saldo empresarial</small>
                <b>— BRL / USDC</b>
                <small>Visível apenas após autenticação financeira</small>
              </div>
              <div className="nexa-pj-mini-cards" aria-hidden="true">
                <div><small>Contas a receber</small><b>—</b></div>
                <div><small>Contas a pagar</small><b>—</b></div>
                <div><small>Pipeline CRM</small><b>—</b></div>
              </div>
              <div className="nexa-pj-mini-bottom" aria-hidden="true">
                <span>ERP & caixa</span><span>Cobranças</span><span>CRM</span><span>Contratos</span><span>Automações</span>
              </div>
            </div>
          </div>
        </div>
        <p className="nexa-pj-mini-caption">Prévia conceitual. Sem saldos reais, funcionalidades financeiras bloqueadas.</p>
      </div>
    </section>
    <h2>Conta, gestão e crescimento. Tudo conectado.</h2>
    <div className="nexa-pj-gate-grid">
      {features.map(([name,desc])=><article key={name}><h3>{name}</h3><p>{desc}</p></article>)}
    </div>
    <p className="nexa-pj-gate-footnote">Abertura de conta não constitui aprovação financeira. O ERP original NexOffice não foi alterado. Nenhum saldo, operação Pix ou transferência é exibido ou executado sem aprovação, vínculo empresarial e autenticação adequados.</p>
  </main>
 </div>;
}
