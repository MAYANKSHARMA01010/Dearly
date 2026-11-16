import { ApiError } from '../../api/client.js';
import { uuid } from '../drafts/contracts.js';
import { parseAttachment } from './contracts.js';
/** @param {{ request: (path: string, options?: RequestInit) => Promise<unknown> }} session @param {string} draftId */
export function createAttachmentService(session, draftId) {
  if (!uuid.test(draftId)) throw new ApiError('Save the draft before adding attachments.', 'configuration');
  const root = `/messages/drafts/${draftId}/attachments`;
  /** @param {string} id */
  const path = (id) => { if (!uuid.test(id)) throw new ApiError('Invalid attachment address.', 'configuration'); return `${root}/${id}`; };
  /** @param {string} route @param {string} method @param {unknown} [body] @param {AbortSignal} [signal] */
  const write = (route, method, body, signal) => session.request(route, { method, signal, headers: { 'Content-Type':'application/json' }, ...(body !== undefined && { body:JSON.stringify(body) }) });
  return {
    /** @param {AbortSignal} [signal] */
    async list(signal) {
      const data = await session.request(root, { signal });
      if (!data || typeof data !== 'object' || !('items' in data) || !Array.isArray(data.items) || data.items.length > 10) throw new ApiError('Attachments could not be confirmed. Refresh to try again.', 'invalid_response');
      return data.items.map(parseAttachment);
    },
    /** @param {import('./contracts.js').Selection} file @param {AbortSignal} [signal] */
    async reserve(file, signal) { return parseAttachment(await write(root, 'POST', { id:file.id, name:file.name, mime:file.mime, bytes:file.bytes }, signal)); },
    /** @param {string} id @param {AbortSignal} [signal] */
    async finalize(id, signal) { return parseAttachment(await write(`${path(id)}/finalize`, 'POST', {}, signal)); },
    /** @param {string} id @param {AbortSignal} [signal] */
    async remove(id, signal) {
      const data = await write(path(id), 'DELETE', undefined, signal);
      if (!data || typeof data !== 'object' || !('deleted' in data) || data.deleted !== true || !('id' in data) || data.id !== id) throw new ApiError('Removal could not be confirmed. Refresh attachments.', 'invalid_response');
    },
    /** @param {string} id */
    contentPath: (id) => `${path(id)}/content`,
  };
}
/**
 * Explicit retry reuses the same reservation UUID, checks its persisted state,
 * and never uploads bytes over an already completed or active transfer.
 * @param {{ api: ReturnType<typeof createAttachmentService>, selection: import('./contracts.js').Selection, upload: () => Promise<unknown>, signal?: AbortSignal }} input
 */
export async function completeUpload({ api, selection, upload, signal }) {
  let row = await api.reserve(selection, signal);
  if (row.state === 'READY') return row;
  if (row.state === 'PENDING') { await upload(); row = await api.reserve(selection, signal); }
  if (row.state === 'UPLOADED') return api.finalize(row.id, signal);
  throw new ApiError('This upload may still be active or has expired. Refresh its status. After 15 minutes, you can remove an interrupted upload and retry.', 'http', 409);
}
