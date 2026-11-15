import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../src/app';
import { errorHandler } from '../src/middlewares/errorHandler';
import { requestContext } from '../src/middlewares/requestContext';
import { validateBody } from '../src/middlewares/validateBody';
import { captureLogger, config, fakeDatabase } from './helpers';

test('root identifies the API and links to available health endpoints without querying the database', async () => {
  let queries = 0;
  const db = { ...fakeDatabase(), isReady: async () => { queries++; return false; } };
  const app = createApp(config, db, captureLogger().logger);
  const response = await request(app).get('/').expect(200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.name, 'Dearly API');
  assert.deepEqual(response.body.data.endpoints, {
    health: '/health', databaseHealth: '/health/db', liveness: '/health/live', readiness: '/health/ready',
  });
  assert.equal(response.body.requestId, response.headers['x-request-id']);
  assert.equal(queries, 0);
});

test('health alias stays live during database failure and after ordinary rate limits are exhausted', async () => {
  let queries = 0;
  const db = { ...fakeDatabase(), isReady: async () => { queries++; return false; } };
  const app = createApp({ ...config, rateLimitMax: 1 }, db, captureLogger().logger);
  await request(app).get('/').expect(200);
  await request(app).get('/').expect(429);
  for (const path of ['/health', '/health/', '/health/live', '/health/live/']) {
    const response = await request(app).get(path).expect(200);
    assert.deepEqual(response.body.data, { status: 'alive' });
    assert.equal(response.headers['cache-control'], 'no-store');
    await request(app).head(path).expect(200);
  }
  assert.equal(queries, 0);
});

test('liveness has security headers, a generated request ID and no database dependency', async () => {
  let queries = 0;
  const db = { ...fakeDatabase(), isReady: async () => { queries++; return false; } };
  const { logger } = captureLogger();
  const app = createApp(config, db, logger);
  const response = await request(app).get('/health/live').set('X-Request-Id', 'untrusted-id').expect(200);
  assert.deepEqual(response.body.data, { status: 'alive' });
  assert.equal(response.body.success, true);
  assert.equal(response.body.requestId, response.headers['x-request-id']);
  assert.match(response.body.requestId, /^[0-9a-f-]{36}$/);
  assert.notEqual(response.body.requestId, 'untrusted-id');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.equal(queries, 0);
});

test('readiness responds to database availability changing without restarting the app', async () => {
  let ready = true;
  const db = { ...fakeDatabase(), isReady: async () => ready };
  const app = createApp(config, db, captureLogger().logger);
  for (const path of ['/health/ready', '/health/db']) {
    const response = await request(app).get(path).expect(200);
    assert.deepEqual(response.body.data, { status: 'ready' });
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  ready = false;
  for (const path of ['/health/ready', '/health/db']) {
    const down = await request(app).get(path).expect(503);
    assert.equal(down.body.error.code, 'NOT_READY');
    assert.equal(down.headers['cache-control'], 'no-store');
  }
  ready = true;
  for (const path of ['/health/ready', '/health/db']) {
    await request(app).get(path).expect(200);
  }
});

test('readiness hides database failures containing connection credentials', async () => {
  const db = { ...fakeDatabase(), isReady: async () => { throw new Error('private-database-password'); } };
  const logs = captureLogger();
  const response = await request(createApp(config, db, logs.logger)).get('/health/ready').expect(503);
  assert.doesNotMatch(JSON.stringify({ body: response.body, logs: logs.entries }), /private-database-password/);
});

test('unknown routes use the common error contract and request ID', async () => {
  const response = await request(createApp(config, fakeDatabase(), captureLogger().logger))
    .get('/api/missing').expect(404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'NOT_FOUND');
  assert.equal(response.body.requestId, response.headers['x-request-id']);
});

test('malformed and oversized JSON return safe 400/413 responses', async () => {
  const app = createApp({ ...config, bodyLimitBytes: 100 }, fakeDatabase(), captureLogger().logger);
  const malformed = await request(app).post('/missing').type('json').send('{"secret":"private-body"').expect(400);
  assert.equal(malformed.body.error.code, 'INVALID_BODY');
  assert.doesNotMatch(JSON.stringify(malformed.body), /private-body|SyntaxError|stack/);
  const large = await request(app).post('/missing').send({ text: 'x'.repeat(101) }).expect(413);
  assert.equal(large.body.error.code, 'PAYLOAD_TOO_LARGE');
});

test('unsupported request charset returns the common 415 error', async () => {
  const app = createApp(config, fakeDatabase(), captureLogger().logger);
  const response = await request(app).post('/missing')
    .set('Content-Type', 'application/json; charset=bogus').send('{}').expect(415);
  assert.equal(response.body.error.code, 'UNSUPPORTED_ENCODING');
});

test('CORS permits configured web origins and originless tools, rejects unlisted origins', async () => {
  const app = createApp(config, fakeDatabase(), captureLogger().logger);
  const allowed = await request(app).get('/health/live').set('Origin', 'http://localhost:8081').expect(200);
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:8081');
  await request(app).get('/health/live').expect(200);
  const denied = await request(app).get('/health/live').set('Origin', 'https://untrusted.example').expect(403);
  assert.equal(denied.body.error.code, 'ORIGIN_NOT_ALLOWED');
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
  const preflight = await request(app).options('/health/ready')
    .set('Origin', 'http://localhost:8081').set('Access-Control-Request-Method', 'GET').expect(204);
  assert.equal(preflight.headers['access-control-allow-origin'], 'http://localhost:8081');
});

test('rate limit rejects excess traffic while leaving liveness available', async () => {
  const app = createApp({ ...config, rateLimitMax: 1 }, fakeDatabase(), captureLogger().logger);
  await request(app).get('/health/ready').expect(200);
  const limited = await request(app).get('/health/ready').expect(429);
  assert.equal(limited.body.error.code, 'RATE_LIMITED');
  assert.ok(limited.headers['retry-after']);
  await request(app).get('/health/live').expect(200);
});

test('request logging excludes authorization, query strings, request IDs and bodies from the caller', async () => {
  const logs = captureLogger();
  const app = createApp(config, fakeDatabase(), logs.logger);
  await request(app).post('/private-path?token=private-token')
    .set('Authorization', 'Bearer private-auth').set('X-Request-Id', 'private-id')
    .send({ otp: 'private-otp', message: 'private-message' }).expect(404);
  assert.doesNotMatch(JSON.stringify(logs.entries), /private-/);
  assert.equal(logs.entries[0].event, 'http.request');
  assert.equal(logs.entries[0].metadata?.statusCode, 404);
});

test('unexpected errors never expose stack traces, messages or credentials', async () => {
  const logs = captureLogger();
  const app = express();
  app.use(requestContext(logs.logger));
  app.get('/crash', () => { throw new Error('private-password'); });
  app.use(errorHandler(logs.logger));
  const response = await request(app).get('/crash').expect(500);
  assert.equal(response.body.error.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(JSON.stringify({ body: response.body, logs: logs.entries }), /private-password|stack/);
});

test('Zod validation rejects invalid fields safely and passes transformed validated data', async () => {
  const logs = captureLogger();
  const app = express();
  app.use(requestContext(logs.logger), express.json());
  app.post('/validate', validateBody(z.object({ name: z.string().trim().min(1) })), (req, res) => {
    res.json(req.body);
  });
  app.use(errorHandler(logs.logger));
  const invalid = await request(app).post('/validate').send({ name: 123, secret: 'private-input' }).expect(400);
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(invalid.body.error.details, [{ field: 'name', code: 'invalid_type' }]);
  assert.doesNotMatch(JSON.stringify(invalid.body.error), /private-input|123/);
  const valid = await request(app).post('/validate').send({ name: '  Dearly  ', ignored: true }).expect(200);
  assert.deepEqual(valid.body, { name: 'Dearly' });
});
