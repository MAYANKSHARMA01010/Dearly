import { createNotification } from './notification.service';
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
  const event = await tx.messageEvent.create({
    data: {
      messageId,
      kind,
      state,
      version,
      occurredAt: await databaseTime(tx),
    },
  });
  if (
    [
      'DELIVERED',
      'PARTIALLY_DELIVERED',
      'SUBMITTED',
      'PARTIALLY_SUBMITTED',
      'DELIVERY_UNKNOWN',
      'FAILED',
      'SMS_NOTIFICATION_DELIVERED',
      'SMS_NOTIFICATION_FAILED',
      'WHATSAPP_NOTIFICATION_DELIVERED',
      'WHATSAPP_NOTIFICATION_FAILED',
    ].includes(kind)
  ) {
    const message = await tx.draftMessage.findUniqueOrThrow({
      where: { id: messageId },
      select: { ownerId: true },
    });
    await createNotification(tx, {
      dedupeKey: `event:${event.id}`,
      userId: message.ownerId,
      kind,
      targetId: messageId,
      targetType: 'owned',
    });
  }
}
