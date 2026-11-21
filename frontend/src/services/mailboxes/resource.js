import { ApiError } from '../../api/client.js';
/** @param {unknown} failure */
export const isAccessDenial = (failure) => failure instanceof ApiError && failure.kind === 'http' && [401,403,404].includes(failure.status ?? 0);
/** @typedef {import('../cache/reads.js').ReadInfo} ReadInfo */
/** Latest-focus read wins; timed snapshots disappear before expired data is shown.
 * @template T @param {(signal:AbortSignal,fresh?:boolean)=>Promise<T>} load
 * @param {{getInfo?:()=>ReadInfo|null,now?:()=>number,setTimer?:typeof setTimeout,clearTimer?:typeof clearTimeout}} [options] */
export function createReadResource(load,{getInfo,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  let state=/** @type {{data:T|null,loading:boolean,error:string,info:ReadInfo|null}} */({data:null,loading:true,error:'',info:null});
  let enabled=true;
  let active=/** @type {AbortController|null} */(null);
  let timer=/** @type {ReturnType<typeof setTimeout>|null} */(null);
  let retryTimer=/** @type {ReturnType<typeof setTimeout>|null} */(null);
  let autoRefreshes=0;
  const listeners=new Set();
  const publish=()=>{for(const fn of listeners)fn();};
  function clearTimers(){if(timer)clearTimer(timer);if(retryTimer)clearTimer(retryTimer);timer=null;retryTimer=null;}
  function arm(){
    if(timer)clearTimer(timer);timer=null;
    if(!state.info || !state.data || !enabled)return;
    timer=setTimer(()=>{
      state={...state,data:null,info:null,error:'This saved copy expired. Reconnect and refresh to see current information.'};publish();
      if(autoRefreshes<5){autoRefreshes++;void run(true,2);}
    },Math.max(0,state.info.expiresAt-now()));
  }
  /** @param {boolean} fresh @param {number} retries */
  async function run(fresh,retries){
    if(!enabled)return false;
    active?.abort();if(retryTimer)clearTimer(retryTimer);retryTimer=null;
    const c=new AbortController();active=c;
    if(state.info && now()>=state.info.expiresAt)state={...state,data:null,info:null};
    state={...state,loading:true,error:''};publish();
    try{
      const data=await load(c.signal,fresh);
      if(active!==c || c.signal.aborted)return false;
      const info=getInfo?.() ?? null;
      if(info && info.expiresAt<=now())throw new ApiError('This saved copy expired. Refresh to check again.','network');
      state={data,loading:false,error:'',info};publish();arm();return true;
    }catch(failure){
      if(active===c && !c.signal.aborted){
        const hide=isAccessDenial(failure) || (state.info!==null && state.info.expiresAt<=now());
        state={...state,data:hide?null:state.data,info:hide?null:state.info,loading:false,error:failure instanceof ApiError?failure.message:'Messages could not be loaded. Please try again.'};publish();arm();
        const retryable=failure instanceof ApiError && (['network','timeout'].includes(failure.kind) || failure.status===429 || (failure.status ?? 0)>=500);
        const delay=Math.max(retries===2?2000:8000,(failure instanceof ApiError?failure.retryAfterSeconds ?? 0:0)*1000);
        if(getInfo && retryable && retries>0 && delay<=30000)retryTimer=setTimer(()=>{void run(true,retries-1);},delay);
      }
      return false;
    }finally{if(active===c)active=null;}
  }
  const model={
    getSnapshot:()=>state,
    /** @param {()=>void} listener */
    subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},
    refresh(){autoRefreshes=0;return run(true,2);},
    invalidate(){if(!enabled)return;clearTimers();state={data:null,info:null,loading:true,error:''};publish();void run(true,2);},
    start(){enabled=true;autoRefreshes=0;return run(false,2);},
    stop(){enabled=false;active?.abort();active=null;clearTimers();state={data:null,info:null,loading:false,error:''};publish();},
  };
  return model;
}
