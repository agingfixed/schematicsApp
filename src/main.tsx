import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const registerServiceWorker = async () => {
  try {
    await navigator.serviceWorker.register('/service-worker.js');
  } catch (error) {
    console.error('Service worker registration failed', error);
  }
};

if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    window.addEventListener('load', registerServiceWorker, { once: true });
  } else {
    registerServiceWorker();
  }
}
