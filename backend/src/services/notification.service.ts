import type { Prisma, PrismaClient } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
export const preferenceDefaults = {
  inAppAlerts: true,
  pushAlerts: false,
  defaultPhoneChannel: 'WHATSAPP',
};
/** Same transaction as delivery; no private content is copied into notifications. */
export async function createNotification(
  tx: Prisma.TransactionClient,
  data: {
    dedupeKey: string;
    userId: string;
    kind: string;
    targetId: string;
    targetType: string;
  },
) {
  const preference = await tx.accountPreferences.findUnique({
    where: { userId: data.userId },
  });
  if (preference?.inAppAlerts === false) return;
  const notification = await tx.notification.upsert({
    where: { dedupeKey: data.dedupeKey },
    create: data,
    update: {},
  });
  if (!preference?.pushAlerts) return;
  const devices = await tx.pushDevice.findMany({
    where: {
      userId: data.userId,
      disabledAt: null,
      session: { revokedAt: null, expiresAt: { gt: new Date() } },
    },
    take: 20,
  });
  if (devices.length)
    await tx.pushJob.createMany({
      data: devices.map((d) => ({
        notificationId: notification.id,
        deviceId: d.id,
      })),
      skipDuplicates: true,
    });
}
export class NotificationService {
  constructor(private db: PrismaClient) {}
  async list(userId: string, cursor?: string) {
    if (
      cursor &&
      !(await this.db.notification.findFirst({
        where: { id: cursor, userId },
        select: { id: true },
      }))
    )
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Invalid notification cursor.',
      );
    const rows = await this.db.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        kind: true,
        targetId: true,
        targetType: true,
        createdAt: true,
        readAt: true,
      },
    });
    return {
      items: rows.slice(0, 20),
      nextCursor: rows.length > 20 ? rows[19].id : null,
      unread: await this.db.notification.count({
        where: { userId, readAt: null },
      }),
    };
  }
  async resolve(userId: string, id: string) {
    const row = await this.db.notification.findFirst({
      where: { id, userId },
      select: { id: true, targetId: true, targetType: true },
    });
    if (!row)
      throw new ApiError(
        404,
        'NOTIFICATION_NOT_FOUND',
        'Notification unavailable.',
      );
    return row;
  }
  async markRead(userId: string, id: string) {
    const found = await this.db.notification.findFirst({
      where: { id, userId },
    });
    if (!found)
      throw new ApiError(
        404,
        'NOTIFICATION_NOT_FOUND',
        'Notification unavailable.',
      );
    await this.db.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: true };
  }
  async preferences(userId: string) {
    return (
      (await this.db.accountPreferences.findUnique({
        where: { userId },
        select: {
          inAppAlerts: true,
          pushAlerts: true,
          defaultPhoneChannel: true,
        },
      })) ?? preferenceDefaults
    );
  }
  async update(userId: string, data: typeof preferenceDefaults) {
    return this.db.$transaction(async (tx) => {
      const result = await tx.accountPreferences.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
        select: {
          inAppAlerts: true,
          pushAlerts: true,
          defaultPhoneChannel: true,
        },
      });
      if (!data.pushAlerts || !data.inAppAlerts)
        await tx.pushJob.updateMany({
          where: { state: 'READY', notification: { userId } },
          data: { state: 'SKIPPED' },
        });
      return result;
    });
  }
  async register(
    userId: string,
    sessionId: string,
    data: { id: string; token: string; platform: string },
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`;
      const session = await tx.session.findFirst({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!session) throw new ApiError(401, 'UNAUTHORIZED', 'Sign in again.');
      const existing = await tx.pushDevice.findFirst({
        where: { OR: [{ id: data.id }, { token: data.token }] },
        include: { session: true },
      });
      if (
        existing &&
        (existing.id !== data.id || existing.sessionId !== sessionId) &&
        !existing.session.revokedAt &&
        existing.session.expiresAt > new Date()
      )
        throw new ApiError(
          409,
          'DEVICE_IN_USE',
          'Sign out of the previous account on this device first.',
        );
      if (
        existing &&
        existing.id === data.id &&
        existing.sessionId === sessionId &&
        existing.token === data.token &&
        existing.platform === data.platform &&
        !existing.disabledAt
      )
        return { registered: true };
      if (existing && existing.id !== data.id)
        await tx.pushDevice.delete({ where: { id: existing.id } });
      const count = await tx.pushDevice.count({
        where: { sessionId, id: { not: data.id }, disabledAt: null },
      });
      if (count >= 5)
        throw new ApiError(429, 'RATE_LIMITED', 'Too many registered devices.');
      await tx.pushDevice.upsert({
        where: { id: data.id },
        create: { ...data, userId, sessionId },
        update: { ...data, userId, sessionId, disabledAt: null },
      });
      return { registered: true };
    });
  }
  async remove(userId: string, sessionId: string, id: string) {
    await this.db.pushDevice.updateMany({
      where: { id, userId, sessionId },
      data: { disabledAt: new Date() },
    });
    return { removed: true };
  }
}
