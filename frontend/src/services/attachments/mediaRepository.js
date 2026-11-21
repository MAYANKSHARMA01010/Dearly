/** @typedef {import('../cache/database.js').CacheDatabase} Database */
/** @typedef {{key:string,account:string,origin:string,path:string,attachmentId:string,sha256:string,mime:string,bytes:number,cipherBytes:number,file:string,expiresAt:number,lastAccess:number,checkedUntil:number}} MediaRecord */
export const mediaLimit=250*1024*1024;
export const mediaRetention=7*86400000;
/** Separate, encrypted metadata database; never store media bytes in SQLite.
 * @param {Database} db */
export async function migrateMedia(db) {
  const row=/** @type {{user_version:number}|null} */(await db.getFirstAsync('PRAGMA user_version'));
  if(!row || row.user_version>1)throw Error('Unsupported media schema');
  if(row.user_version===1)return;
  await db.execAsync('BEGIN IMMEDIATE');
  try{
    await db.execAsync(`CREATE TABLE media_files (key TEXT PRIMARY KEY,account TEXT NOT NULL,origin TEXT NOT NULL,path TEXT NOT NULL,attachmentId TEXT NOT NULL,sha256 TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,cipherBytes INTEGER NOT NULL,file TEXT NOT NULL,expiresAt INTEGER NOT NULL,lastAccess INTEGER NOT NULL,checkedUntil INTEGER NOT NULL);
      CREATE TABLE media_clock (id INTEGER PRIMARY KEY CHECK(id=1),lastSeen INTEGER NOT NULL);
      PRAGMA user_version=1;`);
    await db.execAsync('COMMIT');
  }catch(error){await db.execAsync('ROLLBACK');throw error;}
}
/** @param {Database & {getAllAsync:<T>(sql:string,...params:(string|number|null)[])=>Promise<T[]>}} db */
export function createMediaRepository(db){
 return {
  /** @param {string} key @returns {Promise<MediaRecord|null>} */
  read:key=>db.getFirstAsync('SELECT * FROM media_files WHERE key=?',key),
  /** @returns {Promise<MediaRecord[]>} */
  all:()=>db.getAllAsync('SELECT * FROM media_files ORDER BY lastAccess,key'),
  /** @param {string} key */
  remove:key=>db.runAsync('DELETE FROM media_files WHERE key=?',key),
  /** @param {MediaRecord} r */
  put:r=>db.runAsync('INSERT OR REPLACE INTO media_files(key,account,origin,path,attachmentId,sha256,mime,bytes,cipherBytes,file,expiresAt,lastAccess,checkedUntil) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',r.key,r.account,r.origin,r.path,r.attachmentId,r.sha256,r.mime,r.bytes,r.cipherBytes,r.file,r.expiresAt,r.lastAccess,r.checkedUntil),
  /** @param {number} now */
  async clock(now){const r=/** @type {{lastSeen:number}|null} */(await db.getFirstAsync('SELECT lastSeen FROM media_clock WHERE id=1'));await db.runAsync('INSERT OR REPLACE INTO media_clock(id,lastSeen) VALUES(1,?)',now);return !r || now>=r.lastSeen;},
 };
}
