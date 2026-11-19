import { setTimeout as delay } from 'node:timers/promises';
import { loadEnvironment } from '../configs/loadEnvironment';
import { createDatabase } from '../configs/database';
import { PushWorker } from '../workers/pushWorker';
async function main() {
  const c = loadEnvironment();
  if (!c.push?.enabled) {
    console.log('Push dispatch disabled. No push submitted.');
    return;
  }
  const db = createDatabase(c.databaseUrl),
    stop = new AbortController();
  process.once('SIGTERM', () => stop.abort());
  process.once('SIGINT', () => stop.abort());
  try {
    const worker = new PushWorker(db.prisma!, fetch, c.push?.accessToken);
    do {
      await worker.run(stop.signal);
      if (!process.argv.includes('--loop')) break;
      try {
        await delay(5000, undefined, { signal: stop.signal });
      } catch (error) {
        if (!stop.signal.aborted) throw error;
      }
    } while (!stop.signal.aborted);
  } finally {
    await db.disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Push worker stopped. Inspect private configuration and sanitized job state.',
  );
  process.exitCode = 1;
});
