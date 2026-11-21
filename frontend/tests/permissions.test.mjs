import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestContextualPermission } from '../src/services/permissions.js';

test('granted and permanently denied permissions never show a primer or repeat the OS request', async () => {
  let explains = 0, requests = 0;
  const request = async () => { requests++; return { granted: true, canAskAgain: true }; };
  const explain = async () => { explains++; return true; };
  assert.equal(await requestContextualPermission({ granted: true, canAskAgain: true }, request, explain), 'granted');
  assert.equal(await requestContextualPermission({ granted: false, canAskAgain: false }, request, explain), 'blocked');
  assert.equal(explains, 0); assert.equal(requests, 0);
});
test('Not now does not open the system permission prompt', async () => {
  let requests = 0;
  assert.equal(await requestContextualPermission({ granted: false, canAskAgain: true }, async () => { requests++; throw Error(); }, async () => false), 'canceled');
  assert.equal(requests, 0);
});
test('a contextual opt-in requests once and preserves denied versus blocked recovery', async () => {
  for (const next of [{ granted: true, canAskAgain: true }, { granted: false, canAskAgain: true }, { granted: false, canAskAgain: false }]) {
    const order = [];
    const result = await requestContextualPermission({ granted: false, canAskAgain: true }, async () => { order.push('system'); return next; }, async () => { order.push('explanation'); return true; });
    assert.deepEqual(order, ['explanation', 'system']);
    assert.equal(result, next.granted ? 'granted' : next.canAskAgain ? 'denied' : 'blocked');
  }
});
