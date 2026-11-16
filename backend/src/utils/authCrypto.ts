import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const newOtp = () => randomInt(0, 1_000_000).toString().padStart(6, '0');
export const newToken = (sessionId: string) => `${sessionId}.${randomBytes(32).toString('hex')}`;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const otpHash = (pepper: string, id: string, code: string) =>
  createHmac('sha256', pepper).update(`${id}:${code}`).digest('hex');
export function matchesHash(actual: string, expected: string) {
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
export function sessionIdFromToken(token: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/.test(token)
    ? token.slice(0, 36) : null;
}
