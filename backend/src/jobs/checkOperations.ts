import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadEnvironment } from '../configs/loadEnvironment';
import { createDatabase } from '../configs/database';
import { workerStatus } from '../services/workerStatus.service';
async function main() {
  const c = loadEnvironment(),
    db = createDatabase(c.databaseUrl);
  try {
    const database = await db.isReady();
    let storage = false,
      media = false;
    try {
      await access(c.storageRoot, constants.R_OK | constants.W_OK);
      storage = true;
    } catch {
      /* Not provisioned. */
    }
    try {
      await promisify(execFile)(c.ffprobePath, ['-version'], { timeout: 5000 });
      media = true;
    } catch {
      /* Missing media validator. */
    }
    const worker = database
      ? await workerStatus(db.prisma)
      : { status: 'unavailable' };
    console.log(
      JSON.stringify({
        database,
        privateStorage: storage,
        mediaValidator: media,
        deliveryWorker: worker.status,
        pushDispatch: c.push?.enabled ? 'enabled' : 'disabled',
      }),
    );
    if (!database || !storage || !media || worker.status !== 'running')
      process.exitCode = 1;
  } finally {
    await db.disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Operations check unavailable. No credentials or provider payloads were logged.',
  );
  process.exitCode = 1;
});
