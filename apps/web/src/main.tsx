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
import './styles.css';
import './platform-handoff.css';
import './marketing-landing.css';
import './marketing-readiness.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
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
  </React.StrictMode>
);