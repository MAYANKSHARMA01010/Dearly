import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../../src/app';
import { parseEnvironment } from '../../src/configs/env';
import { AuthService } from '../../src/services/auth.service';
import { developmentOtpProvider } from '../../src/providers/otp/otp.provider';
import { captureLogger } from '../helpers';
import { tokenHash } from '../../src/utils/authCrypto';

const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Set AUTH_TEST_DATABASE_URL for isolated draft tests.');
const schema = `dearly_draft_test_${randomUUID().replaceAll('-', '')}`;
const url = new URL(databaseUrl); url.searchParams.set('schema', schema); url.searchParams.set('connection_limit', '5');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [], errorFormat: 'minimal' });
const admin = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [], errorFormat: 'minimal' });
const pepper = randomBytes(32).toString('hex');
const config = { ...parseEnvironment({ NODE_ENV: 'test', DATABASE_URL: url.toString(), AUTH_MODE: 'development', OTP_PEPPER: pepper }), rateLimitMax: 1000 };
const auth = new AuthService(db, pepper, developmentOtpProvider());
const logs = captureLogger();
const app = createApp(config, { prisma: db, isReady: async () => true, disconnect: async () => {} }, logs.logger, auth);
const route = '/messages/drafts';
const header = (token: string) => `Bearer ${token}`;
let ownerId: string, otherId: string, ownerToken: string, otherToken: string;

// Only a disposable, explicitly named random schema is written/dropped.
test('PostgreSQL draft ownership, recipients, revisions and pagination', { timeout: 180000 }, async (t) => {
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for (const folder of readdirSync('prisma/migrations').filter((name) => /^\d/.test(name)).sort()) {
      const sql = readFileSync(`prisma/migrations/${folder}/migration.sql`, 'utf8')
        .replace(/"(users|phone_auth_states|otp_challenges|sessions|refresh_tokens|draft_messages|draft_recipients|attachments|delivery_intents|delivery_work|delivery_attempts|inbox_items|worker_heartbeats|message_events|email_deliveries|email_budgets|EmailState|MessageEventKind|WorkState|AttemptState|MessageStatus|RecipientType|AttachmentState|DeliveryChannel)"/g, `"${schema}"."$1"`);
      for (const statement of sql.split(';').filter((s) => s.trim())) await db.$executeRawUnsafe(statement);
    }
    assert.equal((await db.$queryRaw<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema}`).length, 16);
    // Log in through the actual HTTP auth contract; subsequent tests use real
    // database-backed bearer sessions, never a fake owner header.
    const login = async (phone: string) => {
      const code = await request(app).post('/auth/otp/request').send({ phone, country: 'US' }).expect(200);
      const verified = await request(app).post('/auth/otp/verify').send({ challengeId: code.body.data.challengeId, code: code.body.data.developmentCode }).expect(200);
      return verified.body.data;
    };
    const owner = await login('2025550180'); const other = await login('2025550181');
    ownerId = owner.user.id; otherId = other.user.id; ownerToken = owner.accessToken; otherToken = other.accessToken;
    t.beforeEach(async () => { await db.draftMessage.deleteMany(); logs.entries.length = 0; });

    await t.test('create stores all recipient types, canonicalizes duplicates and never links claimed destinations', async () => {
      await db.user.update({ where: { id: otherId }, data: { email: 'other@example.com' } });
      const created = await request(app).post(route).set('Authorization', header(ownerToken)).send({
        subject: '  A future hello  ', text: 'private-draft-content\nkept intact', occasion: 'Birthday', recipients: [
          { type: 'SELF', label: 'Myself' }, { type: 'USER', userId: ownerId }, { type: 'USER', userId: otherId },
          { type: 'PHONE', phone: '(202) 555-0181', country: 'US' }, { type: 'PHONE', phone: '+12025550181', country: 'US' },
          { type: 'EMAIL', email: 'Other@Example.COM' }, { type: 'EMAIL', email: 'other@example.com' },
        ],
      }).expect(201);
      const draft = created.body.data;
      assert.equal(created.headers['cache-control'], 'no-store'); assert.equal(draft.status, 'DRAFT'); assert.equal(draft.version, 1);
      assert.equal(draft.subject, 'A future hello'); assert.equal(draft.recipients.length, 4);
      assert.deepEqual(draft.recipients.map((r: { type: string }) => r.type), ['SELF', 'USER', 'PHONE', 'EMAIL']);
      assert.equal(draft.recipients[2].phone, '+12025550181'); assert.equal(draft.recipients[3].email, 'other@example.com');
      assert.equal((await db.draftRecipient.findFirstOrThrow({ where: { type: 'PHONE' } })).targetUserId, null);
      assert.equal((await db.draftRecipient.findFirstOrThrow({ where: { type: 'EMAIL' } })).targetUserId, null);
      assert.ok(!JSON.stringify(logs.entries).includes('private-draft-content'));
      assert.ok(!JSON.stringify(logs.entries).includes('other@example.com'));
      const read = await request(app).get(`${route}/${draft.id}`).set('Authorization', header(ownerToken)).expect(200);
      assert.deepEqual(read.body.data, draft);
      await request(app).get(`${route}/${draft.id}`).set('Authorization', header(otherToken)).expect(404);
      // Draft creation has no schedule, delivery/provider or received-message record.
      assert.equal(await db.draftMessage.count(), 1); assert.equal(await db.draftRecipient.count(), 4);
    });

    await t.test('guests, refresh-token holders and revoked sessions cannot access any draft operation', async () => {
      await request(app).post(route).send({}).expect(401); await request(app).get(route).expect(401);
      await request(app).get(`${route}/invalid-id`).expect(401);
      await request(app).get(route).set('Authorization', header(owner.refreshToken)).expect(401);
      const token = `${randomUUID()}.${randomBytes(32).toString('hex')}`;
      const session = await db.session.create({ data: { userId: ownerId, accessHash: tokenHash(token), accessExpiresAt: new Date(Date.now() + 60000), expiresAt: new Date(Date.now() + 60000), revokedAt: new Date() } });
      await request(app).get(route).set('Authorization', header(token)).expect(401);
      await db.session.delete({ where: { id: session.id } });
    });

    await t.test('foreign drafts are indistinguishable from unknown drafts and never appear in lists', async () => {
      const draft = (await request(app).post(route).set('Authorization', header(ownerToken)).send({ text: 'private-other-account' }).expect(201)).body.data;
      const unknown = randomUUID();
      for (const id of [draft.id, unknown]) {
        const read = await request(app).get(`${route}/${id}`).set('Authorization', header(otherToken)).expect(404);
        assert.equal(read.body.error.code, 'DRAFT_NOT_FOUND');
        await request(app).patch(`${route}/${id}`).set('Authorization', header(otherToken)).send({ version: 1, text: 'Hacked' }).expect(404);
        await request(app).delete(`${route}/${id}?version=1`).set('Authorization', header(otherToken)).expect(404);
      }
      const list = await request(app).get(route).set('Authorization', header(otherToken)).expect(200);
      assert.deepEqual(list.body.data, { items: [], nextCursor: null });
      assert.equal((await db.draftMessage.findUniqueOrThrow({ where: { id: draft.id } })).text, 'private-other-account');
    });

    await t.test('partial update preserves omitted fields; explicit empty values clear content and recipients', async () => {
      const draft = (await request(app).post(route).set('Authorization', header(ownerToken)).send({ text: 'Hello', subject: 'Subject', occasion: 'Birthday', recipients: [{ type: 'SELF' }] }).expect(201)).body.data;
      const updated = (await request(app).patch(`${route}/${draft.id}`).set('Authorization', header(ownerToken)).send({ version: 1, text: 'Edited' }).expect(200)).body.data;
      assert.equal(updated.version, 2); assert.equal(updated.subject, 'Subject'); assert.equal(updated.recipients.length, 1);
      const cleared = (await request(app).patch(`${route}/${draft.id}`).set('Authorization', header(ownerToken)).send({ version: 2, text: '', subject: null, occasion: null, recipients: [] }).expect(200)).body.data;
      assert.equal(cleared.version, 3); assert.equal(cleared.text, ''); assert.equal(cleared.subject, null); assert.equal(cleared.occasion, null); assert.deepEqual(cleared.recipients, []);
    });

    await t.test('invalid targets roll back both message edits and recipient replacement', async () => {
      const draft = (await request(app).post(route).set('Authorization', header(ownerToken)).send({ text: 'Original', recipients: [{ type: 'SELF' }] }).expect(201)).body.data;
      await request(app).post(route).set('Authorization', header(ownerToken)).send({ recipients: [{ type: 'USER', userId: randomUUID() }] }).expect(400);
      const invalid = await request(app).patch(`${route}/${draft.id}`).set('Authorization', header(ownerToken)).send({ version: 1, text: 'Must not save', recipients: [{ type: 'USER', userId: randomUUID() }] }).expect(400);
      assert.equal(invalid.body.error.code, 'INVALID_RECIPIENTS');
      const read = (await request(app).get(`${route}/${draft.id}`).set('Authorization', header(ownerToken)).expect(200)).body.data;
      assert.deepEqual(read, draft); assert.equal(await db.draftMessage.count(), 1);
    });

    await t.test('concurrent updates have exactly one winner and cannot mix recipient/body versions', async () => {
      const draft = (await request(app).post(route).set('Authorization', header(ownerToken)).send({ text: 'Initial' }).expect(201)).body.data;
      const results = await Promise.all([
        request(app).patch(`${route}/${draft.id}`).set('Authorization', header(ownerToken)).send({ version: 1, text: 'Winner A', recipients: [{ type: 'SELF' }] }),
        request(app).patch(`${route}/${draft.id}`).set('Authorization', header(ownerToken)).send({ version: 1, text: 'Winner B', recipients: [{ type: 'EMAIL', email: 'b@example.com' }] }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      const winner = results.find((r) => r.status === 200)!.body.data;
      const loser = results.find((r) => r.status === 409)!; assert.equal(loser.body.error.code, 'VERSION_CONFLICT');
      assert.equal(winner.version, 2); assert.equal(winner.recipients[0].type, winner.text === 'Winner A' ? 'SELF' : 'EMAIL');
      assert.deepEqual((await request(app).get(`${route}/${draft.id}`).set('Authorization', header(ownerToken)).expect(200)).body.data, winner);
      await request(app).delete(`${route}/${draft.id}?version=1`).set('Authorization', header(ownerToken)).expect(409);
    });

    await t.test('delete competes atomically with updates and cascades recipients', async () => {
      const draft = (await request(app).post(route).set('Authorization', header(ownerToken)).send({ recipients: [{ type: 'SELF' }] }).expect(201)).body.data;
      const results = await Promise.all([
        request(app).patch(`${route}/${draft.id}`).set('Authorization', header(ownerToken)).send({ version: 1, text: 'Edited' }),
        request(app).delete(`${route}/${draft.id}?version=1`).set('Authorization', header(ownerToken)),
      ]);
      assert.equal(results.filter((r) => r.status === 200).length, 1);
      if (results[0].status === 200) {
        assert.equal(results[1].status, 409);
        await request(app).delete(`${route}/${draft.id}?version=2`).set('Authorization', header(ownerToken)).expect(200);
      } else assert.equal(results[0].status, 404);
      assert.equal(await db.draftRecipient.count(), 0);
      await request(app).get(`${route}/${draft.id}`).set('Authorization', header(ownerToken)).expect(404);
      await request(app).delete(`${route}/${draft.id}?version=1`).set('Authorization', header(ownerToken)).expect(404);
    });

    await t.test('stable cursor pages handle tied timestamps and remain owner-scoped for forged cursors', async () => {
      const createdAt = new Date('2026-11-16T00:00:00Z');
      await db.draftMessage.createMany({ data: Array.from({ length: 5 }, (_, i) => ({ ownerId, text: `Text ${i}`, createdAt })) });
      const foreign = await db.draftMessage.create({ data: { ownerId: otherId, text: 'Other', createdAt } });
      const ids: string[] = []; let cursor: string | null = null;
      for (let page = 0; page < 3; page++) {
        const result: request.Response = await request(app).get(route).query({ limit: '2', ...(cursor ? { cursor } : {}) }).set('Authorization', header(ownerToken)).expect(200);
        ids.push(...result.body.data.items.map((r: { id: string }) => r.id));
        assert.ok(!JSON.stringify(result.body.data).includes(foreign.id));
        cursor = result.body.data.nextCursor;
      }
      assert.equal(ids.length, 5); assert.equal(new Set(ids).size, 5); assert.equal(cursor, null);
      const forged = Buffer.from(JSON.stringify({ createdAt: foreign.createdAt.toISOString(), id: foreign.id })).toString('base64url');
      const response = await request(app).get(route).query({ cursor: forged }).set('Authorization', header(ownerToken)).expect(200);
      assert.ok(!JSON.stringify(response.body).includes('Other'));
      const expected = (await db.draftMessage.findMany({ where: { ownerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })).map((r) => r.id);
      assert.deepEqual(ids, expected);
    });

    await t.test('summaries bound previews, count recipients and never include full content/destinations', async () => {
      const draft = (await request(app).post(route).set('Authorization', header(ownerToken)).send({ text: '😀'.repeat(200), recipients: [{ type: 'EMAIL', email: 'private@example.com' }] }).expect(201)).body.data;
      const response = await request(app).get(route).set('Authorization', header(ownerToken)).expect(200);
      const summary = response.body.data.items[0]; assert.equal(summary.id, draft.id);
      assert.equal(Array.from(summary.textPreview).length, 160); assert.equal(summary.recipientCount, 1);
      assert.equal(summary.text, undefined); assert.equal(summary.recipients, undefined); assert.equal(response.body.data.nextCursor, null);
    });

    await t.test('deleted user targets become unavailable and claimed email/phone never inherit access', async () => {
      const target = await db.user.create({ data: { phone: '+12025550182', phoneVerifiedAt: new Date() } });
      const draft = (await request(app).post(route).set('Authorization', header(ownerToken)).send({ recipients: [{ type: 'USER', userId: target.id }] }).expect(201)).body.data;
      await db.user.delete({ where: { id: target.id } });
      const read = (await request(app).get(`${route}/${draft.id}`).set('Authorization', header(ownerToken)).expect(200)).body.data;
      assert.equal(read.recipients[0].userId, null); assert.equal(read.recipients[0].unavailable, true);
      assert.equal(read.recipients[0].type, 'USER');
      await request(app).get(`${route}/${draft.id}`).set('Authorization', header(otherToken)).expect(404);
    });

    await t.test('malformed inputs/preconditions/cursors are safe and cannot mutate ownership', async () => {
      const draft = (await request(app).post(route).set('Authorization', header(ownerToken)).send({}).expect(201)).body.data;
      for (const body of [{ ownerId: otherId }, { status: 'SCHEDULED' }, { recipients: [{ type: 'PHONE', phone: 'private-input', country: 'US' }] }]) {
        const result = await request(app).post(route).set('Authorization', header(ownerToken)).send(body).expect(400);
        assert.ok(!JSON.stringify(result.body.error).includes('private-input'));
      }
      await request(app).patch(`${route}/${draft.id}`).set('Authorization', header(ownerToken)).send({ text: 'Missing version' }).expect(400);
      await request(app).patch(`${route}/${draft.id}`).set('Authorization', header(ownerToken)).send({ version: 1 }).expect(400);
      await request(app).delete(`${route}/${draft.id}`).set('Authorization', header(ownerToken)).expect(400);
      await request(app).get(`${route}/invalid`).set('Authorization', header(ownerToken)).expect(400);
      for (const query of [{ limit: '0' }, { limit: '51' }, { cursor: 'bad' }, { ownerId: otherId }]) await request(app).get(route).query(query).set('Authorization', header(ownerToken)).expect(400);
      assert.equal((await db.draftMessage.findUniqueOrThrow({ where: { id: draft.id } })).ownerId, ownerId);
    });
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    throw new Error('Isolated draft checks failed. Inspect safe assertions and database reachability.', {
      // eslint-disable-next-line preserve-caught-error -- Do not attach raw Prisma errors that may expose connection details.
      cause: { name: error instanceof Error ? error.name : 'Unknown' },
    });
  } finally {
    await db.$disconnect(); await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
  }
});
