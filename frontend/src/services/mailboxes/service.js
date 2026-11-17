import { ApiError } from '../../api/client.js';
import { uuid } from '../drafts/contracts.js';
import {
  boxes,
  parseDashboard,
  parseMailboxPage,
  parseOwned,
  parseReceived,
  parseHistory,
  record,
  validDate,
} from './contracts.js';
/** @param {{request:(path:string,options?:RequestInit)=>Promise<unknown>}} session */
export function createMailboxService(session) {
  /** @param {string} id */
  const valid = (id) => {
    if (!uuid.test(id))
      throw new ApiError('This message address is invalid.', 'configuration');
    return id;
  };
  return {
    /** @param {string} intentId @param {AbortSignal} [signal] */
    async revokeEmail(intentId, signal) {
      const result = record(
        await session.request(
          `/external/deliveries/${valid(intentId)}/revoke`,
          {
            method: 'POST',
            signal,
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          },
        ),
      );
      if (result.revoked !== true)
        throw new ApiError(
          'Link revocation could not be confirmed. Refresh and try again.',
          'invalid_response',
        );
    },
    /** @param {AbortSignal} [signal] */
    async dashboard(signal) {
      return parseDashboard(
        await session.request('/messages/dashboard', { signal }),
      );
    },
    /** @param {import('./contracts.js').Box} box @param {{status?:string,read?:'all'|'opened'|'unopened',cursor?:string|null}} [filters] @param {AbortSignal} [signal] */
    async list(box, filters = {}, signal) {
      if (!boxes.includes(box))
        throw new ApiError('Choose a valid mailbox.', 'configuration');
      const query = new URLSearchParams({
        box,
        limit: '20',
        ...(filters.status ? { status: filters.status } : {}),
        ...(box === 'received' ? { read: filters.read ?? 'all' } : {}),
        ...(filters.cursor ? { cursor: filters.cursor } : {}),
      });
      return parseMailboxPage(
        await session.request(`/messages/mailboxes?${query}`, { signal }),
        box,
      );
    },
    /** @param {string} id @param {AbortSignal} [signal] */
    async owned(id, signal) {
      return parseOwned(
        await session.request(`/messages/mailboxes/owned/${valid(id)}`, {
          signal,
        }),
      );
    },
    /** @param {string} id @param {string|null} [cursor] @param {AbortSignal} [signal] */
    async history(id, cursor = null, signal) {
      return parseHistory(
        await session.request(
          `/messages/mailboxes/owned/${valid(id)}/history?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          { signal },
        ),
      );
    },
    /** @param {string} id @param {AbortSignal} [signal] */
    async received(id, signal) {
      return parseReceived(
        await session.request(`/messages/inbox/${valid(id)}`, { signal }),
      );
    },
    /** @param {string} id @param {AbortSignal} [signal] */
    async markOpened(id, signal) {
      const r = record(
        await session.request(`/messages/inbox/${valid(id)}/open`, {
          method: 'POST',
          signal,
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
      );
      if (r.id !== id || !validDate(r.openedAt))
        throw new ApiError(
          'The opened state could not be confirmed. Reload before retrying.',
          'invalid_response',
        );
      return { id, openedAt: r.openedAt };
    },
    /** @param {string} id @param {string} attachmentId @param {boolean} received */
    contentPath(id, attachmentId, received) {
      valid(id);
      valid(attachmentId);
      return received
        ? `/messages/inbox/${id}/attachments/${attachmentId}/content`
        : `/messages/drafts/${id}/attachments/${attachmentId}/content`;
    },
  };
}
