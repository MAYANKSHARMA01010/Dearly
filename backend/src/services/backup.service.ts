import {
  objectPath,
  type ObjectStore,
} from '../providers/storage/local.storage';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { createReadStream, createWriteStream, constants } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  open,
  writeFile,
  appendFile,
  readdir,
  lstat,
  stat,
  rm,
  copyFile,
  chmod,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  postgresTool,
  assertEmptyDatabase,
  sameDatabase,
  quarantineRestoredDatabase,
} from '../providers/postgres/backup.provider';
const magic = Buffer.from('DEARLYBK1');
type Entry = { name: string; bytes: number; sha256: string };
const hash = async (path: string) => {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest('hex');
};
function keyBuffer(key: string) {
  if (!/^[0-9a-f]{64}$/.test(key))
    throw Error('A separate backup encryption key is required.');
  return Buffer.from(key, 'hex');
}
async function temporary() {
  const p = await mkdtemp(join(tmpdir(), 'dearly-backup-'));
  await chmod(p, 0o700);
  return p;
}
async function emptyStorage(path: string) {
  try {
    if (!(await lstat(path)).isDirectory() || (await readdir(path)).length)
      throw Error('Restore storage must be an empty directory.');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}
async function encrypt(input: string, output: string, key: Buffer) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  await writeFile(output, Buffer.concat([magic, iv]), {
    flag: 'wx',
    mode: 0o600,
  });
  try {
    await pipeline(
      createReadStream(input),
      cipher,
      createWriteStream(output, { flags: 'a' }),
    );
    await appendFile(output, cipher.getAuthTag());
  } catch (e) {
    await rm(output, { force: true });
    throw e;
  }
}
async function decrypt(input: string, output: string, key: Buffer) {
  const info = await stat(input);
  if (info.size < magic.length + 29) throw Error('Backup archive invalid.');
  const file = await open(input, 'r');
  try {
    const prefix = Buffer.alloc(magic.length + 12),
      tag = Buffer.alloc(16);
    await file.read(prefix, 0, prefix.length, 0);
    await file.read(tag, 0, 16, info.size - 16);
    if (!prefix.subarray(0, magic.length).equals(magic))
      throw Error('Backup archive invalid.');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      prefix.subarray(magic.length),
    );
    decipher.setAuthTag(tag);
    await pipeline(
      createReadStream(input, { start: prefix.length, end: info.size - 17 }),
      decipher,
      createWriteStream(output, { flags: 'wx', mode: 0o600 }),
    );
  } finally {
    await file.close();
  }
}
export class BackupService {
  constructor(
    private tool = postgresTool,
    private assertEmpty = assertEmptyDatabase,
    private quarantine = quarantineRestoredDatabase,
  ) {}
  async create(
    sourceUrl: string,
    storageRoot: string,
    output: string,
    key: string,
    remoteStore?: ObjectStore,
  ) {
    const encryption = keyBuffer(key),
      temp = await temporary();
    let created = false;
    try {
      const payload = join(temp, 'payload');
      await mkdir(join(payload, 'objects'), { recursive: true, mode: 0o700 });
      await this.tool('pg_dump', sourceUrl, [
        '--format=custom',
        '--no-owner',
        '--no-acl',
        '--file=' + join(payload, 'database.dump'),
      ]);
      const dumpHeader = await open(join(payload, 'database.dump'), 'r');
      try {
        const b = Buffer.alloc(5);
        await dumpHeader.read(b, 0, 5, 0);
        if (b.toString() !== 'PGDMP') throw Error('Database archive invalid.');
      } finally {
        await dumpHeader.close();
      }
      const names = ['database.dump'];
      const objects = remoteStore
        ? await remoteStore.entries()
        : (await readdir(storageRoot)).map((key) => ({
            key,
            bytes: undefined as number | undefined,
          }));
      for (const object of objects) {
        const name = object.key;
        if (/^[0-9a-f-]{36}\.[0-9a-f-]{36}\.part$/.test(name)) continue;
        if (!/^[0-9a-f-]{36}$/.test(name))
          throw Error('Unexpected object in private storage.');
        const source = remoteStore
          ? await objectPath(remoteStore, name, object.bytes ?? 0)
          : join(storageRoot, name);
        if (!(await lstat(source)).isFile())
          throw Error('Unexpected object in private storage.');
        await copyFile(
          source,
          join(payload, 'objects', name),
          constants.COPYFILE_EXCL,
        );
        await chmod(join(payload, 'objects', name), 0o600);
        names.push('objects/' + name);
      }
      const entries: Entry[] = [];
      for (const name of names)
        entries.push({
          name,
          bytes: (await stat(join(payload, name))).size,
          sha256: await hash(join(payload, name)),
        });
      const manifest = Buffer.from(JSON.stringify({ version: 1, entries }));
      if (manifest.length > 16 * 1024 * 1024)
        throw Error('Backup manifest too large.');
      const length = Buffer.alloc(4);
      length.writeUInt32BE(manifest.length);
      const bundle = join(temp, 'bundle');
      await writeFile(bundle, Buffer.concat([length, manifest]), {
        mode: 0o600,
      });
      for (const name of names)
        await pipeline(
          createReadStream(join(payload, name)),
          createWriteStream(bundle, { flags: 'a' }),
        );
      await encrypt(bundle, output, encryption);
      created = true;
      const result = {
        version: 1,
        objects: entries.length - 1,
        bytes: (await stat(output)).size,
        sha256: await hash(output),
      };
      await writeFile(
        output + '.json',
        JSON.stringify(result, null, 2) + '\n',
        { flag: 'wx', mode: 0o600 },
      );
      return result;
    } catch (e) {
      if (created) await rm(output, { force: true });
      throw e;
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
  async restore(
    archive: string,
    targetUrl: string,
    targetStorage: string,
    sourceUrl: string,
    sourceStorage: string,
    key: string,
  ) {
    if (
      sameDatabase(targetUrl, sourceUrl) ||
      resolve(targetStorage) === resolve(sourceStorage)
    )
      throw Error('Restore targets must be separate from live data.');
    const temp = await temporary();
    try {
      const bundle = join(temp, 'bundle');
      await decrypt(archive, bundle, keyBuffer(key));
      const file = await open(bundle, 'r');
      let entries: Entry[];
      let offset: number;
      try {
        const size = Buffer.alloc(4);
        await file.read(size, 0, 4, 0);
        const length = size.readUInt32BE();
        if (length > 16 * 1024 * 1024 || length < 2)
          throw Error('Backup manifest invalid.');
        const data = Buffer.alloc(length);
        await file.read(data, 0, length, 4);
        const m = JSON.parse(data.toString());
        if (
          m.version !== 1 ||
          !Array.isArray(m.entries) ||
          m.entries.length < 1 ||
          m.entries.length > 100001
        )
          throw Error('Backup manifest invalid.');
        entries = m.entries;
        offset = length + 4;
      } finally {
        await file.close();
      }
      const seen = new Set<string>();
      for (const entry of entries) {
        if (
          typeof entry.name !== 'string' ||
          !/^(database\.dump|objects\/[0-9a-f-]{36})$/.test(entry.name) ||
          seen.has(entry.name) ||
          !Number.isSafeInteger(entry.bytes) ||
          entry.bytes < 1 ||
          !/^[0-9a-f]{64}$/.test(entry.sha256)
        )
          throw Error('Backup entries invalid.');
        seen.add(entry.name);
        const path = join(temp, 'payload', entry.name);
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        await pipeline(
          createReadStream(bundle, {
            start: offset,
            end: offset + entry.bytes - 1,
          }),
          createWriteStream(path, { flags: 'wx', mode: 0o600 }),
        );
        if (
          (await stat(path)).size !== entry.bytes ||
          (await hash(path)) !== entry.sha256
        )
          throw Error('Backup checksum invalid.');
        offset += entry.bytes;
      }
      if (!seen.has('database.dump') || offset !== (await stat(bundle)).size)
        throw Error('Backup payload invalid.');
      await emptyStorage(targetStorage);
      await this.assertEmpty(targetUrl);
      await mkdir(targetStorage, { recursive: true, mode: 0o700 });
      await writeFile(
        join(targetStorage, '.restore-review-required'),
        'Restored data is quarantined. Review sessions, budgets and schedules before enabling services.\n',
        { flag: 'wx', mode: 0o600 },
      );
      await this.tool('pg_restore', targetUrl, [
        '--exit-on-error',
        '--single-transaction',
        '--no-owner',
        '--no-acl',
        join(temp, 'payload', 'database.dump'),
      ]);
      await mkdir(targetStorage, { recursive: true, mode: 0o700 });
      for (const entry of entries.filter((e) => e.name.startsWith('objects/')))
        await copyFile(
          join(temp, 'payload', entry.name),
          join(targetStorage, entry.name.slice(8)),
          constants.COPYFILE_EXCL,
        );
      await this.quarantine(targetUrl);
      return { restored: true, objects: entries.length - 1, quarantined: true };
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
}
