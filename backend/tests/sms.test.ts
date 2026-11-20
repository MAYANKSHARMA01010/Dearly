import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { SmsGateProvider, smsLinkFits, smsScope } from '../src/providers/sms/smsgate.provider';
import { verifySmsSignature } from '../src/services/smsReceipt.service';
import { parseEnvironment, type SmsGateConfig } from '../src/configs/env';
import { createApp } from '../src/app';
import { config, captureLogger } from './helpers';
const settings: SmsGateConfig = { baseUrl: 'http://127.0.0.1:3102', connection: 'local', deviceId: 'synthetic-device', username: 'synthetic', password: 'synthetic-password', webhookSecret: 'synthetic-signing-key', simNumber: 1, dailyLimit: 20 };
const phone = '+12025550181', id = randomUUID(), link = 'https://dearly.example/external/#synthetic';
const accepted = () => Response.json({ id, deviceId: settings.deviceId, recipients: [{ phoneNumber: phone.slice(1), state: 'Pending' }], state: 'Pending' }, { status: 202 });

test('SMSGate sends one short private link with a deterministic reservation ID and bounded device TTL', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const provider = new SmsGateProvider(settings, async (url, options) => {
    calls.push({ url: String(url), options });
    return options?.method ? accepted() : Response.json({ status: 'pass' });
  });
  assert.equal((await provider.send(phone, link, id)).state, 'ACCEPTED');
  const body = JSON.parse(String(calls[1].options?.body));
  assert.equal(calls[1].url, `${settings.baseUrl}/message`);
  assert.deepEqual(body.phoneNumbers, [phone]);
  assert.equal(body.id, id); assert.equal(body.simNumber, 1);
  assert.equal(body.withDeliveryReport, true); assert.equal(body.ttl, 300); assert.equal(body.priority, 0);
  assert.equal(body.scheduleAt, undefined); assert.equal(body.deviceId, undefined);
  assert.equal(body.textMessage.text, `Dearly private message: ${link}`);
  assert.equal(calls[1].options?.redirect, 'error');
  assert.equal(smsLinkFits('http://localhost:8080'), false);
  assert.ok(smsLinkFits('https://dearly.example'));
  assert.equal(smsLinkFits(`https://${'a'.repeat(150)}.example`), false);
});

test('invalid numbers and multipart links never POST; offline/auth/uncertainty remain distinct', async () => {
  let posts = 0;
  const provider = new SmsGateProvider(settings, async (_u, o) => { if (o?.method) posts++; return accepted(); });
  for (const p of ['2025550181', '+1 202 555 0181', '123@g.us']) assert.equal((await provider.send(p, link, id)).state, 'REJECTED');
  assert.equal((await provider.send(phone, `https://dearly.example/${'x'.repeat(200)}`, id)).code, 'SMS_TOO_LONG');
  assert.equal(posts, 0);
  for (const status of [401, 503]) {
    const p = new SmsGateProvider(settings, async (_u, o) => { if (o?.method) posts++; return new Response('', { status }); });
    assert.equal((await p.send(phone, link, id)).state, 'RETRYABLE');
  }
  assert.equal(posts, 0);
  for (const [status, state] of [[400, 'REJECTED'], [401, 'RETRYABLE'], [429, 'RETRYABLE'], [409, 'UNKNOWN'], [500, 'UNKNOWN'], [503, 'UNKNOWN']] as const) {
    let calls = 0;
    const p = new SmsGateProvider(settings, async (_u, o) => {
      if (!o?.method) return Response.json({ status: 'pass' });
      calls++; return new Response('', { status });
    });
    assert.equal((await p.send(phone, link, id)).state, state); assert.equal(calls, 1);
  }
  for (const body of [{ ok: true }, { id: randomUUID(), deviceId: settings.deviceId }, { id, deviceId: 'another-device', recipients: [{ phoneNumber: phone }], state: 'Pending' }, { id, deviceId: settings.deviceId, recipients: [{ phoneNumber: '+12025550182' }], state: 'Pending' }]) {
    const p = new SmsGateProvider(settings, async (_u, o) => o?.method ? Response.json(body) : Response.json({ status: 'pass' }));
    assert.equal((await p.send(phone, link, id)).state, 'UNKNOWN');
  }
  let calls = 0;
  const p = new SmsGateProvider(settings, async (_u, o) => { if (!o?.method) return Response.json({ status: 'pass' }); calls++; throw Error('synthetic ambiguous failure'); });
  assert.equal((await p.send(phone, link, id)).state, 'UNKNOWN'); assert.equal(calls, 1);
});

test('cloud readiness checks the selected device and allows its fifteen-minute polling interval', async () => {
  for (const [devices, status] of [[[{ id: settings.deviceId, lastSeen: new Date().toISOString() }], 'READY'], [[{ id: settings.deviceId, lastSeen: new Date(Date.now() - 10 * 60000).toISOString() }], 'READY'], [[{ id: settings.deviceId, lastSeen: new Date(Date.now() - 21 * 60000).toISOString() }], 'OFFLINE'], [[{ id: settings.deviceId, lastSeen: new Date(Date.now() + 2 * 60000).toISOString() }], 'OFFLINE'], [[{ id: settings.deviceId, lastSeen: '2000-01-01' }], 'OFFLINE'], [[{ id: 'other', lastSeen: new Date().toISOString() }], 'OFFLINE']] as const) {
    const p = new SmsGateProvider({ ...settings, baseUrl: 'https://sms.example/3rdparty/v1', connection: 'cloud' }, async (url) => { assert.ok(String(url).endsWith('/devices')); return Response.json(devices); });
    assert.equal(await p.readiness(), status);
  }
  assert.notEqual(smsScope(settings), smsScope({ ...settings, webhookSecret: 'another-phone-signing-key' }));
});

test('SMS callbacks verify raw-body plus timestamp HMAC and reject stale/tampered/oversized requests without private logging', async () => {
  const logs = captureLogger();
  const app = createApp({ ...config, sms: settings }, { prisma: { externalDelivery: { findFirst: async () => null } } as unknown as PrismaClient, isReady: async () => true, disconnect: async () => {} }, logs.logger);
  const raw = JSON.stringify({ deviceId: settings.deviceId, id: 'event', event: 'sms:sent', payload: { messageId: id, recipient: phone, simNumber: 1, partsCount: 1, sentAt: new Date().toISOString() } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', settings.webhookSecret).update(raw).update(timestamp).digest('hex');
  assert.equal(verifySmsSignature(Buffer.from(raw), timestamp, signature, settings.webhookSecret), true);
  assert.equal(verifySmsSignature(Buffer.from(raw + ' '), timestamp, signature, settings.webhookSecret), false);
  assert.equal(verifySmsSignature(Buffer.from(raw), timestamp, signature, settings.webhookSecret, Date.now() + 360000), false);
  await request(app).post('/webhooks/smsgate').set('Content-Type', 'application/json').send(raw).expect(401);
  const r = await request(app).post('/webhooks/smsgate').set('Content-Type', 'application/json').set('X-Timestamp', timestamp).set('X-Signature', signature).send(raw).expect(202);
  assert.equal(r.body.status, 'ignored');
  await request(app).post('/webhooks/smsgate').set('Content-Type', 'application/json').send(JSON.stringify({ body: 'x'.repeat(66000) })).expect(413);
  assert.doesNotMatch(JSON.stringify(logs.entries), new RegExp(`${phone.slice(1)}|${settings.webhookSecret}|${signature}`));
});

test('SMS provider configuration is explicit, private and never falls back to a local URL in production', () => {
  const base = { DATABASE_URL: config.databaseUrl, SMS_PROVIDER: 'smsgate', SMSGATE_LOCAL_API_URL: settings.baseUrl, SMSGATE_USERNAME: settings.username, SMSGATE_PASSWORD: settings.password, SMSGATE_WEBHOOK_SECRET: settings.webhookSecret };
  assert.equal(parseEnvironment(base).sms?.connection, 'local');
  for (const change of [{ SMSGATE_WEBHOOK_SECRET: undefined }, { SMSGATE_PASSWORD: undefined }, { NODE_ENV: 'production' }, { SMSGATE_LOCAL_API_URL: 'http://192.168.1.2:8080' }, { SMSGATE_CONNECTION: 'cloud' }, { SMS_DAILY_LIMIT: '0' }]) assert.throws(() => parseEnvironment({ ...base, ...change }));
  assert.equal(parseEnvironment({ ...base, NODE_ENV: 'production', SMSGATE_SERVER_API_URL: 'https://sms.example/3rdparty/v1', SMSGATE_CONNECTION: 'cloud', SMSGATE_DEVICE_ID: settings.deviceId }).sms?.baseUrl, 'https://sms.example/3rdparty/v1');
  assert.equal(parseEnvironment({ DATABASE_URL: config.databaseUrl }).sms, undefined);
});

test('cloud callback registration pins deviceId, stays idempotent and only narrows this exact URL', async () => {
  const callback = 'https://callback.example/webhooks/smsgate';
  const hooks: { id: string; url: string; event: string; deviceId?: string }[] = [
    { id: 'legacy-own', url: callback, event: 'sms:sent' },
    { id: 'other-app', url: 'https://other.example/webhooks/smsgate', event: 'sms:sent' },
  ];
  let posted = 0; const removed: string[] = [];
  const gateway = new SmsGateProvider({ ...settings, connection: 'cloud', baseUrl: 'https://sms.example/3rdparty/v1' }, async (url, options) => {
    if (options?.method === 'POST') {
      const body = JSON.parse(String(options.body));
      assert.equal(body.deviceId, settings.deviceId); assert.equal(body.device_id, undefined);
      hooks.push({ id: `scoped-${++posted}`, ...body }); return Response.json(body, { status: 201 });
    }
    if (options?.method === 'DELETE') { const id = String(url).split('/').at(-1)!; removed.push(id); hooks.splice(hooks.findIndex((h) => h.id === id), 1); return new Response(null, { status: 204 }); }
    return Response.json(hooks);
  });
  await gateway.registerCallbacks(callback); await gateway.registerCallbacks(callback);
  assert.equal(posted, 4); assert.deepEqual(removed, ['legacy-own']);
  assert.ok(hooks.some((h) => h.id === 'other-app'));
  assert.equal(hooks.filter((h) => h.url === callback && h.deviceId === settings.deviceId).length, 4);
});
