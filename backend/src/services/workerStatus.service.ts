import type { PrismaClient } from '@prisma/client';
import { databaseTime } from '../utils/databaseTime';
import { deliveryPolicy } from '../workers/deliveryWorker';
export async function workerStatus(db?: PrismaClient) {
  if (!db) return { status: 'unavailable' as const };
  const now = await databaseTime(db);
  const online = await db.workerHeartbeat.findFirst({
    where: {
      stoppedAt: null,
      lastSeenAt: { gte: new Date(now.getTime() - deliveryPolicy.heartbeatMs) },
    },
    select: { lastSeenAt: true },
    orderBy: { lastSeenAt: 'desc' },
  });
  return { status: online ? ('running' as const) : ('offline' as const) };
}
