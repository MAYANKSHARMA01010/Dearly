import {persistentMedia} from './persistent.native';
import * as FS from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import { ApiError, createApiClient } from '../../api/client';
import { getApiBaseUrl } from '../../config/api';
import { validateSelection } from './contracts';

const root = `${FS.cacheDirectory}dearly-media/`;
let ready = /** @type {Promise<void>|null} */ (null);
const tasks = new Set();
async function purgeRecordings() {
  for (const directory of ['ExpoAudio/', 'Audio/']) {
    const path = `${FS.cacheDirectory}${directory}`;
    if ((await FS.getInfoAsync(path)).exists) {
      for (const name of await FS.readDirectoryAsync(path)) if (name.startsWith('dearly-voice-')) await FS.deleteAsync(`${path}${name}`, {idempotent:true});
    }
  }
}
export function initializeMediaCache() {
  ready ??= (async () => {
    if (!FS.cacheDirectory) throw new ApiError('Private media cache is unavailable.', 'configuration');
    await FS.deleteAsync(root, { idempotent:true }); await FS.makeDirectoryAsync(root, { intermediates:true }); await purgeRecordings(); await persistentMedia.initialize();
  })();
  return ready;
}
export function pauseMediaCache(){persistentMedia.pause();}
export async function clearDownloadedMedia(){await persistentMedia.clear();}
export function mediaPlaybackInfo(/** @type {string} */ uri){return persistentMedia.info(uri);}
/** @param {ReturnType<typeof import('../auth/sessionManager').createSessionManager>} session */
export async function downloadedMediaStats(session){const user=session.getSnapshot().user;if(!user)throw new ApiError('Sign in to manage device storage.','configuration');return persistentMedia.stats({account:user.id,origin:getApiBaseUrl()});}
export async function clearMediaCache() {
  persistentMedia.pause();
  await persistentMedia.clear();
  await initializeMediaCache();
  await Promise.allSettled([...tasks].map((task) => task.cancelAsync())); tasks.clear();
  await FS.deleteAsync(root, { idempotent:true }); await FS.makeDirectoryAsync(root, { intermediates:true }); await purgeRecordings();
}
/** @param {string} uri */
export async function discardRecording(uri) { if (FS.cacheDirectory && uri.startsWith(FS.cacheDirectory) && (uri.includes('/ExpoAudio/') || uri.includes('/Audio/'))) await FS.deleteAsync(uri, { idempotent:true }); }
/** @param {string} uri */
export async function discardLocal(uri) { if(persistentMedia.info(uri)){await persistentMedia.release(uri);return;} if (uri.startsWith(root)) await FS.deleteAsync(uri, { idempotent:true }); }
/** @param {{ uri: string, name: string, mime?: string|null, file?: File }} input @returns {Promise<import('./contracts').Selection>} */
export async function copySelection({ uri, name, mime }) {
  await initializeMediaCache();
  const info = await FS.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) throw new ApiError('The selected file is unavailable. Choose it again.', 'configuration');
  const details = validateSelection(name, mime, info.size); const id = Crypto.randomUUID();
  const extension = /** @type {Record<string,string>} */ ({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm','audio/mp4':'m4a','audio/mpeg':'mp3','audio/wav':'wav','audio/webm':'webm','application/pdf':'pdf','text/plain':'txt' })[details.mime];
  const target = `${root}${id}.${extension}`;
  await FS.copyAsync({ from:uri, to:target });
  // Pickers return a new cache copy. Never delete a source from Files/Photos.
  if (FS.cacheDirectory && uri.startsWith(FS.cacheDirectory) && !uri.startsWith(root)) await FS.deleteAsync(uri, { idempotent:true });
  return { ...details, uri:target, id };
}
/** @param {ReturnType<typeof import('../auth/sessionManager').createSessionManager>} session @param {string} path @param {import('./contracts').Selection} selection @param {AbortSignal} signal @param {(fraction:number)=>void} progress */
export async function uploadFile(session, path, selection, signal, progress) {
  const client = createApiClient({ getBaseUrl:getApiBaseUrl, timeoutMs:610000,
    fetcher: async (url, options) => {
      const task = FS.createUploadTask(String(url), selection.uri, { httpMethod:'PUT', uploadType:FS.FileSystemUploadType.BINARY_CONTENT,
        sessionType:FS.FileSystemSessionType.FOREGROUND, headers:{ ...Object.fromEntries(new Headers(options?.headers)), 'Content-Type':'application/octet-stream' } },
      (status) => progress(status.totalBytesExpectedToSend > 0 ? Math.min(1, status.totalBytesSent / status.totalBytesExpectedToSend) : 0));
      tasks.add(task); const cancel = () => { void task.cancelAsync(); };
      options?.signal?.addEventListener('abort', cancel, { once:true });
      try {
        if (options?.signal?.aborted) throw new ApiError('Transfer canceled. Refresh attachments before retrying.', 'aborted');
        const result = await task.uploadAsync(); if (!result) throw new ApiError('Transfer canceled. Refresh attachments before retrying.', 'aborted');
        return new Response(result.body, { status:result.status, headers:result.headers });
      } finally { tasks.delete(task); options?.signal?.removeEventListener('abort', cancel); }
    } });
  return session.request(path, { method:'PUT', signal }, client.request);
}
/** @param {ReturnType<typeof import('../auth/sessionManager').createSessionManager>} session @param {string} path @param {import('./contracts').Attachment} item @param {AbortSignal} signal @param {(fraction:number)=>void} progress @returns {Promise<string>} */
async function downloadTemporaryFile(session, path, item, signal, progress) {
  await initializeMediaCache();
  const ext = /** @type {Record<string,string>} */ ({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm','audio/mp4':'m4a','audio/mpeg':'mp3','audio/wav':'wav','audio/webm':'webm','application/pdf':'pdf','text/plain':'txt' })[item.mime];
  const uri = `${root}${Crypto.randomUUID()}.${ext}`;
  const client = createApiClient({ getBaseUrl:getApiBaseUrl, timeoutMs:610000, fetcher:async (url, options) => {
    const task = FS.createDownloadResumable(String(url), uri, { headers:Object.fromEntries(new Headers(options?.headers)), cache:false, sessionType:FS.FileSystemSessionType.FOREGROUND }, (status) => {
      progress(Math.min(1, status.totalBytesWritten / item.bytes)); if (status.totalBytesWritten > item.bytes) void task.cancelAsync();
    });
    tasks.add(task); const cancel = () => { void task.cancelAsync(); }; options?.signal?.addEventListener('abort', cancel, { once:true });
    try {
      if (options?.signal?.aborted) throw new ApiError('Download canceled.', 'aborted');
      const result = await task.downloadAsync(); if (!result) throw new ApiError('Download canceled.', 'aborted');
      if (result.status !== 200) {
        await discardLocal(uri);
        return new Response(JSON.stringify({ success:false, error:{ code:result.status === 401 ? 'UNAUTHORIZED' : 'ATTACHMENT_NOT_FOUND' } }), { status:result.status });
      }
      const info = await FS.getInfoAsync(uri);
      if (!info.exists || info.isDirectory || info.size !== item.bytes) throw new ApiError('Downloaded file could not be confirmed. Try again.', 'invalid_response');
      return new Response(JSON.stringify({ success:true, data:uri }), { status:200 });
    } finally { tasks.delete(task); options?.signal?.removeEventListener('abort', cancel); }
  } });
  try { return /** @type {string} */ (await session.request(path, { signal }, client.request)); }
  catch (error) { await discardLocal(uri); throw error; }
}
/** @param {string} uri */
export async function readText(uri) { return (await FS.readAsStringAsync(uri)).slice(0, 65536); }
/** @param {string} uri @param {string} mime */
export async function openDocument(uri, mime) {
  if (!await Sharing.isAvailableAsync()) throw new ApiError('No document viewer or sharing app is available on this device.', 'configuration');
  await Sharing.shareAsync(uri, { mimeType:mime, ...(mime === 'application/pdf' && { UTI:'com.adobe.pdf' }) });
}

/** Revalidate access on every open. Reuse only verified encrypted bytes; players
 * receive a temporary decrypted copy that discardLocal removes on dismissal.
 * @param {ReturnType<typeof import('../auth/sessionManager').createSessionManager>} session @param {string} path @param {import('./contracts').Attachment} item @param {AbortSignal} signal @param {(fraction:number)=>void} progress */
export async function downloadFile(session,path,item,signal,progress){
 await initializeMediaCache();const user=session.getSnapshot().user;
 if(!user || session.getSnapshot().status!=='authenticated')throw new ApiError('Sign in to open private attachments.','configuration');
 return persistentMedia.open({account:user.id,origin:getApiBaseUrl()},path,item,
  s=>session.request(path+'/access',{signal:s}),s=>downloadTemporaryFile(session,path,item,s,progress),signal);
}
