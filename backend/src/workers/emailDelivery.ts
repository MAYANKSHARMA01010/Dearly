import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AppConfig } from '../configs/env';
import type { Claim } from './deliveryWorker';
import type { EmailSender } from '../providers/email/email.provider';
import { databaseTime } from '../utils/databaseTime';
import { lockMessage } from '../utils/lockMessage';
import { recordMessageEvent } from '../services/messageEvent.service';
import { accessToken } from '../services/externalAccess.service';
export class EmailDelivery {
  constructor(
    private readonly db: PrismaClient,
    private readonly access: NonNullable<AppConfig['emailAccess']>,
    private readonly senderKey: string,
    private readonly send: EmailSender,
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
      if (intent.channel !== 'EMAIL') continue;
      const prepared = await this.tx(async (tx) => {
        const { now } = await this.held(tx, c);
        const old = await tx.emailDelivery.findUnique({
          where: { intentId: intent.id },
        });
        if (old && old.state !== 'RETRYABLE') {
          if (old.state === 'SUBMITTING')
            await tx.emailDelivery.update({
              where: { id: old.id },
              data: { state: 'UNKNOWN', errorCode: 'SMTP_UNCERTAIN' },
            });
          return null;
        }
        const id = createHash('sha256')
          .update(this.senderKey.toLowerCase())
          .digest('hex');
        // A no-op upsert takes the sender-budget row lock before reading its count.
        await tx.emailBudget.upsert({
          where: { id },
          create: { id, resetsAt: new Date(now.getTime() + 86400000) },
          update: { id },
        });
        let budget = await tx.emailBudget.findUniqueOrThrow({ where: { id } });
        if (budget.resetsAt <= now)
          budget = await tx.emailBudget.update({
            where: { id },
            data: { count: 0, resetsAt: new Date(now.getTime() + 86400000) },
          });
        const quota = budget.count >= this.access.dailyLimit;
        const row = await tx.emailDelivery.upsert({
          where: { intentId: intent.id },
          create: {
            intentId: intent.id,
            state: quota ? 'RETRYABLE' : 'SUBMITTING',
            errorCode: quota ? 'EMAIL_QUOTA' : null,
            expiresAt: new Date(now.getTime() + 7 * 86400000),
          },
          update: {
            state: quota ? 'RETRYABLE' : 'SUBMITTING',
            errorCode: quota ? 'EMAIL_QUOTA' : null,
          },
        });
        if (quota) return null;
        if (row.revokedAt || row.expiresAt <= now) {
          await tx.emailDelivery.update({
            where: { id: row.id },
            data: { state: 'REJECTED', errorCode: 'LINK_UNAVAILABLE' },
          });
          return null;
        }
        if (intent.recipient.type !== 'EMAIL' || !intent.recipient.email) {
          await tx.emailDelivery.update({
            where: { id: row.id },
            data: { state: 'REJECTED', errorCode: 'INVALID_RECIPIENT' },
          });
          return null;
        }
        await tx.emailBudget.update({
          where: { id },
          data: { count: { increment: 1 } },
        });
        return { id: row.id, to: intent.recipient.email };
      });
      if (!prepared) continue;
      // A durable SUBMITTING marker exists before network activity. Never blindly resend it.
      const result = await this.send(
        prepared.to,
        `${this.access.publicUrl}/external/#${accessToken(prepared.id, this.access.secret)}`,
        prepared.id,
      );
      await this.tx(async (tx) => {
        const { now } = await this.held(tx, c);
        await tx.emailDelivery.updateMany({
          where: { id: prepared.id, state: 'SUBMITTING' },
          data: {
            state: result.state,
            errorCode: result.code,
            providerMessageId: result.providerMessageId,
            submittedAt: result.state === 'ACCEPTED' ? now : null,
          },
        });
      });
    }
    return this.tx(async (tx) => {
      const { m, now, w } = await this.held(tx, c);
      const all = await tx.deliveryIntent.findMany({
        where: { messageId: c.messageId },
        include: { inboxItem: true, emailDelivery: true },
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
        const e = i.emailDelivery;
        if (i.channel !== 'EMAIL' || !e) {
          failed++;
          continue;
        }
        if (e.state === 'SUBMITTING')
          await tx.emailDelivery.update({
            where: { id: e.id },
            data: { state: 'UNKNOWN', errorCode: 'SMTP_UNCERTAIN' },
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
            ? 'SMTP_UNCERTAIN'
            : failed
              ? 'EMAIL_FAILED'
              : retry
                ? 'EMAIL_RETRY'
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
