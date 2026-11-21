import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';

// Immediate ref latch prevents double taps before React renders disabled controls.
export function useAsyncAction() {
  const active = useRef(/** @type {AbortController | null} */ (null));
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort(); }; }, []);
  const run = useCallback(/** @param {(signal: AbortSignal) => Promise<void>} work */ async (work) => {
    if (active.current) return false;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError('');
    try { await work(controller.signal); return !controller.signal.aborted; }
    catch (failure) {
      if (mounted.current && !controller.signal.aborted) setError(failure instanceof ApiError ? failure.message : 'This action could not finish. Please try again.');
      return false;
    } finally { if (active.current === controller) active.current = null; if (mounted.current) setBusy(false); }
  }, []);
  return { busy, error, run, cancel: () => active.current?.abort(), clearError: () => setError('') };
}
