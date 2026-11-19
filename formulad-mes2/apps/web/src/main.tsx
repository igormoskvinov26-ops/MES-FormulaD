import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initDensity } from './densityPref';
import { initQueue } from './queuePref';
import { initSidebar } from './sidebarPref';
import './styles.css';

try { const t = localStorage.getItem('f7-theme'); if (t === 'dark' || t === 'light' || t === 'soft') document.documentElement.setAttribute('data-theme', t); } catch {}
try { if (localStorage.getItem('f7-layout') === 'mobile') document.documentElement.setAttribute('data-layout', 'mobile'); } catch {}
initSidebar();
initQueue();
initDensity();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
