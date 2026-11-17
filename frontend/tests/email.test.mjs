import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseScheduleMessage,
  parseScheduleReview,
} from '../src/services/schedules/contracts.js';
import { createScheduleService } from '../src/services/schedules/service.js';
import { parseOwned } from '../src/services/mailboxes/contracts.js';
import { createMailboxService } from '../src/services/mailboxes/service.js';
const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  rid = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  date = '2026-11-17T00:00:00.000Z';
const message = () => ({
  id,
  status: 'SUBMITTED',
  subject: 'Private message',
  text: 'Test',
  occasion: null,
  version: 3,
  createdAt: date,
  updatedAt: date,
  recipients: [
    { id: rid, type: 'EMAIL', email: 'test@example.com', label: null },
  ],
  scheduledFor: date,
  timezone: 'UTC',
  localDateTime: '2026-11-17T00:00',
  canceledAt: null,
  deliveryEnabled: true,
  backgroundDelivery: true,
  attachments: [],
  deliveries: [{ recipientId: rid, channel: 'EMAIL' }],
});
test('email schedules preserve channels and reject mismatched recipient proofs', () => {
  const m = message();
  assert.equal(parseScheduleMessage(m).deliveries[0].channel, 'EMAIL');
  assert.throws(() =>
    parseScheduleMessage({
      ...m,
      deliveries: [{ recipientId: rid, channel: 'IN_APP' }],
    }),
  );
  const review = {
    message: {
      ...m,
      status: 'DRAFT',
      scheduledFor: null,
      timezone: null,
      localDateTime: null,
      deliveries: [],
      deliveryEnabled: false,
    },
    resolved: {
      scheduledFor: date,
      timezone: 'UTC',
      localDateTime: '2026-11-17T00:00',
      offset: '+00:00',
    },
    deliveries: [{ recipientId: rid, channels: ['EMAIL'] }],
    reviewToken: 'proof',
    expiresAt: date,
    backgroundDelivery: true,
  };
  assert.equal(parseScheduleReview(review).deliveries[0].channels[0], 'EMAIL');
  assert.throws(() =>
    parseScheduleReview({
      ...review,
      deliveries: [{ recipientId: rid, channels: ['IN_APP'] }],
    }),
  );
});
test('mailbox distinguishes submission and uncertainty from confirmed delivery and retains revocation state', () => {
  const delivery = {
    recipientId: rid,
    intentId: id,
    channel: 'EMAIL',
    outcome: 'SUBMITTED',
    submittedAt: date,
    deliveredAt: null,
    openedAt: null,
    expiresAt: date,
    revokedAt: null,
    errorCode: null,
    attempt: null,
  };
  const owned = {
    ...message(),
    deliveries: [delivery],
    history: { items: [], nextCursor: null },
  };
  assert.equal(parseOwned(owned).deliveries[0].submittedAt, date);
  assert.equal(
    parseOwned({
      ...owned,
      status: 'DELIVERY_UNKNOWN',
      deliveries: [
        {
          ...delivery,
          outcome: 'UNKNOWN',
          submittedAt: null,
          errorCode: 'SMTP_UNCERTAIN',
        },
      ],
    }).deliveries[0].outcome,
    'UNKNOWN',
  );
  for (const bad of [
    { outcome: 'DELIVERED', deliveredAt: date },
    { intentId: 'bad' },
    { submittedAt: null },
    { errorCode: 'private-provider-response' },
  ])
    assert.throws(() =>
      parseOwned({ ...owned, deliveries: [{ ...delivery, ...bad }] }),
    );
});
test('capabilities expose configured SMTP separately and revocation is explicit and never replayed', async () => {
  const calls = [];
  const session = {
    request: async (path, options) => {
      calls.push({ path, options });
      if (path.endsWith('capabilities'))
        return {
          backgroundDelivery: true,
          channels: [{ channel: 'EMAIL', available: true, mode: 'SMTP' }],
          emailLocalOnly: true,
        };
      return { revoked: true };
    },
  };
  const c = await createScheduleService(session).capabilities();
  assert.equal(c.emailAvailable, true);
  assert.equal(c.emailLocalOnly, true);
  assert.equal(c.inAppAvailable, false);
  await createMailboxService(session).revokeLink(id);
  assert.equal(calls.at(-1).options.method, 'POST');
  assert.equal(calls.at(-1).path, `/external/deliveries/${id}/revoke`);
  await assert.rejects(() =>
    createMailboxService({
      request: async () => {
        throw Error('unavailable');
      },
    }).revokeLink(id),
  );
});
