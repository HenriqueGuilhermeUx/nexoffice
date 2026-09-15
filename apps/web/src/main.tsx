import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import OperationsDock from './OperationsDock';
import DailyOpsPulse from './DailyOpsPulse';
import DocWalletConnectBridge from './DocWalletConnectBridge';
import PlatformHandoffBootstrap from './PlatformHandoffBootstrap';
import './styles.css';
import './operations-dock.css';
import './docwallet-connect.css';
import './platform-handoff.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><PlatformHandoffBootstrap/><App/><DailyOpsPulse/><OperationsDock/><DocWalletConnectBridge/></React.StrictMode>
);
