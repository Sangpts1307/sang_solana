import './polyfill';
import React from 'react';
import ReactDOM from 'react-dom/client';
import SolanaProvider from './providers/SolanaProvider';
import App from './App';

import '@solana/wallet-adapter-react-ui/styles.css';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SolanaProvider>
      <App />
    </SolanaProvider>
  </React.StrictMode>
);
