import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ShellUXEnhancements from './ShellUXEnhancements';
import HomeV2 from './HomeV2';
import OfficeView from './OfficeView';
import AssistantNavigationBridge from './AssistantNavigationBridge';
import DocumentWorkspaceBridge from './DocumentWorkspaceBridge';
import ContractCreator from './ContractCreator';
import FinancialEngineCollectionsBridge from './FinancialEngineCollectionsBridge';
import ReceivingAccountOnboardingBridge from './ReceivingAccountOnboardingBridge';
import MarketingLanding from './MarketingLanding';
import MarketingDiscoveryBridge from './MarketingDiscoveryBridge';
import PlatformHandoffBootstrap from './PlatformHandoffBootstrap';
import {PublicLegalFooter,PublicLegalPage} from './PublicLegal';
import './styles.css';
import './platform-handoff.css';
import './marketing-landing.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MarketingLanding/>
    <MarketingDiscoveryBridge/>
    <PlatformHandoffBootstrap/>
    <App/>
    <ShellUXEnhancements/>
    <HomeV2/>
    <OfficeView/>
    <AssistantNavigationBridge/>
    <DocumentWorkspaceBridge/>
    <ContractCreator/>
    <FinancialEngineCollectionsBridge/>
    <ReceivingAccountOnboardingBridge/>
    <PublicLegalFooter/>
    <PublicLegalPage/>
  </React.StrictMode>
);