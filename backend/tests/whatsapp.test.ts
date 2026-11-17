import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import {
  WahaProvider,
  whatsappJid,
} from '../src/providers/whatsapp/waha.provider';
import {
  WahaReceiptService,
  verifyWahaSignature,
} from '../src/services/wahaReceipt.service';
import { parseEnvironment, type WahaConfig } from '../src/configs/env';
import { createApp } from '../src/app';
import { captureLogger, config } from './helpers';
const settings: WahaConfig = {
  engine: 'NOWEB',
  baseUrl: 'http://localhost:3100',
  apiKey: 'synthetic-private-key',
  webhookSecret: 'a'.repeat(64),
  session: 'default',
  dailyLimit: 20,
};
const ready = () =>
  Response.json({ name: 'default', status: 'WORKING', me: {} });
const messageId = 'true_12025550171@c.us_SYNTHETIC123';
test('WhatsApp requires canonical E.164 without guessing a country', () => {
  assert.equal(whatsappJid('+12025550171'), '12025550171@c.us');
  assert.equal(whatsappJid('+919876543210'), '919876543210@c.us');
  for (const value of [
    '2025550171',
    '9876543210',
    '+1 202 555 0171',
    '123@g.us',
  ])
    assert.throws(() => whatsappJid(value));
});
test('WAHA sends one private link and records only a validated outgoing provider ID', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const gateway = new WahaProvider(settings, async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1
      ? ready()
      : Response.json({ id: messageId, fromMe: true, to: '12025550171@c.us' });
  });
  const r = await gateway.send(
    '+12025550171',
    'https://dearly.example/external/#synthetic',
  );
  assert.equal(r.state, 'ACCEPTED');
  assert.equal(r.providerMessageId, messageId);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'http://localhost:3100/api/sendText');
  assert.equal(calls[1].options?.redirect, 'error');
  const body = JSON.parse(String(calls[1].options?.body));
  assert.equal(body.session, 'default');
  assert.equal(body.chatId, '12025550171@c.us');
  assert.equal(body.linkPreview, false);
  assert.match(body.text, /https:\/\/dearly.example/);
  assert.equal(body.attachments, undefined);
});
test('unpaired/offline/restricted checks never submit, POST ambiguity never becomes a safe retry', async () => {
  for (const response of [
    Response.json({ name: 'default', status: 'SCAN_QR_CODE' }),
    Response.json({
      name: 'default',
      status: 'WORKING',
      me: { messageCapping: { cappingStatus: 'CAPPED' } },
    }),
    new Response('', { status: 401 }),
  ]) {
    let submits = 0;
    const gateway = new WahaProvider(settings, async (_url, o) => {
      if (o?.method === 'POST') submits++;
      return response;
    });
    assert.equal(
      (await gateway.send('+12025550171', 'https://dearly.example/#proof'))
        .state,
      'RETRYABLE',
    );
    assert.equal(submits, 0);
  }
  for (const [response, expected] of [
    [new Response('', { status: 500 }), 'UNKNOWN'],
    [new Response('', { status: 429 }), 'RETRYABLE'],
    [new Response('', { status: 422 }), 'REJECTED'],
    [Response.json({ id: messageId, fromMe: false }), 'UNKNOWN'],
    [Response.json({ ok: true }), 'UNKNOWN'],
  ] as const) {
    let n = 0;
    const gateway = new WahaProvider(settings, async () =>
      ++n === 1 ? ready() : response,
    );
    assert.equal(
      (await gateway.send('+12025550171', 'https://dearly.example/#proof'))
        .state,
      expected,
    );
  }
  let n = 0;
  const gateway = new WahaProvider(settings, async () => {
    if (++n === 1) return ready();
    throw Error('private provider failure');
  });
  assert.equal(
    (await gateway.send('+12025550171', 'https://dearly.example/#proof')).state,
    'UNKNOWN',
  );
});
test('signed callbacks authenticate exact bytes and reject changed bodies or algorithms', () => {
  const body = Buffer.from('{"event":"message.ack"}'),
    signature = createHmac('sha512', settings.webhookSecret)
      .update(body)
      .digest('hex');
  assert.equal(
    verifyWahaSignature(body, signature, 'sha512', settings.webhookSecret),
    true,
  );
  assert.equal(
    verifyWahaSignature(
      Buffer.from(body + ' '),
      signature,
      'sha512',
      settings.webhookSecret,
    ),
    false,
  );
  assert.equal(
    verifyWahaSignature(body, signature, 'sha256', settings.webhookSecret),
    false,
  );
  assert.equal(
    verifyWahaSignature(body, 'bad', 'sha512', settings.webhookSecret),
    false,
  );
});
test('callback ingress verifies raw JSON before parsing and never logs secrets or bodies', async () => {
  const logs = captureLogger();
  const app = createApp(
    { ...config, whatsapp: settings },
    {
      prisma: {} as PrismaClient,
      isReady: async () => true,
      disconnect: async () => {},
    },
    logs.logger,
  );
  await request(app)
    .post('/webhooks/waha')
    .set('Content-Type', 'application/json')
    .send('{"token":"private-payload"}')
    .expect(401);
  const raw = '{bad-json',
    sig = createHmac('sha512', settings.webhookSecret)
      .update(raw)
      .digest('hex');
  await request(app)
    .post('/webhooks/waha')
    .set('Content-Type', 'application/json')
    .set('X-Webhook-Hmac', sig)
    .set('X-Webhook-Hmac-Algorithm', 'sha512')
    .send(raw)
    .expect(400);
  await request(app)
    .post('/webhooks/waha')
    .set('Content-Type', 'application/json')
    .send('x'.repeat(65537))
    .expect(413);
  assert.doesNotMatch(
    JSON.stringify(logs.entries),
    /private-payload|synthetic-private-key|bad-json/,
  );
});
test('local and hosted configuration never silently cross over or expose private values', () => {
  const base = {
    DATABASE_URL: 'postgresql://test:test@localhost/test',
    WHATSAPP_MODE: 'waha',
    WAHA_API_KEY: settings.apiKey,
    WAHA_WEBHOOK_SECRET: settings.webhookSecret,
    WAHA_LOCAL_API_URL: 'http://localhost:3100',
    WAHA_SERVER_API_URL: '',
  };
  assert.equal(
    parseEnvironment(base).whatsapp?.baseUrl,
    'http://localhost:3100',
  );
  assert.throws(() => parseEnvironment({ ...base, NODE_ENV: 'production' }));
  assert.equal(
    parseEnvironment({
      ...base,
      NODE_ENV: 'production',
      WAHA_SERVER_API_URL: 'https://waha.example',
    }).whatsapp?.baseUrl,
    'https://waha.example',
  );
  for (const bad of [
    { WAHA_API_KEY: undefined },
    { WAHA_LOCAL_API_URL: 'http://remote.example' },
    { WAHA_SERVER_API_URL: 'https://user:pass@example.com' },
    { WAHA_ENGINE: 'PLUS' },
    { WAHA_SESSION: 'other' },
  ])
    assert.throws(
      () => parseEnvironment({ ...base, ...bad }),
      (error) => !String(error).includes(settings.apiKey),
    );
});

test('pairing helper stays loopback-only, blocks cross-site/rebinding access and exposes no sender credentials', async () => {
  const { createServer } = await import('node:http');
  const { pairingHandler } = await import('../src/providers/whatsapp/pairing');
  let calls = 0;
  const server = createServer(
    pairingHandler(settings, async () => {
      calls++;
      return ready();
    }),
  );
  const page = await request(server).get('/').expect(200);
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.equal(page.headers['x-frame-options'], 'DENY');
  assert.doesNotMatch(
    page.text,
    new RegExp(settings.apiKey + '|' + settings.webhookSecret),
  );
  await request(server)
    .get('/status')
    .set('Sec-Fetch-Site', 'same-origin')
    .expect(200)
    .expect((r) => assert.equal(r.body.status, 'READY'));
  const before = calls;
  await request(server).get('/qr').set('Host', 'evil.example').expect(403);
  await request(server)
    .get('/status')
    .set('Sec-Fetch-Site', 'cross-site')
    .expect(403);
  await request(server).post('/start').expect(405);
  assert.equal(calls, before);
});

test('sender recovery restarts only failed sessions and preserves working, restricted or in-progress pairing', async () => {
  for (const [state, expected] of [
    ['FAILED', 'restart'],
    ['STOPPED', 'start'],
    ['WORKING', null],
    ['SCAN_QR_CODE', null],
  ] as const) {
    const methods: { url: string; method: string }[] = [];
    const provider = new WahaProvider(settings, async (url, options) => {
      methods.push({ url: String(url), method: options?.method ?? 'GET' });
      return methods.length === 1
        ? Response.json({ status: state })
        : Response.json({});
    });
    await provider.start();
    assert.equal(methods.length, expected ? 2 : 1);
    if (expected)
      assert.equal(
        methods[1].url,
        `http://localhost:3100/api/sessions/default/${expected}`,
      );
  }
});

test('GOWS callbacks persist only for the configured engine and preserve scope isolation', async () => {
  let stored = 0;
  const db = {
    $queryRaw: async () => [{ now: new Date() }],
    wahaReceipt: {
      createMany: async () => {
        stored++;
        return { count: 1 };
      },
    },
    externalDelivery: {
      findFirst: async (input: { select?: unknown }) =>
        input.select ? { id: 'synthetic-known' } : null,
    },
  } as unknown as PrismaClient;
  const gows = new WahaReceiptService(db, { ...settings, engine: 'GOWS' });
  const event = {
    id: 'synthetic-gows-event',
    timestamp: Date.now(),
    event: 'message.ack',
    session: 'default',
    engine: 'GOWS',
    payload: { id: messageId, fromMe: true, ack: 2, ackName: 'DEVICE' },
  };
  for (const engine of ['GOWS', 'NOWEB']) {
    const raw = Buffer.from(JSON.stringify({ ...event, engine })),
      sig = createHmac('sha512', settings.webhookSecret)
        .update(raw)
        .digest('hex');
    await gows.ingest(raw, sig, 'sha512');
  }
  assert.equal(stored, 1);
});
