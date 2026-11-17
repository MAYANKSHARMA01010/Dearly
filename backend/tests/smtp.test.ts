import assert from 'node:assert/strict';
import { test } from 'node:test';
import nodemailer from 'nodemailer';
import { EnvironmentError, parseEnvironment } from '../src/configs/env';
import { smtpOptions, verifySmtp } from '../src/providers/email/smtp.transport';

const source = {
  DATABASE_URL: 'postgresql://test:test@localhost/test', EMAIL_MODE: 'smtp',
  SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'sender@gmail.com',
  SMTP_FROM: 'sender@gmail.com', SMTP_PASSWORD: 'synthetic-app-password',
};

test('SMTP defaults disabled and enabled mode requires complete credentials without echoing values', () => {
  assert.equal(parseEnvironment({ DATABASE_URL: source.DATABASE_URL }).email, undefined);
  for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) {
    assert.throws(() => parseEnvironment({ ...source, [key]: undefined }), EnvironmentError);
  }
  for (const overrides of [{ SMTP_PORT: '25' }, { SMTP_FROM: 'other@gmail.com' }, { SMTP_USER: 'private-secret' }]) {
    assert.throws(() => parseEnvironment({ ...source, ...overrides }), (error: unknown) => {
      assert.ok(error instanceof EnvironmentError);
      assert.doesNotMatch(error.message, /synthetic-app-password|private-secret|other@gmail/);
      return true;
    });
  }
});

test('SMTP enforces TLS, bounded waits and disabled logging/content fetching', () => {
  const config = parseEnvironment(source).email!;
  const options = smtpOptions(config);
  assert.equal(options.secure, true);
  assert.equal(smtpOptions({ ...config, port: 587 }).secure, false);
  assert.equal(options.requireTLS, true);
  assert.equal(options.tls?.rejectUnauthorized, true);
  assert.equal(options.tls?.minVersion, 'TLSv1.2');
  assert.equal(options.logger, false);
  assert.equal(options.debug, false);
  assert.equal(options.disableFileAccess, true);
  assert.equal(options.disableUrlAccess, true);
  assert.equal(options.socketTimeout, 20000);
});

test('connection check never sends messages and closes transport on success and failure', async (t) => {
  const config = parseEnvironment(source).email!;
  assert.equal(await verifySmtp(), 'DISABLED');
  for (const [failure, expected] of [
    [undefined, 'READY'], [{ code: 'EAUTH', response: 'private-secret' }, 'AUTH_FAILED'],
    [{ code: 'ETIMEDOUT', response: 'private-secret' }, 'CONNECTION_FAILED'],
  ] as const) {
    let closed = false;
    const transport = {
      verify: async () => { if (failure) throw failure; return true; },
      close: () => { closed = true; },
      sendMail: () => { assert.fail('Connection verification must never send email'); },
    };
    const mock = t.mock.method(nodemailer, 'createTransport', () => transport);
    assert.equal(await verifySmtp(config), expected);
    assert.equal(closed, true);
    mock.mock.restore();
  }
});
