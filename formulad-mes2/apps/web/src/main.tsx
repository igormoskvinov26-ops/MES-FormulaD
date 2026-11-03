import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

try { const t = localStorage.getItem('f7-theme'); if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t); } catch {}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
