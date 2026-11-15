import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { startServer } from '../src/serverLifecycle';
import { captureLogger, config, fakeDatabase } from './helpers';

test('server binds, handles a request and disconnects once on concurrent shutdown', async () => {
  let disconnected = 0;
  const db = { ...fakeDatabase(), disconnect: async () => { disconnected++; } };
  const runtime = await startServer({ ...config, port: 0 }, db, captureLogger().logger);
  try {
    const address = runtime.server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/health/live`);
    assert.equal(response.status, 200);
  } finally {
    const first = runtime.shutdown();
    assert.equal(runtime.shutdown(), first);
    await first;
  }
  assert.equal(disconnected, 1);
  assert.equal(runtime.server.listening, false);
});

test('shutdown drains a pending database request before disconnecting', { timeout: 3000 }, async () => {
  let finishQuery!: (ready: boolean) => void;
  let enteredQuery!: () => void;
  const entered = new Promise<void>((resolve) => { enteredQuery = resolve; });
  const query = new Promise<boolean>((resolve) => { finishQuery = resolve; });
  let disconnected = false;
  const db = {
    isReady: () => { enteredQuery(); return query; },
    disconnect: async () => { disconnected = true; },
  };
  const runtime = await startServer({ ...config, port: 0 }, db, captureLogger().logger);
  const address = runtime.server.address() as AddressInfo;
  const response = fetch(`http://127.0.0.1:${address.port}/health/ready`);
  await entered;
  const stopped = runtime.shutdown();
  assert.equal(disconnected, false);
  finishQuery(true);
  assert.equal((await response).status, 200);
  await stopped;
  assert.equal(disconnected, true);
});

test('shutdown rejects after its deadline if cleanup stalls', { timeout: 3000 }, async () => {
  const db = { ...fakeDatabase(), disconnect: () => new Promise<void>(() => {}) };
  const runtime = await startServer({ ...config, port: 0, shutdownTimeoutMs: 100 }, db, captureLogger().logger);
  await assert.rejects(runtime.shutdown(), /Shutdown deadline exceeded/);
  assert.equal(runtime.server.listening, false);
});

test('address conflicts fail safely and release the database client', async () => {
  const occupied = createServer();
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  let disconnected = false;
  try {
    const port = (occupied.address() as AddressInfo).port;
    const db = { ...fakeDatabase(), disconnect: async () => { disconnected = true; } };
    await assert.rejects(startServer({ ...config, port }, db, captureLogger().logger),
      /Server could not bind/);
    assert.equal(disconnected, true);
  } finally {
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
  }
});
