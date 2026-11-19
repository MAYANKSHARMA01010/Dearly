import Redis from 'ioredis';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadEnvironment } from '../configs/loadEnvironment';
import { createDatabase } from '../configs/database';
import { createObjectStore } from '../providers/storage/createObjectStore';
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
      storage =
        !c.remoteStorage || Boolean(await createObjectStore(c).ready?.());
    } catch {
      /* Not provisioned. */
    }
    try {
      await promisify(execFile)(c.ffprobePath, ['-version'], { timeout: 5000 });
      media = true;
    } catch {
      /* Missing media validator. */
    }
    let redis: 'ready' | 'unavailable' | 'not-configured' = 'not-configured';
    if (c.redisUrl) {
      const client = new Redis(c.redisUrl, {
        lazyConnect: true,
        connectTimeout: 5000,
        commandTimeout: 5000,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      client.on('error', () => {});
      try {
        await client.connect();
        redis = (await client.ping()) === 'PONG' ? 'ready' : 'unavailable';
      } catch {
        redis = 'unavailable';
      } finally {
        client.disconnect();
      }
    }
    const worker = database
      ? await workerStatus(db.prisma)
      : { status: 'unavailable' };
    console.log(
      JSON.stringify({
        database,
        redis,
        privateStorage: storage,
        mediaValidator: media,
        deliveryWorker: worker.status,
        pushDispatch: c.push?.enabled ? 'enabled' : 'disabled',
      }),
    );
    if (
      !database ||
      !storage ||
      !media ||
      worker.status !== 'running' ||
      redis === 'unavailable'
    )
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
