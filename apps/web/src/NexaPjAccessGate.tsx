import React from 'react';

/**
 * Fail-closed access boundary for Nexa PJ-branded builds.
 * Do not mount the NexOffice app or its enhancer modules on this surface.
 * Access can only be enabled after a SERVER-VERIFIED, tenant-bound Nexa PJ
 * approval + a one-time handoff issued by the Nexa identity backend.
 */
export default function NexaPjAccessGate(){
 const features=[
  ['Central de comando','Prioridades e indicadores do negócio'],
  ['CRM e vendas','Clientes, oportunidades e propostas'],
  ['Financeiro e ERP','Contas, cobranças e conciliação'],
  ['Agenda e tarefas','Compromissos e operações'],
  ['Documentos e contratos','Gestão documental da empresa'],
  ['Marketing e automações','Campanhas, rotinas e inteligência'],
  ['Equipe digital','Assistentes e aprovações'],
  ['Conta Nexa','Carteira, extrato, Pix e USDC quando habilitados']
 ];
 return <div className="nexa-pj-gate">
  <header className="nexa-pj-gate-header"><div className="nexa-pj-gate-logo">N</div><b>Nexa PJ</b><a href="https://trynexa.com.br/pj">Conhecer a plataforma</a></header>
  <main className="nexa-pj-gate-main">
    <p className="eyebrow">NEXA PJ · PLATAFORMA EMPRESARIAL</p>
    <h1>Toda a sua empresa. Uma única Conta Nexa.</h1>
    <p>CRM, ERP, vendas, documentos, automações e recursos financeiros em uma experiência unificada. O painel é liberado somente após a aprovação da conta PJ pela Nexa.</p>
    <div className="nexa-pj-gate-actions"><a href="https://trynexa.com.br/cadastro">Abrir minha Conta Nexa</a><a href="https://trynexa.com.br/merchant">Já tenho conta</a></div>
    <div className="nexa-pj-gate-note"><strong>Ativação empresarial</strong><p>1. Cadastre sua conta Nexa. 2. Informe o CNPJ e os responsáveis. 3. Conclua a verificação documental e facial quando solicitada. 4. Aguarde a aprovação empresarial. Após essa etapa, o acesso integrado será disponibilizado.</p></div>
    <h2>O que sua empresa terá disponível</h2><div className="nexa-pj-gate-grid">{features.map(([name,desc])=><article key={name}><h3>{name}</h3><p>{desc}</p></article>)}</div>
    <p className="nexa-pj-gate-footnote">Abertura da conta de gestão não equivale à aprovação financeira. Este ambiente não libera funções por uma sessão do NexOffice ou pelo endereço da página. A integração de acesso único está em homologação.</p>
  </main>
 </div>;
}
