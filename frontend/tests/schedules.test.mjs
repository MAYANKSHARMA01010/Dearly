import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../src/api/client.js';
import {
  parseScheduleMessage,
  parseScheduleReview,
  parseSchedulePage,
  defaultWallTime,
  scheduleLabel,
} from '../src/services/schedules/contracts.js';
import { createScheduleService } from '../src/services/schedules/service.js';
import { createDraftWorkspace } from '../src/services/drafts/editor.js';
const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  rid = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const date = '2027-01-01T18:45:00.000Z';
const draft = () => ({
  id,
  status: 'DRAFT',
  subject: 'Later',
  text: 'Private thought',
  occasion: null,
  version: 1,
  createdAt: date,
  updatedAt: date,
  recipients: [
    { id: rid, type: 'SELF', userId: id, unavailable: false, label: null },
  ],
  scheduledFor: null,
  timezone: null,
  localDateTime: null,
  canceledAt: null,
  attachments: [],
  deliveries: [],
  backgroundDelivery: true,
  deliveryEnabled: false,
});
const scheduled = () => ({
  ...draft(),
  status: 'SCHEDULED',
  version: 2,
  scheduledFor: date,
  timezone: 'Asia/Kolkata',
  localDateTime: '2027-01-02T00:15',
  deliveries: [{ recipientId: rid, channel: 'IN_APP' }],
});
const review = () => ({
  message: draft(),
  resolved: {
    scheduledFor: date,
    timezone: 'Asia/Kolkata',
    localDateTime: '2027-01-02T00:15',
    offset: '+05:30',
  },
  deliveries: [{ recipientId: rid, channels: ['IN_APP'] }],
  reviewToken: 'opaque.review-proof',
  expiresAt: '2027-01-01T18:30:00.000Z',
  backgroundDelivery: true,
  deliveryEnabled: false,
});
test('schedule parsing preserves recipient IDs and rejects incomplete or misleading saved state', () => {
  assert.equal(parseScheduleMessage(scheduled()).recipients[0].id, rid);
  for (const patch of [
    { backgroundDelivery: false },
    { status: 'SENT' },
    { timezone: 'Invalid/Zone' },
    { scheduledFor: 'bad' },
    { deliveries: [] },
    { deliveries: [{ recipientId: rid, channel: 'EMAIL' }] },
    {
      deliveries: [
        { recipientId: rid, channel: 'IN_APP' },
        { recipientId: rid, channel: 'IN_APP' },
      ],
    },
  ])
    assert.throws(() => parseScheduleMessage({ ...scheduled(), ...patch }));
  assert.throws(() =>
    parseScheduleMessage({ ...scheduled(), status: 'CANCELED' }),
  );
  assert.equal(
    parseScheduleMessage({
      ...scheduled(),
      status: 'CANCELED',
      canceledAt: date,
    }).status,
    'CANCELED',
  );
  assert.throws(() => parseScheduleMessage({ ...draft(), scheduledFor: date }));
  assert.throws(() =>
    parseSchedulePage({ items: [], nextCursor: 'x'.repeat(513) }),
  );
});
test('review requires authoritative time, proof and a unique supported choice for each recipient', () => {
  assert.equal(parseScheduleReview(review()).resolved.scheduledFor, date);
  for (const patch of [
    { reviewToken: '' },
    { backgroundDelivery: false },
    { deliveries: [] },
    { deliveries: [{ recipientId: rid, channels: ['SMS'] }] },
    { resolved: { ...review().resolved, offset: 'unknown' } },
    { resolved: { ...review().resolved, localDateTime: 'bad' } },
  ])
    assert.throws(() => parseScheduleReview({ ...review(), ...patch }));
});
test('mobile wall time uses the chosen zone across midnight and non-hour offsets', () => {
  assert.equal(
    defaultWallTime('Asia/Kolkata', new Date(date)),
    '2027-01-02T00:15',
  );
  assert.equal(
    defaultWallTime('Asia/Kathmandu', new Date(date)),
    '2027-01-02T00:30',
  );
  assert.equal(
    defaultWallTime('Pacific/Pago_Pago', new Date('2027-01-01T00:00:00Z')),
    '2026-12-31T13:00',
  );
  assert.match(scheduleLabel(date, 'Asia/Kolkata'), /2027/);
});
test('schedule service keeps review proof/version on explicit writes and never retries an uncertain confirmation', async () => {
  const calls = [];
  let fail = true;
  const api = createScheduleService({
    request: async (path, options) => {
      calls.push({ path, options });
      if (path.endsWith('/confirm')) {
        if (fail) throw new ApiError('Timeout', 'timeout');
        return scheduled();
      }
      if (path.includes('?status=')) return { items: [], nextCursor: null };
      if (path.endsWith('/preview')) return review();
      return draft();
    },
  });
  const source = await api.source(id);
  assert.equal(source.recipients[0].id, rid);
  const choice = {
    version: 1,
    localDateTime: '2027-01-02T00:15',
    timezone: 'Asia/Kolkata',
    deliveries: [{ recipientId: rid, channels: ['IN_APP'] }],
  };
  const p = await api.preview(id, choice);
  await assert.rejects(api.confirm(id, choice, p.reviewToken));
  assert.equal(calls.filter((c) => c.path.endsWith('/confirm')).length, 1);
  fail = false;
  assert.equal(
    (await api.confirm(id, choice, p.reviewToken)).status,
    'SCHEDULED',
  );
  assert.equal(
    calls.at(-1).options.body,
    JSON.stringify({ ...choice, reviewToken: p.reviewToken }),
  );
  await api.list('CANCELED', 'opaque+/cursor');
  assert.match(calls.at(-1).path, /opaque%2B%2Fcursor/);
  const count = calls.length;
  await assert.rejects(api.read('invalid'));
  assert.equal(calls.length, count);
});
test('forgetting a scheduled editor clears old private state before reopening its returned draft', () => {
  const workspace = createDraftWorkspace({});
  workspace.bind(id);
  const old = workspace.editor(id, id);
  old.edit({ text: 'Unsaved' });
  workspace.forget(id);
  assert.equal(old.getSnapshot().content.text, '');
  const reopened = workspace.editor(id, id);
  assert.notEqual(reopened, old);
  assert.equal(reopened.getSnapshot().deleted, false);
});

test('dispatch and final delivery states parse without treating them as editable schedules', () => {
  for (const status of [
    'DISPATCHING',
    'DELIVERED',
    'PARTIALLY_DELIVERED',
    'FAILED',
  ]) {
    const message = parseScheduleMessage({
      ...scheduled(),
      status,
      deliveryEnabled: true,
    });
    assert.equal(message.status, status);
    assert.equal(message.deliveryEnabled, true);
  }
  assert.throws(() =>
    parseScheduleMessage({
      ...scheduled(),
      status: 'OPENED',
      deliveryEnabled: true,
    }),
  );
  assert.throws(() =>
    parseScheduleMessage({ ...scheduled(), deliveryEnabled: 'yes' }),
  );
});
test('delivery capabilities distinguish a running worker from supported in-app delivery', async () => {
  let status = 'offline';
  const api = createScheduleService({
    request: async () => ({
      backgroundDelivery: true,
      worker: { status },
      channels: [
        { channel: 'IN_APP', available: true, mode: 'DATABASE' },
        { channel: 'SMS', available: false },
      ],
    }),
  });
  assert.deepEqual(await api.capabilities(), {
    backgroundDelivery: true,
    workerOnline: false,
    inAppAvailable: true,
    emailAvailable: false,
    emailLocalOnly: false,
    whatsappAvailable: false,
    whatsappStatus: 'DISABLED',
  });
  status = 'running';
  assert.equal((await api.capabilities()).workerOnline, true);
});
