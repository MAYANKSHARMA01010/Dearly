import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createApiClient } from '../../src/api/client.js';
import { createAuthService } from '../../src/services/auth/authService.js';
import { createSessionManager } from '../../src/services/auth/sessionManager.js';

const require = createRequire(new URL('../../../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const { createApp } = require('./dist/app.js');
const { parseEnvironment } = require('./dist/configs/env.js');
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseUrl) throw Error('Set AUTH_TEST_DATABASE_URL to run isolated mobile/auth integration tests.');
const schema = `dearly_mobile_test_${randomUUID().replaceAll('-', '')}`;
const url = new URL(databaseUrl); url.searchParams.set('schema', schema);
const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [], errorFormat: 'minimal' });
const admin = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [], errorFormat: 'minimal' });

test('real mobile client and PostgreSQL auth: login, profile, restart, expiry, rotation and logout', { timeout: 90000 }, async () => {
  let server;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const sql = readFileSync(new URL('../../../backend/prisma/migrations/202611160001_phone_auth/migration.sql', import.meta.url), 'utf8')
      .replace(/"(users|phone_auth_states|otp_challenges|sessions|refresh_tokens)"/g, `"${schema}"."$1"`);
    for (const statement of sql.split(';').filter((s) => s.trim())) await db.$executeRawUnsafe(statement);
    const alertSql = readFileSync(new URL('../../../backend/prisma/migrations/20261119060000_notifications_preferences/migration.sql', import.meta.url), 'utf8')
      .replace(/"(users|sessions|account_preferences|notifications|push_devices|push_jobs)"/g, `"${schema}"."$1"`);
    for (const statement of alertSql.replace(/^\s*--.*$/gm, '').split(';').filter(s => s.trim())) await db.$executeRawUnsafe(statement);

    const config = parseEnvironment({ NODE_ENV: 'test', DATABASE_URL: url.toString(), AUTH_MODE: 'development', OTP_PEPPER: randomBytes(32).toString('hex') });
    const logger = { info() {}, warn() {}, error() {} };
    server = createServer(createApp(config, { prisma: db, isReady: async () => true, disconnect: async () => {} }, logger));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const scope = `http://127.0.0.1:${server.address().port}`;
    const client = createApiClient({ getBaseUrl: () => scope }); const auth = createAuthService(client, true);
    const store = { value: null, async read() { return this.value; }, async write(value) { this.value = value; }, async clear() { this.value = null; } };
    const manager = () => createSessionManager({ client, storage: store, getScope: () => scope });
    const code = await auth.requestOtp('2025550197', 'US');
    assert.equal(code.dispatch, 'simulated'); assert.equal(await db.user.count(), 0);
    await assert.rejects(auth.verifyOtp(code.challengeId, code.developmentCode === '000000' ? '000001' : '000000'), (e) => e.code === 'INVALID_OTP');
    const signedIn = manager(); await signedIn.establish(await auth.verifyOtp(code.challengeId, code.developmentCode));
    assert.equal(signedIn.getSnapshot().status, 'authenticated');
    await signedIn.updateProfile({ name: 'Mobile QA', email: 'qa@example.com', timezone: 'Asia/Kolkata' });
    const restarted = manager(); await restarted.restore(); assert.equal(restarted.getSnapshot().user.name, 'Mobile QA');
    const row = await db.session.findFirstOrThrow();
    await db.session.update({ where: { id: row.id }, data: { accessExpiresAt: new Date(Date.now() - 1000) } });
    await Promise.all([restarted.loadProfile(), restarted.loadProfile()]);
    assert.equal(await db.refreshToken.count({ where: { usedAt: { not: null } } }), 1);
    assert.notEqual((await db.session.findFirstOrThrow()).accessHash, row.accessHash);
    const captured = store.value;
    await restarted.logout(); assert.equal(store.value, null);
    assert.ok((await db.session.findFirstOrThrow()).revokedAt);
    store.value = captured; const revoked = manager(); await revoked.restore();
    assert.equal(revoked.getSnapshot().status, 'anonymous'); assert.equal(store.value, null);
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    // No raw database/provider errors or credentials in test output.
    throw Error('Mobile/auth integration did not complete. Check database access and safe assertions.');
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await db.$disconnect(); await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
  }
});
