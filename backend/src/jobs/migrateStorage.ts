import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { loadEnvironment } from '../configs/loadEnvironment';
import { createDatabase } from '../configs/database';
import { LocalStorage } from '../providers/storage/local.storage';
import { createObjectStore } from '../providers/storage/createObjectStore';
async function main() {
  const c = loadEnvironment();
  if (
    process.argv.slice(2).join(' ') !== '--copy-local-to-neon' ||
    !c.remoteStorage ||
    !process.env.SOURCE_STORAGE_ROOT
  )
    throw Error();
  const db = createDatabase(c.databaseUrl),
    source = new LocalStorage(resolve(process.env.SOURCE_STORAGE_ROOT)),
    target = createObjectStore(c);
  let copied = 0,
    reused = 0;
  try {
    if (!(await target.ready?.())) throw Error();
    if (await db.prisma!.attachment.count({ where: { state: 'UPLOADING' } }))
      throw Error();
    let after: string | undefined;
    for (;;) {
      const rows = await db.prisma!.attachment.findMany({
        where: { state: { in: ['READY', 'UPLOADED'] } },
        orderBy: { id: 'asc' },
        take: 50,
        ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      for (const row of rows) {
        try {
          await target.prepare!(row.id, row.bytes, row.sha256);
          reused++;
          continue;
        } catch {
          /* Copy only a verified source; never remove it. */
        }
        const bytes = await readFile(source.path(row.id));
        if (
          bytes.length !== row.bytes ||
          !row.sha256 ||
          createHash('sha256').update(bytes).digest('hex') !== row.sha256
        )
          throw Error();
        const hash = await target.write(
          row.id,
          randomUUID(),
          Readable.from(bytes),
          row.bytes,
        );
        if (hash !== row.sha256) throw Error();
        copied++;
      }
      after = rows.at(-1)!.id;
    }
    console.log(JSON.stringify({ copied, reused, localFilesPreserved: true }));
  } finally {
    await db.disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Storage copy stopped. Keep writers stopped and inspect source availability/configuration; no private content was logged.',
  );
  process.exitCode = 1;
});
