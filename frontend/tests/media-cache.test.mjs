import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {createPersistentMedia} from '../src/services/attachments/mediaCache.js';
import {createMediaRepository,migrateMedia,mediaRetention} from '../src/services/attachments/mediaRepository.js';
const now=1800000000000,scope={account:'account-a',origin:'https://a.example'};
const item={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',name:'test.png',mime:'image/png',bytes:12,state:'READY',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+1000).toISOString()};
async function fixture(){
 let time=now,calls=0,accessCalls=0,next=0,digest='a'.repeat(64),deny=false,corrupt=false,free=1e9,sealFail=false,sealedSize=40;
 const sql=new DatabaseSync(':memory:');const db={async execAsync(q){sql.exec(q);},async runAsync(q,...v){return sql.prepare(q).run(...v);},async getFirstAsync(q,...v){return sql.prepare(q).get(...v)??null;},async getAllAsync(q,...v){return sql.prepare(q).all(...v);}};await migrateMedia(db);
 const files=new Set(),plain=new Set();
 const media=createPersistentMedia({async open(){return{repository:createMediaRepository(db),async close(){},async seal(_from,to){files.add(to);if(sealFail)throw Error('failed seal');return sealedSize;},async unseal(_from,to){if(corrupt){corrupt=false;throw Error('tampered');}plain.add(to);}};},async destroy(){files.clear();plain.clear();sql.exec('DELETE FROM media_files; DELETE FROM media_clock');},async exists(f){return files.has(f);},async remove(f){files.delete(f);plain.delete(f);},async files(){return[...files];},async playback(){return[...plain];},async space(){return free;},async key(value){return createHash('sha256').update(value).digest('hex');},temporary(){return 'plain-'+(++next);}},()=>time);
 const authorize=async()=>{accessCalls++;if(deny)throw Error('Denied');return{id:item.id,mime:item.mime,bytes:item.bytes,sha256:digest,checkedAt:new Date(time).toISOString(),expiresAt:new Date(time+300000).toISOString()};};
 const download=async()=>{calls++;plain.add('download');return'download';};
 const open=(s=scope,signal=new AbortController().signal)=>media.open(s,'/content',item,authorize,download,signal);
 return{media,sql,files,plain,open,authorize,download,get calls(){return calls;},get accessCalls(){return accessCalls;},clock:t=>time=t,digest:d=>digest=d,deny:v=>deny=v,corrupt:()=>corrupt=true,space:n=>free=n,failSeal:()=>sealFail=true,sealSize:v=>sealedSize=v,openPath:p=>media.open(scope,p,item,authorize,download,new AbortController().signal)};
}
test('valid repeat opens revalidate access without redownloading; release removes only plaintext',async()=>{
 const h=await fixture();const first=await h.open();assert.equal(h.media.info(first).cacheHit,false);await h.media.release(first);assert.equal(h.plain.size,0);assert.equal(h.files.size,1);
 const second=await h.open();assert.equal(h.calls,1);assert.equal(h.accessCalls,2);assert.equal(h.media.info(second).cacheHit,true);assert.equal((await h.media.stats(scope)).count,1);await h.media.clear();h.sql.close();
});
test('missing, changed and corrupt files are redownloaded; denied access evicts the saved file',async()=>{
 const h=await fixture();await h.open();h.files.clear();await h.open();assert.equal(h.calls,2);h.digest('b'.repeat(64));await h.open();assert.equal(h.files.size,1);assert.equal(h.calls,3);h.corrupt();await h.open();assert.equal(h.calls,4);h.deny(true);await assert.rejects(h.open());assert.equal(h.files.size,0);await h.media.clear();h.sql.close();
});
test('retention, clock rollback, namespaces and orphan cleanup do not expose old bytes',async()=>{
 const h=await fixture();await h.open();h.files.add('orphan');await h.media.stats(scope);assert.equal(h.files.has('orphan'),false);
 h.clock(now+mediaRetention);await h.open();assert.equal(h.calls,2);h.clock(now-1);await h.open();assert.equal(h.calls,3);await h.open({account:'account-b',origin:scope.origin});assert.equal(h.calls,4);await h.media.clear();assert.equal(h.files.size,0);assert.equal(h.plain.size,0);h.sql.close();
});
test('low disk, failed encryption and cancellation leave no committed download',async()=>{
 const h=await fixture();h.space(0);await assert.rejects(h.open());assert.equal(h.calls,0);h.space(1e9);h.failSeal();await assert.rejects(h.open());assert.equal(h.files.size,0);assert.equal(h.plain.size,0);
 const c=new AbortController();c.abort();await assert.rejects(h.open(scope,c.signal));assert.equal((await h.media.stats(scope)).count,0);await h.media.clear();h.sql.close();
});


test('least-recently-used files are evicted before exceeding the 250 MB quota',async()=>{
 const h=await fixture();h.sealSize(60*1024*1024);
 for(let n=0;n<5;n++){h.clock(now+n);const uri=await h.openPath('/content/'+n);await h.media.release(uri);}
 const stats=await h.media.stats(scope);assert.equal(stats.count,4);assert.ok(stats.bytes<=stats.limit);assert.equal(h.sql.prepare("SELECT count(*) n FROM media_files WHERE path='/content/0'").get().n,0);
 await h.media.clear();h.sql.close();
});

test('cancellation during a transfer and queued clear revoke plaintext and remove partial work',async()=>{
 const h=await fixture();let finish;const gate=new Promise(resolve=>{finish=resolve;});let began;const started=new Promise(resolve=>{began=resolve;});
 const opening=h.media.open(scope,'/content',item,h.authorize,async()=>{const source=await h.download();began();await gate;return source;},new AbortController().signal);
 await started;const clearing=h.media.clear();finish();await assert.rejects(opening,{kind:'aborted'});await clearing;
 assert.equal(h.files.size,0);assert.equal(h.plain.size,0);assert.equal(h.sql.prepare('SELECT count(*) n FROM media_files').get().n,0);h.sql.close();
});
