import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, normalizeOfflineHash } from './App';
import { I18nProvider } from './i18n';
import { ToastProvider } from './components/ui/toast';
import { AuthProvider } from './lib/auth';
import { syncEngine } from './sync/engine';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root элемент олдсонгүй.');

// `…/#/x?d=…` QR-ыг `/x?d=…` зам болгож хөрвүүлнэ (router ачаалахаас өмнө)
normalizeOfflineHash();

// Sync engine нь аппын амьдралын туршид ажиллана
syncEngine.start();

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);
