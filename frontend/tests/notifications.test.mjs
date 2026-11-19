import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parsePage,
  parseTarget,
  parsePreferences,
  createNotificationService,
} from '../src/services/notifications/service.js';
const id = '00000000-0000-4000-8000-000000000001';
test('notification payloads reject arbitrary deep links and malformed preferences', () => {
  assert.throws(() =>
    parseTarget({
      id,
      targetId: 'https://untrusted.example',
      targetType: 'owned',
    }),
  );
  assert.throws(() =>
    parsePreferences({
      inAppAlerts: true,
      pushAlerts: 'yes',
      defaultPhoneChannel: 'EMAIL',
    }),
  );
  assert.throws(() => parsePage({ items: [], nextCursor: 'wrong', unread: 0 }));
  assert.equal(
    parseTarget({ id, targetId: id, targetType: 'received' }).targetType,
    'received',
  );
});
test('opening resolves through authenticated API before marking read; failures do not redirect', async () => {
  const calls = [];
  const service = createNotificationService({
    async request(path, options) {
      calls.push([path, options?.method ?? 'GET']);
      return path.endsWith('/read')
        ? { read: true }
        : { id, targetId: id, targetType: 'owned' };
    },
  });
  assert.equal((await service.open(id)).targetId, id);
  assert.deepEqual(calls, [
    [`/notifications/${id}`, 'GET'],
    [`/notifications/${id}/read`, 'POST'],
  ]);
  const blocked = createNotificationService({
    async request() {
      throw Error('unauthorized');
    },
  });
  await assert.rejects(blocked.open(id));
});
