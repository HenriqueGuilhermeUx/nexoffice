import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import NexPersonal from './NexPersonal';
import ProductDiscovery from './ProductDiscovery';
import StandaloneSetup from './StandaloneSetup';
import ShellUXEnhancements from './ShellUXEnhancements';
import HomeV2 from './HomeV2';
import OfficeView from './OfficeView';
import AssistantNavigationBridge from './AssistantNavigationBridge';
import AssistantsWorkspace from './AssistantsWorkspace';
import BusinessKnowledgeCenter from './BusinessKnowledgeCenter';
import KnowledgeSecurityCenter from './KnowledgeSecurityCenter';
import InvestmentDock from './InvestmentDock';
import DocumentWorkspaceBridge from './DocumentWorkspaceBridge';
import ContractCreator from './ContractCreator';
import BusinessOperationCenter from './BusinessOperationCenter';
import NetworkCenter from './NetworkCenter';
import FinancialEngineCollectionsBridge from './FinancialEngineCollectionsBridge';
import ReceivingAccountOnboardingBridge from './ReceivingAccountOnboardingBridge';
import FiscalWorkspaceBridge from './FiscalWorkspaceBridge';
import LaunchReadinessCenter from './LaunchReadinessCenter';
import MarketingLanding from './MarketingLanding';
import MarketingDiscoveryBridge from './MarketingDiscoveryBridge';
import PlatformHandoffBootstrap from './PlatformHandoffBootstrap';
import {PublicLegalFooter,PublicLegalPage} from './PublicLegal';
import PublicMaterialView from './PublicMaterialView';
import './styles.css';
import './intelligent-activation.css';
import './platform-handoff.css';
import './marketing-landing.css';
import './marketing-readiness.css';

const pathMaterial=location.pathname.match(/^\/material\/([0-9a-f-]{36})$/i)?.[1]||'';
const queryMaterial=new URLSearchParams(location.search).get('material')||'';
const publicMaterialToken=/^[0-9a-f-]{36}$/i.test(pathMaterial||queryMaterial)?(pathMaterial||queryMaterial):'';
const params=new URLSearchParams(location.search);
const handoffRequested=new URLSearchParams(location.hash.replace(/^#/,'')).has('handoff');
const appRequested=params.has('app')||handoffRequested;
const legalRequested=params.has('legal');
const personalRequested=/^\/personal\/?$/.test(location.pathname);
const personalPreview=(import.meta as any).env?.VITE_PERSONAL_STAGING==='true';
const publicLifeos=(import.meta as any).env?.VITE_NEXA_LIFEOS_PUBLIC==='true';
const publicBuildProbe=(import.meta as any).env?.VITE_NEXA_LIFEOS_BUILD_PROBE==='true';
// Keep the old static preview bookmark working after moving to a single-origin
// preview. This is a fixed Render hostname and cannot be user-controlled.
if(personalPreview
  && (import.meta as any).env?.VITE_PERSONAL_SINGLE_ORIGIN!=='true'
  && location.hostname==='nex-personal-preview.onrender.com'){
  location.replace('https://nex-personal-preview-api.onrender.com/');
}


const appSurface=<>
  <PlatformHandoffBootstrap/>
  <App/>
  <ProductDiscovery/>
  <StandaloneSetup/>
  <ShellUXEnhancements/>
  <HomeV2/>
  <OfficeView/>
  <AssistantNavigationBridge/>
  <AssistantsWorkspace/>
  <BusinessKnowledgeCenter/>
  <KnowledgeSecurityCenter/>
  <InvestmentDock/>
  <DocumentWorkspaceBridge/>
  <ContractCreator/>
  <BusinessOperationCenter/>
  <NetworkCenter/>
  <FinancialEngineCollectionsBridge/>
  <ReceivingAccountOnboardingBridge/>
  <FiscalWorkspaceBridge/>
  <LaunchReadinessCenter/>
</>;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {publicLifeos && publicBuildProbe
      ? <main style={{minHeight:'100vh',background:'#06111F',color:'#e8f8ff',fontFamily:'Inter,system-ui,sans-serif',padding:'min(12vh,90px) 7vw'}}>
          <img src="/meu-espaco/app/nexa-logo.svg" alt="Nexa" width="52" height="52"/>
          <p style={{color:'#31d7ff',fontWeight:700}}>NEXA · HOMOLOGAÇÃO DE ROTA</p>
          <h1>Seu espaço Nexa está em preparação.</h1>
          <p>Esta visualização não aceita login, não se conecta à Wallet e não permite movimentações financeiras.</p>
          <a href="/meu-espaco" style={{color:'#31d7ff'}}>Conhecer o Meu Espaço Nexa</a>
        </main>
      : publicLifeos
      ? <NexPersonal/>
      : personalPreview
      ? <NexPersonal/>
      : publicMaterialToken
      ? <PublicMaterialView token={publicMaterialToken}/>
      : personalRequested
        ? <NexPersonal/>
        : legalRequested
        ? <PublicLegalPage/>
        : appRequested
          ? appSurface
          : <>
              <MarketingLanding/>
              <MarketingDiscoveryBridge/>
              <PublicLegalFooter/>
            </>
    }
  </React.StrictMode>
);