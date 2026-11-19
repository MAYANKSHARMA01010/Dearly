import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { createSmsCallbackApp } from '../src/smsCallbackApp';
import { captureLogger } from './helpers';
const settings = { baseUrl: 'https://sms.example/3rdparty/v1', connection: 'cloud' as const, deviceId: 'test-device', username: 'synthetic', password: 'synthetic', webhookSecret: 'a'.repeat(64), simNumber: 1, dailyLimit: 20 };

test('isolated callback receiver exposes no app API, content, health, query or redirect paths', async () => {
  const logs = captureLogger(), app = createSmsCallbackApp({} as PrismaClient, settings, logs.logger);
  for (const path of ['/', '/health', '/auth/otp/request', '/messages', '/external/', '/webhooks/waha', '/webhooks/smsgate?key=secret', '/webhooks/smsgate/']) {
    await request(app).get(path).expect(404);
    await request(app).post(path).send({}).expect(404);
  }
  await request(app).post('/webhooks/smsgate').set('Content-Type', 'application/json').send('{}').expect(401);
  await request(app).post('/webhooks/smsgate').set('Content-Type', 'application/json').send(JSON.stringify({ text: 'x'.repeat(66000) })).expect(413);
  assert.doesNotMatch(JSON.stringify(logs.entries), /secret|synthetic|aaaaaa/);
});

test('only signed known-shape callbacks reach the isolated receiver, without logging private data', async () => {
  const logs = captureLogger(), app = createSmsCallbackApp({ externalDelivery: { findFirst: async () => null } } as unknown as PrismaClient, settings, logs.logger);
  const raw = JSON.stringify({ deviceId: 'test-device', id: randomUUID(), event: 'sms:sent', payload: { messageId: randomUUID(), recipient: '+12025550181', simNumber: 1, partsCount: 1, sentAt: new Date().toISOString() } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', settings.webhookSecret).update(raw).update(timestamp).digest('hex');
  const r = await request(app).post('/webhooks/smsgate').set('X-Forwarded-For', '192.0.2.1').set('Content-Type', 'application/json').set('X-Timestamp', timestamp).set('X-Signature', signature).send(raw).expect(202);
  assert.equal(r.body.status, 'ignored');
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.doesNotMatch(JSON.stringify(logs.entries), /12025550181|synthetic|aaaaaa/);
});
