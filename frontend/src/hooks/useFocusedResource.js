import { useMemo, useCallback, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { createReadResource } from '../services/mailboxes/resource';
import { useAuth } from '../context/AuthContext';
/** @template T @param {(signal:AbortSignal,fresh?:boolean)=>Promise<T>} load @param {string} [path] */
export function useFocusedResource(load,path) {
  const {session}=useAuth();
  const model=useMemo(()=>createReadResource(load,path?{getInfo:()=>session.getReadInfo(path)}:{}),[load,path,session]);
  useFocusEffect(useCallback(()=>{
    void model.start();
    const unsubscribe=path?session.subscribeData(()=>model.invalidate()):()=>{};
    return()=>{unsubscribe();model.stop();};
  },[model,path,session]));
  const state=useSyncExternalStore(model.subscribe,model.getSnapshot,model.getSnapshot);
  return {...state,refresh:model.refresh};
}
