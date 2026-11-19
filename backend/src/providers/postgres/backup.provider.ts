import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
export function postgresEnvironment(value: string, passfile: string) {
  const u = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(u.protocol) ||
    !u.hostname ||
    !u.username ||
    !u.pathname.slice(1)
  )
    throw Error('Invalid database configuration.');
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  Object.assign(env, {
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    PGUSER: decodeURIComponent(u.username),
    PGPASSFILE: passfile,
    PGCONNECT_TIMEOUT: '10',
  });
  for (const [query, key] of [
    ['sslmode', 'PGSSLMODE'],
    ['channel_binding', 'PGCHANNELBINDING'],
    ['sslrootcert', 'PGSSLROOTCERT'],
  ])
    if (u.searchParams.has(query)) env[key] = u.searchParams.get(query)!;
  if (
    [
      env.PGHOST,
      env.PGPORT,
      env.PGDATABASE,
      env.PGUSER,
      decodeURIComponent(u.password),
    ].some((v) => /[\r\n\0]/.test(v!))
  )
    throw Error('Invalid database configuration.');
  const escape = (s: string) =>
    s.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
  return {
    env,
    passwordLine:
      [
        env.PGHOST,
        env.PGPORT,
        env.PGDATABASE,
        env.PGUSER,
        decodeURIComponent(u.password),
      ]
        .map((v) => escape(v!))
        .join(':') + '\n',
  };
}
export async function postgresTool(
  tool: 'pg_dump' | 'pg_restore',
  databaseUrl: string,
  args: string[],
) {
  const temp = await mkdtemp(join(tmpdir(), 'dearly-pgpass-'));
  try {
    const { env, passwordLine } = postgresEnvironment(
      databaseUrl,
      join(temp, 'pass'),
    );
    await writeFile(join(temp, 'pass'), passwordLine, { mode: 0o600 });
    await promisify(execFile)(
      process.env[tool === 'pg_dump' ? 'PG_DUMP_BIN' : 'PG_RESTORE_BIN'] ||
        tool,
      tool === 'pg_restore' ? ['--dbname=' + env.PGDATABASE, ...args] : args,
      { env, timeout: 1800000, maxBuffer: 1024 * 1024 },
    );
  } catch {
    throw Error(
      'PostgreSQL backup/restore tool failed. No connection details were logged.',
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
export async function assertEmptyDatabase(url: string) {
  const db = new PrismaClient({
    datasources: { db: { url } },
    log: [],
    errorFormat: 'minimal',
  });
  try {
    const rows = await db.$queryRaw<
      { occupied: boolean }[]
    >`SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema') OR EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema') AS occupied`;
    if (rows[0]?.occupied !== false)
      throw Error('Restore target must be empty.');
  } finally {
    await db.$disconnect();
  }
}
export function sameDatabase(a: string, b: string) {
  const x = new URL(a),
    y = new URL(b);
  return (
    x.hostname === y.hostname &&
    (x.port || '5432') === (y.port || '5432') &&
    x.pathname === y.pathname
  );
}

export async function quarantineRestoredDatabase(url: string) {
  const db = new PrismaClient({
    datasources: { db: { url } },
    log: [],
    errorFormat: 'minimal',
  });
  try {
    await db.$transaction(
      async (tx) => {
        const now = new Date();
        await tx.session.updateMany({
          where: { revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.otpChallenge.updateMany({
          where: { consumedAt: null },
          data: { consumedAt: now },
        });
        await tx.pushDevice.updateMany({ data: { disabledAt: now } });
        await tx.pushJob.updateMany({
          where: { state: { in: ['READY', 'SUBMITTING'] } },
          data: { state: 'UNKNOWN', errorCode: 'RESTORE_REVIEW' },
        });
        await tx.draftMessage.updateMany({
          where: { status: { in: ['SCHEDULED', 'DISPATCHING'] } },
          data: { deliveryEnabled: false },
        });
        await tx.deliveryWork.updateMany({
          where: { state: { in: ['READY', 'RUNNING'] } },
          data: {
            state: 'FAILED',
            lastError: 'RESTORE_REVIEW',
            leaseToken: null,
            leaseExpiresAt: null,
          },
        });
        await tx.externalDelivery.updateMany({
          where: { state: 'SUBMITTING' },
          data: { state: 'UNKNOWN', errorCode: 'RESTORE_REVIEW' },
        });
        await tx.externalDelivery.updateMany({
          where: { revokedAt: null },
          data: { revokedAt: now },
        });
      },
      { timeout: 30000 },
    );
  } finally {
    await db.$disconnect();
  }
}
