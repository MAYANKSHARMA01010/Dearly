import { migrateCache } from './database.js';
/** Fail closed: stock SQLite silently ignores an unsupported PRAGMA key.
 * @param {import('./database.js').CacheDatabase} db
 * @param {{readKey:()=>Promise<string|null>,writeKey:(key:string)=>Promise<void>,randomKey:()=>Promise<string>}} secrets */
export async function prepareCipherCache(db,secrets) {
  const cipher = await db.getFirstAsync('PRAGMA cipher_version');
  if (!cipher || !String(/** @type {{cipher_version?:string}} */(cipher).cipher_version ?? '')) throw new Error('Encrypted cache unavailable');
  let key = await secrets.readKey();
  if (!key) {
    key = await secrets.randomKey();
    if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('Invalid cache key');
    await secrets.writeKey(key);
  }
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('Invalid cache key');
  // PRAGMA cannot bind values. Only internally generated, validated hex may be
  // interpolated; all account/content values use parameterized SQL.
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
  await db.execAsync('PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; PRAGMA temp_store=MEMORY; PRAGMA max_page_count=4096;');
  await migrateCache(db);
}
