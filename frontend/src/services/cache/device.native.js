import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { prepareCipherCache } from './encryption.js';
import { createCacheController } from './controller.js';
const databaseName = 'dearly-private-cache-v1.db';
const keyName = 'dearly.cache.cipher-key.v1';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
/** Fail closed before creating tables: stock SQLite silently ignores PRAGMA key. */
async function open() {
  const db = await SQLite.openDatabaseAsync(databaseName,{useNewConnection:true});
  try {
    await prepareCipherCache(db,{
      readKey:()=>SecureStore.getItemAsync(keyName,options),
      writeKey:key=>SecureStore.setItemAsync(keyName,key,options),
      randomKey:async()=>Array.from(await Crypto.getRandomBytesAsync(32),x=>x.toString(16).padStart(2,'0')).join(''),
    });
    return { db,close:()=>db.closeAsync() };
  } catch { await db.closeAsync().catch(()=>{}); throw new Error('Private cache unavailable'); }
}
export const privateCache = createCacheController({open,async destroy() {
  // Remove the decryption key before removing this disposable database. Do not
  // claim physical erasure of flash storage or delete any other application's DB.
  await SecureStore.deleteItemAsync(keyName,options);
  await SQLite.deleteDatabaseAsync(databaseName);
}});
