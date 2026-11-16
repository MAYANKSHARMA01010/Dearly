import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../../src/app';
import { parseEnvironment } from '../../src/configs/env';
import { captureLogger } from '../helpers';
import { ScheduleService } from '../../src/services/schedule.service';
import { scheduleChoice } from '../../src/validators/schedule.validators';
import { ApiError } from '../../src/utils/ApiError';
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseUrl)
  throw Error('Set AUTH_TEST_DATABASE_URL for isolated scheduling tests.');
const schema = `dearly_schedule_test_${randomUUID().replaceAll('-', '')}`;
const url = new URL(databaseUrl);
url.searchParams.set('schema', schema);
url.searchParams.set('connection_limit', '5');
const db = new PrismaClient({
  datasources: { db: { url: url.toString() } },
  log: [],
  errorFormat: 'minimal',
});
const admin = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
  log: [],
  errorFormat: 'minimal',
});
test(
  'durable schedule review, ownership, media freeze, transitions and races',
  { timeout: 240000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'dearly-schedule-'));
    const pepper = randomBytes(32).toString('hex');
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      for (const folder of readdirSync('prisma/migrations')
        .filter((n) => /^\d/.test(n))
        .sort()) {
        const sql = readFileSync(
          `prisma/migrations/${folder}/migration.sql`,
          'utf8',
        ).replace(
          /"(users|phone_auth_states|otp_challenges|sessions|refresh_tokens|draft_messages|draft_recipients|attachments|delivery_intents|delivery_work|delivery_attempts|inbox_items|worker_heartbeats|WorkState|AttemptState|MessageStatus|RecipientType|AttachmentState|DeliveryChannel)"/g,
          `"${schema}"."$1"`,
        );
        for (const statement of sql.split(';').filter((s) => s.trim()))
          await db.$executeRawUnsafe(statement);
      }
      const logs = captureLogger();
      const config = {
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
      const login = async (phone: string) => {
        const c = await request(app)
          .post('/auth/otp/request')
          .send({ phone, country: 'US' })
          .expect(200);
        return (
          await request(app)
            .post('/auth/otp/verify')
            .send({
              challengeId: c.body.data.challengeId,
              code: c.body.data.developmentCode,
            })
            .expect(200)
        ).body.data as { accessToken: string; user: { id: string } };
      };
      const owner = await login('2025550165'),
        other = await login('2025550166');
      const auth = `Bearer ${owner.accessToken}`,
        foreign = `Bearer ${other.accessToken}`;
      const create = async () =>
        (
          await request(app)
            .post('/messages/drafts')
            .set('Authorization', auth)
            .send({
              subject: 'A future thought',
              text: 'private-schedule-test',
              recipients: [
                { type: 'SELF' },
                { type: 'USER', userId: other.user.id },
              ],
            })
            .expect(201)
        ).body.data as {
          id: string;
          version: number;
          recipients: { id: string }[];
        };
      const choice = (
        d: Awaited<ReturnType<typeof create>>,
        time = '2027-01-02T00:15',
      ) => ({
        version: d.version,
        localDateTime: time,
        timezone: 'Asia/Kolkata',
        deliveries: d.recipients.map((r) => ({
          recipientId: r.id,
          channels: ['IN_APP'],
        })),
      });
      const preview = async (id: string, c: object) =>
        (
          await request(app)
            .post(`/messages/schedules/${id}/preview`)
            .set('Authorization', auth)
            .send(c)
            .expect(200)
        ).body.data;
      const confirm = (id: string, c: object, token: string) =>
        request(app)
          .post(`/messages/schedules/${id}/confirm`)
          .set('Authorization', auth)
          .send({ ...c, reviewToken: token });
      const media = async (id: string) => {
        const aid = randomUUID(),
          base = `/messages/drafts/${id}/attachments`;
        await request(app)
          .post(base)
          .set('Authorization', auth)
          .send({ id: aid, name: 'note.txt', mime: 'text/plain', bytes: 5 })
          .expect(201);
        await request(app)
          .put(`${base}/${aid}/content`)
          .set('Authorization', auth)
          .set('Content-Type', 'application/octet-stream')
          .send(Buffer.from('hello'))
          .expect(200);
        await request(app)
          .post(`${base}/${aid}/finalize`)
          .set('Authorization', auth)
          .send({})
          .expect(200);
        return `${base}/${aid}`;
      };
      await t.test(
        'preview resolves the actual instant and confirmation is private, durable and idempotent',
        async () => {
          const d = await create(),
            c = choice(d),
            p = await preview(d.id, c);
          assert.equal(p.resolved.scheduledFor, '2027-01-01T18:45:00.000Z');
          assert.equal(p.backgroundDelivery, true);
          const saved = (await confirm(d.id, c, p.reviewToken).expect(200)).body
            .data;
          assert.equal(saved.status, 'SCHEDULED');
          assert.equal(saved.version, 2);
          assert.equal(saved.deliveries.length, 2);
          const retry = (await confirm(d.id, c, p.reviewToken).expect(200)).body
            .data;
          assert.equal(retry.version, 2);
          assert.equal(
            await db.deliveryIntent.count({ where: { messageId: d.id } }),
            2,
          );
          await confirm(
            d.id,
            { ...c, localDateTime: '2027-01-03T12:00' },
            p.reviewToken,
          ).expect(409);
          await request(app)
            .get(`/messages/schedules/${d.id}`)
            .set('Authorization', foreign)
            .expect(404);
          await request(app).get(`/messages/schedules/${d.id}`).expect(401);
          await request(app)
            .get(`/messages/drafts/${d.id}`)
            .set('Authorization', auth)
            .expect(404);
          await request(app)
            .patch(`/messages/drafts/${d.id}`)
            .set('Authorization', auth)
            .send({ version: 2, text: 'bypass' })
            .expect(409);
          const fresh = new ScheduleService(db, pepper);
          assert.equal(
            (await fresh.read(owner.user.id, d.id)).scheduledFor?.toISOString(),
            '2027-01-01T18:45:00.000Z',
          );
        },
      );
      await t.test(
        'readiness, unavailable channels and missing/duplicate delivery selections are rejected',
        async () => {
          const d = await create(),
            c = choice(d);
          await request(app)
            .post(`/messages/schedules/${d.id}/preview`)
            .set('Authorization', auth)
            .send({ ...c, deliveries: [c.deliveries[0], c.deliveries[0]] })
            .expect(400);
          await request(app)
            .post(`/messages/schedules/${d.id}/preview`)
            .set('Authorization', auth)
            .send({
              ...c,
              deliveries: c.deliveries.map((r) => ({
                ...r,
                channels: ['WHATSAPP'],
              })),
            })
            .expect(400);
          const id = randomUUID();
          await request(app)
            .post(`/messages/drafts/${d.id}/attachments`)
            .set('Authorization', auth)
            .send({ id, name: 'pending.txt', mime: 'text/plain', bytes: 2 })
            .expect(201);
          const blocked = await request(app)
            .post(`/messages/schedules/${d.id}/preview`)
            .set('Authorization', auth)
            .send(c)
            .expect(409);
          assert.equal(blocked.body.error.code, 'ATTACHMENTS_NOT_READY');
          const phone = (
            await request(app)
              .post('/messages/drafts')
              .set('Authorization', auth)
              .send({
                text: 'phone',
                recipients: [
                  { type: 'PHONE', phone: '2025550179', country: 'US' },
                ],
              })
              .expect(201)
          ).body.data;
          await request(app)
            .post(`/messages/schedules/${phone.id}/preview`)
            .set('Authorization', auth)
            .send(choice(phone))
            .expect(400);
        },
      );
      await t.test(
        'tampered/expired reviews and recipient or attachment changes cannot confirm stale previews',
        async () => {
          const d = await create(),
            c = choice(d),
            p = await preview(d.id, c);
          await confirm(d.id, c, `${p.reviewToken}tamper`).expect(409);
          await request(app)
            .patch(`/messages/drafts/${d.id}`)
            .set('Authorization', auth)
            .send({ version: 1, text: 'changed' })
            .expect(200);
          await confirm(d.id, c, p.reviewToken).expect(409);
          const a = await create(),
            ac = choice(a),
            ap = await preview(a.id, ac);
          await media(a.id);
          await confirm(a.id, ac, ap.reviewToken).expect(409);
          let clock = new Date();
          const service = new ScheduleService(db, pepper, () => clock);
          const e = await create();
          const ec = scheduleChoice.parse(choice(e));
          const ep = await service.preview(owner.user.id, e.id, ec);
          clock = new Date(clock.getTime() + 660000);
          await assert.rejects(
            service.confirm(owner.user.id, e.id, {
              ...ec,
              reviewToken: ep.reviewToken,
            }),
            (err: unknown) =>
              err instanceof ApiError && err.code === 'REVIEW_EXPIRED',
          );
        },
      );
      await t.test(
        'scheduled content edit, reschedule, cancellation and return to drafts advance one version',
        async () => {
          const d = await create(),
            c = choice(d),
            p = await preview(d.id, c);
          await confirm(d.id, c, p.reviewToken).expect(200);
          const edited = (
            await request(app)
              .patch(`/messages/schedules/${d.id}`)
              .set('Authorization', auth)
              .send({ version: 2, text: 'updated before delivery' })
              .expect(200)
          ).body.data;
          assert.equal(edited.version, 3);
          await request(app)
            .patch(`/messages/schedules/${d.id}`)
            .set('Authorization', auth)
            .send({ version: 3, recipients: [] })
            .expect(400);
          const rc = {
            version: 3,
            localDateTime: '2027-04-01T12:30',
            timezone: 'America/New_York',
          };
          const rp = (
            await request(app)
              .post(`/messages/schedules/${d.id}/reschedule/preview`)
              .set('Authorization', auth)
              .send(rc)
              .expect(200)
          ).body.data;
          const moved = (
            await request(app)
              .post(`/messages/schedules/${d.id}/reschedule`)
              .set('Authorization', auth)
              .send({ ...rc, reviewToken: rp.reviewToken })
              .expect(200)
          ).body.data;
          assert.equal(moved.version, 4);
          assert.equal(moved.scheduledFor, '2027-04-01T16:30:00.000Z');
          const canceled = (
            await request(app)
              .post(`/messages/schedules/${d.id}/cancel`)
              .set('Authorization', auth)
              .send({ version: 4 })
              .expect(200)
          ).body.data;
          assert.equal(canceled.status, 'CANCELED');
          assert.equal(canceled.version, 5);
          await request(app)
            .post(`/messages/schedules/${d.id}/cancel`)
            .set('Authorization', auth)
            .send({ version: 4 })
            .expect(200);
          await confirm(d.id, c, p.reviewToken).expect(409);
          const reopened = (
            await request(app)
              .post(`/messages/schedules/${d.id}/reopen`)
              .set('Authorization', auth)
              .send({ version: 5 })
              .expect(200)
          ).body.data;
          assert.equal(reopened.status, 'DRAFT');
          assert.equal(reopened.version, 6);
          assert.equal(
            await db.deliveryIntent.count({ where: { messageId: d.id } }),
            0,
          );
        },
      );
      await t.test(
        'competing schedule/content changes and competing reschedules have one winner',
        async () => {
          const d = await create(),
            c = choice(d),
            p = await preview(d.id, c);
          const raced = await Promise.all([
            confirm(d.id, c, p.reviewToken),
            request(app)
              .patch(`/messages/drafts/${d.id}`)
              .set('Authorization', auth)
              .send({ version: 1, text: 'race edit' }),
          ]);
          assert.deepEqual(raced.map((r) => r.status).sort(), [200, 409]);
          const x = await create(),
            xc = choice(x),
            xp = await preview(x.id, xc);
          await confirm(x.id, xc, xp.reviewToken).expect(200);
          const choices = [
            { version: 2, localDateTime: '2027-02-01T10:00', timezone: 'UTC' },
            { version: 2, localDateTime: '2027-03-01T10:00', timezone: 'UTC' },
          ];
          const reviews = await Promise.all(
            choices.map((rc) =>
              request(app)
                .post(`/messages/schedules/${x.id}/reschedule/preview`)
                .set('Authorization', auth)
                .send(rc)
                .expect(200),
            ),
          );
          const results = await Promise.all(
            choices.map((rc, i) =>
              request(app)
                .post(`/messages/schedules/${x.id}/reschedule`)
                .set('Authorization', auth)
                .send({ ...rc, reviewToken: reviews[i].body.data.reviewToken }),
            ),
          );
          assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        },
      );
      await t.test(
        'scheduling freezes attachment writes atomically while owner reads remain private',
        async () => {
          const d = await create(),
            path = await media(d.id),
            c = choice(d),
            p = await preview(d.id, c);
          await confirm(d.id, c, p.reviewToken).expect(200);
          await request(app)
            .get(`${path}/content`)
            .set('Authorization', auth)
            .expect(200);
          await request(app)
            .get(`${path}/content`)
            .set('Authorization', foreign)
            .expect(404);
          await request(app)
            .delete(path)
            .set('Authorization', auth)
            .expect(409);
          await request(app)
            .post(`/messages/drafts/${d.id}/attachments`)
            .set('Authorization', auth)
            .send({
              id: randomUUID(),
              name: 'new.txt',
              mime: 'text/plain',
              bytes: 1,
            })
            .expect(409);
          const r = await create(),
            rpath = await media(r.id),
            rc = choice(r),
            rp = await preview(r.id, rc);
          const results = await Promise.all([
            confirm(r.id, rc, rp.reviewToken),
            request(app).delete(rpath).set('Authorization', auth),
          ]);
          assert.deepEqual(results.map((v) => v.status).sort(), [200, 409]);
        },
      );
      await t.test(
        'scheduled pagination is owner-scoped, bounded and contains no message content',
        async () => {
          const page = await request(app)
            .get('/messages/schedules?limit=1')
            .set('Authorization', auth)
            .expect(200);
          assert.equal(page.body.data.items.length, 1);
          assert.ok(page.body.data.nextCursor);
          assert.equal('text' in page.body.data.items[0], false);
          const next = await request(app)
            .get(
              `/messages/schedules?limit=1&cursor=${page.body.data.nextCursor}`,
            )
            .set('Authorization', auth)
            .expect(200);
          assert.notEqual(
            next.body.data.items[0].id,
            page.body.data.items[0].id,
          );
          const foreignPage = await request(app)
            .get('/messages/schedules')
            .set('Authorization', foreign)
            .expect(200);
          assert.equal(foreignPage.body.data.items.length, 0);
          assert.ok(
            !JSON.stringify(logs.entries).includes('private-schedule-test'),
          );
          assert.ok(!JSON.stringify(logs.entries).includes(owner.accessToken));
        },
      );
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      // eslint-disable-next-line preserve-caught-error -- Do not print database credentials or private message values.
      throw Error(
        'Schedule integration failed. Inspect safe assertions and database availability.',
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
