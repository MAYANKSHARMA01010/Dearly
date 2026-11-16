import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app';
import { parseEnvironment, EnvironmentError } from '../src/configs/env';
import { newOtp, newToken, otpHash, tokenHash, sessionIdFromToken } from '../src/utils/authCrypto';
import { profileSchema, requestOtpSchema } from '../src/validators/auth.validators';
import { captureLogger, config, fakeDatabase } from './helpers';

test('phone validation uses explicit country, full metadata and canonical E.164', () => {
  assert.deepEqual(requestOtpSchema.parse({ phone: '(202) 555-0123', country: 'US' }), { phone: '+12025550123' });
  assert.deepEqual(requestOtpSchema.parse({ phone: '+91 98765 43210', country: 'IN' }), { phone: '+919876543210' });
  for (const input of [
    { phone: '9876543210' }, { phone: '123', country: 'IN' },
    { phone: '+12025550123', country: 'IN' }, { phone: '+12025550123 ext 12', country: 'US' },
    { phone: 'call +12025550123', country: 'US' }, { phone: '+12025550123', country: 'XX' },
  ]) assert.equal(requestOtpSchema.safeParse(input).success, false);
});

test('development auth is opt-in and cannot start in production or on a public bind', () => {
  const base = { DATABASE_URL: config.databaseUrl, AUTH_MODE: 'development', OTP_PEPPER: 'a'.repeat(64) };
  assert.equal(parseEnvironment({ DATABASE_URL: config.databaseUrl }).authMode, 'disabled');
  assert.equal(parseEnvironment(base).authMode, 'development');
  for (const fields of [{ NODE_ENV: 'production' }, { HOST: '0.0.0.0' }, { HOST: '::' }, { OTP_PEPPER: '' }, { OTP_PEPPER: undefined }]) {
    assert.throws(() => parseEnvironment({ ...base, ...fields }), EnvironmentError);
  }
  assert.equal(parseEnvironment({ ...base, NODE_ENV: 'production', AUTH_MODE: 'disabled' }).authMode, 'disabled');
});

test('secrets use distinct hashes and cryptographically generated OTP/token shapes', () => {
  const id = randomUUID();
  const tokens = new Set(Array.from({ length: 100 }, () => newToken(id)));
  assert.equal(tokens.size, 100);
  for (const token of tokens) { assert.equal(sessionIdFromToken(token), id); assert.notEqual(tokenHash(token), token); }
  for (let i = 0; i < 100; i++) assert.match(newOtp(), /^\d{6}$/);
  assert.notEqual(otpHash('a'.repeat(64), id, '123456'), otpHash('b'.repeat(64), id, '123456'));
  assert.notEqual(otpHash('a'.repeat(64), id, '123456'), otpHash('a'.repeat(64), randomUUID(), '123456'));
  assert.equal(sessionIdFromToken('invalid'), null);
});

test('profile validation rejects identity changes, invalid timezone and empty updates', () => {
  for (const value of [{}, { phone: '+12025550123' }, { userId: randomUUID() }, { role: 'ADMIN' }, { timezone: 'invalid' }, { email: 'invalid' }]) {
    assert.equal(profileSchema.safeParse(value).success, false);
  }
  assert.deepEqual(profileSchema.parse({ name: '  Dearly  ', timezone: 'Asia/Kolkata', email: null }), { name: 'Dearly', timezone: 'Asia/Kolkata', email: null });
});

test('disabled auth has safe errors, no cache and leaves health available', async () => {
  const app = createApp(config, fakeDatabase(), captureLogger().logger);
  for (const route of ['/auth/otp/request', '/auth/refresh', '/auth/logout']) {
    const response = await request(app).post(route).send({ phone: 'private-phone' }).expect(503);
    assert.equal(response.body.error.code, 'AUTH_DISABLED');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.doesNotMatch(JSON.stringify(response.body), /private-phone/);
  }
  await request(app).get('/health').expect(200);
});
