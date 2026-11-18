import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AppConfig } from '../configs/env';
import type { Claim } from './deliveryWorker';
import type {
  ExternalProvider,
  ExternalChannel,
} from '../providers/external.provider';
import { databaseTime } from '../utils/databaseTime';
import { lockMessage } from '../utils/lockMessage';
import { recordMessageEvent } from '../services/messageEvent.service';
import { accessToken } from '../services/externalAccess.service';
export class ExternalDelivery {
  constructor(
    private readonly db: PrismaClient,
    private readonly access: NonNullable<AppConfig['externalAccess']>,
    private readonly providers: Partial<
      Record<ExternalChannel, ExternalProvider>
    >,
    private readonly clock?: () => Date,
  ) {}
  private now(tx: Prisma.TransactionClient) {
    return this.clock ? Promise.resolve(this.clock()) : databaseTime(tx);
  }
  private tx<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(work, { timeout: 15000, maxWait: 15000 });
  }
  private async held(tx: Prisma.TransactionClient, c: Claim) {
    const m = await tx.draftMessage.findUniqueOrThrow({
      where: { id: c.messageId },
    });
    if (!(await lockMessage(tx, m.ownerId, m.id)))
      throw Error('Claim unavailable');
    const now = await this.now(tx);
    const w = await tx.deliveryWork.findFirst({
      where: {
        id: c.id,
        state: 'RUNNING',
        leaseToken: c.token,
        attempts: c.attempt,
        leaseExpiresAt: { gt: now },
      },
    });
    if (
      !w ||
      m.version !== w.scheduleVersion + 1 ||
      m.status !== 'DISPATCHING' ||
      !m.deliveryEnabled ||
      !m.scheduledFor ||
      m.scheduledFor > now
    )
      throw Error('Claim unavailable');
    await tx.deliveryWork.update({
      where: { id: w.id },
      data: { leaseExpiresAt: new Date(now.getTime() + 120000) },
    });
    return { m, now, w };
  }
  async execute(c: Claim) {
    const intents = await this.db.deliveryIntent.findMany({
      where: { messageId: c.messageId },
      include: { recipient: true },
      orderBy: { id: 'asc' },
    });
    for (const intent of intents) {
      if (intent.channel === 'IN_APP') {
        await this.tx(async (tx) => {
          const { m, now } = await this.held(tx, c);
          if (await tx.inboxItem.findUnique({ where: { intentId: intent.id } }))
            return;
          const user = intent.recipient.targetUserId
            ? await tx.user.findFirst({
                where: {
                  id: intent.recipient.targetUserId,
                  phoneVerifiedAt: { lte: now },
                  ...(intent.recipient.type === 'PHONE'
                    ? { phone: intent.recipient.phone! }
                    : {}),
                },
              })
            : null;
          const valid =
            !!user && ['SELF', 'USER', 'PHONE'].includes(intent.recipient.type);
          if (valid)
            await tx.inboxItem.create({
              data: {
                intentId: intent.id,
                messageId: m.id,
                userId: user!.id,
                deliveredAt: now,
              },
            });
          await tx.deliveryAttempt.updateMany({
            where: {
              workId: c.id,
              intentId: intent.id,
              number: c.attempt,
              state: 'STARTED',
            },
            data: {
              state: valid ? 'SUCCEEDED' : 'PERMANENT_FAILED',
              errorCode: valid ? null : 'RECIPIENT_UNAVAILABLE',
              finishedAt: now,
            },
          });
        });
        continue;
      }
      if (!['EMAIL', 'WHATSAPP', 'SMS'].includes(intent.channel)) continue;
      const channel = intent.channel as ExternalChannel,
        provider = this.providers[channel];
      const prepared = await this.tx(async (tx) => {
        const { now } = await this.held(tx, c);
        const old = await tx.externalDelivery.findUnique({
          where: { intentId: intent.id },
        });
        if (old && old.state !== 'RETRYABLE') {
          if (old.state === 'SUBMITTING')
            await tx.externalDelivery.update({
              where: { id: old.id },
              data: {
                state: 'UNKNOWN',
                errorCode:
                  channel === 'EMAIL' ? 'SMTP_UNCERTAIN' : channel === 'SMS' ? 'SMSGATE_UNCERTAIN' : 'WAHA_UNCERTAIN',
              },
            });
          return null;
        }
        const id = createHash('sha256')
          .update(
            (provider?.senderKey ?? `unconfigured:${channel}`).toLowerCase(),
          )
          .digest('hex');
        // A no-op upsert takes the sender-budget row lock before reading its count.
        await tx.senderBudget.upsert({
          where: { id },
          create: { id, resetsAt: new Date(now.getTime() + 86400000) },
          update: { id },
        });
        let budget = await tx.senderBudget.findUniqueOrThrow({ where: { id } });
        if (budget.resetsAt <= now)
          budget = await tx.senderBudget.update({
            where: { id },
            data: { count: 0, resetsAt: new Date(now.getTime() + 86400000) },
          });
        const quota = budget.count >= (provider?.dailyLimit ?? 0);
        const row = await tx.externalDelivery.upsert({
          where: { intentId: intent.id },
          create: {
            intentId: intent.id,
            providerScope: provider?.scope,
            state: quota ? 'RETRYABLE' : 'SUBMITTING',
            errorCode: quota
              ? channel === 'EMAIL'
                ? 'EMAIL_QUOTA'
                : channel === 'SMS' ? 'SMS_QUOTA' : 'WHATSAPP_QUOTA'
              : null,
            expiresAt: new Date(now.getTime() + 7 * 86400000),
          },
          update: {
            providerScope: provider?.scope,
            state: quota ? 'RETRYABLE' : 'SUBMITTING',
            errorCode: quota
              ? channel === 'EMAIL'
                ? 'EMAIL_QUOTA'
                : channel === 'SMS' ? 'SMS_QUOTA' : 'WHATSAPP_QUOTA'
              : null,
          },
        });
        if (quota) return null;
        if (row.revokedAt || row.expiresAt <= now) {
          await tx.externalDelivery.update({
            where: { id: row.id },
            data: { state: 'REJECTED', errorCode: 'LINK_UNAVAILABLE' },
          });
          return null;
        }
        if (
          !provider ||
          (channel === 'EMAIL'
            ? intent.recipient.type !== 'EMAIL' || !intent.recipient.email
            : intent.recipient.type !== 'PHONE' ||
              !intent.recipient.phone ||
              !intent.consentAt)
        ) {
          await tx.externalDelivery.update({
            where: { id: row.id },
            data: { state: 'REJECTED', errorCode: 'INVALID_RECIPIENT' },
          });
          return null;
        }
        await tx.senderBudget.update({
          where: { id },
          data: { count: { increment: 1 } },
        });
        return {
          id: row.id,
          to:
            channel === 'EMAIL'
              ? intent.recipient.email!
              : intent.recipient.phone!,
        };
      });
      if (!prepared) {
        if (channel === 'SMS' && provider?.reconcile) {
          const existing = await this.db.externalDelivery.findUnique({ where: { intentId: intent.id } });
          if (existing) await provider.reconcile(existing.id);
        }
        continue;
      }
      // A durable SUBMITTING marker exists before network activity. Never blindly resend it.
      const result = await provider!.send(
        prepared.to,
        `${this.access.publicUrl}/external/#${accessToken(prepared.id, this.access.secret)}`,
        prepared.id,
      );
      await this.tx(async (tx) => {
        const { now } = await this.held(tx, c);
        await tx.externalDelivery.updateMany({
          where: { id: prepared.id, state: 'SUBMITTING' },
          data: {
            state: result.state,
            errorCode: result.code,
            providerMessageId:
              result.state === 'ACCEPTED' ? result.providerMessageId : null,
            submittedAt: result.state === 'ACCEPTED' ? now : null,
          },
        });
      });
      if (result.state === 'ACCEPTED' && result.providerMessageId)
        await provider?.reconcile?.(result.providerMessageId);
      if (channel === 'SMS' && result.state === 'UNKNOWN')
        await provider?.reconcile?.(prepared.id);
    }
    return this.tx(async (tx) => {
      const { m, now, w } = await this.held(tx, c);
      const all = await tx.deliveryIntent.findMany({
        where: { messageId: c.messageId },
        include: { inboxItem: true, externalDelivery: true },
      });
      let delivered = 0,
        accepted = 0,
        failed = 0,
        uncertain = 0,
        retry = false;
      for (const i of all) {
        if (i.channel === 'IN_APP') {
          if (i.inboxItem) delivered++;
          else failed++;
          continue;
        }
        const e = i.externalDelivery;
        if (!['EMAIL', 'WHATSAPP', 'SMS'].includes(i.channel) || !e) {
          failed++;
          continue;
        }
        if (e.state === 'SUBMITTING')
          await tx.externalDelivery.update({
            where: { id: e.id },
            data: {
              state: 'UNKNOWN',
              errorCode:
                i.channel === 'EMAIL' ? 'SMTP_UNCERTAIN' : i.channel === 'SMS' ? 'SMSGATE_UNCERTAIN' : 'WAHA_UNCERTAIN',
            },
          });
        if (e.state === 'ACCEPTED') accepted++;
        else if (e.state === 'UNKNOWN' || e.state === 'SUBMITTING') uncertain++;
        else if (e.state === 'RETRYABLE' && w.attempts < w.attemptLimit)
          retry = true;
        else failed++;
        await tx.deliveryAttempt.updateMany({
          where: {
            workId: c.id,
            intentId: i.id,
            number: c.attempt,
            state: 'STARTED',
          },
          data: {
            state:
              e.state === 'ACCEPTED'
                ? 'SUCCEEDED'
                : e.state === 'RETRYABLE' && w.attempts < w.attemptLimit
                  ? 'RETRYABLE_FAILED'
                  : 'PERMANENT_FAILED',
            finishedAt: now,
            errorCode: e.errorCode,
          },
        });
      }
      const status = retry
        ? 'DISPATCHING'
        : uncertain
          ? 'DELIVERY_UNKNOWN'
          : accepted
            ? failed
              ? 'PARTIALLY_SUBMITTED'
              : 'SUBMITTED'
            : failed
              ? delivered
                ? 'PARTIALLY_DELIVERED'
                : 'FAILED'
              : 'DELIVERED';
      await tx.draftMessage.update({ where: { id: m.id }, data: { status } });
      await tx.deliveryWork.update({
        where: { id: w.id },
        data: {
          state: retry ? 'READY' : failed || uncertain ? 'FAILED' : 'SUCCEEDED',
          nextAttemptAt: new Date(
            now.getTime() +
              [5000, 30000, 120000, 600000][Math.min(w.attempts - 1, 3)],
          ),
          leaseToken: null,
          leaseExpiresAt: null,
          lastError: uncertain
            ? 'EXTERNAL_UNCERTAIN'
            : failed
              ? 'EXTERNAL_FAILED'
              : retry
                ? 'EXTERNAL_RETRY'
                : null,
        },
      });
      await recordMessageEvent(
        tx,
        m.id,
        status === 'DISPATCHING' ? 'RETRY_SCHEDULED' : status,
        status,
        m.version,
      );
      return true;
    });
  }
}
