import {useState} from 'react';
import NexPersonalUSCrypto from './NexPersonalUSCrypto';
import './nex-personal-us.css';

type Tab='overview'|'agentics'|'crypto'|'marketplace';
const specialists=[
 {name:'Maya',role:'Coordinator',description:'Explains available signals and routes plans for user approval.'},
 {name:'Financial intelligence',role:'Read-only',description:'Cash-flow and account insights after a consented US data connection.'},
 {name:'Crypto analyst',role:'Read-only',description:'Network and wallet exposure reviews without signing or transacting.'},
 {name:'Trust policy',role:'Safety',description:'Deterministic permission checks and auditable refusal of financial execution.'}
] as const;
export default function NexPersonalUSA(){
 const [tab,setTab]=useState<Tab>('overview');
 return <div className="npu-root">
  <aside className="npu-side" aria-label="Nex Personal USA navigation">
   <div className="npu-brand"><span className="npu-symbol">N</span><div><strong>Nex Personal</strong><small>UNITED STATES</small></div></div>
   <div className="npu-side-title">MY FINANCIAL LIFE</div>
   {([['overview','Overview'],['agentics','Maya & AI Agents'],['crypto','Crypto Wallets'],['marketplace','Marketplace']] as const).map(([id,label])=>
    <button type="button" className={'npu-nav '+(tab===id?'selected':'')} onClick={()=>setTab(id)} key={id} aria-current={tab===id?'page':undefined}>{label}</button>)}
   <div className="npu-sidebar-footer">USA isolated preview. No bank, trading or money movement service is active.</div>
  </aside>
  <main className="npu-content">
   <header className="npu-header"><div><span className="npu-kicker">NEX PERSONAL · USA</span><h1>Your money. One intelligent place.</h1><p>Banking insights, AI agents and self-custody wallets. Built around your decisions.</p></div><span className="npu-tag">Development preview</span></header>
   {tab==='overview'&&<div className="npu-stack">
    <section className="npu-panel">
     <span className="npu-kicker">FINANCIAL OVERVIEW</span><h2>One dashboard. Clear boundaries.</h2>
     <p>US banking connections will use consented provider adapters. Crypto assets are shown separately from bank cash, credit, debts, investment values and any internal ledger.</p>
     <div className="npu-tiles">
      <div><small>Connected bank accounts</small><strong>Not connected</strong><span>Plaid integration pending</span></div>
      <div><small>Net worth</small><strong>Unavailable</strong><span>No invented dollar balances</span></div>
      <div><small>Crypto assets</small><strong>Connect to inspect</strong><span>Verified chain reads only</span></div>
     </div>
     <div className="npu-buttons"><button type="button" onClick={()=>setTab('crypto')}>Explore crypto wallets</button><button type="button" onClick={()=>setTab('agentics')}>Explore AI agents</button></div>
    </section>
    <section className="npu-panel"><span className="npu-kicker">NEXT-GENERATION EXPERIENCE</span><h2>Agents that prepare, people who decide.</h2><p>We plan to reuse Nexa Agentics' Trust evaluation, scoped delegations, audit, approval and read-only tool patterns. The Nexa engine remains isolated until a dedicated US adapter and security review are approved.</p></section>
   </div>}
   {tab==='agentics'&&<div className="npu-stack">
    <section className="npu-panel"><span className="npu-kicker">NEXA AGENTICS · USA ADAPTER</span><h2>Maya and your financial agents.</h2><p>This is a product preview, not a live connection to the Nexa Agentics runtime. The source engine stays on its own branch and tenant. No agent can authorize a transaction, sign with Privy or change a wallet.</p><div className="npu-tiles">{specialists.map(s=><div key={s.name}><small>{s.role}</small><strong>{s.name}</strong><span>{s.description}</span></div>)}</div></section>
    <section className="npu-panel"><h3>Execution firewall</h3><p>Default deny: no user- or agent-initiated transfers, payments, trading, swaps, withdrawals, token approvals or delegation. Future actions require US-specific identity, verified owner, consent, allowlist, limits, independent approval and reconciliation.</p></section>
   </div>}
   {tab==='crypto'&&<NexPersonalUSCrypto/>}
   {tab==='marketplace'&&<section className="npu-panel"><span className="npu-kicker">PARTNER MARKETPLACE</span><h2>Relevant options, never hidden incentives.</h2><p>Banking, credit, brokerage and investment partners will be reviewed individually for US licensing, suitability, disclosures and commissions. Financial data won't be sold. No products are currently distributed from this preview.</p><div className="npu-tiles"><div><small>BANKING</small><strong>Coming later</strong><span>Plaid provides data aggregation, not a bank account</span></div><div><small>INVESTMENTS</small><strong>Research first</strong><span>F-Insight USA adaptation pending</span></div><div><small>PARTNERS</small><strong>Legal review</strong><span>No transactions or referrals active</span></div></div></section>}
   <footer className="npu-footer">Nex Personal USA · Separate preview · Crypto wallet connections are local browser sessions only · Not financial or investment advice</footer>
  </main>
 </div>;
}
