import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
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
const nexaPjBuild=(import.meta as any).env?.VITE_PRODUCT_BRAND==='nexa-pj';
const appRequested=nexaPjBuild||params.has('app')||handoffRequested;
if(nexaPjBuild){
 document.documentElement.classList.add('nexa-pj-theme');
 document.title='Nexa PJ — Gestão empresarial e Conta Nexa';
 document.querySelector('meta[name="description"]')?.setAttribute('content','Nexa PJ: gestão empresarial, CRM, ERP, automações e Conta Nexa em um só lugar.');
 document.querySelector('meta[property="og:site_name"]')?.setAttribute('content','Nexa PJ');
 document.querySelector('meta[property="og:title"]')?.setAttribute('content','Nexa PJ — Gestão empresarial e Conta Nexa');
 document.querySelector('meta[property="og:description"]')?.setAttribute('content','Nexa PJ: gestão empresarial e operações financeiras conectadas.');
 document.querySelector('link[rel="canonical"]')?.setAttribute('href','https://trynexa.com.br/pj');
}
const legalRequested=params.has('legal');

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
    {publicMaterialToken
      ? <PublicMaterialView token={publicMaterialToken}/>
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