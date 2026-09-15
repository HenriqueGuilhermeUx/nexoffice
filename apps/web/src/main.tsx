import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import OperationsDock from './OperationsDock';
import DocWalletConnectBridge from './DocWalletConnectBridge';
import './styles.css';
import './operations-dock.css';
import './docwallet-connect.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App/><OperationsDock/><DocWalletConnectBridge/></React.StrictMode>
);
