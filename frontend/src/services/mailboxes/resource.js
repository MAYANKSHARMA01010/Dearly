import { ApiError } from '../../api/client.js';
/** @param {unknown} failure */
export const isAccessDenial = (failure) =>
  failure instanceof ApiError &&
  failure.kind === 'http' &&
  [401, 403, 404].includes(failure.status ?? 0);
/** Latest-focus read wins; stopped resources discard private content and late responses.
 * @template T @param {(signal:AbortSignal)=>Promise<T>} load */
export function createReadResource(load) {
  let state = /** @type {{data:T|null,loading:boolean,error:string}} */ ({
    data: null,
    loading: true,
    error: '',
  });
  let enabled = true;
  let active = /** @type {AbortController|null} */ (null);
  const listeners = new Set();
  const publish = () => {
    for (const listener of listeners) listener();
  };
  const model = {
    getSnapshot: () => state,
    /** @param {()=>void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async refresh() {
      if (!enabled) return false;
      active?.abort();
      const c = new AbortController();
      active = c;
      state = { ...state, loading: true, error: '' };
      publish();
      try {
        const data = await load(c.signal);
        if (active !== c || c.signal.aborted) return false;
        state = { data, loading: false, error: '' };
        publish();
        return true;
      } catch (failure) {
        if (active === c && !c.signal.aborted) {
          state = {
            ...state,
            data: isAccessDenial(failure) ? null : state.data,
            loading: false,
            error:
              failure instanceof ApiError
                ? failure.message
                : 'Messages could not be loaded. Please try again.',
          };
          publish();
        }
        return false;
      } finally {
        if (active === c) active = null;
      }
    },
    start() {
      enabled = true;
      return model.refresh();
    },
    stop() {
      enabled = false;
      active?.abort();
      active = null;
      state = { data: null, loading: false, error: '' };
      publish();
    },
  };
  return model;
}
