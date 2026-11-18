import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { newToken, tokenHash } from '../../src/utils/authCrypto';
import { createApp } from '../../src/app';
import { parseEnvironment } from '../../src/configs/env';
import { captureLogger } from '../helpers';
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
import type { EmailResult } from '../../src/providers/email/email.provider';
import { MailboxService } from '../../src/services/mailbox.service';
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseUrl)
  throw Error('Set AUTH_TEST_DATABASE_URL for isolated email tests.');
const schema = `dearly_email_test_${randomUUID().replaceAll('-', '')}`,
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
  'scheduled email, external access, retries, quotas and uncertainty without live SMTP',
  { timeout: 300000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'dearly-email-')),
      secret = randomBytes(32).toString('hex'),
      store = new LocalStorage(root),
      key = randomBytes(32).toString('hex');
    let now = new Date('2035-01-01T00:00:00Z');
    const access = {
      secret: key,
      publicUrl: 'https://dearly.example',
      dailyLimit: 100,
    };
    const scenario = (name: string, work: () => Promise<void>) =>
      t.test(name, async () => {
        try {
          await work();
        } catch (error) {
          if (
            error instanceof Error &&
            error.constructor.name.startsWith('Prisma')
          ) {
            // eslint-disable-next-line preserve-caught-error -- Database errors may contain private values.
            throw Error(
              'Database operation failed in isolated email scenario.',
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
          /"(users|phone_auth_states|otp_challenges|sessions|refresh_tokens|draft_messages|draft_recipients|attachments|delivery_intents|delivery_work|delivery_attempts|inbox_items|worker_heartbeats|message_events|email_deliveries|email_budgets|waha_receipts|sms_receipts|EmailState|MessageEventKind|WorkState|AttemptState|MessageStatus|RecipientType|AttachmentState|DeliveryChannel)"/g,
          `"${schema}"."$1"`,
        );
        for (const statement of sql.replace(/^\s*--.*$/gm, '').split(';').filter((s) => s.trim()))
          await db.$executeRawUnsafe(statement);
      }
      const owner = await db.user.create({
          data: {
            phone: '+12025550160',
            phoneVerifiedAt: new Date('2020-01-01'),
          },
        }),
        other = await db.user.create({
          data: {
            phone: '+12025550161',
            phoneVerifiedAt: new Date('2020-01-01'),
          },
        });
      const drafts = new DraftService(db),
        schedules = new ScheduleService(db, secret, () => now, true),
        external = new ExternalAccessService(db, key),
        mailboxes = new MailboxService(db);
      let sends = 0,
        result: EmailResult = {
          state: 'ACCEPTED',
          code: null,
          providerMessageId: 'synthetic-gmail-id',
        };
      const sender = async () => {
        sends++;
        return result;
      };
      const worker = new DeliveryWorker(
        db,
        store,
        () => now,
        undefined,
        new ExternalDelivery(
          db,
          access,
          {
            EMAIL: {
              senderKey: 'synthetic@gmail.com',
              dailyLimit: access.dailyLimit,
              send: sender,
            },
          },
          () => now,
        ),
      );
      async function scheduled(mixed = false) {
        const draft = await drafts.create(owner.id, {
          text: '<script>private test body</script>',
          subject: 'Synthetic email test',
        });
        await drafts.update(owner.id, draft.id, {
          version: draft.version,
          recipients: [
            { type: 'EMAIL', email: 'recipient@example.com' },
            ...(mixed ? [{ type: 'SELF' as const }] : []),
          ],
        });
        const m = await db.draftMessage.findUniqueOrThrow({
          where: { id: draft.id },
          include: { recipients: true },
        });
        const choice = scheduleChoice.parse({
          version: m.version,
          timezone: 'UTC',
          localDateTime: '2035-01-01T00:02',
          deliveries: m.recipients.map((r) => ({
            recipientId: r.id,
            channels: [r.type === 'EMAIL' ? 'EMAIL' : 'IN_APP'],
          })),
        });
        const review = await schedules.preview(owner.id, m.id, choice);
        await schedules.confirm(owner.id, m.id, {
          ...choice,
          reviewToken: review.reviewToken,
        });
        return m.id;
      }
      let messageId = '',
        token = '',
        intentId = '',
        handle = '';
      await scenario(
        'schedule review binds EMAIL choices and due worker submits only once',
        async () => {
          messageId = await scheduled(true);
          assert.equal(await enqueueDeliveries(db, now), 0);
          now = new Date('2035-01-01T00:03Z');
          await enqueueDeliveries(db, now);
          const claim = await worker.claim();
          assert.ok(claim);
          assert.equal(await worker.execute(claim), true);
          assert.equal(sends, 1);
          const email = await db.externalDelivery.findFirstOrThrow({
            where: { intent: { messageId } },
          });
          intentId = email.intentId;
          token = accessToken(email.id, key);
          assert.equal(
            (
              await db.draftMessage.findUniqueOrThrow({
                where: { id: messageId },
              })
            ).status,
            'SUBMITTED',
          );
          assert.equal(await worker.execute(claim), false);
          assert.equal(sends, 1);
          const owned = await mailboxes.read(owner.id, messageId);
          const e = owned.deliveries.find((d) => d.channel === 'EMAIL')!;
          assert.equal(e.outcome, 'SUBMITTED');
          assert.equal(e.deliveredAt, null);
          assert.ok('submittedAt' in e && e.submittedAt);
          assert.equal(
            owned.deliveries.find((d) => d.channel === 'IN_APP')?.outcome,
            'DELIVERED',
          );
        },
      );
      await scenario(
        'bearer access is due-only, scoped, escaped by client, private-file authorized and explicit-open idempotent',
        async () => {
          const row = await db.externalDelivery.findUniqueOrThrow({
            where: { intentId },
          });
          const bytes = Buffer.from('synthetic private attachment'),
            id = randomUUID();
          await writeFile(store.path(id), bytes);
          await db.attachment.create({
            data: {
              id,
              ownerId: owner.id,
              draftId: messageId,
              name: 'test.txt',
              mime: 'text/plain',
              bytes: bytes.length,
              state: 'READY',
              sha256: createHash('sha256').update(bytes).digest('hex'),
              expiresAt: new Date('2036-01-01'),
            },
          });
          // Access uses database time; use an actually due instant for this synthetic fixture.
          await db.draftMessage.update({
            where: { id: messageId },
            data: { scheduledFor: new Date('2020-01-01') },
          });
          await db.externalDelivery.update({
            where: { id: row.id },
            data: { expiresAt: new Date(Date.now() + 600000) },
          });
          const config = parseEnvironment({
            DATABASE_URL: databaseUrl!,
            STORAGE_ROOT: root,
            AUTH_MODE: 'development',
            OTP_PEPPER: secret,
            EMAIL_PUBLIC_URL: access.publicUrl,
            EXTERNAL_ACCESS_SECRET: key,
          });
          const logs = captureLogger();
          const app = createApp(
            config,
            {
              prisma: db,
              isReady: async () => true,
              disconnect: async () => {},
            },
            logs.logger,
          );
          await request(app).get('/external/').expect(200);
          assert.equal(
            (
              await db.externalDelivery.findUniqueOrThrow({
                where: { id: row.id },
              })
            ).openedAt,
            null,
          );
          const opened = await request(app)
            .post('/external/open')
            .send({ token })
            .expect(200);
          assert.equal(opened.body.text, '<script>private test body</script>');
          assert.doesNotMatch(
            JSON.stringify(opened.body),
            new RegExp(id + '|' + owner.id),
          );
          handle = opened.body.attachments[0].handle;
          await request(app).post('/external/open').send({ token }).expect(200);
          assert.equal(
            await db.messageEvent.count({
              where: { messageId, kind: 'OPENED' },
            }),
            1,
          );
          await request(app)
            .post('/external/file')
            .send({ token, handle })
            .expect(200);
          await request(app)
            .post('/external/file')
            .send({ token, handle: fileHandle(randomUUID(), id, key) })
            .expect(404);
          await request(app)
            .post('/external/open')
            .set('Origin', 'https://evil.example')
            .send({ token })
            .expect(403);
          await request(app)
            .post('/external/open')
            .send({ token: token.slice(0, -1) + '!' })
            .expect(404);
          await db.draftMessage.update({
            where: { id: messageId },
            data: { scheduledFor: new Date(Date.now() + 600000) },
          });
          await assert.rejects(() => external.open(token));
          await db.draftMessage.update({
            where: { id: messageId },
            data: { scheduledFor: new Date('2020-01-01') },
          });
          await db.externalDelivery.update({
            where: { id: row.id },
            data: { expiresAt: new Date('2020-01-01') },
          });
          await assert.rejects(() => external.file(token, handle));
          await db.externalDelivery.update({
            where: { id: row.id },
            data: { expiresAt: new Date(Date.now() + 600000) },
          });
          await assert.rejects(() => external.revoke(other.id, intentId));
          const sid = randomUUID(),
            bearer = newToken(sid);
          await db.session.create({
            data: {
              id: sid,
              userId: owner.id,
              accessHash: tokenHash(bearer),
              accessExpiresAt: new Date(Date.now() + 600000),
              expiresAt: new Date(Date.now() + 600000),
            },
          });
          await request(app)
            .post(`/external/deliveries/${intentId}/revoke`)
            .send({})
            .expect(401);
          await request(app)
            .post(`/external/deliveries/${intentId}/revoke`)
            .set('Authorization', `Bearer ${bearer}`)
            .send({})
            .expect(200)
            .expect((res) => assert.equal(res.body.data.revoked, true));
          await external.revoke(owner.id, intentId);
          assert.equal(
            await db.messageEvent.count({
              where: { messageId, kind: 'EMAIL_LINK_REVOKED' },
            }),
            1,
          );
          await assert.rejects(() => external.open(token));
          await assert.rejects(() => external.file(token, handle));
          assert.doesNotMatch(
            JSON.stringify(logs.entries),
            new RegExp(token + '|private test body'),
          );
        },
      );
      await scenario(
        'ambiguous SMTP result is terminal UNKNOWN and never auto resubmitted',
        async () => {
          now = new Date('2035-01-01T00:00Z');
          const id = await scheduled();
          now = new Date('2035-01-01T00:03Z');
          result = {
            state: 'UNKNOWN',
            code: 'SMTP_UNCERTAIN',
            providerMessageId: null,
          };
          await enqueueDeliveries(db, now);
          const c = await worker.claim();
          assert.ok(c);
          await worker.execute(c);
          const before = sends;
          assert.equal(
            (await db.draftMessage.findUniqueOrThrow({ where: { id } })).status,
            'DELIVERY_UNKNOWN',
          );
          assert.equal(await worker.retry(c.id), false);
          await worker.execute(c);
          assert.equal(sends, before);
        },
      );
      await scenario(
        'temporary rejection retries within budget and accepted results are retained',
        async () => {
          now = new Date('2035-01-01T00:00Z');
          const id = await scheduled();
          now = new Date('2035-01-01T00:03Z');
          result = {
            state: 'RETRYABLE',
            code: 'SMTP_THROTTLED',
            providerMessageId: null,
          };
          await enqueueDeliveries(db, now);
          let c = await worker.claim();
          assert.ok(c);
          await worker.execute(c);
          assert.equal(
            (await db.draftMessage.findUniqueOrThrow({ where: { id } })).status,
            'DISPATCHING',
          );
          now = new Date('2035-01-01T00:04Z');
          result = {
            state: 'ACCEPTED',
            code: null,
            providerMessageId: 'synthetic',
          };
          c = await worker.claim();
          assert.ok(c);
          await worker.execute(c);
          assert.equal(
            (await db.draftMessage.findUniqueOrThrow({ where: { id } })).status,
            'SUBMITTED',
          );
        },
      );
      await scenario(
        'durable pre-call marker survives worker loss without a duplicate send',
        async () => {
          now = new Date('2035-01-01T00:00Z');
          const id = await scheduled();
          now = new Date('2035-01-01T00:03Z');
          await enqueueDeliveries(db, now);
          const c = await worker.claim();
          assert.ok(c);
          const i = await db.deliveryIntent.findFirstOrThrow({
            where: { messageId: id },
          });
          await db.externalDelivery.create({
            data: { intentId: i.id, expiresAt: new Date('2035-01-08') },
          });
          const before = sends;
          await worker.execute(c);
          assert.equal(sends, before);
          assert.equal(
            (
              await db.externalDelivery.findUniqueOrThrow({
                where: { intentId: i.id },
              })
            ).state,
            'UNKNOWN',
          );
        },
      );
      await scenario(
        'durable quota prevents provider calls and reports exhausted work honestly',
        async () => {
          now = new Date('2035-01-01T00:00Z');
          const id = await scheduled();
          now = new Date('2035-01-01T00:03Z');
          await enqueueDeliveries(db, now);
          const c = await worker.claim();
          assert.ok(c);
          const budgetWorker = new DeliveryWorker(
            db,
            store,
            () => now,
            undefined,
            new ExternalDelivery(
              db,
              access,
              {
                EMAIL: {
                  senderKey: 'synthetic@gmail.com',
                  dailyLimit: 1,
                  send: sender,
                },
              },
              () => now,
            ),
          );
          const before = sends;
          await budgetWorker.execute(c);
          assert.equal(sends, before);
          assert.equal(
            (
              await db.externalDelivery.findFirstOrThrow({
                where: { intent: { messageId: id } },
              })
            ).errorCode,
            'EMAIL_QUOTA',
          );
        },
      );
      await scenario(
        'exhausted lease recovery preserves acceptance and uncertainty without remote replay',
        async () => {
          for (const state of ['ACCEPTED', 'SUBMITTING'] as const) {
            now = new Date('2035-01-01T00:00Z');
            const id = await scheduled();
            now = new Date('2035-01-01T00:03Z');
            await enqueueDeliveries(db, now);
            const c = await worker.claim();
            assert.ok(c);
            const intent = await db.deliveryIntent.findFirstOrThrow({
              where: { messageId: id },
            });
            await db.externalDelivery.create({
              data: {
                intentId: intent.id,
                state,
                submittedAt: state === 'ACCEPTED' ? now : null,
                expiresAt: new Date('2035-01-08'),
              },
            });
            await db.deliveryWork.update({
              where: { id: c.id },
              data: {
                attempts: 5,
                leaseExpiresAt: new Date(now.getTime() - 1),
              },
            });
            const before = sends;
            await worker.claim();
            assert.equal(sends, before);
            assert.equal(
              (await db.draftMessage.findUniqueOrThrow({ where: { id } }))
                .status,
              state === 'ACCEPTED' ? 'SUBMITTED' : 'DELIVERY_UNKNOWN',
            );
            assert.equal(
              (await db.deliveryWork.findUniqueOrThrow({ where: { id: c.id } }))
                .state,
              state === 'ACCEPTED' ? 'SUCCEEDED' : 'FAILED',
            );
          }
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
