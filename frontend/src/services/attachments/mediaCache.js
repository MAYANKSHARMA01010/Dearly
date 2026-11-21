import {ApiError} from '../../api/client.js';
import {mediaLimit,mediaRetention} from './mediaRepository.js';
/** @typedef {import('./mediaRepository.js').MediaRecord} MediaRecord */
/** @typedef {{account:string,origin:string}} Scope */
/** @typedef {{id:string,sha256:string,bytes:number,mime:string,checkedAt:string,expiresAt:string}} Access */
/** @param {unknown} value @param {import('./contracts.js').Attachment} item @returns {Access} */
export function parseMediaAccess(value,item){
 const a=/** @type {Access|null} */(value);
 if(!a || a.id!==item.id || a.bytes!==item.bytes || a.mime!==item.mime || !/^[a-f0-9]{64}$/.test(a.sha256) ||
  !Number.isFinite(Date.parse(a.checkedAt)) || !Number.isFinite(Date.parse(a.expiresAt)) || Date.parse(a.expiresAt)<=Date.parse(a.checkedAt) || Date.parse(a.expiresAt)-Date.parse(a.checkedAt)>300000)
  throw new ApiError('Attachment changed or is unavailable. Refresh the message before opening it.','invalid_response');
 return a;
}
/** @typedef {{repository:ReturnType<typeof import('./mediaRepository.js').createMediaRepository>,seal:(source:string,target:string,digest:string,bytes:number)=>Promise<number>,unseal:(source:string,target:string,digest:string,bytes:number)=>Promise<void>,close:()=>Promise<void>}} MediaHandle */
/** @typedef {{open:()=>Promise<MediaHandle>,destroy:()=>Promise<void>,exists:(file:string)=>Promise<boolean>,remove:(file:string)=>Promise<void>,files:()=>Promise<string[]>,playback:()=>Promise<string[]>,space:()=>Promise<number>,key:(value:string)=>Promise<string>,temporary:(mime:string)=>string}} MediaDriver */
/** All file/index operations share a queue. Epoch checks also run after native
 * encryption calls, so canceled/logged-out work cannot expose a decrypted file.
 * @param {MediaDriver} driver @param {()=>number} [now] */
export function createPersistentMedia(driver,now=Date.now){
 let handle=/** @type {MediaHandle|null} */(null),identity='',generation=0;
 let queue=Promise.resolve();
 const views=/** @type {Map<string,{expiresAt:number,cacheHit:boolean}>} */(new Map());
 const tasks=new Set();
 /** @template T @param {()=>Promise<T>} work */
 const serial=work=>{const result=queue.then(work);queue=result.then(()=>{},()=>{});return result;};
 const canceled=()=>new ApiError('Attachment opening was canceled.','aborted');
 async function erase(/** @type {MediaRecord} */ r){await driver.remove(r.file);await handle?.repository.remove(r.key);}
 async function sweep(/** @type {Scope} */ scope){
  if(!handle)return;
  const validClock=await handle.repository.clock(now());
  for(const row of await handle.repository.all())if(!validClock || row.account!==scope.account || row.origin!==scope.origin || row.expiresAt<=now() || !await driver.exists(row.file))await erase(row);
  const known=new Set((await handle.repository.all()).map(r=>r.file));
  for(const file of await driver.files())if(!known.has(file))await driver.remove(file);
 }
 async function owned(/** @type {Scope} */ scope){
  const next=JSON.stringify([scope.account,scope.origin]);
  if(identity && identity!==next){await handle?.close();handle=null;await driver.destroy();}
  identity=next;handle ??= await driver.open();await sweep(scope);return handle;
 }
 function pause(){generation++;for(const task of tasks)task.abort();tasks.clear();views.clear();void serial(async()=>{for(const uri of await driver.playback())await driver.remove(uri);}).catch(()=>{});}
 return {
  pause,
  /** @param {string} uri */
  info:uri=>views.get(uri) ?? null,
  /** @param {string} uri */
  async release(uri){views.delete(uri);await driver.remove(uri);},
  /** @param {Scope} scope @param {string} path @param {import('./contracts.js').Attachment} item
   * @param {(signal:AbortSignal)=>Promise<unknown>} authorize @param {(signal:AbortSignal)=>Promise<string>} download @param {AbortSignal} signal */
  open(scope,path,item,authorize,download,signal){
   const expected=generation;
   return serial(async()=>{
    const c=new AbortController();tasks.add(c);const abort=()=>c.abort();signal.addEventListener('abort',abort,{once:true});
    const check=()=>{if(expected!==generation || signal.aborted || c.signal.aborted)throw canceled();};
    let source='',cipher='',plain='';let committed=false;
    try{
     check();const h=await owned(scope);check();const started=now();
     let access;
     try{access=parseMediaAccess(await authorize(c.signal),item);}catch(error){for(const r of await h.repository.all())if(r.path===path)await erase(r);throw error;}
     check();const until=started+Date.parse(access.expiresAt)-Date.parse(access.checkedAt);
     const key=await driver.key(JSON.stringify([scope.account,scope.origin,path,access.sha256]));
     for(const row of await h.repository.all())if(row.path===path && row.key!==key)await erase(row);
     let row=await h.repository.read(key),hit=Boolean(row);
     plain=driver.temporary(item.mime);
     if(row){
      try{await h.unseal(row.file,plain,access.sha256,item.bytes);}catch{await driver.remove(plain);await erase(row);row=null;hit=false;}
     }
     if(!row){
      if(await driver.space()<item.bytes*4+16*1024*1024)throw new ApiError('Not enough free space to open this attachment. Free storage and try again.','configuration');
      source=await download(c.signal);check();
      cipher=key+'.enc';
      const cipherBytes=await h.seal(source,cipher,access.sha256,item.bytes);check();
      let rows=await h.repository.all();
      let used=rows.reduce((sum,r)=>sum+r.cipherBytes,0);
      while(rows.length && (used+cipherBytes>mediaLimit || rows.length>=500)){const r=rows.shift();if(r){await erase(r);used-=r.cipherBytes;}}
      if(used+cipherBytes>mediaLimit)throw new ApiError('Attachment exceeds the downloaded-media limit.','configuration');
      row={key,account:scope.account,origin:scope.origin,path,attachmentId:item.id,sha256:access.sha256,mime:item.mime,bytes:item.bytes,cipherBytes,file:cipher,expiresAt:now()+mediaRetention,lastAccess:now(),checkedUntil:until};
      check();await h.repository.put(row);committed=true;
      await h.unseal(cipher,plain,access.sha256,item.bytes);
     }
     check();if(now()>=until)throw new ApiError('Attachment access expired while opening. Open it again to check access.','configuration');
     await h.repository.put({...row,lastAccess:now(),checkedUntil:until});check();
     views.set(plain,{expiresAt:until,cacheHit:hit});const result=plain;plain='';return result;
    }finally{
     tasks.delete(c);signal.removeEventListener('abort',abort);
     if(source)await driver.remove(source);
     if(cipher && !committed)await driver.remove(cipher);
     if(plain)await driver.remove(plain);
    }
   });
  },
  /** @param {Scope} scope */
  stats:scope=>serial(async()=>{const h=await owned(scope);const rows=await h.repository.all();return{bytes:rows.reduce((n,r)=>n+r.cipherBytes,0),count:rows.length,limit:mediaLimit};}),
  clear(){pause();return serial(async()=>{await handle?.close();handle=null;identity='';await driver.destroy();});},
 };
}
