import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import OperationsDock from './OperationsDock';
import DailyOpsPulse from './DailyOpsPulse';
import CommandCenterOverview from './CommandCenterOverview';
import DigitalTeamConsole from './DigitalTeamConsole';
import IntegrationSetupCenter from './IntegrationSetupCenter';
import DocWalletConnectBridge from './DocWalletConnectBridge';
import PlatformHandoffBootstrap from './PlatformHandoffBootstrap';
import StandaloneSetup from './StandaloneSetup';
import './styles.css';
import './operations-dock.css';
import './docwallet-connect.css';
import './platform-handoff.css';
import './standalone-setup.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><PlatformHandoffBootstrap/><App/><StandaloneSetup/><CommandCenterOverview/><DigitalTeamConsole/><IntegrationSetupCenter/><DailyOpsPulse/><OperationsDock/><DocWalletConnectBridge/></React.StrictMode>
);
