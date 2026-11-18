import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../src/api/client.js';
import {
  parseDashboard,
  parseMailboxPage,
  parseOwned,
  parseReceived,
  parseHistory,
} from '../src/services/mailboxes/contracts.js';
import { createMailboxService } from '../src/services/mailboxes/service.js';
import { createReadResource } from '../src/services/mailboxes/resource.js';
const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  rid = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  date = '2026-11-17T00:00:00.000Z';
const dashboard = () => ({
  asOf: date,
  counts: {
    created: 3,
    scheduled: 1,
    sent: 1,
    received: 1,
    drafts: 1,
    failed: 0,
  },
  unopened: 1,
});
const message = () => ({
  id,
  status: 'DELIVERED',
  subject: 'Later',
  text: 'Private thought',
  occasion: null,
  version: 3,
  createdAt: date,
  updatedAt: date,
  recipients: [
    { id: rid, type: 'SELF', userId: id, label: null, unavailable: false },
  ],
  scheduledFor: date,
  timezone: 'UTC',
  localDateTime: '2026-11-17T00:00',
  canceledAt: null,
  deliveryEnabled: true,
  attachments: [],
  deliveries: [
    {
      recipientId: rid,
      channel: 'IN_APP',
      outcome: 'DELIVERED',
      deliveredAt: date,
      openedAt: null,
      attempt: {
        state: 'SUCCEEDED',
        number: 1,
        errorCode: null,
        startedAt: date,
        finishedAt: date,
      },
    },
  ],
  history: {
    items: [
      {
        id: rid,
        kind: 'DELIVERED',
        state: 'DELIVERED',
        version: 3,
        occurredAt: date,
      },
    ],
    nextCursor: null,
  },
});
const received = () => ({
  id,
  subject: 'Later',
  text: 'Private thought',
  occasion: null,
  senderName: 'Sender',
  senderIsSelf: false,
  deliveredAt: date,
  openedAt: null,
  scheduledFor: date,
  timezone: 'UTC',
  attachments: [],
});
test('dashboard rejects malformed counts and does not pretend overlapping categories are a total', () => {
  assert.deepEqual(parseDashboard(dashboard()).counts, dashboard().counts);
  for (const patch of [
    { unopened: 2 },
    { asOf: 'bad' },
    { counts: { ...dashboard().counts, created: -1 } },
    { counts: { ...dashboard().counts, sent: 0.5 } },
  ])
    assert.throws(() => parseDashboard({ ...dashboard(), ...patch }));
});
test('mailbox summaries preserve ownership roles and discard extra private/internal fields', () => {
  const row = {
    id,
    role: 'received',
    subject: 'Later',
    status: 'RECEIVED',
    timestamp: date,
    scheduledFor: date,
    timezone: 'UTC',
    recipientCount: null,
    deliveryEnabled: null,
    recipients: ['private'],
    leaseToken: 'secret',
  };
  const p = parseMailboxPage(
    { asOf: date, items: [row], nextCursor: null },
    'received',
  );
  assert.equal('recipients' in p.items[0], false);
  assert.equal('leaseToken' in p.items[0], false);
  assert.throws(() =>
    parseMailboxPage({ asOf: date, items: [row], nextCursor: null }, 'created'),
  );
  assert.throws(() =>
    parseMailboxPage(
      { asOf: date, items: [{ ...row, recipientCount: 3 }], nextCursor: null },
      'received',
    ),
  );
  assert.throws(() =>
    parseMailboxPage(
      { asOf: date, items: [row, row], nextCursor: null },
      'received',
    ),
  );
});
test('delivery details keep partial/failed evidence distinct and reject unsupported external delivery claims', () => {
  assert.equal(parseOwned(message()).deliveries[0].outcome, 'DELIVERED');
  assert.throws(() =>
    parseOwned({
      ...message(),
      deliveries: [{ ...message().deliveries[0], channel: 'SMS' }],
    }),
  );
  assert.equal(
    parseOwned({
      ...message(),
      deliveries: [
        {
          ...message().deliveries[0],
          channel: 'SMS',
          outcome: 'UNAVAILABLE',
          deliveredAt: null,
          openedAt: null,
          attempt: null,
        },
      ],
    }).deliveries[0].outcome,
    'UNAVAILABLE',
  );
  assert.throws(() =>
    parseOwned({
      ...message(),
      deliveries: [
        { ...message().deliveries[0], openedAt: '2000-01-01T00:00:00.000Z' },
      ],
    }),
  );
  assert.throws(() =>
    parseOwned({ ...message(), status: 'PROVIDER_ACCEPTED' }),
  );
  assert.throws(() =>
    parseHistory({
      items: [{ ...message().history.items[0], kind: 'READ_AND_UNDERSTOOD' }],
      nextCursor: null,
    }),
  );
});
test('received detail does not expose other recipients or invent opened tracking', () => {
  const value = parseReceived({
    ...received(),
    recipients: [rid],
    ownerId: rid,
    leaseToken: 'secret',
  });
  assert.equal(value.openedAt, null);
  assert.equal('recipients' in value, false);
  assert.equal('ownerId' in value, false);
  assert.throws(() =>
    parseReceived({ ...received(), openedAt: '2000-01-01T00:00:00.000Z' }),
  );
});
test('mailbox service encodes filter cursors and never marks GET reads as opened or retries writes', async () => {
  const calls = [];
  let fail = true;
  const api = createMailboxService({
    request: async (path, options) => {
      calls.push({ path, options });
      if (path.endsWith('/open')) {
        if (fail) throw new ApiError('Timeout', 'timeout');
        return { id, openedAt: date };
      }
      if (path.includes('?box='))
        return { asOf: date, items: [], nextCursor: null };
      return received();
    },
  });
  await api.received(id);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options?.method, undefined);
  await assert.rejects(api.markOpened(id));
  assert.equal(calls.filter((c) => c.path.endsWith('/open')).length, 1);
  fail = false;
  await api.markOpened(id);
  assert.equal(calls.at(-1).options.body, '{}');
  await api.list('received', { read: 'unopened', cursor: 'opaque+/cursor' });
  assert.match(calls.at(-1).path, /cursor=opaque%2B%2Fcursor/);
  const count = calls.length;
  await assert.rejects(api.owned('bad'));
  assert.throws(() => api.contentPath(id, 'bad', true));
  assert.equal(calls.length, count);
  assert.equal(
    api.contentPath(id, rid, true),
    `/messages/inbox/${id}/attachments/${rid}/content`,
  );
  assert.equal(
    api.contentPath(id, rid, false),
    `/messages/drafts/${id}/attachments/${rid}/content`,
  );
});
test('focus resources ignore stale responses and clear private content when stopped or reused', async () => {
  const finish = [];
  let calls = 0;
  const model = createReadResource(() => {
    calls++;
    return new Promise((r) => finish.push(r));
  });
  const first = model.refresh(),
    second = model.refresh();
  finish[1]('new private data');
  await second;
  finish[0]('stale private data');
  await first;
  assert.equal(model.getSnapshot().data, 'new private data');
  const late = model.refresh();
  model.stop();
  finish[2]('late private data');
  await late;
  assert.equal(model.getSnapshot().data, null);
  await model.refresh();
  assert.equal(calls, 3);
  const resumed = model.start();
  finish[3]('same-account fresh data');
  await resumed;
  assert.equal(model.getSnapshot().data, 'same-account fresh data');
  model.stop();
  assert.equal(model.getSnapshot().data, null);
});
test('refresh failures retain a clearly stale snapshot and suppress raw network failure text', async () => {
  let fail = false;
  const model = createReadResource(async () => {
    if (fail) throw Error('private transport details');
    return 'saved';
  });
  await model.refresh();
  fail = true;
  await model.refresh();
  assert.equal(model.getSnapshot().data, 'saved');
  assert.ok(model.getSnapshot().error);
  assert.equal(model.getSnapshot().error.includes('private transport'), false);
});

test('confirmed missing or denied messages clear retained private content', async () => {
  for (const status of [401, 403, 404]) {
    let denied = false;
    const model = createReadResource(async () => {
      if (denied) throw new ApiError('Unavailable', 'http', status);
      return 'private content';
    });
    await model.refresh();
    denied = true;
    await model.refresh();
    assert.equal(model.getSnapshot().data, null);
    assert.equal(model.getSnapshot().error, 'Unavailable');
  }
});

test('SMS carrier evidence stays separate from link opening and rejects unsupported read or delivery claims', () => {
  const base = message();
  const sms = { ...base, status: 'SUBMITTED', recipients: [{ id: rid, type: 'PHONE', phone: '+12025550181', country: 'US', label: null }], deliveries: [{ recipientId: rid, intentId: id, channel: 'SMS', outcome: 'SUBMITTED', submittedAt: date, notificationSentAt: null, notificationReadAt: null, deliveredAt: null, openedAt: null, expiresAt: date, revokedAt: null, errorCode: null, attempt: null }] };
  assert.equal(parseOwned(sms).deliveries[0].outcome, 'SUBMITTED');
  const delivered = { ...sms.deliveries[0], outcome: 'DELIVERED', notificationSentAt: date, deliveredAt: date };
  assert.equal(parseOwned({ ...sms, deliveries: [delivered] }).deliveries[0].openedAt, null);
  assert.throws(() => parseOwned({ ...sms, deliveries: [{ ...delivered, notificationSentAt: null }] }));
  assert.throws(() => parseOwned({ ...sms, deliveries: [{ ...delivered, notificationReadAt: date }] }));
  assert.equal(parseOwned({ ...sms, deliveries: [{ ...sms.deliveries[0], outcome: 'UNKNOWN', errorCode: 'SMSGATE_UNCERTAIN' }] }).deliveries[0].errorCode, 'SMSGATE_UNCERTAIN');
});
