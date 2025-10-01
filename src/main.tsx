import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const serviceWorkerUrl = new URL('service-worker.js', import.meta.env.BASE_URL).toString();
    navigator.serviceWorker.register(serviceWorkerUrl, { scope: import.meta.env.BASE_URL }).catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  });
}
