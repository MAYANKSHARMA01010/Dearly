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
        deliveredAt: { lte: now },
        message: { scheduledFor: { lte: now } },
      },
      include: {
        message: {
          include: {
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
      subject: item.message.subject,
      text: item.message.text,
      occasion: item.message.occasion,
      scheduledFor: item.message.scheduledFor,
      timezone: item.message.scheduleTimezone,
      attachments: item.message.attachments.map(publicAttachment),
    };
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
    const now = await databaseTime(this.db),
      c = input.cursor;
    const rows = await this.db.inboxItem.findMany({
      where: {
        userId,
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
