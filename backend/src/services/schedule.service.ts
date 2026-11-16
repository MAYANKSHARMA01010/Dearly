import { lockMessage } from '../utils/lockMessage';
import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { z } from 'zod';
import type {
  ScheduleChoice,
  RescheduleChoice,
  ScheduleEdit,
  scheduleList,
} from '../validators/schedule.validators';
import { publicDraft } from './draft.service';
import { publicAttachment } from './attachment.service';
import { resolveScheduleTime } from '../utils/scheduleTime';
import { ApiError } from '../utils/ApiError';
const include = {
  recipients: { orderBy: { position: 'asc' as const } },
  attachments: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  deliveryIntents: {
    orderBy: [{ recipientId: 'asc' as const }, { channel: 'asc' as const }],
  },
};
type Message = Prisma.DraftMessageGetPayload<{ include: typeof include }>;
const missing = () =>
  new ApiError(404, 'SCHEDULE_NOT_FOUND', 'Message is unavailable.');
const conflict = () =>
  new ApiError(
    409,
    'VERSION_CONFLICT',
    'This message changed. Reload before continuing.',
  );
const stateError = () =>
  new ApiError(
    409,
    'SCHEDULE_STATE',
    'This message is not in the required state. Reload it.',
  );
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const scheduleCapabilities = {
  backgroundDelivery: true,
  channels: [
    { channel: 'IN_APP', available: true, mode: 'DATABASE' },
    { channel: 'WHATSAPP', available: false },
    { channel: 'SMS', available: false },
    { channel: 'EMAIL', available: false },
  ],
};
export function publicSchedule(message: Message) {
  return {
    ...publicDraft(message),
    deliveryEnabled: message.deliveryEnabled,
    scheduledFor: message.scheduledFor,
    timezone: message.scheduleTimezone,
    localDateTime: message.scheduleLocalDateTime,
    canceledAt: message.canceledAt,
    attachments: message.attachments
      .filter((a) => a.state === 'READY')
      .map(publicAttachment),
    deliveries: message.deliveryIntents.map((i) => ({
      recipientId: i.recipientId,
      channel: i.channel,
    })),
    backgroundDelivery: true,
  };
}
export class ScheduleService {
  private readonly key: Buffer;
  constructor(
    private readonly db: PrismaClient,
    secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.key = createHmac('sha256', secret)
      .update('dearly.schedule.review.v1')
      .digest();
  }
  private tx<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 15000,
      timeout: 15000,
    });
  }
  private async locked(
    tx: Prisma.TransactionClient,
    ownerId: string,
    id: string,
  ) {
    if (!(await lockMessage(tx, ownerId, id))) throw missing();
    return tx.draftMessage.findUniqueOrThrow({ where: { id }, include });
  }
  private version(message: Message, version: number) {
    if (message.version !== version) throw conflict();
  }
  private async ready(
    tx: Prisma.TransactionClient,
    message: Message,
    deliveries: ScheduleChoice['deliveries'],
  ) {
    if (
      !message.text.trim() &&
      !message.attachments.some((a) => a.state === 'READY')
    )
      throw new ApiError(
        400,
        'MESSAGE_EMPTY',
        'Add message text or a ready attachment before scheduling.',
      );
    if (message.attachments.some((a) => a.state !== 'READY'))
      throw new ApiError(
        409,
        'ATTACHMENTS_NOT_READY',
        'Finish or remove every pending attachment before scheduling.',
      );
    if (!message.recipients.length)
      throw new ApiError(
        400,
        'INVALID_DELIVERIES',
        'Choose at least one recipient.',
      );
    const ids = new Set(deliveries.map((d) => d.recipientId));
    if (
      ids.size !== deliveries.length ||
      deliveries.length !== message.recipients.length ||
      message.recipients.some((r) => !ids.has(r.id))
    )
      throw new ApiError(
        400,
        'INVALID_DELIVERIES',
        'Choose a delivery channel for every recipient exactly once.',
      );
    if (
      deliveries.some(
        (d) => d.channels.length !== 1 || d.channels[0] !== 'IN_APP',
      ) ||
      message.recipients.some(
        (r) => !['SELF', 'USER', 'PHONE'].includes(r.type),
      )
    )
      throw new ApiError(
        400,
        'CHANNEL_UNAVAILABLE',
        'Only in-app delivery to verified Dearly accounts is available. SMS, WhatsApp and email are not enabled.',
      );
    // A phone is resolved only to a verified current account. Confirmation binds
    // that account permanently; dispatch never redirects a recycled number.
    const users = await tx.user.findMany({
      where: {
        phoneVerifiedAt: { lte: this.now() },
        OR: [
          {
            id: {
              in: message.recipients.flatMap((r) =>
                r.targetUserId ? [r.targetUserId] : [],
              ),
            },
          },
          {
            phone: {
              in: message.recipients.flatMap((r) =>
                r.type === 'PHONE' && r.phone ? [r.phone] : [],
              ),
            },
          },
        ],
      },
      select: { id: true, phone: true },
    });
    const bindings = message.recipients.map((r) => {
      const user =
        r.type === 'PHONE'
          ? users.find(
              (u) =>
                u.phone === r.phone &&
                (message.status === 'DRAFT' || u.id === r.targetUserId),
            )
          : users.find((u) => u.id === r.targetUserId);
      if (!user)
        throw new ApiError(
          400,
          'INVALID_RECIPIENTS',
          'An in-app recipient is unavailable. Update recipients in drafts.',
        );
      return { recipientId: r.id, userId: user.id };
    });
    if (new Set(bindings.map((b) => b.userId)).size !== bindings.length)
      throw new ApiError(
        400,
        'INVALID_RECIPIENTS',
        'Choose each in-app recipient only once. Remove duplicate account destinations.',
      );
    return bindings;
  }
  private choices(message: Message) {
    return message.recipients.map((r) => ({
      recipientId: r.id,
      channels: message.deliveryIntents
        .filter((i) => i.recipientId === r.id)
        .map((i) => i.channel),
    }));
  }
  private fingerprint(
    message: Message,
    choice: ScheduleChoice | RescheduleChoice,
    mode: string,
    deliveries: ScheduleChoice['deliveries'],
    bindings: { recipientId: string; userId: string }[],
  ) {
    return digest(
      JSON.stringify({
        mode,
        message: publicDraft(message),
        ownerId: message.ownerId,
        deliveryEnabled: message.deliveryEnabled,
        bindings,
        attachments: message.attachments.map((a) => ({
          id: a.id,
          state: a.state,
          sha256: a.sha256,
          bytes: a.bytes,
        })),
        time: resolveScheduleTime(
          choice.localDateTime,
          choice.timezone,
          this.now(),
        ),
        deliveries: [...deliveries]
          .sort((a, b) => a.recipientId.localeCompare(b.recipientId))
          .map((d) => ({
            recipientId: d.recipientId,
            channels: [...d.channels].sort(),
          })),
      }),
    );
  }
  private sign(hash: string, expires: number) {
    const payload = Buffer.from(JSON.stringify({ hash, expires })).toString(
      'base64url',
    );
    return `${payload}.${createHmac('sha256', this.key).update(payload).digest('base64url')}`;
  }
  private verify(token: string, hash: string) {
    try {
      const [payload, signature, ...extra] = token.split('.');
      if (extra.length || !payload || !signature) throw Error();
      const expected = createHmac('sha256', this.key).update(payload).digest();
      const actual = Buffer.from(signature, 'base64url');
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw Error();
      const value = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as { hash: string; expires: number };
      if (
        value.hash !== hash ||
        !Number.isFinite(value.expires) ||
        value.expires <= this.now().getTime()
      )
        throw Error();
    } catch {
      throw new ApiError(
        409,
        'REVIEW_EXPIRED',
        'The review expired or the message changed. Review the schedule again.',
      );
    }
  }
  async preview(
    ownerId: string,
    id: string,
    choice: ScheduleChoice | RescheduleChoice,
    reschedule = false,
  ) {
    return this.tx(async (tx) => {
      const message = await this.locked(tx, ownerId, id);
      this.version(message, choice.version);
      if (message.status !== (reschedule ? 'SCHEDULED' : 'DRAFT'))
        throw stateError();
      const deliveries = reschedule
        ? this.choices(message)
        : (choice as ScheduleChoice).deliveries;
      const bindings = await this.ready(tx, message, deliveries);
      const resolved = resolveScheduleTime(
        choice.localDateTime,
        choice.timezone,
        this.now(),
      );
      const expires = this.now().getTime() + 600000;
      return {
        message: publicSchedule(message),
        resolved,
        deliveries: deliveries.map((d) => ({
          recipientId: d.recipientId,
          channels: d.channels,
        })),
        reviewToken: this.sign(
          this.fingerprint(
            message,
            choice,
            reschedule ? 'reschedule' : 'schedule',
            deliveries,
            bindings,
          ),
          expires,
        ),
        expiresAt: new Date(expires).toISOString(),
        backgroundDelivery: true,
      };
    });
  }
  async confirm(
    ownerId: string,
    id: string,
    choice: (ScheduleChoice | RescheduleChoice) & { reviewToken: string },
    reschedule = false,
  ) {
    const requestHash = digest(
      JSON.stringify({
        reschedule,
        version: choice.version,
        localDateTime: choice.localDateTime,
        timezone: choice.timezone,
        deliveries: 'deliveries' in choice ? choice.deliveries : null,
        reviewToken: choice.reviewToken,
      }),
    );
    return this.tx(async (tx) => {
      const message = await this.locked(tx, ownerId, id);
      if (
        message.status === 'SCHEDULED' &&
        message.scheduleRequestHash === requestHash
      )
        return publicSchedule(message);
      this.version(message, choice.version);
      if (message.status !== (reschedule ? 'SCHEDULED' : 'DRAFT'))
        throw stateError();
      const deliveries = reschedule
        ? this.choices(message)
        : (choice as ScheduleChoice).deliveries;
      const bindings = await this.ready(tx, message, deliveries);
      this.verify(
        choice.reviewToken,
        this.fingerprint(
          message,
          choice,
          reschedule ? 'reschedule' : 'schedule',
          deliveries,
          bindings,
        ),
      );
      const resolved = resolveScheduleTime(
        choice.localDateTime,
        choice.timezone,
        this.now(),
      );
      await tx.draftMessage.update({
        where: { id },
        data: {
          status: 'SCHEDULED',
          deliveryEnabled: true,
          scheduledFor: new Date(resolved.scheduledFor),
          scheduleTimezone: resolved.timezone,
          scheduleLocalDateTime: resolved.localDateTime,
          canceledAt: null,
          scheduleRequestHash: requestHash,
          version: { increment: 1 },
        },
      });
      if (!reschedule) {
        for (const r of message.recipients.filter((r) => r.type === 'PHONE'))
          await tx.draftRecipient.update({
            where: { id: r.id },
            data: {
              targetUserId: bindings.find((b) => b.recipientId === r.id)!
                .userId,
            },
          });
      }
      if (!reschedule)
        await tx.deliveryIntent.createMany({
          data: deliveries.map((d) => ({
            messageId: id,
            recipientId: d.recipientId,
            channel: 'IN_APP',
          })),
        });
      return publicSchedule(
        await tx.draftMessage.findUniqueOrThrow({ where: { id }, include }),
      );
    });
  }
  async read(ownerId: string, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const message = await tx.draftMessage.findFirst({
          where: {
            id,
            ownerId,
            status: {
              in: [
                'SCHEDULED',
                'CANCELED',
                'DISPATCHING',
                'DELIVERED',
                'PARTIALLY_DELIVERED',
                'FAILED',
              ],
            },
          },
          include,
        });
        if (!message) throw missing();
        return publicSchedule(message);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async edit(ownerId: string, id: string, input: ScheduleEdit) {
    return this.tx(async (tx) => {
      const message = await this.locked(tx, ownerId, id);
      this.version(message, input.version);
      if (message.status !== 'SCHEDULED') throw stateError();
      const next = {
        ...message,
        ...(input.subject !== undefined && { subject: input.subject }),
        ...(input.text !== undefined && { text: input.text }),
        ...(input.occasion !== undefined && { occasion: input.occasion }),
      };
      await this.ready(tx, next, this.choices(message));
      await tx.draftMessage.update({
        where: { id },
        data: {
          ...(input.subject !== undefined && { subject: input.subject }),
          ...(input.text !== undefined && { text: input.text }),
          ...(input.occasion !== undefined && { occasion: input.occasion }),
          scheduleRequestHash: null,
          version: { increment: 1 },
        },
      });
      return publicSchedule(
        await tx.draftMessage.findUniqueOrThrow({ where: { id }, include }),
      );
    });
  }
  async cancel(ownerId: string, id: string, version: number) {
    return this.tx(async (tx) => {
      const m = await this.locked(tx, ownerId, id);
      if (m.status === 'CANCELED' && m.version === version + 1)
        return publicSchedule(m);
      this.version(m, version);
      if (m.status !== 'SCHEDULED') throw stateError();
      await tx.draftMessage.update({
        where: { id },
        data: {
          status: 'CANCELED',
          canceledAt: this.now(),
          scheduleRequestHash: null,
          version: { increment: 1 },
        },
      });
      return publicSchedule(
        await tx.draftMessage.findUniqueOrThrow({ where: { id }, include }),
      );
    });
  }
  async reopen(ownerId: string, id: string, version: number) {
    return this.tx(async (tx) => {
      const m = await this.locked(tx, ownerId, id);
      if (m.status === 'DRAFT' && m.version === version + 1)
        return publicDraft(m);
      this.version(m, version);
      if (m.status !== 'CANCELED') throw stateError();
      await tx.deliveryIntent.deleteMany({ where: { messageId: id } });
      await tx.draftRecipient.updateMany({
        where: { messageId: id, type: 'PHONE' },
        data: { targetUserId: null },
      });
      await tx.draftMessage.update({
        where: { id },
        data: {
          status: 'DRAFT',
          deliveryEnabled: false,
          scheduledFor: null,
          scheduleTimezone: null,
          scheduleLocalDateTime: null,
          canceledAt: null,
          scheduleRequestHash: null,
          version: { increment: 1 },
        },
      });
      return publicDraft(
        await tx.draftMessage.findUniqueOrThrow({ where: { id }, include }),
      );
    });
  }
  async list(ownerId: string, input: z.infer<typeof scheduleList>) {
    const cursor = input.cursor;
    const rows = await this.db.draftMessage.findMany({
      where: {
        ownerId,
        status: input.status,
        ...(cursor && {
          OR: [
            { scheduledFor: { gt: new Date(cursor.scheduledFor) } },
            {
              scheduledFor: new Date(cursor.scheduledFor),
              id: { gt: cursor.id },
            },
          ],
        }),
      },
      orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
      select: {
        id: true,
        status: true,
        subject: true,
        version: true,
        scheduledFor: true,
        scheduleTimezone: true,
        scheduleLocalDateTime: true,
        canceledAt: true,
        deliveryEnabled: true,
      },
    });
    const page = rows.slice(0, input.limit),
      last = page.at(-1);
    return {
      items: page.map(
        ({ scheduleTimezone, scheduleLocalDateTime, ...row }) => ({
          ...row,
          timezone: scheduleTimezone,
          localDateTime: scheduleLocalDateTime,
        }),
      ),
      nextCursor:
        rows.length > input.limit && last?.scheduledFor
          ? Buffer.from(
              JSON.stringify({
                scheduledFor: last.scheduledFor.toISOString(),
                id: last.id,
              }),
            ).toString('base64url')
          : null,
    };
  }
}
