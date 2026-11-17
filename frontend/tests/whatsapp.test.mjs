import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseScheduleMessage,
  parseScheduleReview,
} from '../src/services/schedules/contracts.js';
import { createScheduleService } from '../src/services/schedules/service.js';
import { parseOwned, eventLabel } from '../src/services/mailboxes/contracts.js';
const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  rid = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  date = '2026-11-17T00:00:00.000Z';
const message = () => ({
  id,
  status: 'SUBMITTED',
  subject: 'Later',
  text: 'Private thought',
  occasion: null,
  version: 3,
  createdAt: date,
  updatedAt: date,
  recipients: [
    {
      id: rid,
      type: 'PHONE',
      phone: '+12025550181',
      country: 'US',
      label: null,
      unavailable: false,
    },
  ],
  scheduledFor: date,
  timezone: 'UTC',
  localDateTime: '2026-11-17T00:00',
  canceledAt: null,
  deliveryEnabled: true,
  backgroundDelivery: true,
  attachments: [],
  deliveries: [{ recipientId: rid, channel: 'WHATSAPP' }],
});
test('WhatsApp parsing accepts phone choices and refuses email/account channel substitution', () => {
  const m = message();
  assert.equal(parseScheduleMessage(m).deliveries[0].channel, 'WHATSAPP');
  for (const recipient of [
    { id: rid, type: 'SELF', userId: id, label: null, unavailable: false },
    { id: rid, type: 'EMAIL', email: 'test@example.com', label: null },
  ])
    assert.throws(() =>
      parseScheduleMessage({ ...m, recipients: [recipient] }),
    );
  const review = {
    message: {
      ...m,
      status: 'DRAFT',
      deliveryEnabled: false,
      scheduledFor: null,
      timezone: null,
      localDateTime: null,
      deliveries: [],
    },
    resolved: {
      scheduledFor: date,
      timezone: 'UTC',
      localDateTime: '2026-11-17T00:00',
      offset: '+00:00',
    },
    deliveries: [{ recipientId: rid, channels: ['WHATSAPP'] }],
    reviewToken: 'proof',
    expiresAt: date,
    backgroundDelivery: true,
  };
  assert.equal(
    parseScheduleReview(review).deliveries[0].channels[0],
    'WHATSAPP',
  );
});
test('WhatsApp receipts remain distinct from private content opening and reject fabricated evidence', () => {
  const d = {
      recipientId: rid,
      intentId: id,
      channel: 'WHATSAPP',
      outcome: 'DELIVERED',
      submittedAt: date,
      deliveredAt: date,
      notificationReadAt: date,
      openedAt: null,
      expiresAt: date,
      revokedAt: null,
      errorCode: null,
      attempt: null,
    },
    m = {
      ...message(),
      deliveries: [d],
      history: { items: [], nextCursor: null },
    };
  const parsed = parseOwned(m).deliveries[0];
  assert.equal(parsed.notificationReadAt, date);
  assert.equal(parsed.openedAt, null);
  for (const change of [
    { deliveredAt: null },
    { notificationReadAt: 'not-a-date' },
    { intentId: 'bad' },
    { errorCode: 'raw provider body' },
  ])
    assert.throws(() =>
      parseOwned({ ...m, deliveries: [{ ...d, ...change }] }),
    );
  assert.equal(
    eventLabel('WHATSAPP_NOTIFICATION_READ'),
    'WhatsApp notification read',
  );
});
test('WhatsApp review preserves explicit consent without replaying confirmation and reflects unpaired service state', async () => {
  const calls = [];
  const api = createScheduleService({
    request: async (path, options) => {
      calls.push({ path, options });
      if (path.endsWith('capabilities'))
        return {
          backgroundDelivery: true,
          channels: [
            { channel: 'WHATSAPP', available: true, mode: 'WAHA_CORE' },
          ],
          whatsappStatus: 'UNPAIRED',
          emailLocalOnly: true,
        };
      throw Error('Synthetic connection loss');
    },
  });
  const cap = await api.capabilities();
  assert.equal(cap.whatsappAvailable, true);
  assert.equal(cap.whatsappStatus, 'UNPAIRED');
  assert.equal(cap.emailAvailable, false);
  const choice = {
    version: 1,
    localDateTime: '2027-01-01T00:00',
    timezone: 'UTC',
    whatsappConsent: true,
    deliveries: [{ recipientId: rid, channels: ['WHATSAPP'] }],
  };
  await assert.rejects(() => api.confirm(id, choice, 'proof'));
  assert.equal(calls.filter((c) => c.path.endsWith('/confirm')).length, 1);
  assert.equal(JSON.parse(calls.at(-1).options.body).whatsappConsent, true);
});
