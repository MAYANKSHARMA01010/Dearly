import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { WahaConfig } from '../configs/env';
import { wahaScope } from '../providers/whatsapp/waha.provider';
import { databaseTime } from '../utils/databaseTime';
import { lockMessage } from '../utils/lockMessage';
import { recordMessageEvent } from './messageEvent.service';
import { ApiError } from '../utils/ApiError';
export function verifyWahaSignature(
  body: Buffer,
  signature: string | undefined,
  algorithm: string | undefined,
  secret: string,
) {
  if (
    algorithm !== 'sha512' ||
    !signature ||
    !/^[a-f0-9]{128}$/i.test(signature)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature, 'hex'),
    createHmac('sha512', secret).update(body).digest(),
  );
}
const event = z.object({
  id: z.string().min(1).max(128),
  timestamp: z.number().int().positive(),
  event: z.literal('message.ack'),
  session: z.literal('default'),
  engine: z.enum(['WEBJS', 'NOWEB', 'GOWS']),
  payload: z.object({
    id: z
      .string()
      .max(255)
      .regex(/^true_[0-9]{5,20}@(c\.us|lid)_[A-Za-z0-9_-]+$/),
    fromMe: z.literal(true),
    to: z
      .string()
      .regex(/^\d{5,20}@(c\.us|lid)$/)
      .optional(),
    participant: z.null().optional(),
    ack: z.number().int().min(-1).max(4),
    ackName: z.string().optional(),
  }),
});
export class WahaReceiptService {
  readonly scope: string;
  constructor(
    private readonly db: PrismaClient,
    private readonly config: WahaConfig,
  ) {
    this.scope = wahaScope(config);
  }
  async ingest(raw: Buffer, signature?: string, algorithm?: string) {
    if (
      !verifyWahaSignature(raw, signature, algorithm, this.config.webhookSecret)
    )
      throw new ApiError(
        401,
        'INVALID_SIGNATURE',
        'Callback authentication failed.',
      );
    let value: unknown;
    try {
      value = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new ApiError(400, 'INVALID_CALLBACK', 'Invalid callback.');
    }
    const parsed = event.safeParse(value);
    if (!parsed.success) return { accepted: true, ignored: true };
    const e = parsed.data,
      now = await databaseTime(this.db);
    if (e.engine !== this.config.engine)
      return { accepted: true, ignored: true };
    if (
      e.timestamp > now.getTime() + 300000 ||
      e.timestamp < now.getTime() - 14 * 86400000
    )
      return { accepted: true, ignored: true };
    const ackNames = ['ERROR', 'PENDING', 'SERVER', 'DEVICE', 'READ', 'PLAYED'];
    if (e.payload.ackName && e.payload.ackName !== ackNames[e.payload.ack + 1])
      throw new ApiError(
        400,
        'INVALID_CALLBACK',
        'Acknowledgement fields disagree.',
      );
    const known = await this.db.externalDelivery.findFirst({
      where: {
        providerScope: this.scope,
        providerMessageId: e.payload.id,
        intent: { channel: 'WHATSAPP' },
      },
      select: { id: true },
    });
    if (!known) {
      const encoded = e.payload.id.match(/^true_(\d+)@c\.us_/),
        to = e.payload.to?.match(/^(\d+)@c\.us$/);
      if (encoded && to && encoded[1] !== to[1])
        return { accepted: true, ignored: true };
      const digits = encoded?.[1] ?? to?.[1];
      const active = await this.db.externalDelivery.findFirst({
        where: {
          providerScope: this.scope,
          state: 'SUBMITTING',
          updatedAt: { gte: new Date(now.getTime() - 120000) },
          intent: {
            channel: 'WHATSAPP',
            ...(digits ? { recipient: { phone: `+${digits}` } } : {}),
          },
        },
        select: { id: true },
      });
      if (!active) return { accepted: true, ignored: true };
      // Defer unidentified LID receipts until the HTTP response supplies the exact ID.
      if (!digits)
        throw new ApiError(
          503,
          'RECEIPT_NOT_READY',
          'Receipt correlation is not ready. Retry shortly.',
        );
    }
    await this.db.wahaReceipt.createMany({
      data: [
        {
          scope: this.scope,
          eventId: e.id,
          providerMessageId: e.payload.id,
          destination: e.payload.to ?? null,
          ack: e.payload.ack,
          observedAt: now,
          expiresAt: new Date(now.getTime() + 14 * 86400000),
        },
      ],
      skipDuplicates: true,
    });
    await this.reconcile(e.payload.id);
    return { accepted: true };
  }
  async reconcile(providerMessageId: string) {
    const row = await this.db.externalDelivery.findFirst({
      where: {
        providerScope: this.scope,
        providerMessageId,
        intent: { channel: 'WHATSAPP' },
      },
      include: { intent: { include: { message: true, recipient: true } } },
    });
    if (!row) return;
    await this.db.$transaction(
      async (tx) => {
        if (
          !(await lockMessage(
            tx,
            row.intent.message.ownerId,
            row.intent.messageId,
          ))
        )
          return;
        const current = await tx.externalDelivery.findUniqueOrThrow({
            where: { id: row.id },
          }),
          message = await tx.draftMessage.findUniqueOrThrow({
            where: { id: row.intent.messageId },
          });
        const receipts = await tx.wahaReceipt.findMany({
          where: { scope: this.scope, providerMessageId, appliedAt: null },
          orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
          take: 100,
        });
        let highest = current.notificationAck ?? -1,
          delivered = current.notificationDeliveredAt,
          read = current.notificationReadAt,
          error = current.notificationErrorAt;
        for (const receipt of receipts) {
          if (
            receipt.destination &&
            receipt.destination.endsWith('@c.us') &&
            receipt.destination !==
              `${row.intent.recipient.phone?.slice(1)}@c.us`
          ) {
            continue;
          }
          if (receipt.ack === -1 && !delivered && !error) {
            error = receipt.observedAt;
            await recordMessageEvent(
              tx,
              message.id,
              'WHATSAPP_NOTIFICATION_FAILED',
              message.status,
              message.version,
            );
          }
          if (receipt.ack >= 2 && !delivered) {
            delivered = receipt.observedAt;
            await recordMessageEvent(
              tx,
              message.id,
              'WHATSAPP_NOTIFICATION_DELIVERED',
              message.status,
              message.version,
            );
          }
          if (receipt.ack >= 3 && !read) {
            read = receipt.observedAt;
            await recordMessageEvent(
              tx,
              message.id,
              'WHATSAPP_NOTIFICATION_READ',
              message.status,
              message.version,
            );
          }
          highest = Math.max(highest, receipt.ack);
        }
        if (receipts.length)
          await tx.wahaReceipt.updateMany({
            where: { id: { in: receipts.map((r) => r.id) }, appliedAt: null },
            data: { appliedAt: await databaseTime(tx) },
          });
        await tx.externalDelivery.update({
          where: { id: row.id },
          data: {
            notificationAck: highest < 0 ? null : highest,
            notificationDeliveredAt: delivered,
            notificationReadAt: read,
            notificationErrorAt: error,
          },
        });
      },
      {
        timeout: 15000,
        maxWait: 15000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
  }
  async cleanup() {
    return this.db.wahaReceipt.deleteMany({
      where: { expiresAt: { lte: await databaseTime(this.db) } },
    });
  }
}
