import {useCallback,useEffect,useState} from 'react';
import NexPersonalUSCrypto,{type SharedCryptoObservation} from './NexPersonalUSCrypto';
import {buildReadOnlyCryptoReview} from './nex-personal-us-agentic-contract';
import {createMayaLocalPreviewGrant,activeMayaLocalPreviewGrant,
 type MayaLocalPreviewGrant} from './nex-personal-us-maya-local-session';
import './nex-personal-us.css';

type Tab='overview'|'agentics'|'crypto'|'access'|'marketplace';
const specialists=[
 {name:'Maya',role:'Coordinator',description:'Explains available signals and routes plans for user approval.'},
 {name:'Financial intelligence',role:'Read-only',description:'Cash-flow and account insights after a consented US data connection.'},
 {name:'Crypto analyst',role:'Read-only',description:'Network and wallet exposure reviews without signing or transacting.'},
 {name:'Trust policy',role:'Safety',description:'Deterministic permission checks and auditable refusal of financial execution.'}
] as const;
export default function NexPersonalUSA(){
 const [tab,setTab]=useState<Tab>('overview');
 const [mayaSnapshot,setMayaSnapshot]=useState<MayaLocalPreviewGrant|null>(null);
 const shareSnapshot=useCallback((snapshot:SharedCryptoObservation)=>{
  const grant=createMayaLocalPreviewGrant({
   address:snapshot.address,chainId:snapshot.chainId,
   rawBalance:snapshot.rawBalance,observedAt:snapshot.observedAt
  });
  setMayaSnapshot(grant);
  setTab('agentics');
 },[]);
 const revokeSnapshot=useCallback(()=>setMayaSnapshot(null),[]);
 useEffect(()=>{
  if(!mayaSnapshot)return;
  const delay=Math.max(0,Date.parse(mayaSnapshot.expiresAt)-Date.now());
  const timer=window.setTimeout(()=>{
   setMayaSnapshot(current=>current===mayaSnapshot?null:current);
  },delay);
  return ()=>window.clearTimeout(timer);
 },[mayaSnapshot]);
 const activeSnapshot=activeMayaLocalPreviewGrant(mayaSnapshot);
 const cryptoReview=activeSnapshot?buildReadOnlyCryptoReview({
  rawBalance:activeSnapshot.rawBalance,address:activeSnapshot.address,
  observedAt:activeSnapshot.observedAt
 }):null;
 return <div className="npu-root">
  <aside className="npu-side" aria-label="Nex Personal USA navigation">
   <div className="npu-brand"><span className="npu-symbol">N</span><div><strong>Nex Personal</strong><small>UNITED STATES</small></div></div>
   <div className="npu-side-title">MY FINANCIAL LIFE</div>
   {([['overview','Overview'],['agentics','Maya & AI Agents'],['crypto','Crypto Wallets'],['access','Manage Access'],['marketplace','Marketplace']] as const).map(([id,label])=>
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
    <section className="npu-panel" aria-label="Local wallet review">
     <span className="npu-kicker">MAYA · YOUR EXPLICITLY SHARED DATA</span><h2>Crypto portfolio review</h2>
     {!cryptoReview?<p>No wallet data was shared with Maya. You can opt in to a local snapshot on the Crypto Wallets page. No data is transmitted to Nexa Agentics.</p>:<>
      <div className="npu-tiles"><div><small>Source</small><strong>Polygon · native USDC</strong><span>Browser RPC, not a verified Nex Personal account link</span></div>
       <div><small>Observed</small><strong>{new Date(activeSnapshot!.observedAt).toLocaleString('en-US')}</strong><span>Historical snapshot · not a live position</span></div>
       <div><small>Shared locally</small><strong>{new Date(activeSnapshot!.sharedAt).toLocaleString('en-US')}</strong><span>Not persisted on the server</span></div></div>
      {cryptoReview.insights.map((insight,i)=><p key={i}>{insight}</p>)}
      <div className="npu-buttons"><button type="button" onClick={revokeSnapshot}>Revoke local snapshot</button><button type="button" onClick={()=>setTab('access')}>Manage Maya access</button></div>
      <small>Browser-memory only. This local snapshot expires after 10 minutes and is cleared on page reload. It is not a Privy or PostgreSQL authorization. Owner binding unverified; execution, advice, signing and withdrawals unavailable.</small>
     </>}
    </section>
   </div>}
   {tab==='access'&&<div className="npu-stack">
    <section className="npu-panel" aria-label="Manage Maya local preview access">
     <span className="npu-kicker">YOUR ACCESS · PREVIEW</span><h2>See what Maya can review.</h2>
     <p>You're in control of browser-local sharing. This is not an authenticated Nex Personal account, and these controls do not grant or revoke a real Privy or server-side consent.</p>
     <div className="npu-tiles">
      <div><small>Local Maya snapshot</small><strong>{activeSnapshot?'Active':'Not shared'}</strong><span>{activeSnapshot?'Expires automatically within 10 minutes':'No wallet data is currently shared in this page'}</span></div>
      <div><small>Server-authorized grants</small><strong>Unavailable</strong><span>US Privy authentication and dedicated PostgreSQL integration are not active on this site</span></div>
      <div><small>Financial execution</small><strong>Blocked</strong><span>No signing, swapping, paying or moving funds</span></div>
     </div>
     {activeSnapshot?<div className="npu-access-detail">
      <div><small>OBSERVED WALLET · POLYGON USDC</small><strong>{activeSnapshot.address.slice(0,8)}…{activeSnapshot.address.slice(-6)}</strong></div>
      <div><small>SHARED LOCALLY</small><strong>{new Date(activeSnapshot.sharedAt).toLocaleString('en-US')}</strong></div>
      <div><small>AUTOMATIC EXPIRY</small><strong>{new Date(activeSnapshot.expiresAt).toLocaleString('en-US')}</strong></div>
      <button type="button" onClick={revokeSnapshot}>Revoke this local snapshot</button>
     </div>:<div className="npu-note">No active local Maya snapshot. You may explore a read-only wallet connection in Crypto Wallets; sharing requires a separate explicit click.</div>}
     <div className="npu-buttons"><button type="button" onClick={()=>setTab('crypto')}>Explore crypto wallets</button></div>
    </section>
    <section className="npu-panel"><span className="npu-kicker">VERIFIED PRIVY CONSENT · NOT CONNECTED</span><h3>Real account access remains disabled</h3><p>Owner-specific listings and revocation have passed isolated USA backend and PostgreSQL tests. They cannot be used here until dedicated US Privy identity, service credentials and a separate US API/database have been configured and reviewed. No placeholder login or synthetic permission is treated as genuine.</p></section>
   </div>}
   {tab==='crypto'&&<NexPersonalUSCrypto onShareReview={shareSnapshot} onRevokeReview={revokeSnapshot} hasActiveMayaGrant={Boolean(activeSnapshot)}/>}
   {tab==='marketplace'&&<section className="npu-panel"><span className="npu-kicker">PARTNER MARKETPLACE</span><h2>Relevant options, never hidden incentives.</h2><p>Banking, credit, brokerage and investment partners will be reviewed individually for US licensing, suitability, disclosures and commissions. Financial data won't be sold. No products are currently distributed from this preview.</p><div className="npu-tiles"><div><small>BANKING</small><strong>Coming later</strong><span>Plaid provides data aggregation, not a bank account</span></div><div><small>INVESTMENTS</small><strong>Research first</strong><span>F-Insight USA adaptation pending</span></div><div><small>PARTNERS</small><strong>Legal review</strong><span>No transactions or referrals active</span></div></div></section>}
   <footer className="npu-footer">Nex Personal USA · Separate preview · Crypto wallet connections are local browser sessions only · Not financial or investment advice</footer>
  </main>
 </div>;
}
