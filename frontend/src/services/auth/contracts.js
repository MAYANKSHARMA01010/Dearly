import { ApiError } from '../../api/client.js';

/** @typedef {{ id: string, phone: string, name: string | null, email: string | null, emailVerifiedAt?: string | null, timezone: string, phoneVerifiedAt: string, createdAt: string }} User */
/** @typedef {{ accessToken: string, refreshToken: string, accessExpiresAt: string, sessionExpiresAt: string }} Tokens */
/** @typedef {{ challengeId: string, expiresAt: string, resendAt: number, dispatch: 'simulated' | 'accepted', channel?: 'whatsapp', developmentCode?: string }} Challenge */
const invalid = () => new ApiError('The service returned an unexpected response. Please try again.', 'invalid_response');
/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) { if (!value || typeof value !== 'object') throw invalid(); return /** @type {Record<string, unknown>} */ (value); }
/** @param {unknown} value */
const date = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
/** @param {unknown} value @returns {User} */
export function parseUser(value) {
  const u = record(value);
  if (typeof u.id !== 'string' || typeof u.phone !== 'string' || !/^\+[1-9]\d{5,14}$/.test(u.phone) ||
    !(u.name === null || typeof u.name === 'string') || !(u.email === null || typeof u.email === 'string') ||
    (u.emailVerifiedAt !== undefined && u.emailVerifiedAt !== null && (!date(u.emailVerifiedAt) || !u.email)) ||
    typeof u.timezone !== 'string' || !date(u.phoneVerifiedAt) || !date(u.createdAt)) throw invalid();
  return /** @type {User} */ ({ id: u.id, phone: u.phone, name: u.name, email: u.email, timezone: u.timezone, phoneVerifiedAt: u.phoneVerifiedAt, createdAt: u.createdAt, ...(u.emailVerifiedAt !== undefined ? { emailVerifiedAt: u.emailVerifiedAt } : {}) });
}
/** @param {unknown} value @returns {Tokens} */
export function parseTokens(value) {
  const t = record(value);
  const token = /^[0-9a-f-]{36}\.[0-9a-f]{64}$/;
  if (typeof t.accessToken !== 'string' || typeof t.refreshToken !== 'string' ||
    !token.test(t.accessToken) || !token.test(t.refreshToken) || t.accessToken === t.refreshToken ||
    t.accessToken.slice(0, 36) !== t.refreshToken.slice(0, 36) || !date(t.accessExpiresAt) || !date(t.sessionExpiresAt) ||
    Date.parse(/** @type {string} */ (t.accessExpiresAt)) > Date.parse(/** @type {string} */ (t.sessionExpiresAt))) throw invalid();
  return /** @type {Tokens} */ ({ accessToken: t.accessToken, refreshToken: t.refreshToken, accessExpiresAt: t.accessExpiresAt, sessionExpiresAt: t.sessionExpiresAt });
}
/** @param {unknown} value @param {boolean} allowDevelopmentCode @param {number} [now] @returns {Challenge} */
export function parseChallenge(value, allowDevelopmentCode, now = Date.now()) {
  const c = record(value);
  if (typeof c.challengeId !== 'string' || !/^[0-9a-f-]{36}$/.test(c.challengeId) || !date(c.expiresAt) ||
    !Number.isInteger(c.resendAfterSeconds) || Number(c.resendAfterSeconds) < 0 || Number(c.resendAfterSeconds) > 3600 ||
    !['simulated', 'accepted'].includes(/** @type {string} */ (c.dispatch))) throw invalid();
  if (c.dispatch === 'simulated' && !allowDevelopmentCode) throw new ApiError('Test login is unavailable in this build.', 'configuration');
  if (c.channel !== undefined && (c.channel !== 'whatsapp' || c.dispatch !== 'accepted')) throw invalid();
  if (c.dispatch === 'accepted' && c.developmentCode !== undefined) throw invalid();
  return /** @type {Challenge} */ ({ challengeId: c.challengeId, expiresAt: c.expiresAt,
    resendAt: now + Number(c.resendAfterSeconds) * 1000, dispatch: c.dispatch,
    ...(c.channel === 'whatsapp' ? { channel: 'whatsapp' } : {}),
    ...(allowDevelopmentCode && c.dispatch === 'simulated' && typeof c.developmentCode === 'string' && /^\d{6}$/.test(c.developmentCode)
      ? { developmentCode: c.developmentCode } : {}),
  });
}
