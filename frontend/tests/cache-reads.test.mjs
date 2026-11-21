import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {createCachedReads} from '../src/services/cache/reads.js';
import {createReadResource} from '../src/services/mailboxes/resource.js';
import {createCacheController} from '../src/services/cache/controller.js';
import {migrateCache} from '../src/services/cache/database.js';
import {ApiError} from '../src/api/client.js';
const path='/notifications/preferences';
const value={inAppAlerts:true,pushAlerts:false,defaultPhoneChannel:'WHATSAPP'};
const start=1800000000000;
const until=async(fn)=>{for(let n=0;n<100;n++){if(fn())return;await new Promise(r=>setTimeout(r,1));}assert.fail('Timed out');};
async function setup(){
 let time=start;let calls=0;let network=async()=>value;let allow=true;
 const sql=new DatabaseSync(':memory:');const db={async execAsync(q){sql.exec(q);},async runAsync(q,...p){return sql.prepare(q).run(...p);},async getFirstAsync(q,...p){return sql.prepare(q).get(...p)??null;}};
 const cache=createCacheController({async open(){await migrateCache(db);return{db,async close(){}};},async destroy(){sql.exec('DELETE FROM cache_entries');}},()=>time);
 await cache.activate('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','https://api.example');
 const reads=createCachedReads({cache,now:()=>time,canRead:()=>allow,validUntil:()=>start+60000,async load(p,o){calls++;return network(p,o);}});
 return{reads,cache,setNetwork(fn){network=fn;},setTime(t){time=t;},setAllowed(v){allow=v;},get calls(){return calls;},close(){sql.close();}};
}
test('repeat navigation reduces three protected reads to one; manual refresh and expiry go remote',async()=>{
 const h=await setup();await h.reads.read(path);assert.equal(h.reads.getInfo(path).source,'server');await h.reads.read(path);await h.reads.read(path);assert.equal(h.calls,1);assert.equal(h.reads.getInfo(path).source,'device');
 await h.reads.read(path,{cache:'reload'});assert.equal(h.calls,2);h.setTime(start+60000);await h.reads.read(path);assert.equal(h.calls,3);h.close();
});
test('concurrent reads coalesce while each cancellation remains independent',async()=>{
 const h=await setup();let finish;h.setNetwork(()=>new Promise(r=>{finish=r;}));
 const a=new AbortController(),b=new AbortController();const first=h.reads.read(path,{signal:a.signal});const second=h.reads.read(path,{signal:b.signal});await until(()=>finish);a.abort();await assert.rejects(first,e=>e.kind==='aborted');finish(value);assert.deepEqual(await second,value);assert.equal(h.calls,1);h.close();
});
test('aborting all readers cancels transport; replacement request does not join an aborted flight',async()=>{
 const h=await setup();let attempts=0;h.setNetwork((_p,o)=>{attempts++;if(attempts===2)return value;return new Promise((_r,reject)=>o.signal.addEventListener('abort',()=>reject(new ApiError('Canceled','aborted'))));});
 const c=new AbortController();const first=h.reads.read(path,{signal:c.signal});await until(()=>attempts===1);c.abort();await assert.rejects(first);assert.deepEqual(await h.reads.read(path),value);assert.equal(h.calls,2);h.close();
});
test('invalidation removes saved copies and cancels old reads before they can repopulate cache',async()=>{
 const h=await setup();let finish;h.setNetwork(()=>new Promise(r=>{finish=r;}));const old=h.reads.read(path);await until(()=>finish);await h.reads.invalidate();finish(value);await assert.rejects(old,e=>e.kind==='aborted');assert.equal(await h.cache.read('preferences','self'),null);
 h.setNetwork(async()=>({...value,pushAlerts:true}));assert.equal((await h.reads.read(path)).pushAlerts,true);h.close();
});
test('access denial removes saved data; failures use backoff without replaying a write',async()=>{
 const h=await setup();await h.reads.read(path);h.setNetwork(async()=>{throw new ApiError('Denied','http',404);});await assert.rejects(h.reads.read(path,{cache:'reload'}));assert.equal(await h.cache.read('preferences','self'),null);
 h.setNetwork(async()=>{throw new ApiError('Offline','network');});await assert.rejects(h.reads.read(path));const count=h.calls;await assert.rejects(h.reads.read(path),e=>e.status===429);assert.equal(h.calls,count);h.setTime(start+2000);await assert.rejects(h.reads.read(path));assert.equal(h.calls,count+1);h.close();
});
test('expired auth window/account transitions never serve cached private data',async()=>{
 const h=await setup();await h.reads.read(path);h.setTime(start+60000);h.setNetwork(async()=>{throw new ApiError('Offline','network');});await assert.rejects(h.reads.read(path));assert.equal(h.calls,2);
 h.setAllowed(false);await assert.rejects(h.reads.read(path),e=>e.kind==='aborted');h.close();
});
test('resource hides data exactly at its deadline and stops its timers when unfocused',async()=>{
 let time=start,info={source:'device',fetchedAt:start,expiresAt:start+60000};const timers=new Map();let next=0,calls=0;
 const model=createReadResource(async()=>{calls++;if(calls>1)throw new ApiError('Offline','network');return 'private';},{getInfo:()=>info,now:()=>time,setTimer:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimer:id=>timers.delete(id)});
 await model.start();assert.equal(model.getSnapshot().data,'private');time=start+60000;const expire=[...timers.values()][0];expire.fn();await until(()=>!model.getSnapshot().loading);assert.equal(model.getSnapshot().data,null);assert.ok(model.getSnapshot().error);model.stop();assert.equal(timers.size<=1,true);assert.equal(model.getSnapshot().data,null);
});
test('mailbox cache keys separate filters and reject pagination or unsupported query parameters',async()=>{
 const {cacheTarget}=await import('../src/services/cache/policy.js');const a=cacheTarget('/messages/mailboxes?box=received&limit=20&read=unopened');const b=cacheTarget('/messages/mailboxes?box=received&limit=20&read=opened');assert.notEqual(a.key,b.key);
 for(const q of ['box=received&limit=20&cursor=private','box=bad&limit=20','box=sent&box=received&limit=20','box=sent&limit=20&extra=1'])assert.equal(cacheTarget('/messages/mailboxes?'+q),null);
});
