import { Prisma, type PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import type {
  mailboxQuery,
  historyQuery,
} from '../validators/mailbox.validators';
import { publicDraft } from './draft.service';
import { publicAttachment } from './attachment.service';
import { databaseTime } from '../utils/databaseTime';
import { ApiError } from '../utils/ApiError';
const unavailable = () =>
  new ApiError(404, 'MESSAGE_NOT_FOUND', 'Message is unavailable.');
const sent: Prisma.DraftMessageWhereInput = {
  OR: [
    { inboxItems: { some: { intent: { channel: 'IN_APP' } } } },
    {
      deliveryIntents: {
        some: { channel: 'IN_APP', attempts: { some: { state: 'SUCCEEDED' } } },
      },
    },
  ],
};
export class MailboxService {
  constructor(private readonly db: PrismaClient) {}
  private snapshot<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 15000,
      timeout: 15000,
    });
  }
  async dashboard(ownerId: string) {
    return this.snapshot(async (tx) => {
      const now = await databaseTime(tx);
      const due = {
        userId: ownerId,
        intent: { channel: 'IN_APP' as const },
        deliveredAt: { lte: now },
        message: { scheduledFor: { lte: now } },
      };
      const [states, sentCount, received, unopened] = await Promise.all([
        tx.draftMessage.groupBy({
          by: ['status'],
          where: { ownerId },
          _count: true,
        }),
        tx.draftMessage.count({ where: { ownerId, ...sent } }),
        tx.inboxItem.count({ where: due }),
        tx.inboxItem.count({ where: { ...due, openedAt: null } }),
      ]);
      const count = (s: string) =>
        states.find((r) => r.status === s)?._count ?? 0;
      return {
        asOf: now,
        counts: {
          created: states.reduce((n, r) => n + r._count, 0),
          scheduled: count('SCHEDULED'),
          sent: sentCount,
          received,
          drafts: count('DRAFT'),
          failed: count('FAILED') + count('PARTIALLY_DELIVERED'),
        },
        unopened,
      };
    });
  }
  async list(ownerId: string, input: z.infer<typeof mailboxQuery>) {
    return this.snapshot(async (tx) => {
      const now = await databaseTime(tx),
        c = input.cursor;
      const cursorFor = (at: Date, id: string) =>
        Buffer.from(
          JSON.stringify({
            box: input.box,
            status: input.status ?? null,
            read: input.read,
            at: at.toISOString(),
            id,
          }),
        ).toString('base64url');
      if (input.box === 'received') {
        const rows = await tx.inboxItem.findMany({
          where: {
            userId: ownerId,
            intent: { channel: 'IN_APP' },
            deliveredAt: { lte: now },
            message: { scheduledFor: { lte: now } },
            ...(input.read === 'opened'
              ? { openedAt: { not: null } }
              : input.read === 'unopened'
                ? { openedAt: null }
                : {}),
            ...(c && {
              OR: [
                { deliveredAt: { lt: new Date(c.at) } },
                { deliveredAt: new Date(c.at), id: { lt: c.id } },
              ],
            }),
          },
          orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }],
          take: input.limit + 1,
          select: {
            id: true,
            deliveredAt: true,
            openedAt: true,
            message: {
              select: {
                subject: true,
                scheduledFor: true,
                scheduleTimezone: true,
              },
            },
          },
        });
        const page = rows.slice(0, input.limit),
          last = page.at(-1);
        return {
          asOf: now,
          items: page.map((i) => ({
            id: i.id,
            role: 'received',
            subject: i.message.subject,
            status: i.openedAt ? 'OPENED' : 'RECEIVED',
            timestamp: i.deliveredAt,
            scheduledFor: i.message.scheduledFor,
            timezone: i.message.scheduleTimezone,
            recipientCount: null,
            deliveryEnabled: null,
          })),
          nextCursor:
            rows.length > input.limit && last
              ? cursorFor(last.deliveredAt, last.id)
              : null,
        };
      }
      const scope: Prisma.DraftMessageWhereInput =
        input.box === 'scheduled'
          ? { status: 'SCHEDULED' }
          : input.box === 'drafts'
            ? { status: 'DRAFT' }
            : input.box === 'failed'
              ? { status: { in: ['FAILED', 'PARTIALLY_DELIVERED'] } }
              : input.box === 'sent'
                ? sent
                : {};
      const rows = await tx.draftMessage.findMany({
        where: {
          ownerId,
          AND: [
            scope,
            ...(input.status ? [{ status: input.status }] : []),
            ...(c
              ? [
                  {
                    OR: [
                      { createdAt: { lt: new Date(c.at) } },
                      { createdAt: new Date(c.at), id: { lt: c.id } },
                    ],
                  },
                ]
              : []),
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        select: {
          id: true,
          subject: true,
          status: true,
          createdAt: true,
          scheduledFor: true,
          scheduleTimezone: true,
          deliveryEnabled: true,
          _count: { select: { recipients: true } },
        },
      });
      const page = rows.slice(0, input.limit),
        last = page.at(-1);
      return {
        asOf: now,
        items: page.map((m) => ({
          id: m.id,
          role: 'owned',
          subject: m.subject,
          status: m.status,
          timestamp: m.createdAt,
          scheduledFor: m.scheduledFor,
          timezone: m.scheduleTimezone,
          recipientCount: m._count.recipients,
          deliveryEnabled: m.deliveryEnabled,
        })),
        nextCursor:
          rows.length > input.limit && last
            ? cursorFor(last.createdAt, last.id)
            : null,
      };
    });
  }
  private async events(
    tx: Prisma.TransactionClient,
    messageId: string,
    input: z.infer<typeof historyQuery>,
  ) {
    const boundary = input.cursor
      ? await tx.messageEvent.findFirst({
          where: { id: input.cursor, messageId },
          select: { sequence: true },
        })
      : null;
    if (input.cursor && !boundary)
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'This history cursor is unavailable. Reload the message.',
      );
    const rows = await tx.messageEvent.findMany({
      where: {
        messageId,
        ...(boundary && { sequence: { lt: boundary.sequence } }),
      },
      orderBy: { sequence: 'desc' },
      take: input.limit + 1,
      select: {
        id: true,
        kind: true,
        state: true,
        version: true,
        occurredAt: true,
      },
    });
    const items = rows.slice(0, input.limit);
    return {
      items,
      nextCursor: rows.length > input.limit ? items.at(-1)!.id : null,
    };
  }
  async history(
    ownerId: string,
    id: string,
    input: z.infer<typeof historyQuery>,
  ) {
    return this.snapshot(async (tx) => {
      if (
        !(await tx.draftMessage.findFirst({
          where: { id, ownerId },
          select: { id: true },
        }))
      )
        throw unavailable();
      return this.events(tx, id, input);
    });
  }
  async read(ownerId: string, id: string) {
    return this.snapshot(async (tx) => {
      const message = await tx.draftMessage.findFirst({
        where: { id, ownerId },
        include: {
          recipients: { orderBy: { position: 'asc' } },
          attachments: { where: { state: 'READY' }, orderBy: { id: 'asc' } },
          deliveryIntents: {
            include: {
              inboxItem: { select: { deliveredAt: true, openedAt: true } },
              attempts: {
                orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
                take: 1,
                select: {
                  state: true,
                  number: true,
                  errorCode: true,
                  startedAt: true,
                  finishedAt: true,
                },
              },
            },
          },
        },
      });
      if (!message) throw unavailable();
      return {
        ...publicDraft(message),
        scheduledFor: message.scheduledFor,
        timezone: message.scheduleTimezone,
        localDateTime: message.scheduleLocalDateTime,
        canceledAt: message.canceledAt,
        deliveryEnabled: message.deliveryEnabled,
        attachments: message.attachments.map(publicAttachment),
        deliveries: message.deliveryIntents.map((i) => {
          const a = i.attempts[0],
            supported = i.channel === 'IN_APP';
          const confirmed =
            supported && (Boolean(i.inboxItem) || a?.state === 'SUCCEEDED');
          return {
            recipientId: i.recipientId,
            channel: i.channel,
            outcome: !supported
              ? 'UNAVAILABLE'
              : confirmed
                ? 'DELIVERED'
                : a?.state === 'PERMANENT_FAILED' ||
                    ['FAILED', 'PARTIALLY_DELIVERED'].includes(message.status)
                  ? 'FAILED'
                  : a?.state === 'RETRYABLE_FAILED'
                    ? 'RETRYING'
                    : message.status === 'DISPATCHING'
                      ? 'DISPATCHING'
                      : 'PENDING',
            deliveredAt: confirmed
              ? (i.inboxItem?.deliveredAt ?? a?.finishedAt ?? null)
              : null,
            openedAt: supported ? (i.inboxItem?.openedAt ?? null) : null,
            attempt:
              supported && a
                ? {
                    ...a,
                    errorCode:
                      a.errorCode &&
                      [
                        'STORAGE_UNAVAILABLE',
                        'ATTACHMENTS_NOT_READY',
                        'INTERNAL',
                        'RECIPIENT_UNAVAILABLE',
                        'LEASE_EXPIRED',
                        'ATTEMPTS_EXHAUSTED',
                      ].includes(a.errorCode)
                        ? a.errorCode
                        : null,
                  }
                : null,
          };
        }),
        history: await this.events(tx, id, { limit: 20 }),
      };
    });
  }
}
