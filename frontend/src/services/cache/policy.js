import { parseUser } from '../auth/contracts.js';
import { parsePreferences } from '../notifications/service.js';
import { parseDashboard, parseOwned, parseReceived } from '../mailboxes/contracts.js';
/** @typedef {'profile'|'preferences'|'dashboard'|'owned'|'received'} CacheKind */
export const ttl = Object.freeze({ profile: 300000, preferences: 300000, dashboard: 60000, owned: 300000, received: 300000 });
/** Rebuild values from trusted contracts: no tokens, codes, link URLs or arbitrary API payloads.
 * @param {CacheKind} kind @param {unknown} value @param {number} now */
export function sanitizeCacheValue(kind, value, now) {
  switch (kind) {
    case 'profile': return parseUser(value);
    case 'preferences': {
      const p = parsePreferences(value);
      return { inAppAlerts: p.inAppAlerts, pushAlerts: p.pushAlerts, defaultPhoneChannel: p.defaultPhoneChannel };
    }
    case 'dashboard': return parseDashboard(value);
    case 'owned': return parseOwned(value);
    case 'received': {
      const received = parseReceived(value);
      if (Date.parse(received.deliveredAt) > now || Date.parse(received.scheduledFor) > now) throw new Error('Undelivered content');
      return received;
    }
    default: throw new Error('Unsupported cache record');
  }
}
/** Only explicitly eligible, successfully authorized GET representations.
 * @param {string} path @returns {{kind:CacheKind,key:string}|null} */
export function cacheTarget(path) {
  if (path === '/auth/me') return { kind: 'profile', key: 'self' };
  if (path === '/notifications/preferences') return { kind: 'preferences', key: 'self' };
  if (path === '/messages/dashboard') return { kind: 'dashboard', key: 'self' };
  const match = /^\/messages\/(mailboxes\/owned|inbox)\/([0-9a-f-]{36})$/.exec(path);
  return match ? { kind: match[1] === 'inbox' ? 'received' : 'owned', key: match[2] } : null;
}
