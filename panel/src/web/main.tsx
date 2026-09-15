import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'tucano/css';
import { App } from './App.tsx';
import { applyFavicon } from './components/logos.tsx';
import { I18nProvider } from './lib/i18n.tsx';
import { installIconMasks } from './lib/icon-masks.ts';
import { applyStoredTheme } from './lib/theme.ts';
import './styles.css';

// Antes do primeiro render: evita piscar o tema errado.
applyStoredTheme();
applyFavicon();
installIconMasks();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
