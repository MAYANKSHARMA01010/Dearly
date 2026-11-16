import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import {
  retryDelay,
  deliveryPolicy,
  type Claim,
} from '../src/workers/deliveryWorker';
import { runWorkerLoop } from '../src/workers/runDeliveryWorker';
import { inboxList, inboxParams } from '../src/validators/inbox.validators';
import { createApp } from '../src/app';
import { config, captureLogger, fakeDatabase } from './helpers';
const claim: Claim = {
  id: 'a',
  messageId: 'b',
  token: 'secret-fence',
  attempt: 1,
};
test('retry delays are bounded and increase without allowing an endless attempt budget', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 100].map(retryDelay),
    [5000, 30000, 120000, 600000, 600000, 600000],
  );
  assert.equal(deliveryPolicy.maxAttempts, 5);
  assert.equal(deliveryPolicy.maxTotalAttempts, 20);
  assert.ok(deliveryPolicy.leaseMs > 20000 + 15000);
});
test('worker shutdown drains the claimed operation and stops claiming new work', async () => {
  const stop = new AbortController();
  let finish!: () => void, started!: () => void;
  const seen: string[] = [];
  const ready = new Promise<void>((r) => {
    started = r;
  });
  const held = new Promise<void>((r) => {
    finish = r;
  });
  const running = runWorkerLoop(
    {
      enqueue: async () => {
        seen.push('enqueue');
      },
      claim: async () => {
        seen.push('claim');
        return claim;
      },
      execute: async () => {
        seen.push('execute');
        started();
        await held;
        seen.push('done');
      },
      heartbeat: async (stopped) => {
        seen.push(stopped ? 'stopped' : 'pulse');
      },
    },
    stop.signal,
    1,
  );
  await ready;
  stop.abort();
  assert.equal(seen.includes('done'), false);
  finish();
  await running;
  assert.equal(seen.filter((s) => s === 'claim').length, 1);
  assert.ok(seen.indexOf('done') < seen.indexOf('stopped'));
});
test('a failed polling cycle recovers and keeps raw failures out of diagnostics', async () => {
  let calls = 0,
    failures = 0;
  const stop = new AbortController();
  await runWorkerLoop(
    {
      heartbeat: async () => {},
      enqueue: async () => {
        if (++calls === 1) throw Error('private data');
      },
      claim: async () => {
        stop.abort();
        return null;
      },
      execute: async () => {},
    },
    stop.signal,
    1,
    () => {
      failures++;
    },
  );
  assert.equal(calls, 2);
  assert.equal(failures, 1);
});
test('inbox validation rejects malformed/cross-scope fields and cursor encodings', () => {
  assert.equal(inboxList.parse({}).limit, 20);
  for (const value of [{ limit: '51' }, { ownerId: 'fake' }, { cursor: '%%%' }])
    assert.equal(inboxList.safeParse(value).success, false);
  assert.equal(inboxParams.safeParse({ id: 'not-an-id' }).success, false);
  const valid = Buffer.from(
    JSON.stringify({
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      deliveredAt: '2026-11-16T00:00:00.000Z',
    }),
  ).toString('base64url');
  assert.equal(
    inboxList.parse({ cursor: valid }).cursor?.id,
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  );
});
test('inbox is protected and worker health is separate from API liveness', async () => {
  const app = createApp(config, fakeDatabase(), captureLogger().logger);
  assert.equal((await request(app).get('/messages/inbox')).status, 503);
  const status = await request(app).get('/health/worker').expect(503);
  assert.equal(status.body.data.status, 'unavailable');
  await request(app).get('/health').expect(200);
});
