import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaClient } from '@prisma/client';
import { DraftService } from '../../src/services/draft.service';
import { ScheduleService } from '../../src/services/schedule.service';
import { scheduleChoice } from '../../src/validators/schedule.validators';
import { enqueueDeliveries } from '../../src/jobs/enqueueDeliveries';
import { DeliveryWorker } from '../../src/workers/deliveryWorker';
import { ExternalDelivery } from '../../src/workers/externalDelivery';
import { LocalStorage } from '../../src/providers/storage/local.storage';
import {
  accessToken,
  ExternalAccessService,
  fileHandle,
} from '../../src/services/externalAccess.service';
import { createHmac } from 'node:crypto';
import {
  WahaProvider,
  wahaScope,
} from '../../src/providers/whatsapp/waha.provider';
import { WahaReceiptService } from '../../src/services/wahaReceipt.service';
import type { WahaConfig } from '../../src/configs/env';
import { MailboxService } from '../../src/services/mailbox.service';
import { AuthService } from '../../src/services/auth.service';
import { whatsappOtpProvider } from '../../src/providers/otp/whatsappOtp.provider';
import { ApiError } from '../../src/utils/ApiError';
import request from 'supertest';
import { createApp } from '../../src/app';
import { captureLogger, config } from '../helpers';
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseUrl)
  throw Error('Set AUTH_TEST_DATABASE_URL for isolated WhatsApp tests.');
const schema = `dearly_whatsapp_test_${randomUUID().replaceAll('-', '')}`,
  url = new URL(databaseUrl);
url.searchParams.set('schema', schema);
url.searchParams.set('connection_limit', '5');
const db = new PrismaClient({
    datasources: { db: { url: url.toString() } },
    log: [],
    errorFormat: 'minimal',
  }),
  admin = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [],
    errorFormat: 'minimal',
  });

test(
  'WhatsApp durable dispatch, authenticated receipts, bearer access and failure boundaries',
  { timeout: 300000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'dearly-whatsapp-')),
      key = randomBytes(32).toString('hex'),
      pepper = randomBytes(32).toString('hex'),
      store = new LocalStorage(root);
    const settings: WahaConfig = {
      engine: 'NOWEB',
      baseUrl: 'https://waha.example',
      apiKey: 'synthetic-api-key',
      webhookSecret: randomBytes(32).toString('hex'),
      session: 'default',
      dailyLimit: 100,
    };
    const scope = wahaScope(settings),
      access = {
        publicUrl: 'https://dearly.example',
        secret: key,
        dailyLimit: 100,
      };
    let now = new Date('2035-01-01T00:00Z'),
      submits = 0,
      mode = 'accepted',
      raceReceipt = false;
    const receipts = new WahaReceiptService(db, settings);
    function signed(
      id: string,
      ack: number,
      eventId: string = randomUUID(),
      extra: Record<string, unknown> = {},
    ) {
      const raw = Buffer.from(
        JSON.stringify({
          id: eventId,
          timestamp: Date.now(),
          event: 'message.ack',
          session: 'default',
          engine: 'NOWEB',
          payload: { id, fromMe: true, ack },
          ...extra,
        }),
      );
      return {
        raw,
        signature: createHmac('sha512', settings.webhookSecret)
          .update(raw)
          .digest('hex'),
      };
    }
    async function receive(
      id: string,
      ack: number,
      eventId?: string,
      extra?: Record<string, unknown>,
    ) {
      const e = signed(id, ack, eventId, extra);
      return receipts.ingest(e.raw, e.signature, 'sha512');
    }
    const gateway = new WahaProvider(settings, async (url) => {
      if (String(url).endsWith('/api/sessions/default'))
        return Response.json({
          name: 'default',
          status: mode === 'offline' ? 'SCAN_QR_CODE' : 'WORKING',
        });
      submits++;
      const id = `true_12025550181@c.us_TEST${submits}`;
      if (mode === 'unknown') throw Error('Synthetic post-submit timeout');
      if (mode === 'rejected') return new Response('', { status: 422 });
      if (raceReceipt) {
        await receive(id, 3);
        raceReceipt = false;
      }
      return Response.json({ id, fromMe: true, to: '12025550181@c.us' });
    });
    const worker = new DeliveryWorker(
      db,
      store,
      () => now,
      undefined,
      new ExternalDelivery(
        db,
        access,
        {
          WHATSAPP: {
            senderKey: `whatsapp:${scope}`,
            scope,
            dailyLimit: 100,
            send: (to, link) => gateway.send(to, link),
            reconcile: (id) => receipts.reconcile(id),
          },
        },
        () => now,
      ),
    );
    const scenario = (name: string, work: () => Promise<void>) =>
      t.test(name, async () => {
        try {
          await work();
        } catch (error) {
          if (
            error instanceof Error &&
            error.constructor.name.startsWith('Prisma')
          ) {
            // eslint-disable-next-line preserve-caught-error -- Raw database errors can expose private values.
            throw Error(
              'Database operation failed in isolated WhatsApp scenario.',
            );
          }
          throw error;
        }
      });
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      for (const folder of readdirSync('prisma/migrations')
        .filter((n) => /^\d/.test(n))
        .sort()) {
        const sql = readFileSync(
          `prisma/migrations/${folder}/migration.sql`,
          'utf8',
        ).replace(
          /"(users|phone_auth_states|otp_challenges|sessions|refresh_tokens|draft_messages|draft_recipients|attachments|delivery_intents|delivery_work|delivery_attempts|inbox_items|worker_heartbeats|message_events|email_deliveries|email_relay_submissions|email_budgets|waha_receipts|sms_receipts|account_preferences|notifications|push_devices|push_jobs|EmailState|MessageEventKind|WorkState|AttemptState|MessageStatus|RecipientType|AttachmentState|DeliveryChannel)"/g,
          `"${schema}"."$1"`,
        );
        for (const statement of sql.replace(/^\s*--.*$/gm, '').split(';').filter((s) => s.trim()))
          await db.$executeRawUnsafe(statement);
      }
      const owner = await db.user.create({
          data: {
            phone: '+12025550180',
            phoneVerifiedAt: new Date('2020-01-01'),
          },
        }),
        other = await db.user.create({
          data: {
            phone: '+12025550182',
            phoneVerifiedAt: new Date('2020-01-01'),
          },
        });
      await scenario('WhatsApp OTP verifies without returning a code and its sender quota survives concurrency/restarts', async () => {
        let posts = 0;
        const p = whatsappOtpProvider(new WahaProvider(settings, async (_u, o) => {
          if (!o?.method) return Response.json({ name: 'default', status: 'WORKING' });
          posts++;
          const target = JSON.parse(String(o.body)).chatId;
          return Response.json({ id: `true_${target}_OTPTEST`, fromMe: true });
        }), 2);
        const logs = captureLogger();
        const service = new AuthService(db, pepper, p, () => new Date(), () => '123456');
        const app = createApp({ ...config, authMode: 'whatsapp', whatsapp: settings, otpPepper: pepper }, { prisma: db, isReady: async () => true, disconnect: async () => {} }, logs.logger, service);
        const result = await request(app).post('/auth/otp/request').send({ phone: '+12025550185', country: 'US' }).expect(200);
        assert.equal(result.body.data.channel, 'whatsapp');
        assert.equal(result.body.data.dispatch, 'accepted');
        assert.equal(result.body.data.developmentCode, undefined);
        assert.doesNotMatch(JSON.stringify(result.body), /123456|OTPTEST/);
        await request(app).post('/auth/otp/verify').send({ challengeId: result.body.data.challengeId, code: '000000' }).expect(401);
        await request(app).post('/auth/otp/verify').send({ challengeId: result.body.data.challengeId, code: '123456' }).expect(200);
        await request(app).post('/auth/otp/verify').send({ challengeId: result.body.data.challengeId, code: '123456' }).expect(401);
        const restarted = new AuthService(db, pepper, p);
        const concurrent = await Promise.allSettled(['+12025550186', '+12025550187'].map((phone) => restarted.requestOtp(phone)));
        assert.equal(concurrent.filter((r) => r.status === 'fulfilled').length, 1);
        assert.equal(concurrent.filter((r) => r.status === 'rejected' && r.reason instanceof ApiError && r.reason.code === 'AUTH_RATE_LIMITED').length, 1);
        await assert.rejects(new AuthService(db, pepper, p).requestOtp('+12025550188'), (e: unknown) => e instanceof ApiError && e.code === 'AUTH_RATE_LIMITED');
        assert.equal(posts, 2);
        assert.doesNotMatch(JSON.stringify(logs.entries), /123456|OTPTEST|12025550185/);
      });
      const drafts = new DraftService(db),
        schedules = new ScheduleService(db, pepper, () => now, false, true),
        external = new ExternalAccessService(db, key),
        mailboxes = new MailboxService(db);
      async function planned() {
        now = new Date('2035-01-01T00:00Z');
        const m = await drafts.create(owner.id, {
          subject: 'Synthetic WhatsApp test',
          text: 'Private body stays behind bearer proof',
        });
        const d = await drafts.update(owner.id, m.id, {
          version: m.version,
          recipients: [{ type: 'PHONE', phone: '+12025550181', country: 'US' }],
        });
        const recipient = await db.draftRecipient.findFirstOrThrow({
          where: { messageId: d.id },
        });
        const choice = scheduleChoice.parse({
          version: d.version,
          timezone: 'UTC',
          localDateTime: '2035-01-01T00:02',
          whatsappConsent: true,
          deliveries: [{ recipientId: recipient.id, channels: ['WHATSAPP'] }],
        });
        return { d, recipient, choice };
      }
      async function scheduled() {
        const p = await planned(),
          review = await schedules.preview(owner.id, p.d.id, p.choice);
        await schedules.confirm(owner.id, p.d.id, {
          ...p.choice,
          reviewToken: review.reviewToken,
        });
        now = new Date('2035-01-01T00:03Z');
        await enqueueDeliveries(db, now);
        return p.d.id;
      }
      let messageId = '',
        providerId = '',
        intentId = '',
        token = '';
      await scenario(
        'explicit channel and consent are signed; WhatsApp phones need no Dearly account binding',
        async () => {
          const p = await planned();
          await assert.rejects(() =>
            schedules.preview(owner.id, p.d.id, {
              ...p.choice,
              whatsappConsent: false,
            }),
          );
          await assert.rejects(() =>
            schedules.preview(other.id, p.d.id, p.choice),
          );
          const disabled = new ScheduleService(db, pepper, () => now);
          await assert.rejects(() =>
            disabled.preview(owner.id, p.d.id, p.choice),
          );
          const preview = await schedules.preview(owner.id, p.d.id, p.choice);
          await assert.rejects(() =>
            schedules.confirm(owner.id, p.d.id, {
              ...p.choice,
              whatsappConsent: false,
              reviewToken: preview.reviewToken,
            }),
          );
          await schedules.confirm(owner.id, p.d.id, {
            ...p.choice,
            reviewToken: preview.reviewToken,
          });
          messageId = p.d.id;
          const intent = await db.deliveryIntent.findFirstOrThrow({
            where: { messageId },
          });
          intentId = intent.id;
          assert.ok(intent.consentAt);
          assert.equal(
            (
              await db.draftRecipient.findUniqueOrThrow({
                where: { id: p.recipient.id },
              })
            ).targetUserId,
            null,
          );
        },
      );
      await scenario(
        'due worker persists provider ID and reconciles a signed receipt racing the response',
        async () => {
          now = new Date('2035-01-01T00:03Z');
          await enqueueDeliveries(db, now);
          const c = await worker.claim();
          assert.ok(c);
          raceReceipt = true;
          assert.equal(await worker.execute(c), true);
          assert.equal(submits, 1);
          const row = await db.externalDelivery.findUniqueOrThrow({
            where: { intentId },
          });
          providerId = row.providerMessageId!;
          token = accessToken(row.id, key);
          assert.ok(row.notificationDeliveredAt);
          assert.ok(row.notificationReadAt);
          assert.equal(row.openedAt, null);
          const owned = await mailboxes.read(owner.id, messageId),
            d = owned.deliveries[0];
          assert.equal(d.channel, 'WHATSAPP');
          assert.equal(d.outcome, 'DELIVERED');
          assert.equal(d.openedAt, null);
          assert.doesNotMatch(JSON.stringify(owned), new RegExp(providerId));
          await worker.execute(c);
          assert.equal(submits, 1);
        },
      );
      await scenario(
        'duplicate and out-of-order callbacks are monotonic and cannot fake content opening',
        async () => {
          const e = signed(providerId, 2, 'same-event');
          await Promise.all([
            receipts.ingest(e.raw, e.signature, 'sha512'),
            receipts.ingest(e.raw, e.signature, 'sha512'),
          ]);
          await receive(providerId, 1);
          await receive(providerId, -1);
          const row = await db.externalDelivery.findUniqueOrThrow({
            where: { intentId },
          });
          assert.equal(row.notificationAck, 3);
          assert.equal(row.notificationErrorAt, null);
          assert.equal(row.openedAt, null);
          assert.equal(
            await db.messageEvent.count({
              where: { messageId, kind: 'WHATSAPP_NOTIFICATION_DELIVERED' },
            }),
            1,
          );
          assert.equal(
            await db.messageEvent.count({
              where: { messageId, kind: 'WHATSAPP_NOTIFICATION_READ' },
            }),
            1,
          );
          await assert.rejects(() =>
            receipts.ingest(e.raw, '0'.repeat(128), 'sha512'),
          );
          const before = await db.wahaReceipt.count();
          await receive(providerId, 4, undefined, { session: 'other' });
          await receive(providerId, 4, undefined, { engine: 'WEBJS' });
          assert.equal(await db.wahaReceipt.count(), before);
        },
      );
      await scenario(
        'private WhatsApp links retain due gating, files and owner-only idempotent revocation',
        async () => {
          await assert.rejects(() => external.open(token));
          await db.draftMessage.update({
            where: { id: messageId },
            data: { scheduledFor: new Date('2020-01-01') },
          });
          const row = await db.externalDelivery.findUniqueOrThrow({
            where: { intentId },
          });
          await db.externalDelivery.update({
            where: { id: row.id },
            data: { expiresAt: new Date(Date.now() + 600000) },
          });
          const bytes = Buffer.from('Synthetic WhatsApp attachment'),
            id = randomUUID();
          await writeFile(store.path(id), bytes);
          await db.attachment.create({
            data: {
              id,
              ownerId: owner.id,
              draftId: messageId,
              name: 'private.txt',
              mime: 'text/plain',
              bytes: bytes.length,
              state: 'READY',
              sha256: createHash('sha256').update(bytes).digest('hex'),
              expiresAt: new Date('2036-01-01'),
            },
          });
          const opened = await external.open(token);
          assert.equal(opened.text, 'Private body stays behind bearer proof');
          assert.equal(
            (await external.file(token, fileHandle(row.id, id, key))).id,
            id,
          );
          await assert.rejects(() => external.revoke(other.id, intentId));
          await external.revoke(owner.id, intentId);
          await external.revoke(owner.id, intentId);
          assert.equal(
            await db.messageEvent.count({
              where: { messageId, kind: 'WHATSAPP_LINK_REVOKED' },
            }),
            1,
          );
          await assert.rejects(() => external.open(token));
          await assert.rejects(() =>
            external.file(token, fileHandle(row.id, id, key)),
          );
        },
      );
      await scenario(
        'POST timeout is terminal uncertain and never automatically repeated',
        async () => {
          const id = await scheduled();
          mode = 'unknown';
          const c = await worker.claim();
          assert.ok(c);
          await worker.execute(c);
          const before = submits;
          assert.equal(
            (await db.draftMessage.findUniqueOrThrow({ where: { id } })).status,
            'DELIVERY_UNKNOWN',
          );
          await worker.execute(c);
          assert.equal(await worker.retry(c.id), false);
          assert.equal(submits, before);
          mode = 'accepted';
        },
      );
      await scenario(
        'signed delivery failures enter Failed and later delivery proof recovers without resending',
        async () => {
          mode = 'accepted';
          const id = await scheduled(),
            c = await worker.claim();
          assert.ok(c);
          await worker.execute(c);
          const row = await db.externalDelivery.findFirstOrThrow({
            where: { intent: { messageId: id } },
          });
          await receive(row.providerMessageId!, -1);
          const detail = await mailboxes.read(owner.id, id);
          assert.equal(detail.deliveries[0].outcome, 'FAILED');
          assert.equal(detail.deliveries[0].errorCode, 'WAHA_DELIVERY_ERROR');
          const failed = await mailboxes.list(owner.id, {
            box: 'failed',
            read: 'all',
            limit: 50,
          });
          assert.ok(failed.items.some((i) => i.id === id));
          const count = (await mailboxes.dashboard(owner.id)).counts.failed;
          const before = submits;
          await receive(row.providerMessageId!, 2);
          assert.equal(submits, before);
          assert.equal(
            (await mailboxes.read(owner.id, id)).deliveries[0].outcome,
            'DELIVERED',
          );
          assert.equal(
            (await mailboxes.dashboard(owner.id)).counts.failed,
            count - 1,
          );
        },
      );
      await scenario(
        'offline sender retries safely without POST and recovers once paired',
        async () => {
          const id = await scheduled();
          mode = 'offline';
          let c = await worker.claim();
          assert.ok(c);
          const before = submits;
          await worker.execute(c);
          assert.equal(submits, before);
          assert.equal(
            (
              await db.externalDelivery.findFirstOrThrow({
                where: { intent: { messageId: id } },
              })
            ).errorCode,
            'WAHA_UNPAIRED',
          );
          mode = 'accepted';
          now = new Date('2035-01-01T00:04Z');
          c = await worker.claim();
          assert.ok(c);
          await worker.execute(c);
          assert.equal(submits, before + 1);
          assert.equal(
            (await db.draftMessage.findUniqueOrThrow({ where: { id } })).status,
            'SUBMITTED',
          );
        },
      );
      await scenario(
        'different provider scopes and expired events cannot change this sender evidence',
        async () => {
          const otherConfig = {
              ...settings,
              baseUrl: 'https://other-waha.example',
            },
            otherReceipts = new WahaReceiptService(db, otherConfig),
            e = signed(providerId, 4);
          await otherReceipts.ingest(e.raw, e.signature, 'sha512');
          assert.equal(
            (
              await db.externalDelivery.findUniqueOrThrow({
                where: { intentId },
              })
            ).notificationAck,
            3,
          );
          const before = await db.wahaReceipt.count();
          await receive(providerId, 4, undefined, {
            timestamp: Date.now() - 30 * 86400000,
          });
          assert.equal(await db.wahaReceipt.count(), before);
          await receive('true_12025550199@c.us_UNRELATED', 2);
          assert.equal(await db.wahaReceipt.count(), before);
          await db.wahaReceipt.create({
            data: {
              scope: wahaScope(otherConfig),
              eventId: 'expired-synthetic',
              providerMessageId: providerId,
              ack: 1,
              observedAt: new Date('2020-01-01'),
              expiresAt: new Date('2020-01-02'),
            },
          });
          assert.equal((await receipts.cleanup()).count, 1);
        },
      );
      await scenario(
        'local WhatsApp budget stops submission and remains separate from email',
        async () => {
          const id = await scheduled(),
            before = submits;
          const limited = new DeliveryWorker(
            db,
            store,
            () => now,
            undefined,
            new ExternalDelivery(
              db,
              access,
              {
                WHATSAPP: {
                  senderKey: `whatsapp:${scope}`,
                  scope,
                  dailyLimit: 1,
                  send: (to, link) => gateway.send(to, link),
                },
              },
              () => now,
            ),
          );
          const c = await limited.claim();
          assert.ok(c);
          await limited.execute(c);
          assert.equal(submits, before);
          assert.equal(
            (
              await db.externalDelivery.findFirstOrThrow({
                where: { intent: { messageId: id } },
              })
            ).errorCode,
            'WHATSAPP_QUOTA',
          );
        },
      );
    } finally {
      await db.$disconnect();
      await admin.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
      );
      await admin.$disconnect();
      await rm(root, { recursive: true, force: true });
    }
  },
);
