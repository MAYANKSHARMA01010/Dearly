import { ApiError } from '../../api/client.js';
import { cacheTarget, ttl } from './policy.js';
/** @typedef {{value:unknown,fetchedAt:number,expiresAt:number,recordVersion:string}} CacheEntry */
/** @typedef {{source:'server'|'device',fetchedAt:number,expiresAt:number}} ReadInfo */
/** @typedef {{read?:(kind:import('./policy.js').CacheKind,key:string)=>Promise<CacheEntry|null>,capture:(path:string,value:unknown)=>Promise<unknown>,invalidate?:()=>Promise<unknown>}} ReadCache */
/** @param {{cache?:ReadCache,load:(path:string,options:RequestInit)=>Promise<unknown>,canRead:()=>boolean,validUntil:()=>number,now?:()=>number}} dependencies */
export function createCachedReads({cache,load,canRead,validUntil,now=Date.now}) {
  let generation=0;
  const info=new Map();
  const listeners=new Set();
  const failures= new Map();
  const flights= /** @type {Map<string,{controller:AbortController,promise:Promise<unknown>,users:number}>} */ (new Map());
  const canceled=()=>new ApiError('Request canceled.','aborted');
  async function invalidate(announce=true) {
    generation++; info.clear();
    for(const flight of flights.values()) flight.controller.abort();
    flights.clear();
    await cache?.invalidate?.().catch(()=>{});
    if(announce) for(const listener of listeners) listener();
  }
  return {
    invalidate,
    /** @param {()=>void} listener */
    subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},
    /** @param {string} path @returns {ReadInfo|null} */
    getInfo(path){return info.get(path) ?? null;},
    /** @param {string} path @param {RequestInit} [options] */
    read(path,options={}) {
      if(options.signal?.aborted) return Promise.reject(canceled());
      const target=cacheTarget(path);
      // Authentication remains remote even though profile snapshots are stored.
      if(!target || target.kind==='profile' || options.headers || options.body) return load(path,options);
      const expected=generation;
      const key=path+(options.cache==='reload'?'|fresh':'|default');
      let flight=flights.get(key);
      if(flight?.controller.signal.aborted){flights.delete(key);flight=undefined;}
      if(!flight){
        const controller=new AbortController();
        const check=()=>{if(controller.signal.aborted || generation!==expected || !canRead())throw canceled();};
        const promise=(async()=>{
          check();
          if(options.cache!=='reload' && canRead() && now()<validUntil()) {
            const entry=await cache?.read?.(target.kind,target.key).catch(()=>null);
            check();
            if(entry && entry.fetchedAt<=now() && entry.expiresAt>now() && now()<validUntil()) {
              info.set(path,{source:'device',fetchedAt:entry.fetchedAt,expiresAt:Math.min(entry.expiresAt,validUntil())});return entry.value;
            }
          }
          const last=failures.get(path);
          if(last && last.until>now()) {
            const error=new ApiError('Please wait a moment before refreshing again.','http',429);
            error.retryAfterSeconds=Math.ceil((last.until-now())/1000);throw error;
          }
          try{
            const value=await load(path,{...options,signal:controller.signal});check();
            const fetchedAt=now();
            await cache?.capture(path,value).catch(()=>{});check();
            info.set(path,{source:'server',fetchedAt,expiresAt:Math.min(fetchedAt+ttl[target.kind],validUntil())});failures.delete(path);return value;
          }catch(error){
            if(error instanceof ApiError && [401,403,404].includes(error.status ?? 0)) {await invalidate(false);}
            if(error instanceof ApiError && (['network','timeout'].includes(error.kind) || error.status===429 || (error.status ?? 0)>=500)){
              const count=Math.min((last?.count ?? 0)+1,5);
              failures.set(path,{count,until:now()+Math.max(Math.min(30000,1000*2**count),(error.retryAfterSeconds ?? 0)*1000)});
              if(failures.size>256)failures.delete(failures.keys().next().value);
            }
            throw error;
          }
        })();
        flight={controller,promise,users:0};flights.set(key,flight);
        const original=flight;
        void promise.finally(()=>{if(flights.get(key)===original)flights.delete(key);}).catch(()=>{});
      }
      flight.users++;const shared=flight;
      return new Promise((resolve,reject)=>{
        let done=false;
        const finish=()=>{if(done)return false;done=true;options.signal?.removeEventListener('abort',abort);shared.users--;if(shared.users===0)shared.controller.abort();return true;};
        const abort=()=>{if(finish())reject(canceled());};
        options.signal?.addEventListener('abort',abort,{once:true});
        void shared.promise.then(value=>{if(finish())resolve(value);},error=>{if(finish())reject(error);});
      });
    },
  };
}
