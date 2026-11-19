import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
/** Separate fenced processes share one free web instance; sleeping hosts delay jobs. */
export function supervise(children: ChildProcess[], deadlineMs = 25000) {
  let stopping = false,
    failed = false,
    timer: NodeJS.Timeout | undefined;
  const active = new Set(children);
  const stop = (failure = false) => {
    failed ||= failure;
    if (stopping) return;
    stopping = true;
    for (const child of active) child.kill('SIGTERM');
    timer = setTimeout(() => {
      for (const child of active) child.kill('SIGKILL');
    }, deadlineMs);
    timer.unref();
  };
  const done = new Promise<number>((resolve) => {
    if (!children.length) return resolve(1);
    for (const child of children) {
      child.once('error', () => stop(true));
      child.once('close', () => {
        active.delete(child);
        if (!stopping) stop(true);
        if (!active.size) {
          if (timer) clearTimeout(timer);
          resolve(failed ? 1 : 0);
        }
      });
    }
  });
  return { stop: () => stop(false), done };
}
async function main() {
  const preflight = spawn(
    process.execPath,
    [join(__dirname, 'checkRelease.js')],
    { stdio: 'inherit' },
  );
  const valid = await new Promise<boolean>((resolve) => {
    preflight.once('error', () => resolve(false));
    preflight.once('close', (code) => resolve(code === 0));
  });
  if (!valid) {
    process.exitCode = 1;
    return;
  }
  // Connectivity/authentication only; never sends mail or blocks API availability.
  const emailCheck = spawn(
    process.execPath,
    [join(__dirname, 'checkEmail.js')],
    { stdio: 'inherit' },
  );
  await new Promise<void>((resolve) => {
    emailCheck.once('error', () => resolve());
    emailCheck.once('close', () => resolve());
  });
  const group = supervise(
    ['../server.js', '../workers/runDeliveryWorker.js', 'runPushWorker.js'].map(
      (file) =>
        spawn(
          process.execPath,
          [
            join(__dirname, file),
            ...(file === 'runPushWorker.js' ? ['--loop'] : []),
          ],
          { stdio: 'inherit' },
        ),
    ),
  );
  process.once('SIGTERM', group.stop);
  process.once('SIGINT', group.stop);
  process.exitCode = await group.done;
}
if (require.main === module)
  void main().catch(() => {
    console.error(
      'Hosted processes stopped. Inspect sanitized service status.',
    );
    process.exitCode = 1;
  });
