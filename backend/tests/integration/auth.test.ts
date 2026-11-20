import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../../src/app';
import { AuthService } from '../../src/services/auth.service';
import { developmentOtpProvider, type OtpProvider, type OtpDispatchResult } from '../../src/providers/otp/otp.provider';
import { ApiError } from '../../src/utils/ApiError';
import { tokenHash } from '../../src/utils/authCrypto';
import { captureLogger, config } from '../helpers';

// Explicit opt-in: creates and drops ONLY a random dedicated schema, never public.
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set AUTH_TEST_DATABASE_URL to run isolated PostgreSQL auth tests.');
const schema = `dearly_auth_test_${randomUUID().replaceAll('-', '')}`;
const url = new URL(databaseUrl);
url.searchParams.set('schema', schema);
url.searchParams.set('connection_limit', '5');
url.searchParams.set('connect_timeout', '15');
url.searchParams.set('pool_timeout', '15');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [], errorFormat: 'minimal' });
const adminUrl = new URL(databaseUrl);
adminUrl.searchParams.set('schema', 'public');
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } }, log: [], errorFormat: 'minimal' });
const pepper = 'a'.repeat(64);
const phone = '+12025550123';
const otherPhone = '+12025550124';
const minute = 60_000;
let time = Date.parse('2026-11-16T00:00:00Z');
const now = () => new Date(time);
const service = (provider: OtpProvider = developmentOtpProvider()) => new AuthService(db, pepper, provider, now, () => '123456');
const rejectCode = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;
const login = async (s: AuthService, number = phone) => {
  const challenge = await s.requestOtp(number);
  return (await s.verifyOtp(challenge.challengeId, '123456'))!;
};

// Suppress raw Prisma exceptions in test output; they can include datasource details.
test('PostgreSQL-backed auth security and HTTP contracts', { timeout: 240_000 }, async (t) => {
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    // Prisma model queries qualify schema; raw SQL does not set search_path
    // reliably through a transaction pool. Qualify every migration table first.
    const sql = readFileSync('prisma/migrations/202611160001_phone_auth/migration.sql', 'utf8')
      .replace(/"(users|phone_auth_states|otp_challenges|sessions|refresh_tokens)"/g, `"${schema}"."$1"`);
    for (const statement of sql.split(';').filter((s) => s.trim())) await db.$executeRawUnsafe(statement);
    const alertsSql = readFileSync('prisma/migrations/20261119060000_notifications_preferences/migration.sql', 'utf8')
      .replace(/"(users|sessions|account_preferences|notifications|push_devices|push_jobs)"/g, `"${schema}"."$1"`);
    for (const statement of alertsSql.replace(/^\s*--.*$/gm, '').split(';').filter(s => s.trim())) await db.$executeRawUnsafe(statement);
    const emailSql = readFileSync('prisma/migrations/20261120140000_verified_recipient_email/migration.sql', 'utf8').replace(/"(users|email_verifications)"/g, `"${schema}"."$1"`);
    for(const statement of emailSql.split(';').filter(s=>s.trim())) await db.$executeRawUnsafe(statement);
    const tables = await db.$queryRaw<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema}`;
    assert.equal(tables.length, 10);
    t.beforeEach(async () => {
      await db.refreshToken.deleteMany(); await db.session.deleteMany(); await db.user.deleteMany();
      await db.otpChallenge.deleteMany(); await db.phoneAuthState.deleteMany();
      time = Date.parse('2026-11-16T00:00:00Z');
    });

    await t.test('request, verify and profile use safe envelopes; secrets are hashed and excluded from logs', async () => {
      const logs = captureLogger();
      const s = service();
      const app = createApp({ ...config, authMode: 'development', otpPepper: pepper }, { prisma: db, isReady: async () => true, disconnect: async () => {} }, logs.logger, s);
      const code = await request(app).post('/auth/otp/request').send({ phone: '(202) 555-0123', country: 'US' }).expect(200);
      assert.equal(code.headers['cache-control'], 'no-store');
      assert.equal(code.body.data.dispatch, 'simulated');
      assert.equal(await db.user.count(), 0);
      const verified = await request(app).post('/auth/otp/verify').send({ challengeId: code.body.data.challengeId, code: code.body.data.developmentCode }).expect(200);
      const data = verified.body.data;
      const profile = await request(app).get('/auth/me').set('Authorization', `Bearer ${data.accessToken}`).expect(200);
      assert.equal(profile.body.data.phone, phone);
      assert.equal(profile.body.data.id, data.user.id);
      assert.equal(profile.headers['cache-control'], 'no-store');
      const stored = await db.otpChallenge.findUniqueOrThrow({ where: { id: code.body.data.challengeId } });
      assert.notEqual(stored.codeHash, code.body.data.developmentCode);
      const session = await db.session.findFirstOrThrow();
      assert.equal(session.accessHash, tokenHash(data.accessToken));
      assert.equal((await db.refreshToken.findFirstOrThrow()).hash, tokenHash(data.refreshToken));
      for (const secret of [phone, data.accessToken, data.refreshToken, code.body.data.developmentCode]) assert.ok(!JSON.stringify(logs.entries).includes(secret));
      await request(app).post('/auth/otp/verify').send({ challengeId: code.body.data.challengeId, code: '123456' }).expect(401);
    });

    await t.test('incorrect codes commit attempt counts; five failures lock a challenge', async () => {
      const s = service(); const c = await s.requestOtp(phone);
      for (let i = 0; i < 5; i++) await assert.rejects(s.verifyOtp(c.challengeId, '000000'), rejectCode('INVALID_OTP'));
      assert.equal((await db.otpChallenge.findUniqueOrThrow({ where: { id: c.challengeId } })).attempts, 5);
      await assert.rejects(s.verifyOtp(c.challengeId, '123456'), rejectCode('INVALID_OTP'));
      assert.equal(await db.user.count(), 0);
    });

    await t.test('expiry, reuse and concurrent verification cannot create duplicate sessions', async () => {
      const s = service(); const expired = await s.requestOtp(phone);
      time += 5 * minute;
      await assert.rejects(s.verifyOtp(expired.challengeId, '123456'), rejectCode('INVALID_OTP'));
      const fresh = await s.requestOtp(phone);
      const results = await Promise.allSettled([s.verifyOtp(fresh.challengeId, '123456'), s.verifyOtp(fresh.challengeId, '123456')]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(await db.session.count(), 1); assert.equal(await db.user.count(), 1);
    });

    await t.test('resend cooldown and replacement persist across service instances', async () => {
      const s = service(); const first = await s.requestOtp(phone);
      await assert.rejects(service().resendOtp(first.challengeId), rejectCode('AUTH_RATE_LIMITED'));
      time += minute; const next = await service().resendOtp(first.challengeId);
      await assert.rejects(s.verifyOtp(first.challengeId, '123456'), rejectCode('INVALID_OTP'));
      assert.ok((await s.verifyOtp(next.challengeId, '123456'))?.user);
      await assert.rejects(s.resendOtp(next.challengeId), rejectCode('INVALID_OTP'));
    });

    await t.test('phone request budget survives resends and concurrent requests', async () => {
      const s = service();
      for (let i = 0; i < 4; i++) { await s.requestOtp(phone); time += minute; }
      const results = await Promise.allSettled([s.requestOtp(phone), service().requestOtp(phone)]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      time += minute; await assert.rejects(s.requestOtp(phone), rejectCode('AUTH_RATE_LIMITED'));
      time += 60 * minute; await s.requestOtp(phone);
    });

    await t.test('phone failure budget is not reset by a new challenge', async () => {
      const s = service();
      for (let round = 0; round < 2; round++) {
        const c = await s.requestOtp(phone);
        for (let i = 0; i < 5; i++) await assert.rejects(s.verifyOtp(c.challengeId, '000000'), rejectCode('INVALID_OTP'));
        time += minute;
      }
      const c = await s.requestOtp(phone);
      await assert.rejects(s.verifyOtp(c.challengeId, '123456'), rejectCode('AUTH_RATE_LIMITED'));
      time += 16 * minute; const next = await s.requestOtp(phone);
      assert.ok(await s.verifyOtp(next.challengeId, '123456'));
    });

    await t.test('refresh rotates both tokens and replay revokes the complete session', async () => {
      const s = service(); const first = await login(s);
      const next = (await s.refresh(first.refreshToken))!;
      assert.notEqual(first.refreshToken, next.refreshToken);
      await assert.rejects(s.authenticate(first.accessToken), rejectCode('UNAUTHORIZED'));
      await assert.rejects(s.authenticate(next.refreshToken), rejectCode('UNAUTHORIZED'));
      await assert.rejects(s.refresh(next.accessToken), rejectCode('UNAUTHORIZED'));
      await s.authenticate(next.accessToken);
      await assert.rejects(s.refresh(first.refreshToken), rejectCode('UNAUTHORIZED'));
      await assert.rejects(s.authenticate(next.accessToken), rejectCode('UNAUTHORIZED'));
      await assert.rejects(s.refresh(next.refreshToken), rejectCode('UNAUTHORIZED'));
    });

    await t.test('concurrent refresh has one winner then revokes on replay', async () => {
      const s = service(); const first = await login(s);
      const results = await Promise.allSettled([s.refresh(first.refreshToken), service().refresh(first.refreshToken)]);
      const success = results.find((r) => r.status === 'fulfilled');
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.ok(success?.status === 'fulfilled' && success.value);
      await assert.rejects(s.authenticate(success.value.accessToken), rejectCode('UNAUTHORIZED'));
    });

    await t.test('expired access can refresh; absolute session expiry cannot', async () => {
      const s = service(); const first = await login(s); time += 15 * minute;
      await assert.rejects(s.authenticate(first.accessToken), rejectCode('UNAUTHORIZED'));
      const next = (await s.refresh(first.refreshToken))!;
      assert.equal(next.sessionExpiresAt.getTime(), first.sessionExpiresAt.getTime());
      time += 30 * 24 * 60 * minute;
      await assert.rejects(s.refresh(next.refreshToken), rejectCode('UNAUTHORIZED'));
    });

    await t.test('logout revokes only the caller session; profile rejects ownership and identity changes', async () => {
      const s = service(); const first = await login(s); const second = await login(s, otherPhone);
      const logs = captureLogger();
      const app = createApp({ ...config, authMode: 'development' }, { isReady: async () => true, disconnect: async () => {} }, logs.logger, s);
      const auth = `Bearer ${first.accessToken}`;
      await request(app).get('/auth/me').expect(401);
      await request(app).get('/auth/me').set('Authorization', `Bearer ${first.refreshToken}`).expect(401);
      await request(app).patch('/auth/me').set('Authorization', auth).send({ userId: second.user.id, name: 'Hacked' }).expect(400);
      await request(app).patch('/auth/me').set('Authorization', auth).send({ phone: otherPhone }).expect(400);
      const changed = await request(app).patch('/auth/me').set('Authorization', auth).send({ name: 'Dearly', timezone: 'Asia/Kolkata', email: 'demo@example.com' }).expect(200);
      assert.equal(changed.body.data.id, first.user.id);
      assert.equal((await s.getProfile(await s.authenticate(second.accessToken))).name, null);
      await request(app).post('/auth/logout').set('Authorization', auth).expect(200);
      await request(app).get('/auth/me').set('Authorization', auth).expect(401);
      await assert.rejects(s.refresh(first.refreshToken), rejectCode('UNAUTHORIZED'));
      await s.authenticate(second.accessToken);
    });

    await t.test('provider rejection or uncertainty never yields a usable code', async () => {
      for (const outcome of ['rejected', 'unknown', 'throws'] as const) {
        const s = service({ dispatch: async () => { if (outcome === 'throws') throw new Error('private-provider-key'); return { status: outcome, code: 'safe' }; } });
        await assert.rejects(s.requestOtp(phone), rejectCode('OTP_UNAVAILABLE'));
        const c = await db.otpChallenge.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
        await assert.rejects(s.verifyOtp(c.id, '123456'), rejectCode('INVALID_OTP'));
        time += minute;
      }
      assert.equal(await db.user.count(), 0);
    });

    await t.test('pending dispatch cannot verify and superseded dispatch cannot become active', async () => {
      let finish: ((outcome: OtpDispatchResult) => void) | undefined;
      const s = service({ dispatch: () => new Promise((resolve) => { finish = resolve; }) });
      const pending = s.requestOtp(phone);
      // Poll persisted reservation, bounded without timing-sensitive fixed sleeps.
      let c;
      for (let i = 0; i < 100; i++) { c = await db.otpChallenge.findFirst(); if (c && finish) break; await new Promise((r) => setTimeout(r, 10)); }
      assert.ok(c && finish);
      await assert.rejects(service().verifyOtp(c.id, '123456'), rejectCode('INVALID_OTP'));
      time += minute; const next = await service().requestOtp(phone);
      const rejection = assert.rejects(pending, rejectCode('OTP_UNAVAILABLE'));
      finish({ status: 'simulated', developmentCode: '123456' }); await rejection;
      await assert.rejects(service().verifyOtp(c.id, '123456'), rejectCode('INVALID_OTP'));
      assert.ok(await service().verifyOtp(next.challengeId, '123456'));
    });

    await t.test('cold gateway probes never create codes, expire earlier codes or consume budgets', async () => {
      const readyProvider: OtpProvider = {readiness:async()=> 'READY',dispatch:async()=>({status:'simulated',developmentCode:'123456'})};
      const original = await service(readyProvider).requestOtp(phone);
      let sends=0;
      const cold: OtpProvider = {readiness:async()=> 'WARMING',budget:{key:'cold-gateway-budget',dailyLimit:20},dispatch:async()=>{sends++;return {status:'simulated',developmentCode:'123456'};}};
      const s=service(cold);
      assert.equal((await s.otpStatus()).status,'WARMING');
      await assert.rejects(s.requestOtp(phone),rejectCode('OTP_GATEWAY_WARMING'));
      await assert.rejects(s.resendOtp(original.challengeId),rejectCode('OTP_GATEWAY_WARMING'));
      assert.equal(sends,0);assert.equal(await db.otpChallenge.count(),1);
      assert.equal((await db.otpChallenge.findUniqueOrThrow({where:{id:original.challengeId}})).consumedAt,null);
      assert.equal((await db.phoneAuthState.findUniqueOrThrow({where:{phone}})).requestCount,1);
    });

    await t.test('read-only gateway polling does not exhaust the OTP write limit', async () => {
      const logs=captureLogger(), s=service();
      const app=createApp({...config,authMode:'development'}, {isReady:async()=>true,disconnect:async()=>{}},logs.logger,s);
      for(let n=0;n<15;n++)await request(app).get('/auth/otp/status').expect(200);
      await request(app).post('/auth/otp/request').send({phone,country:'US'}).expect(200);
    });

    await t.test('malformed requests are safe and the auth IP budget is enforced', async () => {
      const logs = captureLogger(); const s = service();
      const app = createApp({ ...config, authMode: 'development' }, { isReady: async () => true, disconnect: async () => {} }, logs.logger, s);
      for (let i = 0; i < 30; i++) await request(app).post('/auth/otp/request').send({ phone: 'private-input', country: 'US' }).expect(400);
      const denied = await request(app).post('/auth/otp/request').send({ phone, country: 'US' }).expect(429);
      assert.ok(denied.headers['retry-after']);
      assert.equal(await db.otpChallenge.count(), 0);
      assert.ok(!JSON.stringify(logs.entries).includes('private-input'));
      await request(app).get('/health').expect(200);
    });
  } catch (error) {
    if (error instanceof assert.AssertionError || error instanceof ApiError) throw error;
    throw new Error('Isolated PostgreSQL auth checks failed; inspect safe test assertions and database reachability.', {
      // eslint-disable-next-line preserve-caught-error -- Raw database errors may contain secrets; retain only the error type.
      cause: { name: error instanceof Error ? error.name : 'Unknown' },
    });
  } finally {
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  }
});
