import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.tsx';
import { registerChunkLoadRecovery } from './lib/chunkLoadRecovery';
import { initClientAnalytics } from './infrastructure/analytics';
import './infrastructure/firebase';
import './index.css';

registerChunkLoadRecovery();
initClientAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
