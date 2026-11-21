import { syncRecipientInbox, receivedIntentScope } from './recipientInbox.service';
import { Prisma } from '@prisma/client';
import { lockMessage } from '../utils/lockMessage';
import { recordMessageEvent } from './messageEvent.service';
import type { PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import type { inboxList } from '../validators/inbox.validators';
import { ApiError } from '../utils/ApiError';
import { databaseTime } from '../utils/databaseTime';
import { publicAttachment, type AttachmentService } from './attachment.service';
const missing = () =>
  new ApiError(404, 'INBOX_NOT_FOUND', 'Delivered message is unavailable.');
export class InboxService {
  constructor(
    private readonly db: PrismaClient,
    private readonly media: AttachmentService,
  ) {}
  private async owned(userId: string, id: string) {
    const now = await databaseTime(this.db);
    const item = await this.db.inboxItem.findFirst({
      where: {
        id,
        userId,
        AND: [receivedIntentScope],
        deliveredAt: { lte: now },
        message: { scheduledFor: { lte: now } },
      },
      include: {
        message: {
          include: {
            owner: { select: { name: true } },
            attachments: { where: { state: 'READY' }, orderBy: { id: 'asc' } },
          },
        },
      },
    });
    if (!item) throw missing();
    return item;
  }
  async read(userId: string, id: string) {
    const item = await this.owned(userId, id);
    return {
      id: item.id,
      deliveredAt: item.deliveredAt,
      openedAt: item.openedAt,
      senderName: item.message.owner.name,
      senderIsSelf: item.message.ownerId === userId,
      subject: item.message.subject,
      text: item.message.text,
      occasion: item.message.occasion,
      scheduledFor: item.message.scheduledFor,
      timezone: item.message.scheduleTimezone,
      attachments: item.message.attachments.map(publicAttachment),
    };
  }
  async open(userId: string, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const time = await databaseTime(tx);
        const item = await tx.inboxItem.findFirst({
          where: {
            id,
            userId,
        AND: [receivedIntentScope],
                deliveredAt: { lte: time },
            message: { scheduledFor: { lte: time } },
          },
          include: { message: { select: { id: true, ownerId: true } } },
        });
        if (
          !item ||
          !(await lockMessage(tx, item.message.ownerId, item.messageId))
        )
          throw missing();
        const message = await tx.draftMessage.findUniqueOrThrow({
          where: { id: item.messageId },
          select: { status: true, version: true },
        });
        const now = await databaseTime(tx);
        const changed = await tx.inboxItem.updateMany({
          where: {
            id,
            userId,
        AND: [receivedIntentScope],
                openedAt: null,
            deliveredAt: { lte: now },
            message: { scheduledFor: { lte: now } },
          },
          data: { openedAt: now },
        });
        if (changed.count && item.externalClaimedAt) await tx.externalDelivery.updateMany({where:{intentId:item.intentId,openedAt:null},data:{openedAt:now}});
        if (changed.count)
          await recordMessageEvent(
            tx,
            item.messageId,
            'OPENED',
            message.status,
            message.version,
          );
        const saved = await tx.inboxItem.findFirst({
          where: { id, userId },
          select: { id: true, openedAt: true },
        });
        if (!saved) throw missing();
        return saved;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 15000,
        timeout: 15000,
      },
    );
  }
  async access(userId: string, id: string, attachmentId: string) {
    const item = await this.owned(userId, id);
    if (!item.message.attachments.some((a) => a.id === attachmentId)) throw missing();
    return this.media.access(item.message.ownerId, item.messageId, attachmentId);
  }
  async content(userId: string, id: string, attachmentId: string) {
    const item = await this.owned(userId, id);
    if (!item.message.attachments.some((a) => a.id === attachmentId))
      throw missing();
    return this.media.content(
      item.message.ownerId,
      item.messageId,
      attachmentId,
    );
  }
  async list(userId: string, input: z.infer<typeof inboxList>) {
    await syncRecipientInbox(this.db, userId);
    const now = await databaseTime(this.db),
      c = input.cursor;
    const rows = await this.db.inboxItem.findMany({
      where: {
        userId,
        AND: [receivedIntentScope],
        deliveredAt: { lte: now },
        message: { scheduledFor: { lte: now } },
        ...(c && {
          OR: [
            { deliveredAt: { lt: new Date(c.deliveredAt) } },
            { deliveredAt: new Date(c.deliveredAt), id: { lt: c.id } },
          ],
        }),
      },
      orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      select: {
        id: true,
        deliveredAt: true,
        message: {
          select: { subject: true, scheduledFor: true, scheduleTimezone: true },
        },
      },
    });
    const items = rows.slice(0, input.limit),
      last = items.at(-1);
    return {
      items: items.map((i) => ({
        id: i.id,
        deliveredAt: i.deliveredAt,
        subject: i.message.subject,
        scheduledFor: i.message.scheduledFor,
        timezone: i.message.scheduleTimezone,
      })),
      nextCursor:
        rows.length > input.limit && last
          ? Buffer.from(
              JSON.stringify({
                id: last.id,
                deliveredAt: last.deliveredAt.toISOString(),
              }),
            ).toString('base64url')
          : null,
    };
  }
}
