import { useCallback, useEffect, useRef, useState } from 'react';
import { checkServiceHealth } from '../services/health';

export function useServiceHealth() {
  const active = useRef(/** @type {AbortController | null} */ (null));
  const [checking, setChecking] = useState(true);
  const [report, setReport] = useState(/** @type {import('../services/health').HealthReport | null} */ (null));
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const check = useCallback(() => {
    active.current?.abort();
    setChecking(true);
    setReport(null);
    setError('');
    setAttempt((previous) => previous + 1);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    void checkServiceHealth({ signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) {
        setReport(result);
        setChecking(false);
      }
    }, () => {
      if (!controller.signal.aborted) {
        setError('The check could not finish. Please try again.');
        setChecking(false);
      }
    });
    return () => controller.abort();
  }, [attempt]);
  return { checking, report, error, check };
}
