// Web transfer uses browser-owned File/Blob objects; native uses file streaming.
import { ApiError, createApiClient } from '../../api/client';
import { getApiBaseUrl } from '../../config/api';
import { validateSelection } from './contracts';
const urls = new Set();
export async function initializeMediaCache() {}
export async function clearMediaCache() { for (const uri of urls) URL.revokeObjectURL(uri); urls.clear(); }
/** @param {string} uri */
export async function discardRecording(uri) { if (uri.startsWith('blob:')) URL.revokeObjectURL(uri); }
/** @param {string} uri */
export async function discardLocal(uri) { if (urls.has(uri)) { URL.revokeObjectURL(uri); urls.delete(uri); } }
/** @param {{uri:string,name:string,mime?:string|null,file?:File}} input @returns {Promise<import('./contracts').Selection>} */
export async function copySelection({ name, mime, file }) {
  if (!file) throw new ApiError('Choose a local file again.', 'configuration');
  const details = validateSelection(name, mime, file.size); const uri = URL.createObjectURL(file); urls.add(uri);
  return { ...details, id:crypto.randomUUID(), uri, file };
}
/** @param {ReturnType<typeof import('../auth/sessionManager').createSessionManager>} session @param {string} path @param {import('./contracts').Selection} selection @param {AbortSignal} signal @param {(fraction:number)=>void} progress */
export async function uploadFile(session, path, selection, signal, progress) {
  const client = createApiClient({ getBaseUrl:getApiBaseUrl, timeoutMs:610000, fetcher:(url, options) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open('PUT', String(url));
    new Headers(options?.headers).forEach((value, key) => xhr.setRequestHeader(key, value)); xhr.setRequestHeader('Content-Type','application/octet-stream');
    const cancel = () => xhr.abort(); options?.signal?.addEventListener('abort', cancel, { once:true });
    xhr.upload.onprogress = (event) => progress(event.lengthComputable ? event.loaded/event.total : 0);
    const finish = () => options?.signal?.removeEventListener('abort', cancel);
    xhr.onload = () => { finish(); resolve(new Response(xhr.responseText, { status:xhr.status })); };
    xhr.onerror = () => { finish(); reject(new ApiError('Upload failed. Refresh attachments before retrying.', 'network')); };
    xhr.onabort = () => { finish(); reject(new ApiError('Upload canceled. Refresh attachments before retrying.', 'aborted')); };
    if (options?.signal?.aborted) { finish(); reject(new ApiError('Upload canceled.', 'aborted')); return; }
    xhr.send(selection.file);
  }) });
  return session.request(path, { method:'PUT', signal }, client.request);
}
/** @param {ReturnType<typeof import('../auth/sessionManager').createSessionManager>} session @param {string} path @param {import('./contracts').Attachment} item @param {AbortSignal} signal @param {(fraction:number)=>void} progress @returns {Promise<string>} */
export async function downloadFile(session, path, item, signal, progress) {
  let cached = '';
  const client = createApiClient({ getBaseUrl:getApiBaseUrl, timeoutMs:610000, fetcher:async (url, options) => {
    const response = await fetch(url, options); if (!response.ok) return response;
    const blob = await response.blob(); if (blob.size !== item.bytes) throw new ApiError('Downloaded file could not be confirmed.', 'invalid_response');
    const uri = URL.createObjectURL(blob); urls.add(uri); cached = uri; progress(1);
    return new Response(JSON.stringify({ success:true, data:uri }), { status:200 });
  } });
  try { return /** @type {string} */ (await session.request(path, { signal }, client.request)); }
  catch (error) { if (cached) await discardLocal(cached); throw error; }
}
/** @param {string} uri */
export async function readText(uri) { return (await (await fetch(uri)).text()).slice(0,65536); }
/** @param {string} uri @param {string} _mime */
export async function openDocument(uri, _mime) { const opened = window.open(uri, '_blank'); if (!opened) throw new ApiError('Allow a document window in your browser and try again.', 'configuration'); opened.opener = null; }
