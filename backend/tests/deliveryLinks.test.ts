import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicDeliveryLink, appDownloadUrl } from '../src/utils/deliveryLinks';
import { emailTemplate } from '../src/providers/email/email.provider';
import { SmsGateProvider } from '../src/providers/sms/smsgate.provider';
import { WahaProvider } from '../src/providers/whatsapp/waha.provider';
import { parseEnvironment } from '../src/configs/env';

test('outgoing message links reject loopback, private IPs, local hostnames and credentials', () => {
  for (const value of ['http://localhost:8080/external/#proof', 'https://127.0.0.1/external/', 'https://[::1]/', 'https://192.168.1.2/', 'https://10.0.0.1/', 'https://phone.local/', 'https://server.internal/', 'https://localhost/', 'https://example.com@localhost/', 'https://user:secret@example.com/']) {
    assert.equal(publicDeliveryLink(value), false);
    assert.throws(() => emailTemplate(value));
  }
  assert.equal(publicDeliveryLink('https://dearly.example/external/#proof'), true);
});
test('email includes public app downloads and truthful phone-only registration instructions', () => {
  const template = emailTemplate('https://dearly.example/external/#proof');
  for (const text of [template.text, template.html]) {
    assert.ok(text.includes(appDownloadUrl));
    assert.match(text, /prerelease/);
    assert.match(text, /phone number/);
    assert.match(text, /Email sign-in is not supported/);
    assert.match(text, /not automatically added/);
    assert.doesNotMatch(text, /localhost/);
  }
});
test('hosted backend origin takes precedence over a stale local email alias', () => {
  const c = parseEnvironment({ DATABASE_URL: 'postgresql://test:test@localhost/test', BACKEND_SERVER_URL: 'https://dearly.example', EMAIL_PUBLIC_URL: 'http://localhost:8080', EXTERNAL_ACCESS_SECRET: 'a'.repeat(64) });
  assert.equal(c.externalAccess?.publicUrl, 'https://dearly.example');
});
test('SMS and WhatsApp reject local content links before any provider request', async () => {
  const request: typeof fetch = async () => { throw Error('Unexpected provider call'); };
  const sms = new SmsGateProvider({ baseUrl: 'http://127.0.0.1:3102', connection: 'local', username: 'test', password: 'test', webhookSecret: 'test', simNumber: 1, dailyLimit: 1 }, request);
  const whatsapp = new WahaProvider({ baseUrl: 'http://127.0.0.1:3100', apiKey: 'synthetic-test-key', webhookSecret: 'a'.repeat(64), session: 'default', engine: 'GOWS', dailyLimit: 1 }, request);
  assert.equal((await sms.send('+12025550181', 'http://localhost:8080/external/#proof', '00000000-0000-4000-8000-000000000000')).code, 'INVALID_CONTENT_URL');
  assert.equal((await whatsapp.send('+12025550181', 'http://localhost:8080/external/#proof')).code, 'INVALID_CONTENT_URL');
});
