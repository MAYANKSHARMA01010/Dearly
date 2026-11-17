import { ApiError } from '../../api/client.js';
import { parseDraft, uuid } from '../drafts/contracts.js';
import {
  parseScheduleMessage,
  parseScheduleReview,
  parseSchedulePage,
} from './contracts.js';
/** @param {{request:(path:string,options?:RequestInit)=>Promise<unknown>}} session */
export function createScheduleService(session) {
  /** @param {string} id */
  const path = (id) => {
    if (!uuid.test(id))
      throw new ApiError('This schedule address is invalid.', 'configuration');
    return `/messages/schedules/${id}`;
  };
  /** @param {string} route @param {string} method @param {object} body @param {AbortSignal} [signal] */
  const write = (route, method, body, signal) =>
    session.request(route, {
      method,
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  return {
    /** @param {AbortSignal} [signal] */
    async capabilities(signal) {
      const r = await session.request('/messages/schedules/capabilities', {
        signal,
      });
      if (
        !r ||
        typeof r !== 'object' ||
        !('backgroundDelivery' in r) ||
        r.backgroundDelivery !== true ||
        !('channels' in r) ||
        !Array.isArray(r.channels)
      )
        throw new ApiError(
          'Delivery availability could not be confirmed.',
          'invalid_response',
        );
      return {
        backgroundDelivery: true,
        workerOnline:
          'worker' in r &&
          Boolean(
            r.worker &&
            typeof r.worker === 'object' &&
            'status' in r.worker &&
            r.worker.status === 'running',
          ),
        whatsappAvailable: r.channels.some(
          (value) =>
            value &&
            typeof value === 'object' &&
            value.channel === 'WHATSAPP' &&
            value.available === true &&
            value.mode === 'WAHA_CORE',
        ),
        whatsappStatus:
          'whatsappStatus' in r &&
          [
            'READY',
            'DISABLED',
            'UNPAIRED',
            'STOPPED',
            'OFFLINE',
            'AUTH_FAILED',
            'RESTRICTED',
            'MISCONFIGURED',
          ].includes(String(r.whatsappStatus))
            ? String(r.whatsappStatus)
            : 'DISABLED',
        emailAvailable: r.channels.some(
          (value) =>
            value &&
            typeof value === 'object' &&
            value.channel === 'EMAIL' &&
            value.available === true &&
            value.mode === 'SMTP',
        ),
        emailLocalOnly: 'emailLocalOnly' in r && r.emailLocalOnly === true,
        inAppAvailable: r.channels.some(
          (value) =>
            value &&
            typeof value === 'object' &&
            value.channel === 'IN_APP' &&
            value.available === true &&
            value.mode === 'DATABASE',
        ),
      };
    },
    /** @param {string} id @param {AbortSignal} [signal] */
    async source(id, signal) {
      path(id);
      const r = await session.request(`/messages/drafts/${id}`, { signal });
      parseDraft(r);
      return parseScheduleMessage({
        .../** @type {object} */ (r),
        deliveryEnabled: false,
        scheduledFor: null,
        timezone: null,
        localDateTime: null,
        canceledAt: null,
        attachments: [],
        deliveries: [],
        backgroundDelivery: true,
      });
    },
    /** @param {string} id @param {AbortSignal} [signal] */
    async read(id, signal) {
      const r = parseScheduleMessage(
        await session.request(path(id), { signal }),
      );
      if (r.status === 'DRAFT')
        throw new ApiError(
          'This message is now a draft. Open it from Your drafts.',
          'http',
          409,
        );
      return r;
    },
    /** @param {string} id @param {import('./contracts.js').Choice} choice @param {boolean} [reschedule] @param {AbortSignal} [signal] */
    async preview(id, choice, reschedule = false, signal) {
      return parseScheduleReview(
        await write(
          `${path(id)}/${reschedule ? 'reschedule/preview' : 'preview'}`,
          'POST',
          choice,
          signal,
        ),
      );
    },
    /** @param {string} id @param {import('./contracts.js').Choice} choice @param {string} reviewToken @param {boolean} [reschedule] @param {AbortSignal} [signal] */
    async confirm(id, choice, reviewToken, reschedule = false, signal) {
      return parseScheduleMessage(
        await write(
          `${path(id)}/${reschedule ? 'reschedule' : 'confirm'}`,
          'POST',
          { ...choice, reviewToken },
          signal,
        ),
      );
    },
    /** @param {string} id @param {number} version @param {{subject:string|null,text:string,occasion:string|null}} content @param {AbortSignal} [signal] */
    async edit(id, version, content, signal) {
      return parseScheduleMessage(
        await write(path(id), 'PATCH', { version, ...content }, signal),
      );
    },
    /** @param {string} id @param {number} version @param {AbortSignal} [signal] */
    async cancel(id, version, signal) {
      return parseScheduleMessage(
        await write(`${path(id)}/cancel`, 'POST', { version }, signal),
      );
    },
    /** @param {string} id @param {number} version @param {AbortSignal} [signal] */
    async reopen(id, version, signal) {
      return parseDraft(
        await write(`${path(id)}/reopen`, 'POST', { version }, signal),
      );
    },
    /** @param {'SCHEDULED'|'CANCELED'|'DISPATCHING'|'DELIVERED'|'PARTIALLY_DELIVERED'|'SUBMITTED'|'PARTIALLY_SUBMITTED'|'DELIVERY_UNKNOWN'|'FAILED'} [status] @param {string|null} [cursor] @param {AbortSignal} [signal] */
    async list(status = 'SCHEDULED', cursor = null, signal) {
      return parseSchedulePage(
        await session.request(
          `/messages/schedules?status=${status}&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          { signal },
        ),
      );
    },
  };
}
