import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recipientChannel, reviewBlockers, validWallTime, wallTimePickerValue, pickerWallTime } from '../src/services/schedules/selection.js';

const self = { id: 'self', type: 'SELF' };
const phone = { id: 'phone', type: 'PHONE', phone: '+12025550173', label: 'Alex' };
const email = { id: 'email', type: 'EMAIL', email: 'alex@example.com' };
const ready = { recipients: [self], phoneChannels: {}, available: true, emailAvailable: false, whatsappAvailable: true, smsAvailable: false, whatsappConsent: false, smsConsent: false, date: '2026-11-21', time: '18:45', timezone: 'Asia/Kolkata' };

test('every saved recipient must have an available delivery channel', () => {
  assert.deepEqual(reviewBlockers(ready), []);
  assert.match(reviewBlockers({ ...ready, recipients: [self, phone, email], phoneChannels: { phone: 'SMS' } }).join(), /SMS is unavailable/);
  assert.match(reviewBlockers({ ...ready, recipients: [self, email] }).join(), /Email is unavailable/);
});

test('included WhatsApp and SMS require explicit independent consent', () => {
  assert.match(reviewBlockers({ ...ready, recipients: [phone], phoneChannels: { phone: 'WHATSAPP' } }).join(), /agreed to WhatsApp/);
  assert.deepEqual(reviewBlockers({ ...ready, recipients: [phone], phoneChannels: { phone: 'WHATSAPP' }, whatsappConsent: true }), []);
  const reasons = reviewBlockers({ ...ready, recipients: [phone], phoneChannels: { phone: 'SMS' }, whatsappConsent: true });
  assert.match(reasons.join(), /SMS is unavailable/);
  assert.match(reasons.join(), /agreed to SMS/);
});

test('unavailable destinations explain how to correct the draft', () => {
  assert.match(reviewBlockers({ ...ready, recipients: [self, email] }).join(), /Email is unavailable/);
  assert.deepEqual(reviewBlockers(ready), []);
  assert.match(reviewBlockers({ ...ready, recipients: [] }).join(), /at least one recipient/);
  assert.match(reviewBlockers({ ...ready, recipients: [{ ...self, unavailable: true }] }).join(), /account is unavailable/);
});

test('channels follow recipient type and keep the explicit phone choice', () => {
  assert.equal(recipientChannel(email, {}), 'EMAIL');
  assert.equal(recipientChannel(self, {}), 'IN_APP');
  assert.equal(recipientChannel(phone, { phone: 'WHATSAPP' }), 'WHATSAPP');
});

test('date/time and timezone blockers identify malformed choices', () => {
  for (const [date, time] of [['2026-02-30', '12:00'], ['2026-11-21', '24:00'], ['2026-11-21', '09:60'], ['bad', '12:00']]) {
    assert.equal(validWallTime(date, time), false);
    assert.match(reviewBlockers({ ...ready, date, time }).join(), /valid delivery date and time/);
  }
  assert.equal(validWallTime('2028-02-29', '00:00'), true);
  assert.match(reviewBlockers({ ...ready, timezone: 'Not/AZone' }).join(), /valid timezone/);
});

test('native picker carrier retains wall-clock fields without applying device timezone or resolving DST', () => {
  for (const [date, time] of [['2026-11-21', '00:05'], ['2026-11-01', '01:30'], ['2026-03-08', '02:30'], ['2028-02-29', '23:59']]) {
    assert.deepEqual(pickerWallTime(wallTimePickerValue(date, time)), { date, time });
  }
});
