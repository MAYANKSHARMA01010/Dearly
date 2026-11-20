import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaClient } from '@prisma/client';
import { DraftService } from '../../src/services/draft.service';
import { ScheduleService } from '../../src/services/schedule.service';
import { ExternalAccessService, accessToken } from '../../src/services/externalAccess.service';
import { MailboxService } from '../../src/services/mailbox.service';
import { SmsReceiptService } from '../../src/services/smsReceipt.service';
import { SmsGateProvider } from '../../src/providers/sms/smsgate.provider';
import type { SmsGateConfig } from '../../src/configs/env';
import { LocalStorage } from '../../src/providers/storage/local.storage';
import { ExternalDelivery } from '../../src/workers/externalDelivery';
import { DeliveryWorker } from '../../src/workers/deliveryWorker';
import { enqueueDeliveries } from '../../src/jobs/enqueueDeliveries';
import { scheduleChoice } from '../../src/validators/schedule.validators';
import { ApiError } from '../../src/utils/ApiError';
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseUrl) throw Error('Set AUTH_TEST_DATABASE_URL for isolated SMS tests.');
const schema = `dearly_sms_test_${randomUUID().replaceAll('-', '')}`, url = new URL(databaseUrl);
url.searchParams.set('schema', schema); url.searchParams.set('connection_limit', '5');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [], errorFormat: 'minimal' });
const admin = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [], errorFormat: 'minimal' });
const rejected = (code: string) => (e: unknown) => e instanceof ApiError && e.code === code;

test('SMS durable dispatch, scoped receipts, consent, privacy and uncertainty', { timeout: 300000 }, async (t) => {
  const storage = await mkdtemp(join(tmpdir(), 'dearly-sms-')), secret = randomBytes(32).toString('hex');
  const settings: SmsGateConfig = { baseUrl: 'https://sms.example/3rdparty/v1', connection: 'cloud', deviceId: 'test-device', username: 'test', password: 'synthetic-password', webhookSecret: randomBytes(32).toString('hex'), simNumber: 1, dailyLimit: 20 };
  let clock = new Date(), posts = 0, mode = 'ready', race = false;
  const receipts = new SmsReceiptService(db, settings);
  async function receive(id: string, kind: 'sent' | 'delivered' | 'failed', eventId = randomUUID(), partsCount = 1, overrides: Record<string, unknown> = {}) {
    const raw = Buffer.from(JSON.stringify({ deviceId: settings.deviceId, id: eventId, event: `sms:${kind}`, payload: { messageId: id, recipient: '+12025550181', simNumber: 1, [`${kind}At`]: new Date().toISOString(), ...(kind === 'sent' ? { partsCount } : {}) }, ...overrides }));
    const timestamp = String(Math.floor(Date.now() / 1000)), signature = createHmac('sha256', settings.webhookSecret).update(raw).update(timestamp).digest('hex');
    return receipts.ingest(raw, timestamp, signature);
  }
  const gateway = new SmsGateProvider(settings, async (_url, o) => {
    if (!o?.method) return Response.json([{ id: settings.deviceId, lastSeen: new Date().toISOString() }]);
    posts++;
    const body = JSON.parse(String(o.body));
    assert.equal(body.phoneNumbers.length, 1); assert.equal(body.simNumber, 1);
    assert.doesNotMatch(body.textMessage.text, /Private synthetic content/);
    if (mode === 'reject') return new Response('', { status: 422 });
    if (race) { await receive(body.id, 'delivered'); await receive(body.id, 'sent'); }
    if (mode === 'unknown') throw Error('synthetic ambiguous timeout');
    return Response.json({ id: body.id, deviceId: settings.deviceId, recipients: [{ phoneNumber: body.phoneNumbers[0] }], state: 'Pending' }, { status: 202 });
  });
  const offline = new SmsGateProvider(settings, async () => new Response('', { status: 503 }));
  function worker(provider = gateway, quota = 20) {
    return new DeliveryWorker(db, new LocalStorage(storage), () => clock, undefined, new ExternalDelivery(db, { publicUrl: 'https://dearly.example', secret, dailyLimit: 20 }, { SMS: { senderKey: `sms:${gateway.scope}`, scope: gateway.scope, dailyLimit: quota, send: (to, link, id) => provider.send(to, link, id), reconcile: (id) => receipts.reconcile(id) } }, () => clock));
  }
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for (const folder of readdirSync('prisma/migrations').filter((f) => /^\d/.test(f)).sort()) {
      const sql = readFileSync(`prisma/migrations/${folder}/migration.sql`, 'utf8').replace(/"(users|phone_auth_states|otp_challenges|sessions|refresh_tokens|draft_messages|draft_recipients|attachments|delivery_intents|delivery_work|delivery_attempts|inbox_items|worker_heartbeats|message_events|email_deliveries|email_relay_submissions|email_verifications|email_budgets|waha_receipts|sms_receipts|account_preferences|notifications|push_devices|push_jobs|EmailState|MessageEventKind|WorkState|AttemptState|MessageStatus|RecipientType|AttachmentState|DeliveryChannel)"/g, `"${schema}"."$1"`);
      for (const statement of sql.replace(/^\s*--.*$/gm, '').split(';').filter((s) => s.trim())) await db.$executeRawUnsafe(statement);
    }
    const owner = await db.user.create({ data: { phone: '+12025550180', phoneVerifiedAt: new Date() } });
    const other = await db.user.create({ data: { phone: '+12025550182', phoneVerifiedAt: new Date() } });
    const drafts = new DraftService(db), schedules = new ScheduleService(db, secret, () => clock, false, false, true);
    t.beforeEach(async () => { await db.draftMessage.deleteMany(); await db.senderBudget.deleteMany(); posts = 0; mode = 'ready'; race = false; clock = new Date(Date.now() - 300000); });
    const scenario = (name: string, fn: () => Promise<void>) => t.test(name, async () => {
      try { await fn(); } catch (e) {
        if (e instanceof Error && e.constructor.name.startsWith('Prisma')) {
          // eslint-disable-next-line preserve-caught-error -- Raw database exceptions may expose datasource details.
          throw Error('Database operation failed in isolated SMS scenario.');
        }
        throw e;
      }
    });
    async function planned() {
      clock = new Date(Date.now() - 300000);
      const draft = await drafts.create(owner.id, { subject: 'Synthetic SMS', text: 'Private synthetic content', recipients: [{ type: 'PHONE', phone: '+12025550181', country: 'US' }] });
      const choice = scheduleChoice.parse({ version: draft.version, timezone: 'UTC', localDateTime: new Date(clock.getTime() + 120000).toISOString().slice(0, 16), smsConsent: true, deliveries: [{ recipientId: draft.recipients[0].id, channels: ['SMS'] }] });
      return { draft, choice };
    }
    async function scheduled() {
      const p = await planned(), review = await schedules.preview(owner.id, p.draft.id, p.choice);
      await schedules.confirm(owner.id, p.draft.id, { ...p.choice, reviewToken: review.reviewToken });
      clock = new Date(); await enqueueDeliveries(db, clock); return p.draft;
    }
    await scenario('SMS consent is required, bound to review, and does not require a recipient Dearly account', async () => {
      const p = await planned();
      await assert.rejects(schedules.preview(owner.id, p.draft.id, { ...p.choice, smsConsent: false }), rejected('RECIPIENT_CONSENT_REQUIRED'));
      const review = await schedules.preview(owner.id, p.draft.id, p.choice);
      await assert.rejects(schedules.confirm(owner.id, p.draft.id, { ...p.choice, smsConsent: false, reviewToken: review.reviewToken }), rejected('RECIPIENT_CONSENT_REQUIRED'));
      await schedules.confirm(owner.id, p.draft.id, { ...p.choice, reviewToken: review.reviewToken });
      const intent = await db.deliveryIntent.findFirstOrThrow(); assert.ok(intent.consentAt); assert.equal(intent.channel, 'SMS');
      assert.equal(await db.user.count({ where: { phone: '+12025550181' } }), 0);
      await assert.rejects(schedules.read(other.id, p.draft.id), rejected('SCHEDULE_NOT_FOUND'));
    });
    await scenario('racing authenticated receipts reconcile once, stay monotonic and never imply content opening', async () => {
      const d = await scheduled(); race = true;
      const w = worker(), claim = await w.claim(); assert.ok(claim); await w.execute(claim);
      assert.equal(posts, 1);
      const row = await db.externalDelivery.findFirstOrThrow(); assert.equal(row.state, 'ACCEPTED'); assert.ok(row.notificationSentAt); assert.ok(row.notificationDeliveredAt); assert.equal(row.openedAt, null); assert.equal(row.notificationReadAt, null);
      const eventId = randomUUID(); await receive(row.id, 'delivered', eventId); await receive(row.id, 'delivered', eventId); await receive(row.id, 'failed');
      assert.equal(await db.messageEvent.count({ where: { messageId: d.id, kind: 'SMS_NOTIFICATION_DELIVERED' } }), 1);
      const owned = await new MailboxService(db).read(owner.id, d.id); assert.equal(owned.deliveries[0].outcome, 'DELIVERED');
      const access = new ExternalAccessService(db, secret), token = accessToken(row.id, secret);
      assert.equal((await access.open(token)).text, 'Private synthetic content');
      await assert.rejects(access.revoke(other.id, row.intentId), rejected('LINK_UNAVAILABLE'));
      await access.revoke(owner.id, row.intentId); await access.revoke(owner.id, row.intentId);
      await assert.rejects(access.open(token), rejected('LINK_UNAVAILABLE'));
      assert.equal(await db.messageEvent.count({ where: { messageId: d.id, kind: 'SMS_LINK_REVOKED' } }), 1);
    });
    await scenario('unexpected multipart evidence never claims the whole SMS delivered; unrelated device/SIM metadata is ignored', async () => {
      await scheduled(); const w = worker(), c = await w.claim(); assert.ok(c); await w.execute(c);
      const row = await db.externalDelivery.findFirstOrThrow();
      await receive(row.id, 'sent', randomUUID(), 2); await receive(row.id, 'delivered');
      assert.equal((await db.externalDelivery.findUniqueOrThrow({ where: { id: row.id } })).notificationDeliveredAt, null);
      const before = await db.smsReceipt.count();
      await receive(row.id, 'delivered', randomUUID(), 1, { deviceId: 'wrong-device' });
      await receive(randomUUID(), 'delivered');
      assert.equal(await db.smsReceipt.count(), before);
    });
    await scenario('uncertain submission is terminal and cannot be replayed after a worker restart', async () => {
      const d = await scheduled(); mode = 'unknown';
      const w = worker(), c = await w.claim(); assert.ok(c); await w.execute(c);
      assert.equal(posts, 1); assert.equal((await db.draftMessage.findUniqueOrThrow({ where: { id: d.id } })).status, 'DELIVERY_UNKNOWN');
      assert.equal((await db.externalDelivery.findFirstOrThrow()).state, 'UNKNOWN');
      clock = new Date(Date.now() + 3600000); await enqueueDeliveries(db, clock);
      assert.equal(await worker().claim(), null); assert.equal(await w.retry(c.id), false); assert.equal(posts, 1);
      // A signed report racing an ambiguous HTTP response is still useful evidence;
      // it never licenses another POST or erases the original uncertain response.
      const next = await scheduled(); race = true;
      const again = worker(), held = await again.claim(); assert.ok(held); await again.execute(held);
      const proof = await db.externalDelivery.findFirstOrThrow({ where: { intent: { messageId: next.id } } });
      assert.equal(proof.state, 'UNKNOWN'); assert.ok(proof.notificationDeliveredAt);
      assert.equal((await new MailboxService(db).read(owner.id, next.id)).deliveries[0].outcome, 'DELIVERED');
      assert.equal(await again.retry(held.id), false); assert.equal(posts, 2);

    });
    await scenario('offline checks retry without POST; carrier rejection enters Failed without another channel', async () => {
      const d = await scheduled(); let w = worker(offline), c = await w.claim(); assert.ok(c); await w.execute(c);
      assert.equal(posts, 0); assert.equal((await db.externalDelivery.findFirstOrThrow()).state, 'RETRYABLE');
      clock = new Date(Date.now() + 600000); mode = 'reject'; w = worker(); c = await w.claim(); assert.ok(c); await w.execute(c);
      assert.equal(posts, 1); assert.equal((await db.draftMessage.findUniqueOrThrow({ where: { id: d.id } })).status, 'FAILED');
      assert.equal(await db.deliveryIntent.count({ where: { channel: { not: 'SMS' } } }), 0);
    });
    await scenario('signed device failure is visible and quota exhaustion never posts', async () => {
      const d = await scheduled(); const w = worker(), c = await w.claim(); assert.ok(c); await w.execute(c);
      const row = await db.externalDelivery.findFirstOrThrow(); await receive(row.id, 'failed');
      assert.equal((await new MailboxService(db).read(owner.id, d.id)).deliveries[0].outcome, 'FAILED');
      const next = await scheduled(); const limited = worker(gateway, 1), held = await limited.claim(); assert.ok(held); await limited.execute(held);
      assert.equal(posts, 1); const denied = await db.externalDelivery.findFirstOrThrow({ where: { intent: { messageId: next.id } } }); assert.equal(denied.errorCode, 'SMS_QUOTA');
    });
  } catch (e) {
    if (e instanceof Error && e.constructor.name.startsWith('Prisma')) {
      // eslint-disable-next-line preserve-caught-error -- Never print private datasource errors.
      throw Error('SMS test database setup failed.');
    }
    throw e;
  } finally {
    await db.$disconnect(); await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect(); await rm(storage, { recursive: true, force: true });
  }
});
