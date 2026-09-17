import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import OperationsDock from './OperationsDock';
import DailyOpsPulse from './DailyOpsPulse';
import CommandCenterOverview from './CommandCenterOverview';
import DigitalTeamConsole from './DigitalTeamConsole';
import IntegrationSetupCenter from './IntegrationSetupCenter';
import DocumentIntelligenceCenter from './DocumentIntelligenceCenter';
import DocWalletConnectBridge from './DocWalletConnectBridge';
import PlatformHandoffBootstrap from './PlatformHandoffBootstrap';
import StandaloneSetup from './StandaloneSetup';
import BillingCenter from './BillingCenter';
import MarketingLanding from './MarketingLanding';
import BusinessExtensions from './BusinessExtensions';
import StatementImportCenter from './StatementImportCenter';
import FinancialIntelligenceCenter from './FinancialIntelligenceCenter';
import './styles.css';
import './operations-dock.css';
import './docwallet-connect.css';
import './platform-handoff.css';
import './standalone-setup.css';
import './billing-center.css';
import './marketing-landing.css';
import './business-extensions.css';
import './statement-import.css';
import './financial-intelligence.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><MarketingLanding/><PlatformHandoffBootstrap/><App/><StandaloneSetup/><BillingCenter/><CommandCenterOverview/><DigitalTeamConsole/><IntegrationSetupCenter/><DocumentIntelligenceCenter/><DailyOpsPulse/><OperationsDock/><DocWalletConnectBridge/><BusinessExtensions/><StatementImportCenter/><FinancialIntelligenceCenter/></React.StrictMode>
);