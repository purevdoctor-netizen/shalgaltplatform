/**
 * Онлайн/офлайн индикатор — дэлгэцийн доод буланд байнга харагдана.
 */

import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { useT } from '../../i18n';
import { useSyncStatus } from '../../sync/useSync';
import { cn } from '../../lib/utils';
import { Button } from '../ui';

export function OnlineIndicator() {
  const t = useT();
  const { online, state, pending, syncNow } = useSyncStatus();

  const showSyncButton = online && pending > 0 && state !== 'syncing';

  return (
    <div className="no-print pointer-events-none fixed bottom-4 left-4 z-40">
      <div
        className={cn(
          'pointer-events-auto flex items-center gap-2 rounded-full border px-3 py-2 shadow-soft',
          'bg-white/95 backdrop-blur',
          online ? 'border-success-100' : 'border-warning-100',
        )}
        role="status"
        aria-live="polite"
      >
        <span
          className={cn('h-2.5 w-2.5 shrink-0 rounded-full', online ? 'bg-success' : 'bg-warning')}
          aria-hidden="true"
        />
        {online ? (
          <Wifi className="h-4 w-4 text-success" aria-hidden="true" />
        ) : (
          <CloudOff className="h-4 w-4 text-warning-600" aria-hidden="true" />
        )}

        <span className="text-xs font-medium text-slate-700">
          {online ? t('online.online') : t('online.offline')}
        </span>

        {pending > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {t('online.syncPending', { count: pending })}
          </span>
        )}

        {state === 'syncing' && (
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
        )}

        {showSyncButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={syncNow}
            className="h-8 min-h-0 px-2 text-xs"
            aria-label={t('online.syncNow')}
          >
            {t('online.syncNow')}
          </Button>
        )}
      </div>
    </div>
  );
}
