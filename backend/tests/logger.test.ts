import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import winston from 'winston';
import { createLogger, safeLog, type LogMetadata } from '../src/utils/logger';
test('real logger discards private bodies, raw errors, tokens, URLs and arbitrary event strings', async () => {
  const stream = new PassThrough(),
    line = new Promise<Buffer>((resolve) => stream.once('data', resolve));
  const logger = createLogger('info', [
    new winston.transports.Stream({ stream }),
  ]);
  logger.info('a-private-bearer-token', {
    method: 'POST',
    statusCode: 401,
    code: '123456',
    body: 'private message',
    authorization: 'Bearer private-token',
    error: Error('postgresql://private:password@host/db'),
  } as LogMetadata);
  const text = (await line).toString(),
    event = JSON.parse(text);
  assert.equal(event.message, 'app.event');
  assert.equal(event.statusCode, 401);
  assert.equal(event.code, undefined);
  assert.doesNotMatch(text, /private|password|Bearer|123456/);
});
test('recognized operational fields survive without accepting invalid values', () => {
  assert.deepEqual(
    safeLog('http.request', {
      requestId: '00000000-0000-4000-8000-000000000001',
      method: 'GET',
      statusCode: 200,
      durationMs: 1,
      headers: { authorization: 'secret' },
    }).metadata,
    {
      requestId: '00000000-0000-4000-8000-000000000001',
      method: 'GET',
      statusCode: 200,
      durationMs: 1,
    },
  );
  assert.deepEqual(
    safeLog('http.error', {
      durationMs: Infinity,
      port: 123456,
      code: 'private_token',
    }).metadata,
    {},
  );
});
