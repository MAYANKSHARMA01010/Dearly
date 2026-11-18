import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../../src/app';
import { parseEnvironment } from '../../src/configs/env';
import { captureLogger } from '../helpers';
import { newToken, tokenHash } from '../../src/utils/authCrypto';
import { DraftService } from '../../src/services/draft.service';
import { ScheduleService } from '../../src/services/schedule.service';
import { scheduleChoice } from '../../src/validators/schedule.validators';
import { enqueueDeliveries } from '../../src/jobs/enqueueDeliveries';
import { DeliveryWorker } from '../../src/workers/deliveryWorker';
import { LocalStorage } from '../../src/providers/storage/local.storage';
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseUrl)
  throw Error('Set AUTH_TEST_DATABASE_URL for isolated mailbox tests.');
const schema = `dearly_mailbox_test_${randomUUID().replaceAll('-', '')}`,
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
  'mailboxes, delivery evidence, privacy, opened choices and durable event history',
  { timeout: 300000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'dearly-mailbox-')),
      pepper = randomBytes(32).toString('hex');
    const scenario = (name: string, work: () => Promise<void>) =>
      t.test(name, async () => {
        try {
          await work();
        } catch (error) {
          if (
            error instanceof Error &&
            error.constructor.name.startsWith('Prisma')
          ) {
            // eslint-disable-next-line preserve-caught-error -- Raw database errors may expose private values.
            throw Error('Database operation failed in this mailbox scenario.');
          }
          throw error;
        }
      });
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      let legacyId = '';
      for (const folder of readdirSync('prisma/migrations')
        .filter((n) => /^\d/.test(n))
        .sort()) {
        if (folder === '202611170006_mailboxes') {
          const legacy = await db.user.create({
            data: {
              phone: '+12025550199',
              phoneVerifiedAt: new Date('2020-01-01'),
            },
          });
          legacyId = (
            await db.draftMessage.create({
              data: { ownerId: legacy.id, text: 'legacy baseline' },
            })
          ).id;
        }
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
      const baseline = await db.messageEvent.findMany({
        where: { messageId: legacyId },
      });
      assert.equal(baseline.length, 1);
      assert.equal(baseline[0].kind, 'BASELINE');
      assert.equal(baseline[0].state, 'DRAFT');
      await db.draftMessage.deleteMany();
      const users = await Promise.all(
        ['+12025550170', '+12025550171', '+12025550172'].map((phone, i) =>
          db.user.create({
            data: {
              phone,
              name: i ? 'Other person' : 'Test sender',
              phoneVerifiedAt: new Date('2020-01-01'),
            },
          }),
        ),
      );
      const [owner, other] = users;
      const headers = await Promise.all(
        users.map(async (user) => {
          const id = randomUUID(),
            token = newToken(id);
          await db.session.create({
            data: {
              id,
              userId: user.id,
              accessHash: tokenHash(token),
              accessExpiresAt: new Date(Date.now() + 3600000),
              expiresAt: new Date(Date.now() + 86400000),
            },
          });
          return `Bearer ${token}`;
        }),
      );
      const logs = captureLogger(),
        config = {
          ...parseEnvironment({
            NODE_ENV: 'test',
            DATABASE_URL: url.toString(),
            AUTH_MODE: 'development',
            OTP_PEPPER: pepper,
            STORAGE_ROOT: root,
          }),
          rateLimitMax: 5000,
        };
      const app = createApp(
        config,
        { prisma: db, isReady: async () => true, disconnect: async () => {} },
        logs.logger,
      );
      const drafts = new DraftService(db),
        schedules = new ScheduleService(db, pepper),
        store = new LocalStorage(root),
        worker = new DeliveryWorker(db, store);
      const future = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
      const draft = (
        recipients: Parameters<DraftService['create']>[1]['recipients'] = [
          { type: 'SELF' },
          { type: 'USER', userId: other.id },
        ],
      ) =>
        drafts.create(owner.id, {
          subject: 'Private mailbox fixture',
          text: 'mailbox-private-body',
          recipients,
        });
      const schedule = async (d: Awaited<ReturnType<typeof draft>>) => {
        const c = scheduleChoice.parse({
          version: d.version,
          localDateTime: future,
          timezone: 'UTC',
          deliveries: d.recipients.map((r) => ({
            recipientId: r.id,
            channels: ['IN_APP'],
          })),
        });
        const p = await schedules.preview(owner.id, d.id, c);
        return {
          c,
          p,
          saved: await schedules.confirm(owner.id, d.id, {
            ...c,
            reviewToken: p.reviewToken,
          }),
        };
      };
      const deliver = async (id: string) => {
        await db.draftMessage.update({
          where: { id },
          data: { scheduledFor: new Date(Date.now() - 10000) },
        });
        await enqueueDeliveries(db);
        const c = await worker.claim();
        assert.ok(c);
        assert.equal(c.messageId, id);
        assert.equal(await worker.execute(c), true);
      };
      const get = (path: string, as = 0) =>
        request(app).get(path).set('Authorization', headers[as]);
      t.beforeEach(async () => {
        await db.draftMessage.deleteMany();
      });
      await scenario(
        'account-scoped counts and categories reflect partial outcomes without conflating sent and received',
        async () => {
          const doomed = await db.user.create({
            data: {
              phone: '+12025550173',
              phoneVerifiedAt: new Date('2020-01-01'),
            },
          });
          await draft();
          const upcoming = await draft();
          await schedule(upcoming);
          const canceled = await draft();
          await schedule(canceled);
          await schedules.cancel(owner.id, canceled.id, 2);
          const good = await draft();
          await schedule(good);
          await deliver(good.id);
          const failed = await draft([{ type: 'USER', userId: doomed.id }]);
          await schedule(failed);
          const partial = await draft([
            { type: 'SELF' },
            { type: 'USER', userId: doomed.id },
          ]);
          await schedule(partial);
          await db.user.delete({ where: { id: doomed.id } });
          await deliver(failed.id);
          await deliver(partial.id);
          const dashboard = await get('/messages/dashboard').expect(200);
          assert.deepEqual(dashboard.body.data.counts, {
            created: 6,
            scheduled: 1,
            sent: 2,
            received: 2,
            drafts: 1,
            failed: 2,
          });
          assert.equal(dashboard.body.data.unopened, 2);
          assert.match(dashboard.headers['cache-control'], /no-store/);
          const foreign = await get('/messages/dashboard', 1).expect(200);
          assert.equal(foreign.body.data.counts.created, 0);
          assert.equal(foreign.body.data.counts.received, 1);
          const sent = await get('/messages/mailboxes?box=sent').expect(200);
          assert.equal(sent.body.data.items.length, 2);
          const attention = await get('/messages/mailboxes?box=failed').expect(
            200,
          );
          assert.deepEqual(
            new Set(attention.body.data.items.map((i: { id: string }) => i.id)),
            new Set([failed.id, partial.id]),
          );
          const filtered = await get(
            '/messages/mailboxes?box=created&status=CANCELED',
          ).expect(200);
          assert.equal(filtered.body.data.items[0].id, canceled.id);
          const detail = await get(
            `/messages/mailboxes/owned/${partial.id}`,
          ).expect(200);
          assert.equal(detail.body.data.status, 'PARTIALLY_DELIVERED');
          assert.deepEqual(
            detail.body.data.deliveries
              .map((d: { outcome: string }) => d.outcome)
              .sort(),
            ['DELIVERED', 'FAILED'],
          );
          assert.equal('leaseToken' in detail.body.data, false);
        },
      );
      await scenario(
        'mailbox pages handle tied timestamps and reject cross-filter cursors and foreign owners',
        async () => {
          const all = await Promise.all([draft(), draft(), draft()]);
          await db.draftMessage.updateMany({
            where: { id: { in: all.map((d) => d.id) } },
            data: { createdAt: new Date('2026-01-01') },
          });
          const first = await get(
              '/messages/mailboxes?box=created&limit=1',
            ).expect(200),
            cursor = first.body.data.nextCursor;
          assert.ok(cursor);
          const second = await get(
            `/messages/mailboxes?box=created&limit=1&cursor=${cursor}`,
          ).expect(200);
          assert.notEqual(
            second.body.data.items[0].id,
            first.body.data.items[0].id,
          );
          await get(`/messages/mailboxes?box=sent&cursor=${cursor}`).expect(
            400,
          );
          const foreign = await get(
            `/messages/mailboxes?box=created&cursor=${cursor}`,
            1,
          ).expect(200);
          assert.equal(foreign.body.data.items.length, 0);
          await get(`/messages/mailboxes/owned/${all[0].id}`, 1).expect(404);
          await get(`/messages/mailboxes/owned/${all[0].id}/history`, 1).expect(
            404,
          );
          await request(app).get('/messages/dashboard').expect(401);
          await get('/messages/mailboxes?box=created&ownerId=forged').expect(
            400,
          );
          await get('/messages/mailboxes?box=received&status=DELIVERED').expect(
            400,
          );
        },
      );
      await scenario(
        'fetching a delivered message does not mark it opened; explicit concurrent writes are idempotent and private',
        async () => {
          const d = await draft();
          await schedule(d);
          await deliver(d.id);
          const ownInbox = await db.inboxItem.findFirstOrThrow({
              where: { messageId: d.id, userId: owner.id },
            }),
            receipt = await db.inboxItem.findFirstOrThrow({
              where: { messageId: d.id, userId: other.id },
            });
          const read = await get(`/messages/inbox/${receipt.id}`, 1).expect(
            200,
          );
          assert.equal(read.body.data.openedAt, null);
          assert.equal(read.body.data.senderName, 'Test sender');
          assert.equal(read.body.data.senderIsSelf, false);
          assert.equal('recipients' in read.body.data, false);
          assert.equal('ownerId' in read.body.data, false);
          await get(`/messages/inbox/${receipt.id}`).expect(404);
          const opened = await Promise.all(
            [0, 1].map(() =>
              request(app)
                .post(`/messages/inbox/${receipt.id}/open`)
                .set('Authorization', headers[1])
                .send({}),
            ),
          );
          assert.ok(opened.every((r) => r.status === 200));
          assert.equal(
            opened[0].body.data.openedAt,
            opened[1].body.data.openedAt,
          );
          assert.equal(
            await db.messageEvent.count({
              where: { messageId: d.id, kind: 'OPENED' },
            }),
            1,
          );
          assert.equal(
            (
              await db.inboxItem.findUniqueOrThrow({
                where: { id: ownInbox.id },
              })
            ).openedAt,
            null,
          );
          const dashboard = await get('/messages/dashboard', 1).expect(200);
          assert.equal(dashboard.body.data.unopened, 0);
          const page = await get(
            '/messages/mailboxes?box=received&read=opened',
            1,
          ).expect(200);
          assert.equal(page.body.data.items[0].id, receipt.id);
          assert.equal(page.body.data.items[0].recipientCount, null);
          await request(app)
            .post(`/messages/inbox/${receipt.id}/open`)
            .set('Authorization', headers[2])
            .send({})
            .expect(404);
          await request(app)
            .post(`/messages/inbox/${receipt.id}/open`)
            .set('Authorization', headers[1])
            .send({ openedAt: '2000-01-01' })
            .expect(400);
          const detail = await get(`/messages/mailboxes/owned/${d.id}`).expect(
            200,
          );
          const target = detail.body.data.deliveries.find(
            (i: { recipientId: string }) =>
              i.recipientId ===
              d.recipients.find((r) => r.userId === other.id)!.id,
          );
          assert.ok(target.openedAt);
          assert.equal(detail.body.data.version, 3);
        },
      );
      await scenario(
        'owned timelines persist actual mutations once, paginate deterministically, and hide older messages from cursor misuse',
        async () => {
          const d = await draft();
          const edited = await drafts.update(owner.id, d.id, {
            version: 1,
            text: 'updated',
          });
          const { c, p } = await schedule(edited);
          await schedules.confirm(owner.id, d.id, {
            ...c,
            reviewToken: p.reviewToken,
          });
          const rc = {
            version: 3,
            localDateTime: new Date(Date.now() + 2 * 86400000)
              .toISOString()
              .slice(0, 16),
            timezone: 'UTC',
          };
          const preview = await schedules.preview(owner.id, d.id, rc, true);
          await schedules.confirm(
            owner.id,
            d.id,
            { ...rc, reviewToken: preview.reviewToken },
            true,
          );
          await schedules.cancel(owner.id, d.id, 4);
          await schedules.cancel(owner.id, d.id, 4);
          await schedules.reopen(owner.id, d.id, 5);
          await schedules.reopen(owner.id, d.id, 5);
          const events = await db.messageEvent.findMany({
            where: { messageId: d.id },
            orderBy: { sequence: 'asc' },
          });
          assert.deepEqual(
            events.map((e) => e.kind),
            [
              'CREATED',
              'EDITED',
              'SCHEDULED',
              'RESCHEDULED',
              'CANCELED',
              'REOPENED',
            ],
          );
          const first = await get(
            `/messages/mailboxes/owned/${d.id}/history?limit=2`,
          ).expect(200);
          assert.equal(first.body.data.items[0].kind, 'REOPENED');
          assert.equal('sequence' in first.body.data.items[0], false);
          const next = await get(
            `/messages/mailboxes/owned/${d.id}/history?limit=2&cursor=${first.body.data.nextCursor}`,
          ).expect(200);
          assert.equal(next.body.data.items[0].kind, 'RESCHEDULED');
          const otherDraft = await draft();
          await get(
            `/messages/mailboxes/owned/${otherDraft.id}/history?cursor=${first.body.data.nextCursor}`,
          ).expect(400);
          const freshApp = createApp(
            config,
            {
              prisma: db,
              isReady: async () => true,
              disconnect: async () => {},
            },
            logs.logger,
          );
          const reread = await request(freshApp)
            .get(`/messages/mailboxes/owned/${d.id}`)
            .set('Authorization', headers[0])
            .expect(200);
          assert.equal(reread.body.data.history.items.length, 6);
        },
      );
      await scenario(
        'recipients cannot access scheduled content or media; delivered ranges remain scoped to their own inbox record',
        async () => {
          const d = await draft();
          const aid = randomUUID(),
            bytes = Buffer.from('private mailbox media');
          await writeFile(store.path(aid), bytes);
          await db.attachment.create({
            data: {
              id: aid,
              draftId: d.id,
              ownerId: owner.id,
              name: 'mail.txt',
              mime: 'text/plain',
              bytes: bytes.length,
              state: 'READY',
              sha256: createHash('sha256').update(bytes).digest('hex'),
              expiresAt: new Date(Date.now() + 86400000),
            },
          });
          await schedule(d);
          assert.equal(
            (await get('/messages/mailboxes?box=received', 1).expect(200)).body
              .data.items.length,
            0,
          );
          await get(`/messages/mailboxes/owned/${d.id}`, 1).expect(404);
          await get(
            `/messages/drafts/${d.id}/attachments/${aid}/content`,
            1,
          ).expect(404);
          await deliver(d.id);
          const receipt = await db.inboxItem.findFirstOrThrow({
            where: { messageId: d.id, userId: other.id },
          });
          const range = await get(
            `/messages/inbox/${receipt.id}/attachments/${aid}/content`,
            1,
          )
            .set('Range', 'bytes=0-6')
            .expect(206);
          assert.equal(range.text, 'private');
          await get(
            `/messages/inbox/${receipt.id}/attachments/${aid}/content`,
            2,
          ).expect(404);
          await get(
            `/messages/inbox/${receipt.id}/attachments/${randomUUID()}/content`,
            1,
          ).expect(404);
          const detail = await get(`/messages/inbox/${receipt.id}`, 1).expect(
            200,
          );
          assert.equal('path' in detail.body.data.attachments[0], false);
        },
      );
      await scenario(
        'unsupported external acceptance records never become sent, received, delivered or opened evidence',
        async () => {
          const d = await draft([{ type: 'SELF' }]);
          await db.draftMessage.update({
            where: { id: d.id },
            data: {
              status: 'SCHEDULED',
              scheduledFor: new Date(Date.now() - 10000),
              scheduleTimezone: 'UTC',
              scheduleLocalDateTime: new Date().toISOString().slice(0, 16),
            },
          });
          const intent = await db.deliveryIntent.create({
            data: {
              messageId: d.id,
              recipientId: d.recipients[0].id,
              channel: 'SMS',
            },
          });
          const work = await db.deliveryWork.create({
            data: {
              messageId: d.id,
              scheduleVersion: 1,
              nextAttemptAt: new Date(),
              state: 'SUCCEEDED',
              attempts: 1,
            },
          });
          await db.deliveryAttempt.create({
            data: {
              workId: work.id,
              intentId: intent.id,
              number: 1,
              state: 'SUCCEEDED',
              finishedAt: new Date(),
            },
          });
          const fake = await db.inboxItem.create({
            data: { intentId: intent.id, messageId: d.id, userId: owner.id },
          });
          const dashboard = await get('/messages/dashboard').expect(200);
          assert.equal(dashboard.body.data.counts.sent, 0);
          assert.equal(dashboard.body.data.counts.received, 0);
          const detail = await get(`/messages/mailboxes/owned/${d.id}`).expect(
            200,
          );
          assert.equal(detail.body.data.deliveries[0].outcome, 'UNAVAILABLE');
          assert.equal(detail.body.data.deliveries[0].deliveredAt, null);
          assert.equal(detail.body.data.deliveries[0].openedAt, null);
          assert.equal(detail.body.data.deliveries[0].attempt, null);
          await get(`/messages/inbox/${fake.id}`).expect(404);
          assert.equal(
            (await get('/messages/inbox').expect(200)).body.data.items.length,
            0,
          );
          await request(app)
            .post(`/messages/inbox/${fake.id}/open`)
            .set('Authorization', headers[0])
            .send({})
            .expect(404);
        },
      );
      await scenario(
        'payloads and logs omit tokens, claim state, storage paths and other private internals',
        async () => {
          const d = await draft();
          const detail = await get(`/messages/mailboxes/owned/${d.id}`).expect(
            200,
          );
          const body = JSON.stringify(detail.body.data);
          for (const key of [
            'scheduleRequestHash',
            'leaseToken',
            'sequence',
            'sha256',
            'workId',
          ])
            assert.ok(!body.includes(key));
          const log = JSON.stringify(logs.entries);
          assert.ok(!log.includes('mailbox-private-body'));
          assert.ok(!log.includes(headers[0]));
        },
      );
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      // eslint-disable-next-line preserve-caught-error -- Hide datasource details.
      throw Error(
        'Mailbox integration setup failed. Check isolated database availability.',
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
