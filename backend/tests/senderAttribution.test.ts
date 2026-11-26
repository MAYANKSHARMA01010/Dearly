import assert from 'node:assert/strict';
import { test } from 'node:test';
import { senderDisplayName } from '../src/utils/senderDisplayName';
import { emailTemplate } from '../src/providers/email/email.provider';
import { smsText } from '../src/providers/sms/smsgate.provider';
import { smsSegments } from '../src/utils/smsSegments';
import { WahaProvider } from '../src/providers/whatsapp/waha.provider';

test('sender display labels bound length, remove controls and use a neutral fallback', () => {
  assert.equal(senderDisplayName('  Alex\r\nMorgan\u202e  '), 'Alex Morgan');
  assert.equal(senderDisplayName(' \u200b '), 'Someone');
  assert.equal(senderDisplayName(null), 'Someone');
  assert.equal(Array.from(senderDisplayName('😀'.repeat(100))).length, 80);
});
test('email attributes subject/plain/HTML with escaping and no header injection', () => {
  const mail = emailTemplate('https://dearly.example/external/#synthetic', 'Alex <Morgan>\r\nBcc: fake');
  assert.match(mail.subject, /^Alex <Morgan> Bcc: fake sent you/);
  assert.doesNotMatch(mail.subject, /[\r\n]/);
  assert.match(mail.html, /Alex &lt;Morgan&gt; Bcc: fake sent you/);
  assert.doesNotMatch(mail.html, /<Morgan>/);
  assert.match(mail.text, /Alex <Morgan> Bcc: fake sent you/);
  assert.match(emailTemplate('https://dearly.example/external/#synthetic', '').subject, /^Someone sent/);
});
test('SMS preserves the entire link, expiry and one-segment cap for long or Unicode names', () => {
  const link = `https://dearly-z8zm.onrender.com/external/#00000000-0000-4000-8000-000000000000.${'a'.repeat(43)}`;
  for (const name of ['Alex', 'A'.repeat(80), 'अजय', 'José', '']) {
    const text = smsText(link, name);
    assert.ok(text.endsWith(link));
    assert.equal(smsSegments(text).segments, 1);
    assert.match(text, /\(7 days\)/);
  }
  assert.match(smsText(link, 'Alex'), /from Alex/);
  assert.match(smsText(link, 'अजय'), /Someone/);
});
test('WhatsApp attribution uses only display name and does not change OTP copy', async () => {
  const texts: string[] = [];
  const gateway = new WahaProvider({ engine: 'GOWS', baseUrl: 'http://localhost:3100', apiKey: 'synthetic', webhookSecret: 'a'.repeat(64), session: 'default', dailyLimit: 20 }, async (_url, init) => {
    if (init?.method !== 'POST') return Response.json({ name: 'default', status: 'WORKING' });
    texts.push(JSON.parse(String(init.body)).text);
    return Response.json({ id: 'true_12025550171@c.us_SYNTHETIC' });
  });
  await gateway.send('+12025550171', 'https://dearly.example/external/#synthetic', 'Alex Morgan');
  await gateway.sendOtp('+12025550171', '123456');
  assert.match(texts[0], /^Alex Morgan sent you a private message via Dearly/);
  assert.doesNotMatch(texts[1], /Alex Morgan/);
});
