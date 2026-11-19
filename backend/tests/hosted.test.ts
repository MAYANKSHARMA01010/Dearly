import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { supervise } from '../src/jobs/startHosted';
class FakeChild extends EventEmitter {
  signals: string[] = [];
  kill(signal: string) {
    this.signals.push(signal);
    return true;
  }
}
test('unexpected hosted process exit stops sibling workers and reports failure', async () => {
  const api = new FakeChild(),
    worker = new FakeChild(),
    push = new FakeChild();
  const group = supervise(
    [api, worker, push] as unknown as ChildProcess[],
    100,
  );
  worker.emit('close', 1);
  assert.deepEqual(api.signals, ['SIGTERM']);
  assert.deepEqual(push.signals, ['SIGTERM']);
  api.emit('close', 0);
  push.emit('close', 0);
  assert.equal(await group.done, 1);
});
test('host shutdown stops taking work, forwards termination and bounds stuck children', async () => {
  const api = new FakeChild(),
    worker = new FakeChild();
  const group = supervise([api, worker] as unknown as ChildProcess[], 10);
  group.stop();
  api.emit('close', 0);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(worker.signals, ['SIGTERM', 'SIGKILL']);
  worker.emit('close', 0);
  assert.equal(await group.done, 0);
});
