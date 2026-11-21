import { useCallback, useEffect, useRef, useState } from 'react';

export function usePermissionPrompt() {
  const [kind, setKind] = useState(/** @type {'microphone'|'notifications'|null} */ (null));
  const resolve = useRef(/** @type {((allow:boolean)=>void)|null} */ (null));
  useEffect(() => () => { resolve.current?.(false); resolve.current = null; }, []);
  const explain = useCallback(/** @param {'microphone'|'notifications'} next */ (next) => new Promise(/** @param {(allow:boolean)=>void} done */ (done) => {
    resolve.current?.(false); resolve.current = done; setKind(next);
  }), []);
  const finish = useCallback(/** @param {boolean} allow */ (allow) => {
    const done = resolve.current; resolve.current = null; setKind(null); done?.(allow);
  }, []);
  return { kind, explain, finish };
}
