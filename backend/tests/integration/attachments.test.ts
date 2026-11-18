import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, utimes, rm } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../../src/app';
import { parseEnvironment } from '../../src/configs/env';
import { captureLogger } from '../helpers';
import { LocalStorage } from '../../src/providers/storage/local.storage';
import { AttachmentService } from '../../src/services/attachment.service';
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
if (!databaseUrl) throw Error('Set AUTH_TEST_DATABASE_URL for isolated attachment integration tests.');
const schema = `dearly_media_test_${randomUUID().replaceAll('-', '')}`;
const url = new URL(databaseUrl); url.searchParams.set('schema', schema); url.searchParams.set('connection_limit', '5');
const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [], errorFormat: 'minimal' });
const admin = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [], errorFormat: 'minimal' });

test('private attachment API, real storage/media validation and orphan cleanup', { timeout: 300000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dearly-media-api-')); const fixtures = await mkdtemp(join(tmpdir(), 'dearly-media-fixtures-'));
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for (const folder of readdirSync('prisma/migrations').filter((name) => /^\d/.test(name)).sort()) {
      const sql = readFileSync(`prisma/migrations/${folder}/migration.sql`, 'utf8').replace(/"(users|phone_auth_states|otp_challenges|sessions|refresh_tokens|draft_messages|draft_recipients|attachments|delivery_intents|delivery_work|delivery_attempts|inbox_items|worker_heartbeats|message_events|email_deliveries|email_budgets|waha_receipts|sms_receipts|EmailState|MessageEventKind|WorkState|AttemptState|MessageStatus|RecipientType|AttachmentState|DeliveryChannel)"/g, `"${schema}"."$1"`);
      for (const statement of sql.replace(/^\s*--.*$/gm, '').split(';').filter((s) => s.trim())) await db.$executeRawUnsafe(statement);
    }
    const logs = captureLogger(); const config = { ...parseEnvironment({ NODE_ENV: 'test', DATABASE_URL: url.toString(), AUTH_MODE: 'development', OTP_PEPPER: randomBytes(32).toString('hex'), STORAGE_ROOT: root }), rateLimitMax: 1000 };
    const app = createApp(config, { prisma: db, isReady: async () => true, disconnect: async () => {} }, logs.logger);
    const login = async (phone: string) => {
      const code = await request(app).post('/auth/otp/request').send({ phone, country: 'US' }).expect(200);
      return (await request(app).post('/auth/otp/verify').send({ challengeId: code.body.data.challengeId, code: code.body.data.developmentCode }).expect(200)).body.data as { accessToken: string; user: { id: string } };
    };
    const owner = await login('2025550185'); const other = await login('2025550186'); const token = `Bearer ${owner.accessToken}`;
    const draft = async () => (await request(app).post('/messages/drafts').set('Authorization', token).send({}).expect(201)).body.data as { id: string; version: number };
    const d = await draft(); const base = `/messages/drafts/${d.id}/attachments`;
    const reserve = async (body: Buffer, mime = 'text/plain', name = 'test.txt', path = base, id = randomUUID()) => (await request(app).post(path).set('Authorization', token).send({ id, name, mime, bytes: body.length }).expect(201)).body.data as { id: string; state: string };
    const put = (path: string, bytes: Buffer) => request(app).put(path).set('Authorization', token).set('Content-Type', 'application/octet-stream').send(bytes);
    const finalize = (path: string) => request(app).post(`${path}/finalize`).set('Authorization', token).send({});

    await t.test('idempotent reservations, ownership, no pre-finalize access and range content', async () => {
      const body = Buffer.from('private-test-content'); const id = randomUUID();
      await Promise.all([reserve(body, 'text/plain', 'test.txt', base, id), reserve(body, 'text/plain', 'test.txt', base, id)]);
      assert.equal(await db.attachment.count(), 1);
      await request(app).get(`${base}/${id}/content`).expect(401);
      await request(app).get(`${base}/${id}`).set('Authorization', `Bearer ${other.accessToken}`).expect(404);
      await request(app).get(`${base}/${id}/content`).set('Authorization', token).expect(409);
      await put(`${base}/${id}/content`, body).expect(200); await finalize(`${base}/${id}`).expect(200); await finalize(`${base}/${id}`).expect(200);
      const read = await request(app).get(`${base}/${id}/content`).set('Authorization', token).expect(200);
      assert.equal(read.text, body.toString()); assert.equal(read.headers['cache-control'], 'private, no-store');
      const range = await request(app).get(`${base}/${id}/content`).set('Authorization', token).set('Range', 'bytes=0-6').expect(206); assert.equal(range.text, 'private');
      await request(app).delete(`${base}/${id}`).set('Authorization', `Bearer ${other.accessToken}`).expect(404);
      await request(app).delete(`${base}/${id}`).set('Authorization', token).expect(200); await request(app).delete(`${base}/${id}`).set('Authorization', token).expect(200);
      assert.equal(await db.attachment.count(), 0);
    });
    await t.test('oversized/short transfers reset safely, MIME mismatch stays private and upload retry succeeds', async () => {
      const bytes = Buffer.from('hello'); const row = await reserve(bytes); const path = `${base}/${row.id}`;
      await put(`${path}/content`, Buffer.from('hello!')).expect(413);
      await put(`${path}/content`, Buffer.from('hi')).expect(400);
      assert.equal((await db.attachment.findUniqueOrThrow({ where: { id: row.id } })).state, 'PENDING');
      await put(`${path}/content`, bytes).expect(200); await finalize(path).expect(200);
      await request(app).delete(path).set('Authorization', token).expect(200);
      const bad = await reserve(bytes, 'image/png', 'fake.png'); await put(`${base}/${bad.id}/content`, bytes).expect(200); await finalize(`${base}/${bad.id}`).expect(415);
      await request(app).get(`${base}/${bad.id}/content`).set('Authorization', token).expect(409);
      await request(app).delete(`${base}/${bad.id}`).set('Authorization', token).expect(200);
    });
    await t.test('all supported media families validate actual streams and reopen exact bytes', async () => {
      const specs: [string, string, string[]][] = [
        ['photo.png', 'image/png', ['-f','lavfi','-i','color=c=red:s=64x64','-frames:v','1']],
        ['photo.jpg', 'image/jpeg', ['-f','lavfi','-i','color=c=red:s=64x64','-frames:v','1']],
        ['photo.webp', 'image/webp', ['-f','lavfi','-i','color=c=red:s=64x64','-frames:v','1']],
        ['clip.mp4', 'video/mp4', ['-f','lavfi','-i','color=c=red:s=64x64:d=1','-c:v','libx264','-pix_fmt','yuv420p']],
        ['clip.mov', 'video/quicktime', ['-f','lavfi','-i','color=c=red:s=64x64:d=1','-c:v','libx264','-pix_fmt','yuv420p']],
        ['clip.webm', 'video/webm', ['-f','lavfi','-i','color=c=red:s=64x64:d=1','-c:v','libvpx-vp9']],
        ['voice.m4a', 'audio/mp4', ['-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','aac']],
        ['voice.mp3', 'audio/mpeg', ['-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','libmp3lame']],
        ['voice.wav', 'audio/wav', ['-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','pcm_s16le']],
        ['voice.webm', 'audio/webm', ['-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','libopus']],
      ];
      for (const [name, mime, args] of specs) {
        const file = join(fixtures, name);
        if (name.endsWith('.webp')) await writeFile(file, Buffer.from('UklGRloAAABXRUJQVlA4IE4AAADwAwCdASpAAEAAPpFIoEwlpCMiIggAsBIJaQDTyoAAEDuTwRbaZ3EAAP7u09//gN18W0y//3OB/3OB/3OB/G1DJheOmvIZc3w+KZAAAAA=', 'base64'));
        else execFileSync('ffmpeg', ['-v','error','-y', ...args, file], { stdio: 'pipe' });
        const bytes = await readFile(file); const a = await reserve(bytes, mime, name); const path = `${base}/${a.id}`;
        await put(`${path}/content`, bytes).expect(200); await finalize(path).expect(200);
        const read = await request(app).get(`${path}/content`).set('Authorization', token).buffer(true).parse((res, callback) => { const chunks: Buffer[] = []; res.on('data', (chunk: Buffer) => chunks.push(chunk)); res.on('end', () => callback(null, Buffer.concat(chunks))); }).expect(200);
        assert.deepEqual(read.body, bytes);
        await request(app).delete(path).set('Authorization', token).expect(200);
      }
      const doc = await PDFDocument.create(); doc.addPage().drawText('Dearly test PDF'); const pdf = Buffer.from(await doc.save()); const p = await reserve(pdf, 'application/pdf', 'note.pdf'); await put(`${base}/${p.id}/content`, pdf).expect(200); await finalize(`${base}/${p.id}`).expect(200);
    });
    await t.test('count quota, active upload protection, deleted-draft and orphan cleanup preserve ready references', async () => {
      const ready = await db.attachment.findFirstOrThrow({ where: { state: 'READY' } });
      const temp = await draft(); const tempBase = `/messages/drafts/${temp.id}/attachments`;
      const reserved = await Promise.all(Array.from({ length: 10 }, () => reserve(Buffer.from('x'), 'text/plain', 'x.txt', tempBase)));
      await request(app).post(tempBase).set('Authorization', token).send({ id: randomUUID(), name: 'x.txt', mime: 'text/plain', bytes: 1 }).expect(409);
      await db.attachment.update({ where: { id: reserved[0].id }, data: { state: 'UPLOADING' } });
      await request(app).delete(`${tempBase}/${reserved[0].id}`).set('Authorization', token).expect(409);
      const store = new LocalStorage(root); const service = new AttachmentService(db, store);
      const orphan = randomUUID(); await writeFile(store.path(orphan), 'orphan'); const old = new Date(Date.now() - 25 * 3600000); await utimes(store.path(orphan), old, old);
      await request(app).delete(`/messages/drafts/${temp.id}?version=1`).set('Authorization', token).expect(200);
      const first = await service.cleanup(); assert.ok(first.removed >= 9); assert.equal(first.orphans, 1);
      assert.ok(await db.attachment.findUnique({ where: { id: ready.id } })); assert.ok((await store.entries()).some((e) => e.key === ready.id));
      await db.attachment.update({ where: { id: reserved[0].id }, data: { updatedAt: old } }); await service.cleanup();
      await request(app).delete(`/messages/drafts/${d.id}?version=1`).set('Authorization', token).expect(200); await service.cleanup();
      assert.equal(await db.attachment.count(), 0); assert.equal((await store.entries()).length, 0);
      assert.ok(!JSON.stringify(logs.entries).includes('private-test-content')); assert.ok(!JSON.stringify(logs.entries).includes(owner.accessToken));
    });
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    // Never print raw database URLs, SQL values or file content.
    // eslint-disable-next-line preserve-caught-error -- Raw database/tool errors may contain secrets.
    throw Error('Attachment integration failed. Inspect safe assertions and storage/database/tool availability.');
  } finally {
    await db.$disconnect(); await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
    await rm(root, { recursive: true, force: true }); await rm(fixtures, { recursive: true, force: true });
  }
});
