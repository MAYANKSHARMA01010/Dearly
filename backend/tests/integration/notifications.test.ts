import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import {
  NotificationService,
  createNotification,
} from '../../src/services/notification.service';
import { PushWorker } from '../../src/workers/pushWorker';
import { AuthService } from '../../src/services/auth.service';
import { developmentOtpProvider } from '../../src/providers/otp/otp.provider';
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseUrl)
  throw Error('Set AUTH_TEST_DATABASE_URL for isolated notification tests.');
const schema = `dearly_notifications_${randomUUID().replaceAll('-', '')}`,
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
  'durable notifications, session-bound devices, preferences and private push transport',
  { timeout: 300000 },
  async (t) => {
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      const migrations = readdirSync('prisma/migrations')
        .filter((n) => /^\d/.test(n))
        .sort()
        .map((n) =>
          readFileSync(`prisma/migrations/${n}/migration.sql`, 'utf8'),
        );
      const names = [
        ...new Set(
          migrations.flatMap((s) =>
            [...s.matchAll(/CREATE (?:TABLE|TYPE) "(\w+)"/g)].map((m) => m[1]),
          ),
        ),
      ];
      const pattern = new RegExp('"(' + names.join('|') + ')"', 'g');
      for (const sql of migrations)
        for (const statement of sql
          .replace(pattern, `"${schema}"."$1"`)
          .replace(/^\s*--.*$/gm, '')
          .split(';')
          .filter((s) => s.trim()))
          await db.$executeRawUnsafe(statement);
      const a = await db.user.create({
          data: { phone: '+12025550121', phoneVerifiedAt: new Date() },
        }),
        b = await db.user.create({
          data: { phone: '+12025550122', phoneVerifiedAt: new Date() },
        });
      const session = await db.session.create({
        data: {
          userId: a.id,
          accessHash: randomUUID(),
          accessExpiresAt: new Date(Date.now() + 3600000),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      const service = new NotificationService(db),
        id = randomUUID(),
        target = randomUUID();
      await t.test(
        'read and resolve require ownership; paging does not mark read',
        async () => {
          await db.$transaction((tx) =>
            createNotification(tx, {
              dedupeKey: 'first',
              userId: a.id,
              kind: 'RECEIVED',
              targetId: target,
              targetType: 'received',
            }),
          );
          await db.$transaction((tx) =>
            createNotification(tx, {
              dedupeKey: 'first',
              userId: a.id,
              kind: 'RECEIVED',
              targetId: target,
              targetType: 'received',
            }),
          );
          const list = await service.list(a.id);
          assert.equal(list.items.length, 1);
          assert.equal(list.unread, 1);
          await assert.rejects(service.resolve(b.id, list.items[0].id));
          await assert.rejects(service.markRead(b.id, list.items[0].id));
          await assert.rejects(service.list(b.id, list.items[0].id));
          await service.markRead(a.id, list.items[0].id);
          await service.markRead(a.id, list.items[0].id);
          assert.equal((await service.list(a.id)).unread, 0);
          await db.notification.createMany({
            data: Array.from({ length: 22 }, (_, i) => ({
              dedupeKey: `page:${i}`,
              userId: a.id,
              kind: 'FAILED',
              targetType: 'owned',
              targetId: target,
            })),
          });
          const page = await service.list(a.id),
            next = await service.list(a.id, page.nextCursor!);
          assert.equal(page.items.length, 20);
          assert.equal(next.items.length, 3);
          assert(
            !page.items.some((x) => next.items.some((y) => x.id === y.id)),
          );
        },
      );
      await t.test(
        'opt-out suppresses new alerts and preserves previous notifications',
        async () => {
          await service.update(a.id, {
            inAppAlerts: false,
            pushAlerts: false,
            defaultPhoneChannel: 'SMS',
          });
          await db.$transaction((tx) =>
            createNotification(tx, {
              dedupeKey: 'optout',
              userId: a.id,
              kind: 'FAILED',
              targetId: target,
              targetType: 'owned',
            }),
          );
          assert.equal(
            await db.notification.count({ where: { dedupeKey: 'optout' } }),
            0,
          );
          assert.equal(
            (await service.preferences(a.id)).defaultPhoneChannel,
            'SMS',
          );
        },
      );
      await service.update(a.id, {
        inAppAlerts: true,
        pushAlerts: true,
        defaultPhoneChannel: 'WHATSAPP',
      });
      await service.register(a.id, session.id, {
        id,
        token: 'ExpoPushToken[synthetic_one]',
        platform: 'ios',
      });
      await t.test(
        'two workers make one private submission; uncertain result is not replayed',
        async () => {
          await db.$transaction((tx) =>
            createNotification(tx, {
              dedupeKey: 'push',
              userId: a.id,
              kind: 'RECEIVED',
              targetId: target,
              targetType: 'received',
            }),
          );
          let posts = 0;
          const transport: typeof fetch = async (_url, options) => {
            posts++;
            const payload = JSON.parse(String(options?.body));
            assert.equal(payload.body, 'You have a new update in Dearly.');
            assert(!JSON.stringify(payload).includes(target));
            throw Error('synthetic timeout');
          };
          await Promise.all([
            new PushWorker(db, transport).run(),
            new PushWorker(db, transport).run(),
          ]);
          await new PushWorker(db, transport).run();
          assert.equal(posts, 1);
          assert.equal((await db.pushJob.findFirstOrThrow()).state, 'UNKNOWN');
        },
      );
      await t.test(
        'rotation and invalid-token receipts do not invalidate a newer registration',
        async () => {
          await service.register(a.id, session.id, {
            id,
            token: 'ExpoPushToken[synthetic_two]',
            platform: 'ios',
          });
          await db.$transaction((tx) =>
            createNotification(tx, {
              dedupeKey: 'receipt',
              userId: a.id,
              kind: 'RECEIVED',
              targetId: target,
              targetType: 'received',
            }),
          );
          const worker = new PushWorker(db, async () =>
            Response.json({ data: { status: 'ok', id: 'test-ticket' } }),
          );
          await worker.run();
          const job = await db.pushJob.findFirstOrThrow({
            where: { state: 'ACCEPTED' },
          });
          await db.pushJob.update({
            where: { id: job.id },
            data: { submittedAt: new Date(Date.now() - 16 * 60000) },
          });
          await new PushWorker(db, async () =>
            Response.json({
              data: {
                'test-ticket': {
                  status: 'error',
                  details: { error: 'DeviceNotRegistered' },
                },
              },
            }),
          ).run();
          assert.equal(
            (await db.pushDevice.findUniqueOrThrow({ where: { id } }))
              .disabledAt,
            null,
          );
          // The aged ticket predates this token registration and must not disable it.
          await db.pushDevice.update({
            where: { id },
            data: { updatedAt: new Date(Date.now() - 17 * 60000) },
          });
          await db.pushJob.update({
            where: { id: job.id },
            data: { state: 'ACCEPTED' },
          });
          await new PushWorker(db, async () =>
            Response.json({
              data: {
                'test-ticket': {
                  status: 'error',
                  details: { error: 'DeviceNotRegistered' },
                },
              },
            }),
          ).run();
          assert(
            (await db.pushDevice.findUniqueOrThrow({ where: { id } }))
              .disabledAt,
          );
        },
      );
      await t.test(
        'logout disables devices and blocks late registration',
        async () => {
          await new AuthService(
            db,
            randomBytes(32).toString('hex'),
            developmentOtpProvider(),
          ).logout({ userId: a.id, sessionId: session.id });
          assert(
            (await db.pushDevice.findUniqueOrThrow({ where: { id } }))
              .disabledAt,
          );
          await assert.rejects(
            service.register(a.id, session.id, {
              id,
              token: 'ExpoPushToken[synthetic_three]',
              platform: 'ios',
            }),
          );
        },
      );
    } finally {
      await db.$disconnect();
      await admin.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
      );
      await admin.$disconnect();
    }
  },
);
