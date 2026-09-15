import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import OperationsDock from './OperationsDock';
import DailyOpsPulse from './DailyOpsPulse';
import CommandCenterOverview from './CommandCenterOverview';
import DigitalTeamConsole from './DigitalTeamConsole';
import DocWalletConnectBridge from './DocWalletConnectBridge';
import PlatformHandoffBootstrap from './PlatformHandoffBootstrap';
import './styles.css';
import './operations-dock.css';
import './docwallet-connect.css';
import './platform-handoff.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><PlatformHandoffBootstrap/><App/><CommandCenterOverview/><DigitalTeamConsole/><DailyOpsPulse/><OperationsDock/><DocWalletConnectBridge/></React.StrictMode>
);
