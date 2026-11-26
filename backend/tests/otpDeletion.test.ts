import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { deleteExpiredOtpMessages } from '../src/jobs/deleteExpiredOtpMessages';
import { WahaProvider } from '../src/providers/whatsapp/waha.provider';
import type { WahaConfig } from '../src/configs/env';

const settings: WahaConfig = { engine: 'GOWS', baseUrl: 'http://localhost:3100',
  apiKey: 'synthetic-key', webhookSecret: 'a'.repeat(64), session: 'default', dailyLimit: 20 };
const messageId = 'true_12025550171@c.us_SYNTHETIC123';
const now = new Date('2026-11-26T10:00:00Z');

test('OTP revoke uses an encoded single outgoing ID and explicitly deletes for everyone', async () => {
  const calls: { url: string; method: string | undefined }[] = [];
  const gateway = new WahaProvider(settings, async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    return new Response(null, { status: 200 });
  });
  for (const id of ['false_12025550171@c.us_X', '../all', 'true_12025550171@g.us_X'])
    assert.equal(await gateway.deleteOtpMessage(id), false);
  assert.equal(calls.length, 0);
  assert.equal(await gateway.deleteOtpMessage(messageId), true);
  assert.deepEqual(calls, [{ method: 'DELETE', url:
    'http://localhost:3100/api/default/chats/12025550171%40c.us/messages/true_12025550171%40c.us_SYNTHETIC123?forMe=false' }]);
});

test('missing session, auth errors, gateway failures and timeout never claim deletion', async () => {
  for (const status of [401, 404, 429, 500]) {
    const gateway = new WahaProvider(settings, async () => new Response(null, { status }));
    assert.equal(await gateway.deleteOtpMessage(messageId), false);
  }
  const gateway = new WahaProvider(settings, async () => { throw Error('private error'); });
  assert.equal(await gateway.deleteOtpMessage(messageId), false);
});

test('expiry cleanup scopes and bounds its query, persists lease before I/O and records success', async () => {
  const events: string[] = [], writes: unknown[] = [];
  const db = { otpChallenge: {
    async findMany(args: { where: Record<string, unknown>; take: number }) {
      assert.equal(args.take, 3);
      assert.equal(args.where.deletionScope, 'synthetic-sender');
      assert.deepEqual(args.where.expiresAt, { lte: now, gt: new Date(now.getTime() - 86400000) });
      assert.deepEqual(args.where.deleteAttempts, { lt: 20 });
      assert.deepEqual(args.where.deleteAfter, { lte: now });
      assert.equal(args.where.deletedAt, null);
      return [{ id: 'synthetic-challenge', providerMessageId: messageId, deleteAttempts: 0 }];
    },
    async updateMany(args: unknown) { events.push('persist'); writes.push(args); return { count: 1 }; },
  } } as unknown as PrismaClient;
  const result = await deleteExpiredOtpMessages(db, { scope: 'synthetic-sender',
    async deleteOtpMessage(id) { events.push('revoke'); assert.equal(id, messageId); return true; } }, now);
  assert.deepEqual(events, ['persist', 'revoke', 'persist']);
  assert.deepEqual(result, { deleted: 1, failed: 0 });
  assert.match(JSON.stringify(writes[0]), /2026-11-26T10:02:00.000Z/);
  assert.deepEqual((writes[1] as { data: unknown }).data, { deletedAt: now, deleteAfter: null });
});

test('lost concurrent claim skips I/O and failed revoke keeps the persisted retry', async () => {
  for (const count of [0, 1]) {
    let sends = 0, writes = 0;
    const db = { otpChallenge: {
      async findMany() { return [{ id: 'synthetic', providerMessageId: messageId, deleteAttempts: 2 }]; },
      async updateMany() { writes++; return { count }; },
    } } as unknown as PrismaClient;
    const result = await deleteExpiredOtpMessages(db, { scope: 'synthetic-sender',
      async deleteOtpMessage() { sends++; throw Error('private'); } }, now);
    assert.equal(sends, count);
    assert.equal(writes, 1);
    assert.deepEqual(result, { deleted: 0, failed: count });
  }
});
