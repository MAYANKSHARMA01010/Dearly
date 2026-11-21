import { sanitizeCacheValue, ttl } from './policy.js';
/** @typedef {import('./database.js').CacheDatabase} CacheDatabase */
/** @typedef {import('./policy.js').CacheKind} CacheKind */
/** @typedef {{account:string,origin:string}} CacheScope */
/** @typedef {{payload:string|null,record_version:string,fetched_at:number,expires_at:number,deleted_at:number|null}} Row */
/** One owner serializes this connection, including migrations and lifecycle work.
 * @param {CacheDatabase} db @param {CacheScope} scope @param {()=>number} [now] */
export function createCacheRepository(db, scope, now = Date.now) {
  if (!scope.account || !/^https?:\/\//.test(scope.origin)) throw new Error('Invalid cache scope');
  const parameters = (/** @type {CacheKind} */ kind, /** @type {string} */ key) => [scope.account, scope.origin, kind, key];
  async function prune() {
    const time = now();
    if (!Number.isSafeInteger(time) || time < 0) throw new Error('Invalid cache clock');
    const clock = await db.getFirstAsync('SELECT last_seen FROM cache_clock WHERE id=1');
    if (clock && Number(/** @type {{last_seen:number}} */(clock).last_seen) > time) await db.execAsync('DELETE FROM cache_entries');
    await db.runAsync('INSERT INTO cache_clock(id,last_seen) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen', time);
    await db.runAsync('DELETE FROM cache_entries WHERE expires_at<=?', time);
    return time;
  }
  return {
    async isolate() { await db.runAsync('DELETE FROM cache_entries WHERE account<>? OR origin<>?', scope.account, scope.origin); await prune(); },
    /** @param {CacheKind} kind @param {string} key */
    async read(kind, key) {
      const time = await prune();
      const row = /** @type {Row|null} */ (await db.getFirstAsync('SELECT payload,record_version,fetched_at,expires_at,deleted_at FROM cache_entries WHERE account=? AND origin=? AND kind=? AND record_key=?', ...parameters(kind,key)));
      if (!row || !Number.isSafeInteger(row.fetched_at) || !Number.isSafeInteger(row.expires_at) || typeof row.record_version !== 'string' || row.deleted_at !== null || row.fetched_at > time || row.expires_at <= time || row.expires_at > row.fetched_at + ttl[kind]) return null;
      try { return { value: sanitizeCacheValue(kind,JSON.parse(row.payload ?? 'null'),time,key), fetchedAt:row.fetched_at, expiresAt:row.expires_at, recordVersion:row.record_version }; }
      catch { await db.runAsync('DELETE FROM cache_entries WHERE account=? AND origin=? AND kind=? AND record_key=?', ...parameters(kind,key)); return null; }
    },
    /** @param {CacheKind} kind @param {string} key @param {unknown} value @param {{fetchedAt?:number,recordVersion?:string,deleted?:boolean}} [metadata] */
    async write(kind, key, value, metadata = {}) {
      const time = await prune();
      const fetched = metadata.fetchedAt ?? time;
      if (!Object.hasOwn(ttl,kind) || !key || key.length > 100 || !Number.isSafeInteger(fetched) || fetched > time || fetched + ttl[kind] <= time) return;
      const payload = metadata.deleted ? null : JSON.stringify(sanitizeCacheValue(kind,value,time,key));
      if (payload && payload.length * 4 > 131072) return;
      if (!metadata.deleted && (kind === 'profile' || kind === 'owned' || kind === 'received')) {
        const id = /** @type {{id?:string}} */(JSON.parse(payload ?? '{}')).id;
        if (id !== (kind === 'profile' ? scope.account : key)) return;
      }
      const version = metadata.recordVersion ?? String(fetched);
      if (!version || version.length > 100) return;
      await db.runAsync(`INSERT INTO cache_entries(account,origin,kind,record_key,payload,record_version,fetched_at,expires_at,deleted_at)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(account,origin,kind,record_key) DO UPDATE SET
        payload=excluded.payload,record_version=excluded.record_version,fetched_at=excluded.fetched_at,
        expires_at=excluded.expires_at,deleted_at=excluded.deleted_at
        WHERE excluded.fetched_at>cache_entries.fetched_at OR
          (excluded.fetched_at=cache_entries.fetched_at AND cache_entries.deleted_at IS NULL)`,
      ...parameters(kind,key), payload, version, fetched, fetched+ttl[kind],metadata.deleted ? time : null);
      // Bound retained payload to <=4 MiB worst-case UTF-8 and <=200 records.
      await db.execAsync(`DELETE FROM cache_entries WHERE rowid NOT IN
        (SELECT rowid FROM cache_entries ORDER BY fetched_at DESC,rowid DESC LIMIT 200)`);
      let size = await db.getFirstAsync('SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) AS bytes FROM cache_entries');
      while (Number(/** @type {{bytes:number}|null} */(size)?.bytes) > 4194304) {
        await db.execAsync('DELETE FROM cache_entries WHERE rowid=(SELECT rowid FROM cache_entries ORDER BY fetched_at,rowid LIMIT 1)');
        size = await db.getFirstAsync('SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) AS bytes FROM cache_entries');
      }
    },
    async purge() { await db.execAsync('DELETE FROM cache_entries; DELETE FROM cache_clock;'); },
  };
}
