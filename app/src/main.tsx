import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { bindWebPlatform } from './data/platform';

// Before anything renders: the core needs to be told how to store a preference, save
// a file, and load SQLite in this environment.
bindWebPlatform();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
