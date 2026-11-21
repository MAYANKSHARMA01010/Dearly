import { createCacheRepository } from './repository.js';
import { cacheTarget } from './policy.js';
/** @typedef {{db:import('./database.js').CacheDatabase,close:()=>Promise<void>}} Handle */
/** Cache operations use a separate queue from auth. A synchronous lease change
 * prevents an old in-flight read/write from becoming visible after sign-out.
 * @param {{open:()=>Promise<Handle>,destroy:()=>Promise<void>}} driver
 * @param {()=>number} [now] */
export function createCacheController(driver, now = Date.now) {
  let generation = 0;
  let enabled = false;
  let handle = /** @type {Handle|null} */ (null);
  let repository = /** @type {ReturnType<typeof createCacheRepository>|null} */ (null);
  let identity = '';
  let mustPurge = false;
  let queue = Promise.resolve();
  /** @template T @param {()=>Promise<T>} work @returns {Promise<T|null>} */
  function serial(work) { const result = queue.then(work).catch(() => null); queue = result.then(() => {}); return result; }
  function suspend() { generation++; enabled = false; }
  async function dispose() {
    repository = null; identity = '';
    const old = handle; handle = null;
    try { await old?.close(); } finally { await driver.destroy(); }
  }
  return {
    suspend,
    /** Call only after remote identity verification, never with an offline profile.
     * @param {string} account @param {string} origin */
    activate(account,origin) {
      suspend(); const expected = generation;
      return serial(async () => {
        if (expected !== generation) return;
        try {
          if (mustPurge || (identity && identity !== JSON.stringify([account,origin]))) { await dispose(); mustPurge = false; }
          handle ??= await driver.open();
          if (expected !== generation) return;
          repository = createCacheRepository(handle.db,{account,origin},now);
          await repository.isolate();
          identity = JSON.stringify([account,origin]);
          enabled = expected === generation;
        } catch { repository = null; enabled = false; }
      });
    },
    /** No current screen reads this in Phase 20; Phase 21 owns refresh/UI rules.
     * @param {import('./policy.js').CacheKind} kind @param {string} key */
    read(kind,key) {
      const expected = generation;
      return serial(async () => {
        if (!enabled || expected !== generation || !repository) return null;
        try { const result = await repository.read(kind,key); return enabled && expected === generation ? result : null; }
        catch { enabled = false; return null; }
      });
    },
    /** @param {string} path @param {unknown} value */
    capture(path,value) {
      const expected = generation; const target = cacheTarget(path); const fetchedAt = now();
      return serial(async () => {
        if (!target || !enabled || expected !== generation || !repository) return;
        try { const version = value && typeof value === 'object' && 'version' in value ? String(value.version) : String(fetchedAt);
          await repository.write(target.kind,target.key,value,{fetchedAt,recordVersion:version}); }
        catch { enabled = false; }
      });
    },
    purge() {
      suspend(); mustPurge = true;
      return serial(async () => { await dispose(); mustPurge = false; });
    },
  };
}
