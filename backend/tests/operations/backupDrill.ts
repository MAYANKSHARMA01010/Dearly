import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BackupService } from '../../src/services/backup.service';
let stage = 'configuration';
async function main() {
  const raw = process.env.DRILL_DATABASE_URL;
  if (
    !raw ||
    !['localhost', '127.0.0.1', '[::1]'].includes(new URL(raw).hostname)
  )
    throw Error('An isolated local drill database is required.');
  const seed = randomUUID().replaceAll('-', ''),
    sourceName = 'dearly_backup_source_' + seed,
    targetName = 'dearly_backup_target_' + seed;
  const source = new URL(raw),
    target = new URL(raw);
  source.pathname = '/' + sourceName;
  target.pathname = '/' + targetName;
  const admin = new PrismaClient({
      datasources: { db: { url: raw } },
      log: [],
      errorFormat: 'minimal',
    }),
    from = new PrismaClient({
      datasources: { db: { url: source.toString() } },
      log: [],
      errorFormat: 'minimal',
    }),
    to = new PrismaClient({
      datasources: { db: { url: target.toString() } },
      log: [],
      errorFormat: 'minimal',
    });
  const root = await mkdtemp(join(tmpdir(), 'dearly-restore-drill-')),
    storage = join(root, 'objects'),
    restored = join(root, 'restored'),
    archive = join(root, 'backup.dearly'),
    key = 'c'.repeat(64),
    id = '00000000-0000-4000-8000-000000000001';
  try {
    stage = 'create-isolated-databases';
    await admin.$executeRawUnsafe(`CREATE DATABASE "${sourceName}"`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${targetName}"`);
    stage = 'apply-migrations';
    await promisify(execFile)(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      {
        env: { ...process.env, DATABASE_URL: source.toString() },
        timeout: 60000,
      },
    );
    stage = 'seed-synthetic-data';
    const user = await from.user.create({
      data: { phone: '+12025550125', phoneVerifiedAt: new Date() },
    });
    await from.emailVerification.create({ data: { userId: user.id, email: 'casey@example.com', codeHash: 'a'.repeat(64), dispatchStatus: 'ACCEPTED', expiresAt: new Date(Date.now()+300000) } });
    await from.session.create({
      data: {
        userId: user.id,
        accessHash: randomUUID(),
        accessExpiresAt: new Date(Date.now() + 3600000),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await from.$executeRawUnsafe(
      'CREATE TABLE backup_drill (payload TEXT NOT NULL)',
    );
    await from.$executeRawUnsafe(
      'INSERT INTO backup_drill VALUES ($1)',
      'synthetic restored data',
    );
    await mkdir(storage);
    await writeFile(join(storage, id), 'synthetic private attachment');
    stage = 'create-encrypted-backup';
    await promisify(execFile)(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/jobs/manageBackup.ts',
        'create',
        archive,
        '--writers-stopped',
      ],
      {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          STORAGE_PROVIDER: 'local',
          DATABASE_URL: source.toString(),
          AUTH_MODE: 'disabled',
          STORAGE_ROOT: storage,
          BACKUP_ENCRYPTION_KEY: key,
        },
        timeout: 60000,
      },
    );
    stage = 'restore-encrypted-backup';
    const service = new BackupService();
    await service.restore(
      archive,
      target.toString(),
      restored,
      source.toString(),
      storage,
      key,
    );
    stage = 'verify-restored-data';
    assert.equal(await to.session.count({ where: { revokedAt: null } }), 0);
    stage = 'verify-email-proof-revocation';
    assert.equal(await to.emailVerification.count(), 1);
    assert.equal(await to.emailVerification.count({where:{consumedAt:null}}), 0);
    stage = 'verify-quarantine-marker';
    assert(
      (await readFile(join(restored, '.restore-review-required'))).length > 0,
    );
    stage = 'verify-restored-payload';
    const rows = await to.$queryRaw<
      { payload: string }[]
    >`SELECT payload FROM backup_drill`;
    assert.equal(rows[0].payload, 'synthetic restored data');
    stage = 'verify-restored-object';
    assert.equal(
      (await readFile(join(restored, id))).toString(),
      'synthetic private attachment',
    );
    stage = 'verify-restored-migrations';
    const migrations = await to.$queryRaw<
      { count: bigint }[]
    >`SELECT COUNT(*) AS count FROM _prisma_migrations`;
    assert(migrations[0].count > 0n);
    stage = 'verify-occupied-target-refusal';
    await assert.rejects(
      service.restore(
        archive,
        target.toString(),
        join(root, 'empty'),
        source.toString(),
        storage,
        key,
      ),
    );
    console.log(
      JSON.stringify({
        encryptedBackup: true,
        realPostgresRestore: true,
        privateAttachmentRestored: true,
        appliedMigrationsRestored: Number(migrations[0].count),
        nonEmptyTargetRefused: true,
        restoredSessionsRevoked: true,
        restoredEmailChallengesConsumed: true,
        quarantineMarkerCreated: true,
        liveDataUsed: false,
      }),
    );
  } finally {
    await from.$disconnect();
    await to.$disconnect();
    await admin.$executeRawUnsafe(
      `DROP DATABASE IF EXISTS "${sourceName}" WITH (FORCE)`,
    );
    await admin.$executeRawUnsafe(
      `DROP DATABASE IF EXISTS "${targetName}" WITH (FORCE)`,
    );
    await admin.$disconnect();
    await rm(root, { recursive: true, force: true });
  }
}
void main().catch(() => {
  console.error('Isolated backup/restore drill failed at ' + stage + '. No live data was used.');
  process.exitCode = 1;
});
