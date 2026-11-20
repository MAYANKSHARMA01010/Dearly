import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createApiClient } from '../../src/api/client.js';
import { createAuthService } from '../../src/services/auth/authService.js';
import { createSessionManager } from '../../src/services/auth/sessionManager.js';
import { createDraftService } from '../../src/services/drafts/service.js';
import { createDraftEditor } from '../../src/services/drafts/editor.js';
import { createScheduleService } from '../../src/services/schedules/service.js';
import { prepareContent } from '../../src/services/drafts/contracts.js';

const require = createRequire(new URL('../../../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client'); const { createApp } = require('./dist/app.js'); const { parseEnvironment } = require('./dist/configs/env.js');
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseUrl) throw Error('Set AUTH_TEST_DATABASE_URL for isolated mobile draft tests.');
const schema = `dearly_mobile_draft_test_${randomUUID().replaceAll('-', '')}`;
const url = new URL(databaseUrl); url.searchParams.set('schema', schema); url.searchParams.set('connection_limit', '5');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [], errorFormat: 'minimal' });
const admin = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [], errorFormat: 'minimal' });

test('mobile draft editor and real API/PostgreSQL: compose, conflict, schedule, edit, reschedule, cancel and reopen', { timeout: 180000 }, async () => {
  let server; let stage = 'schema';
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const migrations = new URL('../../../backend/prisma/migrations/', import.meta.url);
    for (const folder of readdirSync(migrations).filter((name) => /^\d/.test(name)).sort()) {
      const sql = readFileSync(new URL(`${folder}/migration.sql`, migrations), 'utf8')
        .replace(/"(users|phone_auth_states|otp_challenges|sessions|refresh_tokens|draft_messages|draft_recipients|attachments|delivery_intents|delivery_work|delivery_attempts|inbox_items|worker_heartbeats|message_events|email_deliveries|email_relay_submissions|email_verifications|email_budgets|waha_receipts|sms_receipts|account_preferences|notifications|push_devices|push_jobs|EmailState|MessageEventKind|WorkState|AttemptState|MessageStatus|RecipientType|AttachmentState|DeliveryChannel)"/g, `"${schema}"."$1"`);
      for (const statement of sql.replace(/^\s*--.*$/gm, '').split(';').filter((s) => s.trim())) await db.$executeRawUnsafe(statement);
    }
    stage = 'server';
    const config = parseEnvironment({ NODE_ENV: 'test', DATABASE_URL: url.toString(), AUTH_MODE: 'development', OTP_PEPPER: randomBytes(32).toString('hex') });
    server = createServer(createApp(config, { prisma: db, isReady: async () => true, disconnect: async () => {} }, { info() {}, warn() {}, error() {} }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const scope = `http://127.0.0.1:${server.address().port}`; let creates = 0;
    const client = createApiClient({ getBaseUrl: () => scope, fetcher: async (url, options) => { if (url === `${scope}/messages/drafts` && options?.method === 'POST') creates++; return fetch(url, options); } });
    const auth = createAuthService(client, true);
    const store = { value: null, async read() { return this.value; }, async write(value) { this.value = value; }, async clear() { this.value = null; } };
    const session = createSessionManager({ client, storage: store, getScope: () => scope });
    stage = 'login';
    const code = await auth.requestOtp('2025550160', 'US');
    await session.establish(await auth.verifyOtp(code.challengeId, code.developmentCode));
    const ownerId = session.getSnapshot().user.id;
    stage = 'target';
    const target = await db.user.create({ data: { phone: '+12025550161', phoneVerifiedAt: new Date() } });
    const api = createDraftService(session); const editor = createDraftEditor({ api, ownerId });
    editor.edit({ subject: 'Mobile draft', text: 'A private future thought.', occasion: 'Birthday', recipients: [
      { type: 'SELF' }, { type: 'USER', userId: target.id }, { type: 'PHONE', phone: '2025550162', country: 'US' }, { type: 'EMAIL', email: 'friend@example.com' },
    ] });
    stage = 'save';
    await Promise.all([editor.save(), editor.save()]); assert.equal(creates, 1); assert.equal(await db.draftMessage.count(), 1);
    assert.equal(editor.getSnapshot().dirty, false); assert.equal(editor.getSnapshot().content.recipients.length, 4);
    const id = editor.getSnapshot().id; assert.ok(id);
    stage = 'list';
    const page = await api.list(); assert.equal(page.items[0].subject, 'Mobile draft');
    const reopened = createDraftEditor({ api, ownerId, id }); await reopened.open();
    assert.equal(reopened.getSnapshot().content.text, 'A private future thought.');
    reopened.edit({ text: 'Local unsaved edit' });
    stage = 'external update';
    await api.update(id, 1, prepareContent({ ...editor.getSnapshot().content, text: 'Changed elsewhere' }, ownerId));
    assert.equal(await reopened.save(), false); assert.equal(reopened.getSnapshot().conflict, true); assert.equal(reopened.getSnapshot().content.text, 'Local unsaved edit');
    await reopened.reload(); assert.equal(reopened.getSnapshot().content.text, 'Changed elsewhere');
    reopened.edit({ text: 'Final thought' }); assert.equal(await reopened.save(), true); assert.equal(reopened.getSnapshot().version, 3);
    stage = 'schedule source';
    await api.update(id, reopened.getSnapshot().version, {text:'Final thought',recipients:[{type:'SELF'}]});
    const schedules=createScheduleService(session);
    const source=await schedules.source(id);
    assert.equal((await schedules.capabilities()).inAppAvailable,true);
    const choice={version:source.version,localDateTime:'2027-01-02T00:15',timezone:'Asia/Kolkata',deliveries:source.recipients.map(r=>({recipientId:r.id,channels:['IN_APP']}))};
    stage = 'schedule review';
    const review=await schedules.preview(id,choice);assert.equal(review.resolved.scheduledFor,'2027-01-01T18:45:00.000Z');
    const saved=await schedules.confirm(id,choice,review.reviewToken);assert.equal(saved.status,'SCHEDULED');
    assert.equal((await schedules.confirm(id,choice,review.reviewToken)).version,saved.version);
    assert.equal((await schedules.list()).items[0].id,id);
    stage = 'schedule edit and reschedule';
    const edited=await schedules.edit(id,saved.version,{subject:'New subject',text:'Edited scheduled thought',occasion:null});
    const movedChoice={version:edited.version,localDateTime:'2027-04-01T12:30',timezone:'America/New_York'};
    const nextReview=await schedules.preview(id,movedChoice,true);
    const moved=await schedules.confirm(id,movedChoice,nextReview.reviewToken,true);assert.equal(moved.scheduledFor,'2027-04-01T16:30:00.000Z');
    stage = 'cancel and reopen';
    const canceled=await schedules.cancel(id,moved.version);assert.equal(canceled.status,'CANCELED');
    assert.equal((await schedules.list('CANCELED')).items[0].id,id);
    const returned=await schedules.reopen(id,canceled.version);assert.equal(returned.text,'Edited scheduled thought');
    assert.equal((await schedules.list()).items.length,0);await reopened.reload();
    assert.equal(await reopened.remove(), true); assert.equal(await db.draftMessage.count(), 0); assert.equal(await db.draftRecipient.count(), 0);
    await session.logout(); await assert.rejects(api.list()); assert.equal(store.value, null);
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' && /^[A-Z_0-9]+$/.test(error.code) ? error.code : 'UNKNOWN';
    throw Error(`Mobile draft integration failed at ${stage} (${code}).`);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await db.$disconnect(); await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
  }
});
