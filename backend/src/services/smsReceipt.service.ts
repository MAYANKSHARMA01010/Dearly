import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { SmsGateConfig } from '../configs/env';
import { smsScope } from '../providers/sms/smsgate.provider';
import { ApiError } from '../utils/ApiError';
import { databaseTime } from '../utils/databaseTime';
import { lockMessage } from '../utils/lockMessage';
import { recordMessageEvent } from './messageEvent.service';

export function verifySmsSignature(raw: Buffer, timestamp: string | undefined, signature: string | undefined, secret: string, now = Date.now()) {
  if (!timestamp || !/^\d{10}$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/i.test(signature) || Math.abs(now - Number(timestamp) * 1000) > 300000) return false;
  const expected = createHmac('sha256', secret).update(raw).update(timestamp).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
const event = z.object({
  deviceId: z.string().min(1).max(64), id: z.string().min(1).max(128),
  event: z.enum(['sms:sent', 'sms:delivered', 'sms:failed', 'sms:cancelled']),
  payload: z.object({
    messageId: z.string().uuid(), recipient: z.string().regex(/^\+?[1-9]\d{5,14}$/),
    simNumber: z.number().int().min(1).max(3).nullable().optional(),
    partsCount: z.number().int().min(-1).max(100).optional(),
    sentAt: z.string().datetime({ offset: true }).optional(),
    deliveredAt: z.string().datetime({ offset: true }).optional(),
    failedAt: z.string().datetime({ offset: true }).optional(),
    cancelledAt: z.string().datetime({ offset: true }).optional(),
  }),
});

export class SmsReceiptService {
  readonly scope: string;
  constructor(private readonly db: PrismaClient, private readonly config: SmsGateConfig) { this.scope = smsScope(config); }
  async ingest(raw: Buffer, timestamp?: string, signature?: string) {
    if (!verifySmsSignature(raw, timestamp, signature, this.config.webhookSecret))
      throw new ApiError(401, 'INVALID_SIGNATURE', 'Callback authentication failed.');
    let body: unknown;
    try { body = JSON.parse(raw.toString('utf8')); }
    catch { throw new ApiError(400, 'INVALID_CALLBACK', 'Use valid callback JSON.'); }
    const parsed = event.safeParse(body);
    if (!parsed.success) throw new ApiError(400, 'INVALID_CALLBACK', 'Invalid SMS callback.');
    const e = parsed.data, p = e.payload;
    if ((this.config.deviceId && e.deviceId !== this.config.deviceId) || p.simNumber !== this.config.simNumber) return { status: 'ignored' };
    const kind = e.event === 'sms:sent' ? 'SENT' : e.event === 'sms:delivered' ? 'DELIVERED' : 'FAILED';
    const when = kind === 'SENT' ? p.sentAt : kind === 'DELIVERED' ? p.deliveredAt : p.failedAt ?? p.cancelledAt;
    if (!when || (kind === 'SENT' && p.partsCount === undefined)) throw new ApiError(400, 'INVALID_CALLBACK', 'Missing SMS evidence.');
    const observedAt = new Date(when);
    const row = await this.db.externalDelivery.findFirst({ where: {
      id: p.messageId, providerScope: this.scope, state: { in: ['SUBMITTING', 'ACCEPTED', 'UNKNOWN'] },
      intent: { channel: 'SMS', recipient: { phone: p.recipient.startsWith('+') ? p.recipient : `+${p.recipient}` } },
    } });
    // Client-selected UUID proves the exact outbound reservation, including callback races.
    // Never persist unrelated personal SMS metadata or raw callback bodies/reasons.
    if (!row || observedAt.getTime() < row.createdAt.getTime() - 60000 || observedAt.getTime() > Date.now() + 300000) return { status: 'ignored' };
    await this.db.smsReceipt.upsert({
      where: { scope_eventId: { scope: this.scope, eventId: e.id } }, update: {},
      create: { scope: this.scope, eventId: e.id, deliveryId: row.id, kind,
        partsCount: kind === 'SENT' ? p.partsCount : null, observedAt, expiresAt: new Date(Date.now() + 14 * 86400000) },
    });
    await this.reconcile(row.id);
    return { status: 'accepted' };
  }
  async reconcile(id: string) {
    await this.db.$transaction(async (tx) => {
      const initial = await tx.externalDelivery.findFirst({ where: { id, providerScope: this.scope, intent: { channel: 'SMS' } }, include: { intent: { include: { message: true } } } });
      if (!initial || initial.state === 'SUBMITTING') return;
      const message = initial.intent.message;
      if (!(await lockMessage(tx, message.ownerId, message.id))) return;
      // Re-read after serialization with other receipts/owner operations.
      const row = await tx.externalDelivery.findUniqueOrThrow({ where: { id } });
      if (!['ACCEPTED', 'UNKNOWN'].includes(row.state)) return;
      const receipts = await tx.smsReceipt.findMany({ where: { scope: this.scope, deliveryId: id }, orderBy: { observedAt: 'asc' } });
      const sent = receipts.find((r) => r.kind === 'SENT' && r.partsCount === 1);
      const unexpectedParts = receipts.some((r) => r.kind === 'SENT' && r.partsCount !== 1);
      const delivered = sent && !unexpectedParts ? receipts.find((r) => r.kind === 'DELIVERED') : undefined;
      const failed = receipts.find((r) => r.kind === 'FAILED');
      const now = await databaseTime(tx);
      if (sent && !row.notificationSentAt) await recordMessageEvent(tx, message.id, 'SMS_NOTIFICATION_SENT', message.status, message.version);
      if (delivered && !row.notificationDeliveredAt) await recordMessageEvent(tx, message.id, 'SMS_NOTIFICATION_DELIVERED', message.status, message.version);
      if (failed && !delivered && !row.notificationDeliveredAt && !row.notificationErrorAt) await recordMessageEvent(tx, message.id, 'SMS_NOTIFICATION_FAILED', message.status, message.version);
      await tx.externalDelivery.update({ where: { id }, data: {
        notificationSentAt: row.notificationSentAt ?? sent?.observedAt,
        notificationDeliveredAt: row.notificationDeliveredAt ?? delivered?.observedAt,
        notificationErrorAt: row.notificationDeliveredAt || delivered ? null : row.notificationErrorAt ?? failed?.observedAt,
      } });
      await tx.smsReceipt.updateMany({ where: { deliveryId: id, scope: this.scope, appliedAt: null }, data: { appliedAt: now } });
    }, { maxWait: 15000, timeout: 15000 });
  }
}
