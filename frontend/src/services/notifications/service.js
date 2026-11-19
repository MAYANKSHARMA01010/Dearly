import { ApiError } from '../../api/client.js';
import { uuid } from '../drafts/contracts.js';
/** @typedef {{inAppAlerts:boolean,pushAlerts:boolean,defaultPhoneChannel:'WHATSAPP'|'SMS'}} Preferences */
/** @typedef {{id:string,kind:string,targetId:string,targetType:'owned'|'received',createdAt:string,readAt:string|null}} Notice */
/** @param {unknown} value @returns {Record<string,unknown>} */
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiError('Unexpected notification response.', 'invalid_response');
  return /** @type {Record<string,unknown>} */ (value);
}
/** @param {unknown} value @returns {Preferences} */
export function parsePreferences(value) {
  const v = object(value);
  if (
    typeof v.inAppAlerts !== 'boolean' ||
    typeof v.pushAlerts !== 'boolean' ||
    !['WHATSAPP', 'SMS'].includes(String(v.defaultPhoneChannel))
  )
    throw new ApiError('Unexpected preferences response.', 'invalid_response');
  return /** @type {Preferences} */ (v);
}
/** @param {unknown} value @returns {{id:string,targetId:string,targetType:'owned'|'received'}} */
export function parseTarget(value) {
  const v = object(value);
  if (
    typeof v.id !== 'string' ||
    !uuid.test(v.id) ||
    typeof v.targetId !== 'string' ||
    !uuid.test(v.targetId) ||
    !['owned', 'received'].includes(String(v.targetType))
  )
    throw new ApiError('Notification address unavailable.', 'invalid_response');
  return /** @type {{id:string,targetId:string,targetType:'owned'|'received'}} */ (
    v
  );
}
/** @param {unknown} value @returns {{items:Notice[],nextCursor:string|null,unread:number}} */
export function parsePage(value) {
  const v = object(value);
  if (
    !Array.isArray(v.items) ||
    v.items.length > 20 ||
    !Number.isInteger(v.unread) ||
    Number(v.unread) < 0 ||
    (v.nextCursor !== null &&
      (typeof v.nextCursor !== 'string' || !uuid.test(v.nextCursor)))
  )
    throw new ApiError('Unexpected notification list.', 'invalid_response');
  for (const item of v.items) {
    parseTarget(item);
    const x = object(item);
    if (
      typeof x.kind !== 'string' ||
      typeof x.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(x.createdAt)) ||
      (x.readAt !== null &&
        (typeof x.readAt !== 'string' ||
          !Number.isFinite(Date.parse(x.readAt))))
    )
      throw new ApiError('Unexpected notification item.', 'invalid_response');
  }
  return /** @type {{items:Notice[],nextCursor:string|null,unread:number}} */ (
    v
  );
}
/** @param {{request:(path:string,options?:RequestInit)=>Promise<unknown>}} session */
export function createNotificationService(session) {
  /** @param {string} path @param {string} method @param {unknown} [body] */
  const write = (path, method, body) =>
    session.request('/notifications' + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  return {
    /** @param {string|null} [cursor] @param {AbortSignal} [signal] */
    async list(cursor = null, signal) {
      return parsePage(
        await session.request(
          '/notifications' +
            (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
          { signal },
        ),
      );
    },
    /** @param {AbortSignal} [signal] */
    async preferences(signal) {
      return parsePreferences(
        await session.request('/notifications/preferences', { signal }),
      );
    },
    /** @param {Preferences} value */
    async save(value) {
      return parsePreferences(await write('/preferences', 'PATCH', value));
    },
    /** @param {string} id */
    async open(id) {
      if (!uuid.test(id))
        throw new ApiError('Notification unavailable.', 'configuration');
      const target = parseTarget(await session.request('/notifications/' + id));
      await write('/' + id + '/read', 'POST', {});
      return target;
    },
    /** @param {{id:string,token:string,platform:string,projectId:string}} value */
    async register(value) {
      const v = object(await write('/devices', 'PUT', value));
      if (v.registered !== true)
        throw new ApiError(
          'Device registration unconfirmed.',
          'invalid_response',
        );
    },
    /** @param {string} id */
    async remove(id) {
      await write('/devices/' + id, 'DELETE');
    },
  };
}
/** @param {string} kind */
export function notificationLabel(kind) {
  return (
    /** @type {Record<string,string>} */ ({
      RECEIVED: 'A message arrived for you',
      DELIVERED: 'Your message was delivered in Dearly',
      SUBMITTED: 'Your notification was submitted',
      PARTIALLY_DELIVERED: 'Some recipients received your message',
      PARTIALLY_SUBMITTED: 'Some notifications were submitted',
      DELIVERY_UNKNOWN: 'A delivery needs checking',
      FAILED: 'A message needs attention',
    })[kind] ?? 'A message update'
  );
}
