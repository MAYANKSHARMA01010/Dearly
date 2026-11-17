import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../../src/app';
import { parseEnvironment } from '../../src/configs/env';
import { captureLogger } from '../helpers';
import { newToken, tokenHash } from '../../src/utils/authCrypto';
import { ScheduleService } from '../../src/services/schedule.service';
import { DraftService } from '../../src/services/draft.service';
import { scheduleChoice } from '../../src/validators/schedule.validators';
import {
  DeliveryWorker,
  DeliveryFault,
} from '../../src/workers/deliveryWorker';
import { enqueueDeliveries } from '../../src/jobs/enqueueDeliveries';
import { LocalStorage } from '../../src/providers/storage/local.storage';
import { ApiError } from '../../src/utils/ApiError';
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseUrl)
  throw Error('Set AUTH_TEST_DATABASE_URL for isolated delivery tests.');
const schema = `dearly_delivery_test_${randomUUID().replaceAll('-', '')}`,
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
  'durable delivery: due-time privacy, process recovery, fencing, retries and recipient isolation',
  { timeout: 300000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'dearly-delivery-')),
      pepper = randomBytes(32).toString('hex'),
      children: ChildProcess[] = [];
    const scenario = (name: string, work: () => Promise<void>) =>
      t.test(name, async () => {
        try {
          await work();
        } catch (error) {
          if (
            error instanceof Error &&
            error.constructor.name.startsWith('Prisma')
          ) {
            // eslint-disable-next-line preserve-caught-error -- Raw database details may contain private values.
            throw Error('Database operation failed in this delivery scenario.');
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
          /"(users|phone_auth_states|otp_challenges|sessions|refresh_tokens|draft_messages|draft_recipients|attachments|delivery_intents|delivery_work|delivery_attempts|inbox_items|worker_heartbeats|message_events|email_deliveries|email_budgets|EmailState|MessageEventKind|WorkState|AttemptState|MessageStatus|RecipientType|AttachmentState|DeliveryChannel)"/g,
          `"${schema}"."$1"`,
        );
        for (const statement of sql.split(';').filter((s) => s.trim()))
          await db.$executeRawUnsafe(statement);
      }
      const users = await Promise.all(
        ['+12025550174', '+12025550175', '+12025550176'].map((phone) =>
          db.user.create({
            data: { phone, phoneVerifiedAt: new Date('2020-01-01T00:00:00Z') },
          }),
        ),
      );
      const [owner, other, stranger] = users;
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
      const store = new LocalStorage(root),
        worker = new DeliveryWorker(db, store),
        drafts = new DraftService(db);
      const future = new Date(Date.now() + 86400000);
      const schedules = new ScheduleService(db, pepper);
      const make = async (
        recipients: Parameters<DraftService['create']>[1]['recipients'] = [
          { type: 'SELF' },
          { type: 'USER', userId: other.id },
        ],
      ) => {
        const d = await drafts.create(owner.id, {
          subject: 'Delivery QA',
          text: 'private-delivery-fixture',
          recipients,
        });
        const c = scheduleChoice.parse({
          version: d.version,
          localDateTime: future.toISOString().slice(0, 16),
          timezone: 'UTC',
          deliveries: d.recipients.map((r) => ({
            recipientId: r.id,
            channels: ['IN_APP'],
          })),
        });
        const p = await schedules.preview(owner.id, d.id, c);
        await schedules.confirm(owner.id, d.id, {
          ...c,
          reviewToken: p.reviewToken,
        });
        return d.id;
      };
      const due = async (id: string) => {
        await db.draftMessage.update({
          where: { id },
          data: { scheduledFor: new Date(Date.now() - 10000) },
        });
        await enqueueDeliveries(db);
      };
      const clear = async () => {
        await db.draftMessage.deleteMany();
      };
      const expectCode = (code: string) => (e: unknown) =>
        e instanceof ApiError && e.code === code;
      await scenario(
        'future plans and old paused plans never expose content; a due claim freezes edits and cancels',
        async () => {
          await clear();
          const id = await make();
          assert.equal(await enqueueDeliveries(db), 0);
          assert.equal(await worker.claim(), null);
          await db.deliveryWork.create({
            data: {
              messageId: id,
              scheduleVersion: 2,
              nextAttemptAt: new Date(Date.now() - 1000),
            },
          });
          assert.equal(await worker.claim(), null);
          assert.equal(
            (
              await db.deliveryWork.findFirstOrThrow({
                where: { messageId: id },
              })
            ).state,
            'READY',
          );
          await db.deliveryWork.deleteMany({ where: { messageId: id } });
          const intent = await db.deliveryIntent.findFirstOrThrow({
            where: { messageId: id, recipient: { targetUserId: other.id } },
          });
          const forged = await db.inboxItem.create({
            data: { messageId: id, intentId: intent.id, userId: other.id },
          });
          await request(app)
            .get(`/messages/inbox/${forged.id}`)
            .set('Authorization', headers[1])
            .expect(404);
          await db.inboxItem.delete({ where: { id: forged.id } });
          await request(app)
            .get('/messages/inbox')
            .set('Authorization', headers[1])
            .expect(200)
            .then((r) => assert.equal(r.body.data.items.length, 0));
          await request(app)
            .get(`/messages/inbox/${id}`)
            .set('Authorization', headers[1])
            .expect(404);
          await db.draftMessage.update({
            where: { id },
            data: {
              deliveryEnabled: false,
              scheduledFor: new Date(Date.now() - 10000),
            },
          });
          assert.equal(await enqueueDeliveries(db), 0);
          await db.draftMessage.update({
            where: { id },
            data: { deliveryEnabled: true },
          });
          await enqueueDeliveries(db);
          const c = await worker.claim();
          assert.ok(c);
          await assert.rejects(
            schedules.cancel(owner.id, id, 3),
            expectCode('SCHEDULE_STATE'),
          );
          await assert.rejects(
            schedules.edit(owner.id, id, { version: 3, text: 'too late' }),
            expectCode('SCHEDULE_STATE'),
          );
          assert.equal(await worker.execute(c), true);
          assert.equal(
            (await schedules.read(owner.id, id)).status,
            'DELIVERED',
          );
          await request(app)
            .get(`/messages/schedules/${id}`)
            .set('Authorization', headers[2])
            .expect(404);
        },
      );
      await scenario(
        'inbox content and attachment ranges are available only to delivered recipients',
        async () => {
          await clear();
          const id = await make(),
            aid = randomUUID(),
            bytes = Buffer.from('private delivery attachment');
          await writeFile(store.path(aid), bytes);
          await db.attachment.create({
            data: {
              id: aid,
              draftId: id,
              ownerId: owner.id,
              name: 'note.txt',
              mime: 'text/plain',
              bytes: bytes.length,
              state: 'READY',
              sha256: createHash('sha256').update(bytes).digest('hex'),
              expiresAt: new Date(Date.now() + 86400000),
            },
          });
          await request(app)
            .get(`/messages/drafts/${id}/attachments/${aid}/content`)
            .set('Authorization', headers[1])
            .expect(404);
          await due(id);
          const c = await worker.claim();
          assert.ok(c);
          await worker.execute(c);
          const list = await request(app)
            .get('/messages/inbox?limit=1')
            .set('Authorization', headers[1])
            .expect(200);
          const inboxId = list.body.data.items[0].id;
          const detail = await request(app)
            .get(`/messages/inbox/${inboxId}`)
            .set('Authorization', headers[1])
            .expect(200);
          assert.equal(detail.body.data.text, 'private-delivery-fixture');
          assert.equal('recipients' in detail.body.data, false);
          assert.equal('ownerId' in detail.body.data, false);
          const part = await request(app)
            .get(`/messages/inbox/${inboxId}/attachments/${aid}/content`)
            .set('Authorization', headers[1])
            .set('Range', 'bytes=0-6')
            .expect(206);
          assert.equal(part.text, 'private');
          assert.match(part.headers['cache-control'], /no-store/);
          await request(app)
            .get(`/messages/inbox/${inboxId}`)
            .set('Authorization', headers[2])
            .expect(404);
          await request(app)
            .get(`/messages/inbox/${inboxId}/attachments/${aid}/content`)
            .set('Authorization', headers[2])
            .expect(404);
          await request(app).get(`/messages/inbox/${inboxId}`).expect(401);
          assert.equal(await worker.execute(c), false);
          assert.equal(
            await db.inboxItem.count({ where: { messageId: id } }),
            2,
          );
        },
      );
      await scenario(
        'cancellation wins before claim and stale content/reschedule jobs cannot dispatch',
        async () => {
          await clear();
          const canceled = await make();
          await due(canceled);
          await schedules.cancel(owner.id, canceled, 2);
          assert.equal(await worker.claim(), null);
          assert.equal(await db.inboxItem.count(), 0);
          const changed = await make();
          await due(changed);
          await schedules.edit(owner.id, changed, {
            version: 2,
            text: 'changed before claim',
          });
          assert.equal(await worker.claim(), null);
          await enqueueDeliveries(db);
          const c = await worker.claim();
          assert.ok(c);
          await worker.execute(c);
          assert.equal(
            (
              await db.deliveryWork.findMany({
                where: { messageId: changed },
                orderBy: { scheduleVersion: 'asc' },
              })
            )[0].state,
            'OBSOLETE',
          );
          const moved = await make();
          await due(moved);
          const rc = {
            version: 2,
            localDateTime: future.toISOString().slice(0, 16),
            timezone: 'UTC',
          };
          const p = await schedules.preview(owner.id, moved, rc, true);
          await schedules.confirm(
            owner.id,
            moved,
            { ...rc, reviewToken: p.reviewToken },
            true,
          );
          assert.equal(await worker.claim(), null);
          assert.equal(
            await db.inboxItem.count({ where: { messageId: moved } }),
            0,
          );
        },
      );
      await scenario(
        'competing claims and cancellation have a single dispatch boundary',
        async () => {
          await clear();
          const id = await make();
          await due(id);
          const results = await Promise.allSettled([
            worker.claim(),
            new DeliveryWorker(db, store).claim(),
            schedules.cancel(owner.id, id, 2),
          ]);
          const claims = results.flatMap((r) =>
            r.status === 'fulfilled' && r.value && 'token' in r.value
              ? [r.value]
              : [],
          );
          assert.ok(claims.length <= 1);
          const message = await db.draftMessage.findUniqueOrThrow({
            where: { id },
          });
          if (message.status === 'CANCELED') {
            assert.equal(claims.length, 0);
            assert.equal(await db.inboxItem.count(), 0);
          } else {
            assert.equal(claims.length, 1);
            await worker.execute(claims[0]);
            assert.equal(await db.inboxItem.count(), 2);
          }
        },
      );
      await scenario(
        'an expired claim is reclaimed and an old process cannot commit',
        async () => {
          await clear();
          const id = await make();
          await due(id);
          const old = await worker.claim();
          assert.ok(old);
          await db.deliveryWork.update({
            where: { id: old.id },
            data: { leaseExpiresAt: new Date(Date.now() - 1000) },
          });
          const next = await new DeliveryWorker(db, store).claim();
          assert.ok(next);
          assert.notEqual(next.token, old.token);
          assert.equal(next.attempt, 2);
          assert.equal(await worker.execute(old), false);
          assert.equal(await worker.execute(next), true);
          assert.equal(await db.inboxItem.count(), 2);
          assert.equal(
            await db.deliveryAttempt.count({
              where: { workId: old.id, number: 1, state: 'ABANDONED' },
            }),
            2,
          );
        },
      );
      await scenario(
        'a lease expiring during commit rolls back every inbox write',
        async () => {
          await clear();
          const id = await make();
          await due(id);
          const c = await worker.claim();
          assert.ok(c);
          let reads = 0;
          const now = Date.now();
          const late = new DeliveryWorker(
            db,
            store,
            () => new Date(now + (reads++ ? 120000 : 0)),
          );
          assert.equal(await late.execute(c), false);
          assert.equal(await db.inboxItem.count(), 0);
          assert.equal(
            (await db.deliveryWork.findUniqueOrThrow({ where: { id: c.id } }))
              .state,
            'RUNNING',
          );
          await db.deliveryWork.update({
            where: { id: c.id },
            data: { leaseExpiresAt: new Date(Date.now() - 1000) },
          });
          const fresh = await worker.claim();
          assert.ok(fresh);
          await worker.execute(fresh);
          assert.equal(await db.inboxItem.count(), 2);
        },
      );
      await scenario(
        'storage failures back off, exhaust a bounded budget and can recover without duplicates',
        async () => {
          await clear();
          const id = await make();
          await due(id);
          const failing = new DeliveryWorker(db, store, undefined, async () => {
            throw new DeliveryFault('STORAGE_UNAVAILABLE');
          });
          let workId = '';
          for (let n = 1; n <= 5; n++) {
            const c = await failing.claim();
            assert.ok(c);
            workId = c.id;
            assert.equal(await failing.execute(c), false);
            const w = await db.deliveryWork.findUniqueOrThrow({
              where: { id: c.id },
            });
            assert.equal(w.attempts, n);
            assert.equal(w.state, n === 5 ? 'FAILED' : 'READY');
            if (n < 5) {
              assert.equal(await failing.claim(), null);
              await db.deliveryWork.update({
                where: { id: c.id },
                data: { nextAttemptAt: new Date(Date.now() - 1000) },
              });
            }
          }
          assert.equal(await db.inboxItem.count(), 0);
          assert.equal(
            (await db.draftMessage.findUniqueOrThrow({ where: { id } })).status,
            'FAILED',
          );
          assert.equal(await worker.retry(workId), true);
          const recovered = await worker.claim();
          assert.ok(recovered);
          assert.equal(await worker.execute(recovered), true);
          assert.equal(await db.inboxItem.count(), 2);
          assert.equal(await worker.retry(workId), false);
          await db.deliveryWork.update({where:{id:workId},data:{state:'FAILED',attemptLimit:20}});await db.draftMessage.update({where:{id},data:{status:'FAILED'}});assert.equal(await worker.retry(workId),false);
        },
      );
      await scenario(
        'verified phone bindings never redirect to a replacement account; mixed outcomes stay explicit',
        async () => {
          await clear();
          const id = await make([
            { type: 'SELF' },
            { type: 'PHONE', phone: other.phone, country: 'US' },
          ]);
          const recipient = await db.draftRecipient.findFirstOrThrow({
            where: { messageId: id, type: 'PHONE' },
          });
          assert.equal(recipient.targetUserId, other.id);
          const changing = await drafts.create(owner.id, {
            text: 'changing phone review',
            recipients: [{ type: 'PHONE', phone: other.phone, country: 'US' }],
          });
          const changedChoice = scheduleChoice.parse({
            version: 1,
            localDateTime: future.toISOString().slice(0, 16),
            timezone: 'UTC',
            deliveries: changing.recipients.map((r) => ({
              recipientId: r.id,
              channels: ['IN_APP'],
            })),
          });
          const oldReview = await schedules.preview(
            owner.id,
            changing.id,
            changedChoice,
          );
          await db.user.update({
            where: { id: other.id },
            data: { phone: '+12025550177' },
          });
          await db.user.create({
            data: {
              phone: other.phone,
              phoneVerifiedAt: new Date('2020-01-01'),
            },
          });
          await assert.rejects(
            schedules.confirm(owner.id, changing.id, {
              ...changedChoice,
              reviewToken: oldReview.reviewToken,
            }),
            expectCode('REVIEW_EXPIRED'),
          );
          await due(id);
          const c = await worker.claim();
          assert.ok(c);
          await worker.execute(c);
          assert.equal(
            (await db.draftMessage.findUniqueOrThrow({ where: { id } })).status,
            'PARTIALLY_DELIVERED',
          );
          assert.equal(await db.inboxItem.count(), 1);
          assert.equal(
            await db.deliveryAttempt.count({
              where: {
                state: 'PERMANENT_FAILED',
                errorCode: 'RECIPIENT_UNAVAILABLE',
              },
            }),
            1,
          );
          const unknown = await drafts.create(owner.id, {
            text: 'unknown phone',
            recipients: [
              { type: 'PHONE', phone: '+12025550178', country: 'US' },
            ],
          });
          await assert.rejects(
            schedules.preview(
              owner.id,
              unknown.id,
              scheduleChoice.parse({
                version: 1,
                localDateTime: future.toISOString().slice(0, 16),
                timezone: 'UTC',
                deliveries: unknown.recipients.map((r) => ({
                  recipientId: r.id,
                  channels: ['IN_APP'],
                })),
              }),
            ),
            expectCode('INVALID_RECIPIENTS'),
          );
          const deleted = await make([{ type: 'USER', userId: stranger.id }]);
          await db.user.delete({ where: { id: stranger.id } });
          await due(deleted);
          const dc = await worker.claim();
          assert.ok(dc);
          await worker.execute(dc);
          assert.equal(
            (
              await db.draftMessage.findUniqueOrThrow({
                where: { id: deleted },
              })
            ).status,
            'FAILED',
          );
        },
      );
      await scenario(
        'independent worker processes survive a crash and create unique inbox records',
        async () => {
          await clear();
          const id = await make([{ type: 'SELF' }]);
          await due(id);
          // A process exits after a durable claim without executing it, simulating a crash.
          const childCode =
            "const {PrismaClient}=require('@prisma/client');const {DeliveryWorker}=require('./dist/workers/deliveryWorker');const {LocalStorage}=require('./dist/providers/storage/local.storage');const db=new PrismaClient({log:[]});(async()=>{try{const c=await new DeliveryWorker(db,new LocalStorage(process.env.STORAGE_ROOT)).claim();if(!c)process.exitCode=1;}catch{process.exitCode=1;}finally{await db.$disconnect();}})();";
          const env = {
            ...process.env,
            DATABASE_URL: url.toString(),
            STORAGE_ROOT: root,
          };
          const crashed = spawn(process.execPath, ['-e', childCode], {
            env,
            stdio: 'ignore',
          });
          children.push(crashed);
          assert.equal(
            await new Promise<number | null>((r) => crashed.once('exit', r)),
            0,
          );
          await db.deliveryWork.updateMany({
            where: { messageId: id, state: 'RUNNING' },
            data: { leaseExpiresAt: new Date(Date.now() - 1000) },
          });
          const processes = [0, 1].map(() => {
            const p = spawn(
              process.execPath,
              ['dist/workers/runDeliveryWorker.js'],
              { env: { ...env, AUTH_MODE: 'disabled' }, stdio: 'ignore' },
            );
            children.push(p);
            return p;
          });
          const deadline = Date.now() + 25000;
          while (
            Date.now() < deadline &&
            (await db.inboxItem.count({ where: { messageId: id } })) !== 1
          )
            await delay(300);
          assert.equal(
            await db.inboxItem.count({ where: { messageId: id } }),
            1,
          );
          assert.equal(
            await db.deliveryWork.count({ where: { messageId: id } }),
            1,
          );
          for (const p of processes) {
            p.kill('SIGTERM');
            await new Promise<void>((resolve) => {
              if (p.exitCode !== null) resolve();
              else p.once('exit', () => resolve());
            });
          }
          assert.equal(
            await db.workerHeartbeat.count({ where: { stoppedAt: null } }),
            0,
          );
        },
      );
      await scenario(
        'heartbeat health and diagnostics expose no tokens or message content',
        async () => {
          const id = randomUUID();
          await worker.heartbeat(id);
          await request(app).get('/health/worker').expect(200);
          await worker.heartbeat(id, true);
          await request(app).get('/health/worker').expect(503);
          const entries = JSON.stringify(logs.entries);
          assert.ok(!entries.includes('private-delivery-fixture'));
          assert.ok(!entries.includes(headers[0]));
        },
      );
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      // eslint-disable-next-line preserve-caught-error -- Suppress private datasource/Prisma details.
      throw Error(
        'Delivery integration failed. Inspect safe assertions and database availability.',
      );
    } finally {
      for (const c of children) if (c.exitCode === null) c.kill('SIGKILL');
      await db.$disconnect();
      await admin.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
      );
      await admin.$disconnect();
      await rm(root, { recursive: true, force: true });
    }
  },
);
