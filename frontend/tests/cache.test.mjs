import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareCipherCache } from '../src/services/cache/encryption.js';
import { migrateCache } from '../src/services/cache/database.js';
import { createCacheRepository } from '../src/services/cache/repository.js';
import { createCacheController } from '../src/services/cache/controller.js';
import { cacheTarget } from '../src/services/cache/policy.js';
const preferences = {inAppAlerts:true,pushAlerts:false,defaultPhoneChannel:'WHATSAPP'};
const account = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const scope = {account,origin:'https://api.example'};
const start = 1800000000000;
function database(path=':memory:') {
  const sql = new DatabaseSync(path);
  return {sql,db:{async execAsync(query) {sql.exec(query);},async runAsync(query,...params) {return sql.prepare(query).run(...params);},async getFirstAsync(query,...params) {return sql.prepare(query).get(...params) ?? null;}},async close() {sql.close();}};
}
async function setup() {const handle=database();await migrateCache(handle.db);let time=start;return {...handle,setTime(value){time=value;},repo:createCacheRepository(handle.db,scope,()=>time)};}

test('cache migrates once and persists across actual SQLite close/reopen',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dearly-cache-')); const path=join(dir,'test.db');
 try {let h=database(path);await migrateCache(h.db);const repo=createCacheRepository(h.db,scope,()=>start);await repo.write('preferences','self',preferences);await h.close();
 h=database(path);await migrateCache(h.db);assert.deepEqual((await createCacheRepository(h.db,scope,()=>start+1).read('preferences','self')).value,preferences);await h.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('migration failure rolls back schema/version; a future schema is rejected intact',async()=>{
 const h=database();const original=h.db.execAsync;
 h.db.execAsync=async sql=>{await original(sql);if(sql.includes('CREATE TABLE')) throw Error('test failure');};
 await assert.rejects(migrateCache(h.db));assert.equal(h.sql.prepare('PRAGMA user_version').get().user_version,0);assert.equal(h.sql.prepare("SELECT name FROM sqlite_master WHERE name='cache_entries'").get(),undefined);
 h.db.execAsync=original;await migrateCache(h.db);h.sql.exec('PRAGMA user_version=99');await assert.rejects(migrateCache(h.db));assert.equal(h.sql.prepare('PRAGMA user_version').get().user_version,99);await h.close();
});
test('expiry boundary and clock rollback clear data before reads',async()=>{
 const h=await setup();await h.repo.write('preferences','self',preferences);h.setTime(start+299999);assert.ok(await h.repo.read('preferences','self'));h.setTime(start+300000);assert.equal(await h.repo.read('preferences','self'),null);
 h.setTime(start+400000);await h.repo.write('preferences','self',preferences);h.setTime(start+399999);assert.equal(await h.repo.read('preferences','self'),null);await h.close();
});
test('account/backend isolation, parameter binding and purge do not leak records',async()=>{
 const h=await setup();const key="key'); DROP TABLE cache_entries;--";await h.repo.write('preferences',key,preferences);
 const other=createCacheRepository(h.db,{account:'other',origin:scope.origin},()=>start);assert.equal(await other.read('preferences',key),null);
 const server=createCacheRepository(h.db,{account,origin:'https://other.example'},()=>start);assert.equal(await server.read('preferences',key),null);await other.isolate();assert.equal(await h.repo.read('preferences',key),null);
 await other.write('preferences','self',preferences);await other.purge();assert.equal(h.sql.prepare('SELECT count(*) n FROM cache_entries').get().n,0);await h.close();
});
test('deletion tombstones reject older/equal in-flight snapshots and preserve version',async()=>{
 const h=await setup();await h.repo.write('preferences','self',preferences,{recordVersion:'v1'});h.setTime(start+10);await h.repo.write('preferences','self',null,{recordVersion:'v2',deleted:true});
 await h.repo.write('preferences','self',preferences,{fetchedAt:start});await h.repo.write('preferences','self',preferences,{fetchedAt:start+10});assert.equal(await h.repo.read('preferences','self'),null);
 const row=h.sql.prepare('SELECT record_version,deleted_at FROM cache_entries').get();assert.equal(row.record_version,'v2');assert.equal(row.deleted_at,start+10);await h.close();
});
test('malformed payload, future/expired fetch times, oversized records and auth paths are rejected',async()=>{
 const h=await setup();for(const path of ['/auth/otp','/auth/refresh','/messages/drafts','/schedules/review','/messages/inbox/x','/messages/dashboard?extra=1'])assert.equal(cacheTarget(path),null);
 await h.repo.write('preferences','self',preferences,{fetchedAt:start+1});assert.equal(await h.repo.read('preferences','self'),null);
 await assert.rejects(h.repo.write('preferences','self',{accessToken:'secret'}));
 await h.repo.write('preferences','self',preferences);h.sql.exec("UPDATE cache_entries SET payload='invalid-json'");assert.equal(await h.repo.read('preferences','self'),null);
 const wrong={id:'other',phone:'+12025550123',name:'x',email:null,timezone:'UTC',phoneVerifiedAt:new Date(start).toISOString(),createdAt:new Date(start).toISOString()};await h.repo.write('profile','self',wrong);assert.equal(await h.repo.read('profile','self'),null);
 await h.close();
});
test('cache bounds retained records and excludes extra private fields',async()=>{
 const h=await setup();for(let i=0;i<205;i++)await h.repo.write('preferences',String(i),{...preferences,accessToken:'never-store'});
 assert.equal(h.sql.prepare('SELECT count(*) n FROM cache_entries').get().n,200);assert.equal(JSON.stringify(h.sql.prepare('SELECT * FROM cache_entries').all()).includes('never-store'),false);await h.close();
});
test('controller suspends stale in-flight reads and purges before account change',async()=>{
 let destroyed=0;let handle;const driver={async open(){handle=database();await migrateCache(handle.db);return handle;},async destroy(){destroyed++;}};
 const c=createCacheController(driver,()=>start);await c.activate(account,scope.origin);await c.capture('/notifications/preferences',preferences);assert.ok(await c.read('preferences','self'));
 const pending=c.read('preferences','self');c.suspend();assert.equal(await pending,null);
 await c.activate('other',scope.origin);assert.equal(await c.read('preferences','self'),null);assert.equal(destroyed,1);await c.purge();assert.equal(await c.read('preferences','self'),null);assert.equal(destroyed,2);
});
test('open/corruption/purge failure disables cache and can recover without affecting network work',async()=>{
 let failing=true;let handle;const c=createCacheController({async open(){if(failing)throw Error('disk unavailable');handle=database();await migrateCache(handle.db);return handle;},async destroy(){}},()=>start);
 await c.activate(account,scope.origin);assert.equal(await c.read('preferences','self'),null);failing=false;await c.activate(account,scope.origin);await c.capture('/notifications/preferences',preferences);assert.ok(await c.read('preferences','self'));await c.purge();
});


test('cipher guard refuses stock SQLite before reading a key or writing schema; rejects unsafe keys',async()=>{
 const h=database();let keyRead=false;const secrets={async readKey(){keyRead=true;return "x'; DROP TABLE cache_entries;--";},async writeKey(){assert.fail('Unexpected key write');},async randomKey(){assert.fail('Unexpected generation');}};
 await assert.rejects(prepareCipherCache(h.db,secrets),/Encrypted cache unavailable/);assert.equal(keyRead,false);assert.equal(h.sql.prepare('PRAGMA user_version').get().user_version,0);
 const real=h.db.getFirstAsync;h.db.getFirstAsync=async(sql,...args)=>sql==='PRAGMA cipher_version'?{cipher_version:'test-only'}:real(sql,...args);
 await assert.rejects(prepareCipherCache(h.db,secrets),/Invalid cache key/);assert.equal(h.sql.prepare('PRAGMA user_version').get().user_version,0);await h.close();
});
