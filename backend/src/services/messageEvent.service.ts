import type { Prisma, MessageEventKind, MessageStatus } from '@prisma/client';
import { databaseTime } from '../utils/databaseTime';
/** Called only inside the transaction that owns the message mutation/row lock. */
export async function recordMessageEvent(
  tx: Prisma.TransactionClient,
  messageId: string,
  kind: MessageEventKind,
  state: MessageStatus,
  version: number,
) {
  await tx.messageEvent.create({
    data: {
      messageId,
      kind,
      state,
      version,
      occurredAt: await databaseTime(tx),
    },
  });
}
