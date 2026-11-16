import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, createApiClient } from '../src/api/client.js';
import { createSessionManager } from '../src/services/auth/sessionManager.js';
import { createAuthService } from '../src/services/auth/authService.js';
import { parseChallenge } from '../src/services/auth/contracts.js';

const clock = Date.parse('2026-11-16T00:00:00Z');
const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const scope = 'http://localhost:8080';
const token = (char) => `${id}.${char.repeat(64)}`;
const tokens = (expired = false) => ({ accessToken: token('a'), refreshToken: token('b'), accessExpiresAt: new Date(clock + (expired ? -1 : 900000)).toISOString(), sessionExpiresAt: new Date(clock + 86400000).toISOString() });
const rotated = { ...tokens(), accessToken: token('c'), refreshToken: token('d'), accessExpiresAt: new Date(clock + 1800000).toISOString() };
const user = { id, phone: '+12025550123', name: 'Demo', email: null, timezone: 'UTC', phoneVerifiedAt: new Date(clock).toISOString(), createdAt: new Date(clock).toISOString() };
const saved = (expired = false, more = {}) => JSON.stringify({ scope, tokens: tokens(expired), refreshPending: false, ...more });
const memory = (value = null) => ({ value, writes: 0, async read() { return this.value; }, async write(next) { this.writes++; this.value = next; }, async clear() { this.value = null; } });
const unauthorized = () => new ApiError('Session ended.', 'http', 401);
const network = () => new ApiError('Unavailable.', 'network');
const manager = (storage, request, extras = {}) => createSessionManager({ storage, client: { request }, getScope: () => scope, now: () => clock, ...extras });
const until = async (predicate) => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise((r) => setTimeout(r, 1)); } assert.fail('Condition did not resolve'); };

test('no credentials restores anonymous without making network calls', async () => {
  const s = manager(memory(), async () => assert.fail('Unexpected request'));
  await s.restore(); assert.equal(s.getSnapshot().status, 'anonymous');
});

test('restoration validates profile remotely and persists no personal profile', async () => {
  const store = memory(); const calls = [];
  const s = manager(store, async (path, options) => { calls.push({ path, options }); return user; });
  await s.establish({ ...tokens(), user });
  assert.equal(store.value.includes(user.phone), false);
  const fresh = manager(store, async (path, options) => { calls.push({ path, options }); return user; });
  assert.equal(fresh.getSnapshot().user, null); await fresh.restore();
  assert.equal(fresh.getSnapshot().status, 'authenticated'); assert.deepEqual(fresh.getSnapshot().user, user);
  assert.equal(calls[0].path, '/auth/me'); assert.equal(calls[0].options.headers.Authorization, `Bearer ${tokens().accessToken}`);
});

test('scope changes, malformed storage and interrupted refresh are cleared without sending tokens', async () => {
  for (const value of [saved(false, { scope: 'https://other.example' }), saved(false, { refreshPending: true }), 'invalid JSON', JSON.stringify({ tokens: {} })]) {
    const store = memory(value); const s = manager(store, async () => assert.fail('Unexpected credential dispatch'));
    await s.restore(); assert.equal(store.value, null); assert.equal(s.getSnapshot().status, 'anonymous');
  }
});

test('offline restoration hides the profile but retains credentials for explicit retry', async () => {
  const store = memory(saved()); let offline = true;
  const s = manager(store, async () => { if (offline) throw network(); return user; });
  await s.restore(); assert.equal(s.getSnapshot().status, 'blocked'); assert.equal(s.getSnapshot().user, null); assert.ok(store.value);
  offline = false; await s.restore(); assert.equal(s.getSnapshot().status, 'authenticated');
});

test('concurrent expired-session reads serialize one refresh and atomically replace credentials', async () => {
  const store = memory(); let count = 0; let expired = false;
  const s = manager(store, async (path, options) => {
    if (path === '/auth/refresh') { count++; assert.equal(JSON.parse(store.value).refreshPending, true); return rotated; }
    assert.equal(options.headers.Authorization, `Bearer ${expired ? rotated.accessToken : tokens().accessToken}`); return user;
  }, { now: () => expired ? clock + 900001 : clock });
  await s.establish({ ...tokens(), user }); expired = true;
  await Promise.all([s.loadProfile(), s.loadProfile(), s.loadProfile()]);
  assert.equal(count, 1); assert.deepEqual(JSON.parse(store.value).tokens, rotated); assert.equal(JSON.parse(store.value).refreshPending, false);
});

test('401 read refreshes once and retries only that read', async () => {
  const store = memory(saved()); let count = 0; let refreshed = false;
  const s = manager(store, async (path) => {
    if (path === '/auth/refresh') { count++; refreshed = true; return rotated; }
    if (!refreshed) throw unauthorized(); return user;
  });
  await s.restore(); assert.equal(count, 1); assert.equal(s.getSnapshot().status, 'authenticated');
});

test('revoked refresh clears credentials and exposes no protected profile', async () => {
  const store = memory(saved(true)); const s = manager(store, async () => { throw unauthorized(); });
  await s.restore(); assert.equal(store.value, null); assert.equal(s.getSnapshot().status, 'anonymous'); assert.equal(s.getSnapshot().user, null);
});

test('uncertain refresh is never replayed after restart', async () => {
  const store = memory(saved(true)); let requests = 0;
  const s = manager(store, async () => { requests++; throw network(); });
  await s.restore(); await s.restore(); assert.equal(requests, 1); assert.equal(store.value, null); assert.equal(s.getSnapshot().status, 'anonymous');
});

test('absolute session expiry cannot be refreshed', async () => {
  const store = memory(saved(true, { tokens: { ...tokens(true), sessionExpiresAt: new Date(clock - 1).toISOString() } }));
  const s = manager(store, async () => assert.fail('Expired session sent'));
  await s.restore(); assert.equal(store.value, null); assert.equal(s.getSnapshot().status, 'anonymous');
});

test('profile writes are not automatically repeated after a 401', async () => {
  const store = memory(); let writes = 0; let refreshed = false;
  const s = manager(store, async (path, options) => {
    if (path === '/auth/refresh') { refreshed = true; return rotated; }
    if (options.method === 'PATCH') { writes++; if (!refreshed) throw unauthorized(); return { ...user, name: 'Changed' }; }
    return user;
  });
  await s.establish({ ...tokens(), user });
  await assert.rejects(s.updateProfile({ name: 'Changed', email: null, timezone: 'UTC' }), (e) => e.status === 409);
  assert.equal(writes, 1); assert.equal(s.getSnapshot().status, 'authenticated');
  await s.updateProfile({ name: 'Changed', email: null, timezone: 'UTC' }); assert.equal(writes, 2); assert.equal(s.getSnapshot().user.name, 'Changed');
});

test('logout invalidates an in-flight refresh and late results cannot resurrect a session', async () => {
  const store = memory(); let finish; let entered = false; let expired = false; let refreshCalls = 0;
  const s = manager(store, async (path) => {
    if (path === '/auth/refresh') { if (++refreshCalls > 1) throw unauthorized(); entered = true; return await new Promise((resolve) => { finish = resolve; }); }
    return user;
  }, { now: () => expired ? clock + 900001 : clock });
  await s.establish({ ...tokens(), user }); expired = true;
  const read = s.loadProfile(); const failedRead = assert.rejects(read); await until(() => entered);
  const out = s.logout(); assert.equal(s.getSnapshot().user, null);
  finish(rotated); await failedRead; await out;
  assert.equal(store.value, null); assert.equal(s.getSnapshot().status, 'anonymous');
});

test('logout clears local credentials even when the server is offline', async () => {
  const store = memory(); const s = manager(store, async () => { throw network(); });
  await s.establish({ ...tokens(), user }); await s.logout();
  assert.equal(store.value, null); assert.equal(s.getSnapshot().status, 'anonymous'); assert.match(s.getSnapshot().message, /could not be confirmed/);
});

test('storage failure blocks sign-in and clear failure exposes a recovery state', async () => {
  const store = memory(); store.write = async () => { throw Error('private-native-error'); };
  const s = manager(store, async () => user);
  await assert.rejects(s.establish({ ...tokens(), user })); assert.equal(s.getSnapshot().status, 'anonymous');
  store.clear = async () => { throw Error('private-native-error'); };
  await assert.rejects(s.logout()); assert.equal(s.getSnapshot().status, 'blocked'); assert.equal(s.getSnapshot().user, null);
  assert.ok(!s.getSnapshot().message.includes('private-native-error'));
});

test('cancelled login cannot persist credentials or open protected screens', async () => {
  const store = memory(); const s = manager(store, async () => user); const controller = new AbortController(); controller.abort();
  await assert.rejects(s.establish({ ...tokens(), user }, controller.signal)); assert.equal(store.value, null); assert.notEqual(s.getSnapshot().status, 'authenticated');
});

test('safe API errors retain only known codes and bounded retry metadata', async () => {
  const client = createApiClient({ getBaseUrl: () => scope, fetcher: async () => new Response(JSON.stringify({ error: { code: 'INVALID_OTP', message: 'private-server-secret' } }), { status: 401, headers: { 'Retry-After': '90' } }) });
  await assert.rejects(client.request('/auth/otp/verify'), (e) => { assert.equal(e.code, 'INVALID_OTP'); assert.equal(e.retryAfterSeconds, 90); assert.ok(!e.message.includes('private-server-secret')); return true; });
});

test('OTP simulation is gated to development, countdown uses server delay and auth writes never retry', async () => {
  const data = { challengeId: id, expiresAt: new Date(clock + 300000).toISOString(), resendAfterSeconds: 60, dispatch: 'simulated', developmentCode: '123456' };
  assert.equal(parseChallenge(data, true, clock).resendAt, clock + 60000);
  assert.equal(parseChallenge(data, true, clock).developmentCode, '123456');
  assert.throws(() => parseChallenge(data, false, clock));
  let requests = 0;
  const client = { request: async () => { requests++; throw network(); } };
  const auth = createAuthService(client, true);
  await assert.rejects(auth.requestOtp('2025550123', 'US')); assert.equal(requests, 1);
  await assert.rejects(auth.verifyOtp(id, '123456')); assert.equal(requests, 2);
});

test('logout never sends old credentials to a different API scope', async () => {
  const store = memory(); let current = scope;
  const s = manager(store, async () => assert.fail('Wrong-scope credential dispatch'), { getScope: () => current });
  await s.establish({ ...tokens(), user }); current = 'https://other.example';
  await s.logout(); assert.equal(store.value, null); assert.equal(s.getSnapshot().status, 'anonymous');
});

test('logout after local access expiry renews only to revoke, without saving new tokens', async () => {
  const store = memory(); let expired = false; const calls = [];
  const s = manager(store, async (path, options) => {
    assert.equal(store.value, null); calls.push(path);
    if (path === '/auth/refresh') return rotated;
    assert.equal(options.headers.Authorization, `Bearer ${rotated.accessToken}`); return { loggedOut: true };
  }, { now: () => expired ? clock + 900001 : clock });
  await s.establish({ ...tokens(), user }); expired = true; await s.logout();
  assert.deepEqual(calls, ['/auth/refresh', '/auth/logout']); assert.equal(store.value, null); assert.equal(s.getSnapshot().status, 'anonymous');
});
