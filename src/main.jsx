import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/sora';
import '@fontsource-variable/jetbrains-mono';
import './estilos/base.css';
import './estilos/componentes.css';
import './estilos/telas.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Funcionamento offline: depois da primeira visita o app abre mesmo sem internet.
// (O arquivo sw.js é gerado no build — veja vite.config.js.)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* sem service worker o app funciona igual, só não abre offline */
    });
  });
}
