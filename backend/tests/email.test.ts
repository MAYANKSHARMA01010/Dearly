import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';
import nodemailer from 'nodemailer';
import { createEmailSender } from '../src/providers/email/email.provider';
import {
  accessId,
  accessToken,
  fileHandle,
} from '../src/services/externalAccess.service';
import {
  emailTemplate,
  escapeHtml,
  smtpFailure,
} from '../src/providers/email/email.provider';
import { parseEnvironment } from '../src/configs/env';
import { createApp } from '../src/app';
import { config, fakeDatabase, captureLogger } from './helpers';
test('bearer and attachment proofs are domain separated, scoped and resistant to tampering', () => {
  const key = randomBytes(32).toString('hex'),
    id = randomUUID(),
    token = accessToken(id, key);
  assert.equal(accessId(token, key), id);
  for (const bad of [
    '',
    token + 'x',
    token.replace(id, randomUUID()),
    token.slice(0, -1) + '!',
  ])
    assert.equal(accessId(bad, key), null);
  assert.equal(accessId(token, randomBytes(32).toString('hex')), null);
  assert.notEqual(
    fileHandle(id, 'file', key),
    fileHandle(randomUUID(), 'file', key),
  );
  assert.notEqual(fileHandle(id, 'file', key), fileHandle(id, 'other', key));
});
test('email notification escapes links, excludes content and rejects executable URLs', () => {
  assert.equal(escapeHtml('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;');
  const template = emailTemplate('https://example.com/external/#opaque');
  assert.match(template.html, /Open message/);
  assert.match(template.text, /seven days/);
  assert.throws(() => emailTemplate('javascript:alert(1)'));
  assert.throws(() => emailTemplate('https://user:password@example.com/'));
});
test('SMTP errors distinguish explicit rejection and pre-submission retry from uncertain DATA', () => {
  assert.equal(
    smtpFailure({ responseCode: 550, response: 'private' }).state,
    'REJECTED',
  );
  assert.equal(smtpFailure({ responseCode: 452 }).state, 'RETRYABLE');
  assert.equal(smtpFailure({ code: 'EAUTH' }).state, 'RETRYABLE');
  assert.equal(
    smtpFailure({ command: 'CONN', code: 'ETIMEDOUT' }).state,
    'RETRYABLE',
  );
  for (const error of [
    { command: 'DATA', code: 'ETIMEDOUT' },
    new Error('private'),
    {},
  ]) {
    const result = smtpFailure(error);
    assert.equal(result.state, 'UNKNOWN');
    assert.doesNotMatch(JSON.stringify(result), /private|ETIMEDOUT/);
  }
});
test('external viewer is no-store and opening without authorization never returns content', async () => {
  const logs = captureLogger(),
    app = createApp(config, fakeDatabase(), logs.logger);
  const page = await request(app).get('/external/').expect(200);
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.equal(page.headers['referrer-policy'], 'no-referrer');
  assert.match(page.headers['content-security-policy'], /default-src 'none'/);
  assert.match(page.headers['content-security-policy'], /img-src 'self' blob:/);
  assert.match(page.text, /<header class="brand"><img src="\/external\/logo\.png" width="48" height="48" alt=""><span>Dearly<\/span>/);
  const logo = await request(app).get('/external/logo.png').expect(200).expect('Content-Type', /image\/png/);
  assert.deepEqual([...logo.body.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(logo.headers['x-content-type-options'], 'nosniff');

  await request(app)
    .post('/external/open')
    .send({ token: 'invalid' })
    .expect(503);
  assert.doesNotMatch(JSON.stringify(logs.entries), /invalid|token/);
});
test('external URL requires HTTPS in production and sending budget is bounded', () => {
  for (const extra of [
    { EMAIL_DAILY_LIMIT: '501' },
    { EMAIL_DAILY_LIMIT: '0' },
    { NODE_ENV: 'production', EMAIL_PUBLIC_URL: 'http://example.com' },
    { EXTERNAL_ACCESS_SECRET: 'bad' },
  ])
    assert.throws(() =>
      parseEnvironment({
        DATABASE_URL: 'postgresql://test:test@localhost/test',
        ...extra,
      }),
    );
});

test('SMTP adapter submits one envelope recipient, excludes private message content and records acceptance only', async (t) => {
  const config = {
    host: 'smtp.gmail.com',
    port: 465 as const,
    user: 'synthetic@gmail.com',
    password: 'synthetic-test-password',
    from: 'synthetic@gmail.com',
  };
  let sent: Record<string, unknown> | undefined,
    closed = 0;
  const transport = {
    sendMail: async (options: Record<string, unknown>) => {
      sent = options;
      return {
        accepted: ['recipient@example.com'],
        rejected: [],
        response: '250 2.0.0 OK synthetic-provider-id - gsmtp',
      };
    },
    close: () => {
      closed++;
    },
  };
  const mock = t.mock.method(nodemailer, 'createTransport', () => transport);
  const send = createEmailSender(config),
    r = await send(
      'recipient@example.com',
      'https://dearly.example/external/#synthetic',
      randomUUID(),
    );
  assert.equal(r.state, 'ACCEPTED');
  assert.equal(r.providerMessageId, 'synthetic-provider-id');
  assert.equal(closed, 1);
  assert.deepEqual(sent?.envelope, {
    from: 'synthetic@gmail.com',
    to: ['recipient@example.com'],
  });
  assert.equal(sent?.attachments, undefined);
  assert.equal(sent?.cc, undefined);
  assert.equal(sent?.bcc, undefined);
  assert.equal(
    (
      await send(
        'bad\r\nBcc: other@example.com',
        'https://dearly.example',
        randomUUID(),
      )
    ).state,
    'REJECTED',
  );
  assert.equal(closed, 1);
  mock.mock.restore();
});
