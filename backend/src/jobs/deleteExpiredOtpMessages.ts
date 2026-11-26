import type { PrismaClient } from '@prisma/client';
import type { WahaProvider } from '../providers/whatsapp/waha.provider';

/** Durable expiry sweep. A lease prevents overlapping workers revoking together. */
export async function deleteExpiredOtpMessages(
  db: PrismaClient,
  gateway: Pick<WahaProvider, 'scope' | 'deleteOtpMessage'>,
  now = new Date(),
) {
  const due = {
    deletionScope: gateway.scope,
    expiresAt: { lte: now, gt: new Date(now.getTime() - 24 * 60 * 60_000) },
    deleteAfter: { lte: now }, deletedAt: null,
    providerMessageId: { not: null }, deleteAttempts: { lt: 20 },
  };
  const rows = await db.otpChallenge.findMany({
    where: due, orderBy: { deleteAfter: 'asc' }, take: 3,
    select: { id: true, providerMessageId: true, deleteAttempts: true },
  });
  let deleted = 0, failed = 0;
  for (const row of rows) {
    const claimed = await db.otpChallenge.updateMany({
      where: { ...due, id: row.id, deleteAttempts: row.deleteAttempts },
      data: { deleteAttempts: { increment: 1 }, deleteAfter: new Date(now.getTime() + 120_000) },
    });
    if (!claimed.count) continue;
    let success = false;
    try { success = await gateway.deleteOtpMessage(row.providerMessageId!); }
    catch { /* Retry only this same deletion after the persisted lease expires. */ }
    if (success) {
      await db.otpChallenge.updateMany({
        where: { id: row.id, deletionScope: gateway.scope, deletedAt: null },
        data: { deletedAt: now, deleteAfter: null },
      });
      deleted++;
    } else failed++;
  }
  return { deleted, failed };
}
