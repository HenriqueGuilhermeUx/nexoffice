import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import NexPersonalUSA from '../../apps/web/src/NexPersonalUSA';
import './site.css';

function Site(){
 const [preview,setPreview]=useState(false);
 const openPreview=()=>{setPreview(true);window.scrollTo({top:0,behavior:'instant'});};
 const closePreview=()=>{setPreview(false);window.scrollTo({top:0,behavior:'instant'});};
 return preview?<div className="npu-site-preview">
  <div className="npu-site-preview-bar"><strong>Nex Personal USA</strong><span>Development preview — simulated and browser-local features only</span><button type="button" onClick={closePreview}>Back to website</button></div>
  <NexPersonalUSA/>
 </div>:<div className="npu-site">
  <header className="npu-site-nav">
   <a href="#top" className="npu-site-brand" aria-label="Nex Personal USA home"><span className="npu-site-mark">N</span><span>Nex Personal <small>USA</small></span></a>
   <nav aria-label="Site navigation"><a href="#experience">Experience</a><a href="#safety">Security</a><a href="#roadmap">Roadmap</a></nav>
   <button type="button" className="npu-site-nav-cta" onClick={openPreview}>Explore preview <span aria-hidden="true">↗</span></button>
  </header>
  <main id="top">
   <section className="npu-site-hero">
    <div className="npu-site-hero-copy">
     <p className="npu-site-eyebrow"><span className="npu-site-dot"/> BUILT FOR YOUR FINANCIAL LIFE · USA PREVIEW</p>
     <h1>Everything about your money. <em>Finally, in perspective.</em></h1>
     <p className="npu-site-lead">A clearer way to understand accounts, follow your goals, explore self-custody wallets and work with intelligent assistants — with you in control.</p>
     <div className="npu-site-actions"><button type="button" onClick={openPreview}>Explore the product preview <span aria-hidden="true">→</span></button><a href="#experience">See how it works</a></div>
     <p className="npu-site-caption">Early product preview. No live bank connection, custody, transfers, investment execution or financial advice.</p>
    </div>
    <div className="npu-site-showcase" aria-label="Illustrative financial dashboard mockup">
     <div className="npu-site-window-head"><span/><span/><span/><small>YOUR FINANCIAL OVERVIEW · CONCEPT</small></div>
     <div className="npu-site-mock-content">
      <div className="npu-site-mock-heading"><div><small>YOUR FINANCIAL LIFE</small><strong>One connected perspective.</strong></div><span>Preview</span></div>
      <div className="npu-site-mock-grid">
       <div><small>Banking</small><strong>Consent first</strong><span>Connections planned</span></div>
       <div><small>Crypto</small><strong>Read only</strong><span>Polygon USDC review</span></div>
      </div>
      <div className="npu-site-mock-maya"><div className="npu-site-maya-icon">M</div><div><small>MAYA · YOUR AI COORDINATOR</small><strong>Insights, not transactions.</strong><p>Explore what matters. Approve what happens next.</p></div></div>
      <div className="npu-site-mock-bars"><span/><span/><span/><span/><span/><span/><span/></div>
      <div className="npu-site-mock-bottom"><span>PLANNING · PRIVACY · CONTROL</span><strong>YOU DECIDE</strong></div>
     </div>
    </div>
   </section>
   <section className="npu-site-features" id="experience">
    <div className="npu-site-section-heading"><p className="npu-site-eyebrow">A MORE INTELLIGENT VIEW</p><h2>Less switching.<br/>More understanding.</h2><p>One experience designed to make complex financial information understandable, without blurring the difference between what exists today and what comes next.</p></div>
    <div className="npu-site-feature-grid">
     <article><span className="npu-site-feature-icon">01</span><h3>Financial clarity</h3><p>Organize your financial picture and explore consent-based account insights as supported integrations are introduced.</p><small>Bank data connections: planned</small></article>
     <article><span className="npu-site-feature-icon">02</span><h3>Maya & AI specialists</h3><p>Prepare questions, compare signals and understand the next step. Assistants do not make financial decisions for you.</p><small>Read-only exploration: preview</small></article>
     <article><span className="npu-site-feature-icon">03</span><h3>Self-custody visibility</h3><p>Explore read-only external wallet discovery and native USDC balance observations on Polygon, without handing over signing authority.</p><small>Browser-local crypto preview</small></article>
    </div>
   </section>
   <section className="npu-site-trust" id="safety"><div><p className="npu-site-eyebrow">BUILT AROUND PERMISSION</p><h2>Your data.<br/>Your choices.</h2><p>Identity, explicit consent, short-lived permissions and revocation are the foundation of our US architecture. Critical account and wallet capabilities remain behind independent verification.</p></div><div className="npu-site-trust-list"><p><span>✓</span> Separate USA data and identity boundaries</p><p><span>✓</span> Explicit and revocable Maya read consent</p><p><span>✓</span> No agent signing or delegated transactions</p><p><span>✓</span> No cross-border sharing of Brazilian customer databases</p></div></section>
   <section className="npu-site-roadmap" id="roadmap"><p className="npu-site-eyebrow">WHAT'S AVAILABLE</p><h2>Explore the experience. Know the limits.</h2><div className="npu-site-roadmap-grid"><div><small>AVAILABLE TO EXPLORE</small><h3>Interactive USA preview</h3><p>Navigate the dashboard, review Maya's local-only illustration and inspect compatible browser wallet behavior.</p></div><div><small>IN VALIDATION</small><h3>Verified identity and consent</h3><p>US-only Privy identity, PostgreSQL consent controls and server-trusted wallet read flows are tested in an isolated development branch.</p></div><div><small>NOT ACTIVE</small><h3>Banking and transactions</h3><p>Live bank aggregation, brokerage, money movement, trading and investment services are not offered from this website.</p></div></div><button type="button" className="npu-site-bottom-cta" onClick={openPreview}>Open the interactive preview <span aria-hidden="true">→</span></button></section>
  </main>
  <footer className="npu-site-footer"><div className="npu-site-brand"><span className="npu-site-mark">N</span><span>Nex Personal <small>USA</small></span></div><p>Independent USA development preview. No financial services are currently provided through this site.</p><small>© {new Date().getFullYear()} Nex Personal USA · Alternative Ventures</small></footer>
 </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Site/></React.StrictMode>);
