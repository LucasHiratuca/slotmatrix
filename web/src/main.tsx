import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary scope="global">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
