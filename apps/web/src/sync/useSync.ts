/**
 * Sync engine-ийн төлөвийг React-д холбоно.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { syncEngine, type SyncStatusSnapshot } from './engine';

export function useSyncStatus(): SyncStatusSnapshot & { syncNow: () => void } {
  const snapshot = useSyncExternalStore(
    (listener) => syncEngine.subscribe(() => listener()),
    () => syncEngine.getSnapshot(),
    () => syncEngine.getSnapshot(),
  );

  const syncNow = useCallback(() => {
    void syncEngine.syncNow();
  }, []);

  return { ...snapshot, syncNow };
}
