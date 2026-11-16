import { ApiError } from '../../api/client.js';
import { parseTokens, parseUser } from './contracts.js';

/** @typedef {import('./contracts.js').User} User */
/** @typedef {import('./contracts.js').Tokens} Tokens */
/** @typedef {{ scope: string, tokens: Tokens, refreshPending: boolean }} SavedSession */
/** @typedef {{ read: () => Promise<string | null>, write: (value: string) => Promise<void>, clear: () => Promise<void> }} SessionStorage */
/** @typedef {{ status: 'restoring' | 'anonymous' | 'authenticated' | 'blocked', user: User | null, message: string, recovery?: 'storage' }} AuthState */
const expired = () => new ApiError('Your session ended. Please sign in again.', 'http', 401);

/**
 * All session/profile operations share a queue. Only one refresh may rotate a
 * token at a time. Epoch checks reject results arriving after local sign-out.
 * @param {{ client: ReturnType<typeof import('../../api/client.js').createApiClient>, storage: SessionStorage, getScope: () => string, now?: () => number }} dependencies
 */
export function createSessionManager({ client, storage, getScope, now = Date.now }) {
  let state = /** @type {AuthState} */ ({ status: 'restoring', user: null, message: '' });
  let saved = /** @type {SavedSession | null} */ (null);
  let epoch = 0;
  let queue = Promise.resolve();
  const listeners = new Set();
  /** @param {AuthState} next */
  const publish = (next) => { state = next; for (const fn of listeners) fn(); };
  /** @template T @param {() => Promise<T>} work @returns {Promise<T>} */
  const serial = (work) => { const result = queue.then(work); queue = result.then(() => {}, () => {}); return result; };
  /** @param {number} expected */
  const current = (expected) => { if (epoch !== expected) throw expired(); };
  /** @param {string} message */
  async function clear(message) {
    saved = null;
    try { await storage.clear(); publish({ status: 'anonymous', user: null, message }); }
    catch { publish({ status: 'blocked', user: null, recovery: 'storage', message: 'Secure storage could not be cleared. Please retry sign-out.' }); throw new ApiError('Secure storage is unavailable. Please retry.', 'configuration'); }
  }
  /** @param {SavedSession} value @param {number} expected */
  async function persist(value, expected) {
    current(expected);
    await storage.write(JSON.stringify(value));
    current(expected);
    saved = value;
  }
  /** @param {number} expected @returns {Promise<Tokens>} */
  async function refresh(expected) {
    current(expected);
    if (!saved || Date.parse(saved.tokens.sessionExpiresAt) <= now()) { await clear('Your session ended. Please sign in again.'); throw expired(); }
    const old = saved;
    // Persist intent before dispatch: a crash or ambiguous response must never
    // replay the old refresh token after a server-side rotation.
    await persist({ ...old, refreshPending: true }, expected);
    try {
      const tokens = parseTokens(await client.request('/auth/refresh', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: old.tokens.refreshToken }) }));
      await persist({ ...old, tokens, refreshPending: false }, expected);
      return tokens;
    } catch (error) {
      if (epoch === expected) await clear('The session could not be renewed safely. Please sign in again.');
      throw error;
    }
  }
  /** @param {string} path @param {RequestInit} options @param {number} expected */
  async function authorized(path, options, expected) {
    current(expected);
    if (!saved || saved.scope !== getScope()) { await clear('Please sign in again.'); throw expired(); }
    if (Date.parse(saved.tokens.accessExpiresAt) <= now() + 15_000) await refresh(expected);
    const used = saved;
    if (!used) throw expired();
    const send = () => client.request(path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${saved?.tokens.accessToken}` } });
    try { const value = await send(); current(expected); return value; }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || epoch !== expected) throw error;
      await refresh(expected);
      // Only reads are automatically retried. Never replay profile writes.
      if (options.method && options.method !== 'GET') throw new ApiError('Your session was renewed. Please save your changes again.', 'http', 409);
      try { const value = await send(); current(expected); return value; }
      catch (retryError) {
        if (epoch === expected && retryError instanceof ApiError && retryError.status === 401) await clear('Your session ended. Please sign in again.');
        throw retryError;
      }
    }
  }
  return {
    getSnapshot: () => state,
    /** @param {() => void} listener */
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    restore() {
      const expected = ++epoch;
      publish({ status: 'restoring', user: null, message: '' });
      return serial(async () => {
        try {
          const raw = await storage.read(); current(expected);
          if (!raw) { saved = null; publish({ status: 'anonymous', user: null, message: '' }); return; }
          let value;
          try {
            const parsed = JSON.parse(raw);
            value = { scope: parsed.scope, tokens: parseTokens(parsed.tokens), refreshPending: parsed.refreshPending };
            if (value.scope !== getScope() || value.refreshPending !== false) throw expired();
          } catch { await clear('Please sign in again.'); return; }
          saved = value;
          const user = parseUser(await authorized('/auth/me', {}, expected));
          current(expected); publish({ status: 'authenticated', user, message: '' });
        } catch (error) {
          if (epoch !== expected) return;
          if (state.status === 'anonymous' || state.status === 'blocked') return;
          publish({ status: 'blocked', user: null, message: error instanceof ApiError ? error.message : 'Your session could not be restored. Check your connection and retry.' });
        }
      });
    },
    /** @param {unknown} response @param {AbortSignal} [signal] */
    establish(response, signal) {
      const expected = ++epoch;
      return serial(async () => {
        const value = /** @type {{ user: unknown }} */ (response);
        const tokens = parseTokens(response); const user = parseUser(value.user);
        try {
          if (signal?.aborted) throw expired();
          await persist({ scope: getScope(), tokens, refreshPending: false }, expected);
          if (signal?.aborted) throw expired();
          publish({ status: 'authenticated', user, message: '' });
        } catch (error) { if (epoch === expected) await clear('Sign-in could not be stored securely. Please try again.'); throw error; }
      });
    },
    loadProfile() {
      const expected = epoch;
      return serial(async () => {
        const user = parseUser(await authorized('/auth/me', {}, expected));
        current(expected); publish({ status: 'authenticated', user, message: '' }); return user;
      });
    },
    /** @param {{ name: string | null, email: string | null, timezone: string }} input */
    updateProfile(input) {
      const expected = epoch;
      return serial(async () => {
        const user = parseUser(await authorized('/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }, expected));
        current(expected); publish({ status: 'authenticated', user, message: '' }); return user;
      });
    },
    logout() {
      ++epoch;
      const old = saved; saved = null;
      publish({ status: 'restoring', user: null, message: '' });
      return serial(async () => {
        await clear('');
        if (old) {
          if (old.scope !== getScope()) return;
          try { await client.request('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${old.tokens.accessToken}` } }); }
          catch { publish({ status: 'anonymous', user: null, message: 'Signed out on this device. Server sign-out could not be confirmed.' }); }
        }
      });
    },
  };
}
