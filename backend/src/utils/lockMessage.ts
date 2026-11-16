import type { Prisma } from '@prisma/client';
import { ApiError } from './ApiError';

/** Acquire a message row lock through schema-aware Prisma queries. Explicitly
 * preserving updatedAt avoids changing the review snapshot or message version.
 * A concurrent writer before the lock yields a conflict instead of stale data.
 */
export async function lockMessage(
  tx: Prisma.TransactionClient,
  ownerId: string,
  id: string,
) {
  const current = await tx.draftMessage.findFirst({
    where: { id, ownerId },
    select: { version: true, updatedAt: true },
  });
  if (!current) return false;
  const locked = await tx.draftMessage.updateMany({
    where: {
      id,
      ownerId,
      version: current.version,
      updatedAt: current.updatedAt,
    },
    data: { updatedAt: current.updatedAt },
  });
  if (locked.count !== 1)
    throw new ApiError(
      409,
      'VERSION_CONFLICT',
      'This message changed. Reload before continuing.',
    );
  return true;
}
