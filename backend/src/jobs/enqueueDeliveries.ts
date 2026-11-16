import type { PrismaClient } from '@prisma/client';
import { databaseTime } from '../utils/databaseTime';
/** Idempotent catch-up scan; PostgreSQL schedules remain authoritative if this process stops. */
export async function enqueueDeliveries(db: PrismaClient, now?: Date) {
  const due = await db.draftMessage.findMany({
    where: {
      status: 'SCHEDULED',
      deliveryEnabled: true,
      scheduledFor: { lte: now ?? (await databaseTime(db)) },
    },
    orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
    take: 100,
    select: {
      id: true,
      version: true,
      scheduledFor: true,
      deliveryWork: {
        where: { state: { in: ['READY', 'RUNNING'] } },
        select: { scheduleVersion: true },
      },
    },
  });
  // A running claim changes the message status, allowing later due rows into the next bounded scan.
  const pending = due.filter(
    (m) => !m.deliveryWork.some((w) => w.scheduleVersion === m.version),
  );
  if (!pending.length) return 0;
  return (
    await db.deliveryWork.createMany({
      data: pending.map((m) => ({
        messageId: m.id,
        scheduleVersion: m.version,
        nextAttemptAt: m.scheduledFor!,
      })),
      skipDuplicates: true,
    })
  ).count;
}
