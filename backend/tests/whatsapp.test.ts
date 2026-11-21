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

test('WhatsApp OTP is immediate, contains no content link and never auto retries ambiguous sends', async () => {
  const { whatsappOtpProvider } = await import('../src/providers/otp/whatsappOtp.provider');
  const calls: RequestInit[] = [];
  const gateway = new WahaProvider(settings, async (_url, options) => {
    if (!options?.method) return ready();
    calls.push(options);
    return Response.json({ id: messageId, fromMe: true, to: '12025550171@c.us' });
  });
  const provider = whatsappOtpProvider(gateway, 20);
  const result = await provider.dispatch({ phone: '+12025550171', code: '123456', challengeId: 'synthetic' });
  assert.equal(result.status, 'accepted');
  assert.equal(provider.channel, 'whatsapp');
  const body = JSON.parse(String(calls[0].body));
  assert.match(body.text, /123456.*5 minutes/);
  assert.doesNotMatch(body.text, /https?:|private Dearly message/);
  assert.equal(body.linkPreview, false);
  assert.equal(calls.length, 1);
  await gateway.sendOtp('+12025550171', 'bad');
  assert.equal(calls.length, 1);
  for (const mode of ['offline', 'throttled', 'uncertain'] as const) {
    let posts = 0;
    const p = whatsappOtpProvider(new WahaProvider(settings, async (_u, options) => {
      if (!options?.method) return mode === 'offline' ? new Response('', { status: 503 }) : ready();
      posts++;
      if (mode === 'uncertain') throw Error('synthetic timeout');
      return new Response('', { status: 429 });
    }), 20);
    const out = await p.dispatch({ phone: '+12025550171', code: '123456', challengeId: 'synthetic' });
    assert.equal(out.status, mode === 'uncertain' ? 'unknown' : 'rejected');
    assert.equal(posts, mode === 'offline' ? 0 : 1);
  }
});

test('WhatsApp auth requires real provider configuration and never relaxes production development-code guards', () => {
  const base = { DATABASE_URL: config.databaseUrl, AUTH_MODE: 'whatsapp', OTP_PEPPER: 'a'.repeat(64), WHATSAPP_MODE: 'waha', WAHA_LOCAL_API_URL: 'http://localhost:3100', WAHA_API_KEY: settings.apiKey, WAHA_WEBHOOK_SECRET: settings.webhookSecret };
  assert.equal(parseEnvironment(base).authMode, 'whatsapp');
  assert.equal(parseEnvironment(base).whatsappOtpDailyLimit, 20);
  for (const change of [{ OTP_PEPPER: undefined }, { WHATSAPP_MODE: 'disabled' }, { WAHA_API_KEY: undefined }, { WHATSAPP_OTP_DAILY_LIMIT: '0' }, { NODE_ENV: 'production' }])
    assert.throws(() => parseEnvironment({ ...base, ...change }));
  assert.equal(parseEnvironment({ ...base, NODE_ENV: 'production', WAHA_SERVER_API_URL: 'https://private-waha.example' }).authMode, 'whatsapp');
});

test('Core GOWS minimal send responses accept outbound IDs while mismatches stay uncertain', async () => {
  for (const [body, expected] of [
    [{ id: messageId, _data: null }, 'ACCEPTED'],
    [{ id: messageId, fromMe: false }, 'UNKNOWN'],
    [{ id: 'false_12025550171@c.us_TEST' }, 'UNKNOWN'],
    [{ id: 'true_12025550172@c.us_TEST' }, 'UNKNOWN'],
    [{ id: messageId, to: '12025550172@c.us' }, 'UNKNOWN'],
  ] as const) {
    const gateway = new WahaProvider({ ...settings, engine: 'GOWS' }, async (_u, o) => o?.method ? Response.json(body) : ready());
    assert.equal((await gateway.sendOtp('+12025550171', '123456')).state, expected);
  }
});

test('hosted gateway tolerates slow readiness and confirms a slow OTP submission once', { timeout: 35000 }, async () => {
  let submissions = 0;
  const gateway = new WahaProvider({ ...settings, baseUrl: 'https://waha.example' }, async (url, options) => {
    // Real abort-aware delay exercises AbortSignal.timeout, which uses Node's
    // internal clock rather than node:test's mocked setTimeout clock. No network.
    const { setTimeout: delay } = await import('node:timers/promises');
    await delay(12000, undefined, { signal: options?.signal ?? undefined });
    if (String(url).endsWith('/api/sessions/default')) return ready();
    submissions++;
    return Response.json({ id: messageId, fromMe: true, to: '12025550171@c.us' });
  });
  const result = await gateway.sendOtp('+12025550171', '123456');
  assert.equal(result.state, 'ACCEPTED');
  assert.equal(submissions, 1);
});

test('OTP status, reservation preflight and dispatch share a recent successful gateway check', async () => {
  let now = 10000, probes = 0, posts = 0;
  const gateway = new WahaProvider(settings, async (_url, options) => {
    if (!options?.method) { probes++; return ready(); }
    posts++;
    return Response.json({ id: messageId, fromMe: true, to: '12025550171@c.us' });
  }, () => now);
  assert.deepEqual(await Promise.all([gateway.otpReadiness(), gateway.otpReadiness()]), ['READY', 'READY']);
  assert.equal(await gateway.otpReadiness(), 'READY');
  assert.equal((await gateway.sendOtp('+12025550171', '123456')).state, 'ACCEPTED');
  assert.equal(probes, 1);
  assert.equal(posts, 1);
  now += 5001;
  await gateway.otpReadiness();
  assert.equal(probes, 2);
});

test('OTP readiness never caches an offline state and a failed send invalidates recent readiness', async () => {
  let probes = 0, online = false, posts = 0;
  const gateway = new WahaProvider(settings, async (_url, options) => {
    if (!options?.method) { probes++; return online ? ready() : new Response('', { status: 503 }); }
    posts++; return new Response('', { status: 500 });
  });
  assert.equal(await gateway.otpReadiness(), 'OFFLINE');
  online = true;
  assert.equal(await gateway.otpReadiness(), 'READY');
  assert.equal(probes, 2);
  assert.equal((await gateway.sendOtp('+12025550171', '123456')).state, 'UNKNOWN');
  assert.equal(posts, 1);
  online = false;
  assert.equal(await gateway.otpReadiness(), 'OFFLINE');
  assert.equal(probes, 3);
  assert.equal(posts, 1);
});


test('relocating the same paired sender can retain quota and receipt scope independently of transport', async () => {
  const old = { ...settings, baseUrl: 'https://gateway-old.example.com' };
  const relocated = { ...old, baseUrl: 'https://gateway-new.example.com', scopeOrigin: old.baseUrl };
  assert.equal(new WahaProvider(old).scope, new WahaProvider(relocated).scope);
  assert.notEqual(new WahaProvider(old).scope, new WahaProvider({ ...relocated, scopeOrigin: undefined }).scope);
  assert.notEqual(new WahaProvider(old).scope, new WahaProvider({ ...relocated, engine: 'GOWS' }).scope);
  const moved = new WahaProvider(relocated, async url => {
    assert.ok(String(url).startsWith(relocated.baseUrl + '/'));
    return ready();
  });
  assert.equal(await moved.readiness(), 'READY');
});
