import { parseUser } from '../auth/contracts.js';
import { parsePreferences } from '../notifications/service.js';
import { parseDashboard, parseOwned, parseReceived, parseMailboxPage, boxes, states } from '../mailboxes/contracts.js';
/** @typedef {'profile'|'preferences'|'dashboard'|'owned'|'received'|'mailbox'} CacheKind */
export const ttl = Object.freeze({ profile: 300000, preferences: 300000, dashboard: 60000, owned: 300000, received: 300000, mailbox: 60000 });
/** Rebuild values from trusted contracts: no tokens, codes, link URLs or arbitrary API payloads.
 * @param {CacheKind} kind @param {unknown} value @param {number} now @param {string} [key] */
export function sanitizeCacheValue(kind, value, now, key='') {
  switch (kind) {
    case 'profile': return parseUser(value);
    case 'preferences': {
      const p = parsePreferences(value);
      return { inAppAlerts: p.inAppAlerts, pushAlerts: p.pushAlerts, defaultPhoneChannel: p.defaultPhoneChannel };
    }
    case 'dashboard': return parseDashboard(value);
    case 'mailbox': return parseMailboxPage(value,/** @type {import('../mailboxes/contracts.js').Box} */(key.split('|')[0]));
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
  if(path.startsWith('/messages/mailboxes?')) {
    const query=new URLSearchParams(path.slice(path.indexOf('?')+1));
    const box=query.get('box'),status=query.get('status') ?? '',read=query.get('read') ?? 'all';
    if(query.get('limit')!=='20' || !boxes.includes(/** @type {import('../mailboxes/contracts.js').Box} */(box)) ||
      (status && !states.includes(status)) || !['all','opened','unopened'].includes(read) ||
      [...query.keys()].some(k=>!['box','limit','status','read'].includes(k) || query.getAll(k).length!==1)) return null;
    return {kind:'mailbox',key:`${box}|${status}|${read}`};
  }
  const match = /^\/messages\/(mailboxes\/owned|inbox)\/([0-9a-f-]{36})$/.exec(path);
  return match ? { kind: match[1] === 'inbox' ? 'received' : 'owned', key: match[2] } : null;
}
