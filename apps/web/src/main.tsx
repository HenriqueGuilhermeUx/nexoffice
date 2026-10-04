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

const publicMaterialMatch=location.pathname.match(/^\/material\/([0-9a-f-]{36})$/i);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {publicMaterialMatch?<PublicMaterialView token={publicMaterialMatch[1]}/>:<>
      <MarketingLanding/>
      <MarketingDiscoveryBridge/>
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
      <PublicLegalFooter/>
      <PublicLegalPage/>
    </>}
  </React.StrictMode>
);