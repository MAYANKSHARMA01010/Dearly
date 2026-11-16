import { ApiError } from '../../api/client.js';
import { parseDraft, parsePage, uuid } from './contracts.js';

/** @param {{ request: (path: string, options?: RequestInit) => Promise<unknown> }} transport */
export function createDraftService(transport) {
  /** @param {string} id */
  const path = (id) => { if (!uuid.test(id)) throw new ApiError('This draft address is invalid.', 'configuration'); return `/messages/drafts/${id}`; };
  return {
    /** @param {string|null} [cursor] @param {AbortSignal} [signal] */
    list: async (cursor = null, signal) => parsePage(await transport.request(`/messages/drafts?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal })),
    /** @param {string} id @param {AbortSignal} [signal] */
    read: async (id, signal) => parseDraft(await transport.request(path(id), { signal })),
    /** @param {import('./contracts.js').DraftContent} content */
    create: async (content) => parseDraft(await transport.request('/messages/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content) })),
    /** @param {string} id @param {number} version @param {import('./contracts.js').DraftContent} content */
    update: async (id, version, content) => parseDraft(await transport.request(path(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...content, version }) })),
    /** @param {string} id @param {number} version */
    remove: async (id, version) => {
      const value = await transport.request(`${path(id)}?version=${version}`, { method: 'DELETE' });
      if (!value || typeof value !== 'object' || !('deleted' in value) || value.deleted !== true || !('id' in value) || value.id !== id) throw new ApiError('Deletion could not be confirmed. Refresh your drafts before trying again.', 'invalid_response');
    },
  };
}
