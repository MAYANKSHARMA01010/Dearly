/** @typedef {{execAsync:(sql:string)=>Promise<void>, runAsync:(sql:string,...params:(string|number|null)[])=>Promise<unknown>, getFirstAsync:<T>(sql:string,...params:(string|number|null)[])=>Promise<T|null>}} CacheDatabase */
export const schemaVersion = 1;
/** Only this disposable cache schema belongs here; never migrate server data.
 * @param {CacheDatabase} db */
export async function migrateCache(db) {
  const row = await db.getFirstAsync('PRAGMA user_version');
  const version = Number(/** @type {{user_version:number}|null} */(row)?.user_version);
  if (!Number.isInteger(version) || version < 0 || version > schemaVersion) throw new Error('Unsupported cache schema');
  if (version === schemaVersion) return;
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    await db.execAsync(`CREATE TABLE cache_entries (
      account TEXT NOT NULL, origin TEXT NOT NULL, kind TEXT NOT NULL, record_key TEXT NOT NULL,
      payload TEXT, record_version TEXT NOT NULL, fetched_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, deleted_at INTEGER,
      PRIMARY KEY (account, origin, kind, record_key)
    );
    CREATE INDEX cache_expiry ON cache_entries(expires_at);
    CREATE TABLE cache_clock (id INTEGER PRIMARY KEY CHECK(id=1), last_seen INTEGER NOT NULL);
    PRAGMA user_version = 1;`);
    await db.execAsync('COMMIT');
  } catch (error) { await db.execAsync('ROLLBACK'); throw error; }
}
