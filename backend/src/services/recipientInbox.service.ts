import { Prisma, type PrismaClient } from "@prisma/client";
import { databaseTime } from "../utils/databaseTime";
import { lockMessage } from "../utils/lockMessage";
import { createNotification } from "./notification.service";

/** Materialize only due, active external deliveries after destination possession is verified.
 * Bind a recipient once: a later account must never take an existing account's delivery.
 * GET/list refresh may discover delivery, but never records the content as opened.
 */
export async function syncRecipientInbox(db: PrismaClient, userId: string) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dearly:email:${userId}`},0))`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) return;
      const now = await databaseTime(tx);
      const destinations: Prisma.DraftRecipientWhereInput[] = [
        { type: "PHONE", phone: user.phone },
      ];
      if (user.emailVerifiedAt && user.verifiedEmail)
        destinations.push({ type: "EMAIL", email: user.verifiedEmail });
      const rows = await tx.deliveryIntent.findMany({
        where: {
          channel: { in: ["EMAIL", "WHATSAPP", "SMS"] },
          inboxItem: null,
          recipient: {
            AND: [
              { OR: destinations },
              { OR: [{ targetUserId: null }, { targetUserId: userId }] },
            ],
          },
          message: { deliveryEnabled: true, scheduledFor: { lte: now } },
          externalDelivery: {
            state: { in: ["ACCEPTED", "UNKNOWN"] },
            revokedAt: null,
            expiresAt: { gt: now },
          },
        },
        include: {
          message: { select: { ownerId: true } },
          externalDelivery: true,
        },
        orderBy: [{ messageId: "asc" }, { id: "asc" }],
        take: 100,
      });
      for (const row of rows) {
        if (!(await lockMessage(tx, row.message.ownerId, row.messageId)))
          continue;
        const active = await tx.externalDelivery.findFirst({
          where: {
            intentId: row.id,
            state: { in: ["ACCEPTED", "UNKNOWN"] },
            revokedAt: null,
            expiresAt: { gt: now },
            intent: {
              message: { deliveryEnabled: true, scheduledFor: { lte: now } },
            },
          },
        });
        if (!active) continue;
        await tx.draftRecipient.updateMany({
          where: { id: row.recipientId, targetUserId: null },
          data: { targetUserId: userId },
        });
        const bound = await tx.draftRecipient.findUnique({
          where: { id: row.recipientId },
        });
        if (bound?.targetUserId !== userId) continue;
        const item = await tx.inboxItem.upsert({
          where: { intentId: row.id },
          create: {
            intentId: row.id,
            messageId: row.messageId,
            userId,
            deliveredAt: now,
            externalClaimedAt: now,
          },
          update: {},
        });
        if (item.userId !== userId) continue;
        await createNotification(tx, {
          dedupeKey: `inbox:${item.id}`,
          userId,
          kind: "RECEIVED",
          targetId: item.id,
          targetType: "received",
        });
      }
    },
    { maxWait: 15000, timeout: 15000 },
  );
}

export const receivedIntentScope: Prisma.InboxItemWhereInput = {
  OR: [{ intent: { channel: "IN_APP" } }, { externalClaimedAt: { not: null } }],
};
