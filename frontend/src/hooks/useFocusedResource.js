import { useMemo, useCallback, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { createReadResource } from '../services/mailboxes/resource';
/** @template T @param {(signal:AbortSignal)=>Promise<T>} load */
export function useFocusedResource(load) {
  const model = useMemo(() => createReadResource(load), [load]);
  useFocusEffect(
    useCallback(() => {
      void model.start();
      return () => model.stop();
    }, [model]),
  );
  const state = useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
  return { ...state, refresh: model.refresh };
}
