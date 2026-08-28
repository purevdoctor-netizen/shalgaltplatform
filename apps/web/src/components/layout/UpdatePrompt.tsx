/**
 * Service worker шинэчлэлтийн мэдэгдэл.
 */

import { useRegisterSW } from 'virtual:pwa-register/react';
import { useT } from '../../i18n';
import { Button } from '../ui';

export function UpdatePrompt() {
  const t = useT();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error: unknown) {
      console.warn('[pwa] Service worker бүртгэх алдаа:', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="no-print fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-primary-200 bg-white p-4 shadow-soft-lg">
      <p className="text-sm font-medium text-slate-900">{t('pwa.updateAvailable')}</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setNeedRefresh(false)}>
          {t('common.close')}
        </Button>
        <Button size="sm" onClick={() => void updateServiceWorker(true)}>
          {t('pwa.update')}
        </Button>
      </div>
    </div>
  );
}
