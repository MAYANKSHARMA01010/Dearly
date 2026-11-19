import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BackupService } from '../src/services/backup.service';
import { postgresEnvironment } from '../src/providers/postgres/backup.provider';
const source = 'postgresql://owner:private-password@localhost/source',
  target = 'postgresql://owner:private-password@localhost/restored',
  key = 'c'.repeat(64),
  id = '00000000-0000-4000-8000-000000000001';
test('encrypted backup round trip includes private objects and rejects tampering before restore', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dearly-backup-test-'));
  try {
    const storage = join(root, 'storage');
    await mkdir(storage);
    await writeFile(join(storage, id), 'synthetic private photo');
    let restores = 0,
      emptyChecks = 0;
    const service = new BackupService(
      async (tool, _url, args) => {
        if (tool === 'pg_dump')
          await writeFile(
            args.find((a) => a.startsWith('--file='))!.slice(7),
            'PGDMPsynthetic private database',
          );
        else {
          restores++;
          assert.equal(
            (await readFile(args.at(-1)!)).toString(),
            'PGDMPsynthetic private database',
          );
          assert(args.includes('--single-transaction'));
          assert(!args.includes('--clean'));
        }
      },
      async () => {
        emptyChecks++;
      },
      async () => {},
    );
    const archive = join(root, 'backup.dearly');
    const result = await service.create(source, storage, archive, key);
    assert.equal(result.objects, 1);
    const bytes = await readFile(archive);
    assert(!bytes.includes(Buffer.from('synthetic private')));
    assert(!bytes.includes(Buffer.from('private-password')));
    await assert.rejects(service.create(source, storage, archive, key));
    assert.deepEqual(await readFile(archive), bytes);
    await assert.rejects(
      service.restore(
        archive,
        target,
        join(root, 'badkey'),
        source,
        storage,
        'd'.repeat(64),
      ),
    );
    assert.equal(restores, 0);
    assert.equal(emptyChecks, 0);
    const tampered = join(root, 'tampered.dearly');
    const altered = Buffer.from(bytes);
    altered[30] ^= 1;
    await writeFile(tampered, altered);
    await assert.rejects(
      service.restore(
        tampered,
        target,
        join(root, 'tampered'),
        source,
        storage,
        key,
      ),
    );
    assert.equal(restores, 0);
    await assert.rejects(
      service.restore(
        archive,
        source,
        join(root, 'same'),
        source,
        storage,
        key,
      ),
    );
    const restored = join(root, 'restored');
    await service.restore(archive, target, restored, source, storage, key);
    assert.equal(restores, 1);
    assert.equal(
      (await readFile(join(restored, id))).toString(),
      'synthetic private photo',
    );
    await assert.rejects(
      service.restore(archive, target, restored, source, storage, key),
    );
    assert.equal(restores, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('Postgres credentials stay out of argv and generic errors; passfiles cannot gain extra entries', () => {
  const { env, passwordLine } = postgresEnvironment(source, '/private/pass');
  assert.equal(env.PGPASSWORD, undefined);
  assert(!Object.values(env).includes('private-password'));
  assert(passwordLine.includes('private-password'));
  assert.equal(env.PGHOST, 'localhost');
  assert.throws(() =>
    postgresEnvironment(
      'postgresql://user:bad%0Ainjection@localhost/db',
      '/private/pass',
    ),
  );
});

test('failed SQL restore leaves a startup-blocking quarantine marker without enabling restored data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dearly-backup-failure-'));
  try {
    const storage = join(root, 'source'),
      restored = join(root, 'restored'),
      archive = join(root, 'backup.dearly');
    await mkdir(storage);
    let quarantined = false;
    const service = new BackupService(
      async (tool, _url, args) => {
        if (tool === 'pg_dump')
          await writeFile(
            args.find((a) => a.startsWith('--file='))!.slice(7),
            'PGDMPsynthetic',
          );
        else {
          assert(
            (await readFile(join(restored, '.restore-review-required')))
              .length > 0,
          );
          throw Error('Synthetic SQL failure');
        }
      },
      async () => {},
      async () => {
        quarantined = true;
      },
    );
    await service.create(source, storage, archive, key);
    await assert.rejects(
      service.restore(archive, target, restored, source, storage, key),
    );
    assert.equal(quarantined, false);
    assert(
      (await readFile(join(restored, '.restore-review-required'))).length > 0,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
