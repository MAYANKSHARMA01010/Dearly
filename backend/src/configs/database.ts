import { PrismaClient } from '@prisma/client';

export interface Database {
  isReady(): Promise<boolean>;
  disconnect(): Promise<void>;
}

export function createDatabase(databaseUrl: string): Database {
  const url = new URL(databaseUrl);
  // Bound cold-start/outage checks; preserve supplied SSL and pooling parameters.
  for (const key of ['connect_timeout', 'pool_timeout', 'socket_timeout']) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, '5');
  }
  const prisma = new PrismaClient({
    datasources: { db: { url: url.toString() } },
    log: [],
    errorFormat: 'minimal',
  });
  let pendingCheck: Promise<boolean> | undefined;
  return {
    isReady() {
      // Concurrent probes share one query instead of amplifying a database outage.
      pendingCheck ??= prisma.$queryRaw`SELECT 1`
        .then(() => true, () => false)
        .finally(() => { pendingCheck = undefined; });
      return pendingCheck;
    },
    async disconnect() {
      await prisma.$disconnect();
    },
  };
}
