import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createApiClient } from '../../src/api/client.js';
import { createAuthService } from '../../src/services/auth/authService.js';
import { createSessionManager } from '../../src/services/auth/sessionManager.js';
import { createDraftService } from '../../src/services/drafts/service.js';
import { createScheduleService } from '../../src/services/schedules/service.js';
import { createMailboxService } from '../../src/services/mailboxes/service.js';
const require = createRequire(
  new URL('../../../backend/package.json', import.meta.url),
);
const { PrismaClient } = require('@prisma/client'),
  { createApp } = require('./dist/app.js'),
  { parseEnvironment } = require('./dist/configs/env.js'),
  { DeliveryWorker } = require('./dist/workers/deliveryWorker.js'),
  { enqueueDeliveries } = require('./dist/jobs/enqueueDeliveries.js'),
  { LocalStorage } = require('./dist/providers/storage/local.storage.js');
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseUrl)
  throw Error('Set AUTH_TEST_DATABASE_URL for isolated mobile mailbox tests.');
const schema = `dearly_mobile_mailbox_test_${randomUUID().replaceAll('-', '')}`,
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
  'two real mobile sessions compose, deliver, browse isolated mailboxes, open explicitly and recover tracking',
  { timeout: 180000 },
  async () => {
    let server,
      stage = 'schema';
    const root = await mkdtemp(join(tmpdir(), 'dearly-mobile-mailboxes-'));
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      const migrations = new URL(
        '../../../backend/prisma/migrations/',
        import.meta.url,
      );
      for (const folder of readdirSync(migrations)
        .filter((n) => /^\d/.test(n))
        .sort()) {
        const sql = readFileSync(
          new URL(`${folder}/migration.sql`, migrations),
          'utf8',
        ).replace(
          /"(users|phone_auth_states|otp_challenges|sessions|refresh_tokens|draft_messages|draft_recipients|attachments|delivery_intents|delivery_work|delivery_attempts|inbox_items|worker_heartbeats|message_events|email_deliveries|email_relay_submissions|email_verifications|email_budgets|waha_receipts|sms_receipts|account_preferences|notifications|push_devices|push_jobs|EmailState|MessageEventKind|WorkState|AttemptState|MessageStatus|RecipientType|AttachmentState|DeliveryChannel)"/g,
          `"${schema}"."$1"`,
        );
        for (const statement of sql.replace(/^\s*--.*$/gm, '').split(';').filter((s) => s.trim()))
          await db.$executeRawUnsafe(statement);
      }
      const config = {
        ...parseEnvironment({
          NODE_ENV: 'test',
          DATABASE_URL: url.toString(),
          AUTH_MODE: 'development',
          OTP_PEPPER: randomBytes(32).toString('hex'),
          STORAGE_ROOT: root,
        }),
        rateLimitMax: 1000,
      };
      server = createServer(
        createApp(
          config,
          { prisma: db, isReady: async () => true, disconnect: async () => {} },
          { info() {}, warn() {}, error() {} },
        ),
      );
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const scope = `http://127.0.0.1:${server.address().port}`;
      const client = createApiClient({ getBaseUrl: () => scope }),
        auth = createAuthService(client, true);
      const login = async (phone) => {
        const storage = {
          value: null,
          async read() {
            return this.value;
          },
          async write(v) {
            this.value = v;
          },
          async clear() {
            this.value = null;
          },
        };
        const session = createSessionManager({
          client,
          storage,
          getScope: () => scope,
        });
        const c = await auth.requestOtp(phone, 'US');
        await session.establish(
          await auth.verifyOtp(c.challengeId, c.developmentCode),
        );
        return session;
      };
      stage = 'two sessions';
      const owner = await login('2025550184'),
        recipient = await login('2025550185');
      const ownerId = owner.getSnapshot().user.id,
        targetId = recipient.getSnapshot().user.id;
      const senderBoxes = createMailboxService(owner),
        recipientBoxes = createMailboxService(recipient),
        drafts = createDraftService(owner),
        schedules = createScheduleService(owner);
      stage = 'draft';
      const d = await drafts.create({
        subject: 'A future note',
        text: 'Two-account mailbox check',
        occasion: null,
        recipients: [{ type: 'SELF' }, { type: 'USER', userId: targetId }],
      });
      assert.equal((await senderBoxes.dashboard()).counts.drafts, 1);
      assert.equal((await recipientBoxes.dashboard()).counts.created, 0);
      assert.equal(
        (await senderBoxes.owned(d.id)).history.items[0].kind,
        'CREATED',
      );
      await assert.rejects(recipientBoxes.owned(d.id));
      stage = 'schedule';
      const source = await schedules.source(d.id),
        choice = {
          version: source.version,
          localDateTime: new Date(Date.now() + 86400000)
            .toISOString()
            .slice(0, 16),
          timezone: 'UTC',
          deliveries: source.recipients.map((r) => ({
            recipientId: r.id,
            channels: ['IN_APP'],
          })),
        };
      const review = await schedules.preview(d.id, choice);
      await schedules.confirm(d.id, choice, review.reviewToken);
      assert.equal((await senderBoxes.list('scheduled')).items[0].id, d.id);
      assert.equal((await recipientBoxes.list('received')).items.length, 0);
      stage = 'delivery';
      await db.draftMessage.update({
        where: { id: d.id },
        data: { scheduledFor: new Date(Date.now() - 10000) },
      });
      await enqueueDeliveries(db);
      const worker = new DeliveryWorker(db, new LocalStorage(root)),
        claim = await worker.claim();
      assert.ok(claim);
      assert.equal(await worker.execute(claim), true);
      const receivedPage = await recipientBoxes.list('received', {
        read: 'unopened',
      });
      assert.equal(receivedPage.items.length, 1);
      const inboxId = receivedPage.items[0].id;
      assert.notEqual(inboxId, d.id);
      const content = await recipientBoxes.received(inboxId);
      assert.equal(content.text, 'Two-account mailbox check');
      assert.equal(content.openedAt, null);
      assert.equal('recipients' in content, false);
      await assert.rejects(senderBoxes.received(inboxId));
      stage = 'tracking';
      await recipientBoxes.markOpened(inboxId);
      await recipientBoxes.markOpened(inboxId);
      assert.ok((await recipientBoxes.received(inboxId)).openedAt);
      assert.equal((await recipientBoxes.dashboard()).unopened, 0);
      assert.equal(
        (await recipientBoxes.list('received', { read: 'opened' })).items[0].id,
        inboxId,
      );
      const sent = await senderBoxes.owned(d.id);
      assert.equal(sent.status, 'DELIVERED');
      assert.equal(sent.deliveries.filter((i) => i.openedAt).length, 1);
      assert.equal(sent.history.items[0].kind, 'OPENED');
      assert.equal(
        sent.history.items.filter((e) => e.kind === 'OPENED').length,
        1,
      );
      assert.equal((await senderBoxes.dashboard()).counts.sent, 1);
      stage = 'restored session';
      await owner.restore();
      assert.equal(owner.getSnapshot().user.id, ownerId);
      assert.equal(
        (await senderBoxes.owned(d.id)).history.items[0].kind,
        'OPENED',
      );
      await recipient.logout();
      await assert.rejects(recipientBoxes.list('received'));
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      const code =
        error instanceof Error &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^[A-Z_0-9]+$/.test(error.code)
          ? error.code
          : 'UNKNOWN';
      throw Error(`Mobile mailbox integration failed at ${stage} (${code}).`);
    } finally {
      if (server) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
      await db.$disconnect();
      await admin.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
      );
      await admin.$disconnect();
      await rm(root, { recursive: true, force: true });
    }
  },
);
