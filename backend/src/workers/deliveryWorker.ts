import { Prisma, type PrismaClient, type Attachment } from '@prisma/client';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { ObjectStore } from '../providers/storage/local.storage';
import { lockMessage } from '../utils/lockMessage';
import { databaseTime } from '../utils/databaseTime';

export const deliveryPolicy = {
  leaseMs: 60000,
  maxAttempts: 5,
  maxTotalAttempts: 20,
  backoffMs: [5000, 30000, 120000, 600000],
  pollMs: 15000,
  heartbeatMs: 90000,
};
export const retryDelay = (attempt: number) =>
  deliveryPolicy.backoffMs[
    Math.min(Math.max(attempt - 1, 0), deliveryPolicy.backoffMs.length - 1)
  ];
export class DeliveryFault extends Error {
  constructor(
    readonly code: 'STORAGE_UNAVAILABLE' | 'ATTACHMENTS_NOT_READY' | 'INTERNAL',
  ) {
    super(code);
  }
}
export type Claim = {
  id: string;
  messageId: string;
  token: string;
  attempt: number;
};
export class DeliveryWorker {
  constructor(
    private readonly db: PrismaClient,
    private readonly store: ObjectStore,
    private readonly clock?: () => Date,
    private readonly inspect?: (files: Attachment[]) => Promise<void>,
  ) {}
  private now(tx: Prisma.TransactionClient | PrismaClient = this.db) {
    return this.clock ? Promise.resolve(this.clock()) : databaseTime(tx);
  }
  private tx<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 15000,
      timeout: 15000,
    });
  }
  async heartbeat(id: string, stopped = false) {
    const now = await this.now();
    await this.db.workerHeartbeat.upsert({
      where: { id },
      create: { id, lastSeenAt: now, stoppedAt: stopped ? now : null },
      update: { lastSeenAt: now, stoppedAt: stopped ? now : null },
    });
  }
  async claim(): Promise<Claim | null> {
    const now = await this.now();
    const candidates = await this.db.deliveryWork.findMany({
      where: {
        OR: [
          { state: 'READY', nextAttemptAt: { lte: now } },
          { state: 'RUNNING', leaseExpiresAt: { lte: now } },
        ],
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
      take: 20,
      include: { message: { select: { ownerId: true } } },
    });
    for (const c of candidates) {
      const result = await this.tx(async (tx) => {
        if (!(await lockMessage(tx, c.message.ownerId, c.messageId)))
          return null;
        const time = await this.now(tx);
        // Conditional update is the claim's row lock and fencing point. A competing worker loses.
        const token = randomUUID();
        const grabbed = await tx.deliveryWork.updateMany({
          where: {
            id: c.id,
            attempts: c.attempts,
            state: c.state,
            leaseToken: c.leaseToken,
            OR: [
              { state: 'READY', nextAttemptAt: { lte: time } },
              { state: 'RUNNING', leaseExpiresAt: { lte: time } },
            ],
          },
          data: {
            state: 'RUNNING',
            leaseToken: token,
            leaseExpiresAt: new Date(time.getTime() + deliveryPolicy.leaseMs),
          },
        });
        if (!grabbed.count) return null;
        const message = await tx.draftMessage.findUniqueOrThrow({
          where: { id: c.messageId },
          include: { deliveryIntents: { include: { inboxItem: true } } },
        });
        const fresh =
          message.status === 'SCHEDULED' &&
          message.version === c.scheduleVersion;
        const resumed =
          message.status === 'DISPATCHING' &&
          message.version === c.scheduleVersion + 1;
        if (
          !message.deliveryEnabled ||
          !message.scheduledFor ||
          (!fresh && !resumed)
        ) {
          await tx.deliveryWork.update({
            where: { id: c.id },
            data: {
              state: 'OBSOLETE',
              leaseToken: null,
              leaseExpiresAt: null,
              lastError: 'STALE_SCHEDULE',
            },
          });
          return null;
        }
        if (message.scheduledFor > time) {
          await tx.deliveryWork.update({
            where: { id: c.id },
            data: {
              state: 'READY',
              nextAttemptAt: message.scheduledFor,
              leaseToken: null,
              leaseExpiresAt: null,
            },
          });
          return null;
        }
        await tx.deliveryAttempt.updateMany({
          where: { workId: c.id, state: 'STARTED' },
          data: {
            state: 'ABANDONED',
            finishedAt: time,
            errorCode: 'LEASE_EXPIRED',
          },
        });
        if (c.attempts >= c.attemptLimit) {
          const delivered = message.deliveryIntents.filter(
            (i) => i.inboxItem,
          ).length;
          await tx.deliveryWork.update({
            where: { id: c.id },
            data: {
              state: 'FAILED',
              leaseToken: null,
              leaseExpiresAt: null,
              lastError: 'ATTEMPTS_EXHAUSTED',
            },
          });
          await tx.draftMessage.update({
            where: { id: message.id },
            data: {
              status: delivered ? 'PARTIALLY_DELIVERED' : 'FAILED',
              ...(fresh && { version: { increment: 1 } }),
              scheduleRequestHash: null,
            },
          });
          return null;
        }
        if (fresh)
          await tx.draftMessage.update({
            where: { id: message.id },
            data: {
              status: 'DISPATCHING',
              version: { increment: 1 },
              scheduleRequestHash: null,
            },
          });
        await tx.deliveryWork.update({
          where: { id: c.id },
          data: { attempts: { increment: 1 }, lastError: null },
        });
        const intents = message.deliveryIntents.filter((i) => !i.inboxItem);
        if (intents.length)
          await tx.deliveryAttempt.createMany({
            data: intents.map((i) => ({
              workId: c.id,
              intentId: i.id,
              number: c.attempts + 1,
              startedAt: time,
            })),
          });
        return {
          id: c.id,
          messageId: c.messageId,
          token,
          attempt: c.attempts + 1,
        };
      });
      if (result) return result;
    }
    return null;
  }
  private async verifyFiles(files: Attachment[]) {
    if (files.some((f) => f.state !== 'READY'))
      throw new DeliveryFault('ATTACHMENTS_NOT_READY');
    if (this.inspect) return this.inspect(files);
    try {
      const signal = AbortSignal.timeout(20000);
      for (const f of files) {
        const info = await stat(this.store.path(f.id));
        if (!info.isFile() || info.size !== f.bytes) throw Error();
        const hash = createHash('sha256');
        let bytes = 0;
        for await (const chunk of createReadStream(this.store.path(f.id), {
          signal,
        })) {
          bytes += chunk.length;
          if (bytes > f.bytes) throw Error();
          hash.update(chunk);
        }
        if (bytes !== f.bytes || hash.digest('hex') !== f.sha256) throw Error();
      }
    } catch {
      throw new DeliveryFault('STORAGE_UNAVAILABLE');
    }
  }
  async execute(claim: Claim) {
    try {
      const snapshot = await this.db.draftMessage.findUnique({
        where: { id: claim.messageId },
        include: { attachments: true },
      });
      if (!snapshot) return false;
      await this.verifyFiles(snapshot.attachments);
      return await this.tx(async (tx) => {
        if (!(await lockMessage(tx, snapshot.ownerId, snapshot.id)))
          return false;
        const now = await this.now(tx);
        const held = await tx.deliveryWork.updateMany({
          where: {
            id: claim.id,
            state: 'RUNNING',
            leaseToken: claim.token,
            leaseExpiresAt: { gt: now },
            attempts: claim.attempt,
          },
          data: { leaseToken: claim.token },
        });
        if (!held.count) return false;
        const work = await tx.deliveryWork.findUniqueOrThrow({
          where: { id: claim.id },
        });
        const message = await tx.draftMessage.findUniqueOrThrow({
          where: { id: snapshot.id },
          include: {
            attachments: true,
            deliveryIntents: { include: { recipient: true, inboxItem: true } },
          },
        });
        if (
          message.status !== 'DISPATCHING' ||
          message.version !== work.scheduleVersion + 1 ||
          !message.deliveryEnabled ||
          !message.scheduledFor ||
          message.scheduledFor > now
        )
          throw new DeliveryFault('INTERNAL');
        if (
          message.attachments.some(
            (a) =>
              a.state !== 'READY' ||
              !snapshot.attachments.some(
                (s) =>
                  s.id === a.id && s.sha256 === a.sha256 && s.bytes === a.bytes,
              ),
          ) ||
          message.attachments.length !== snapshot.attachments.length
        )
          throw new DeliveryFault('ATTACHMENTS_NOT_READY');
        const targets = await tx.user.findMany({
          where: {
            id: {
              in: message.deliveryIntents.flatMap((i) =>
                i.recipient.targetUserId ? [i.recipient.targetUserId] : [],
              ),
            },
            phoneVerifiedAt: { lte: now },
          },
          select: { id: true, phone: true },
        });
        const pending = message.deliveryIntents.filter((i) => !i.inboxItem);
        const success = pending.filter(
          (i) =>
            i.channel === 'IN_APP' &&
            ['SELF', 'USER', 'PHONE'].includes(i.recipient.type) &&
            targets.some(
              (u) =>
                u.id === i.recipient.targetUserId &&
                (i.recipient.type !== 'PHONE' || u.phone === i.recipient.phone),
            ),
        );
        const good = new Set(success.map((i) => i.id));
        const bad = pending.filter((i) => !good.has(i.id));
        const delivered =
            message.deliveryIntents.length - pending.length + success.length,
          failed = bad.length;
        if (success.length) {
          await tx.inboxItem.createMany({
            data: success.map((i) => ({
              intentId: i.id,
              messageId: message.id,
              userId: i.recipient.targetUserId!,
              deliveredAt: now,
            })),
          });
          await tx.deliveryAttempt.updateMany({
            where: {
              workId: work.id,
              number: claim.attempt,
              intentId: { in: success.map((i) => i.id) },
              state: 'STARTED',
            },
            data: { state: 'SUCCEEDED', finishedAt: now, errorCode: null },
          });
        }
        if (bad.length)
          await tx.deliveryAttempt.updateMany({
            where: {
              workId: work.id,
              number: claim.attempt,
              intentId: { in: bad.map((i) => i.id) },
              state: 'STARTED',
            },
            data: {
              state: 'PERMANENT_FAILED',
              finishedAt: now,
              errorCode: 'RECIPIENT_UNAVAILABLE',
            },
          });
        if (!message.deliveryIntents.length)
          throw new DeliveryFault('INTERNAL');
        // Fence again using database time after all writes; a late worker rolls back its entire result.
        const end = await this.now(tx);
        const finished = await tx.deliveryWork.updateMany({
          where: {
            id: work.id,
            leaseToken: claim.token,
            state: 'RUNNING',
            leaseExpiresAt: { gt: end },
          },
          data: {
            state: failed ? 'FAILED' : 'SUCCEEDED',
            lastError: failed ? 'RECIPIENT_UNAVAILABLE' : null,
            leaseToken: null,
            leaseExpiresAt: null,
          },
        });
        if (!finished.count) throw new DeliveryFault('INTERNAL');
        await tx.draftMessage.update({
          where: { id: message.id },
          data: {
            status: failed
              ? delivered
                ? 'PARTIALLY_DELIVERED'
                : 'FAILED'
              : 'DELIVERED',
          },
        });
        return true;
      });
    } catch (error) {
      await this.fail(
        claim,
        error instanceof DeliveryFault ? error.code : 'INTERNAL',
      );
      return false;
    }
  }
  private async fail(claim: Claim, code: DeliveryFault['code']) {
    const m = await this.db.draftMessage.findUnique({
      where: { id: claim.messageId },
      select: { ownerId: true },
    });
    if (!m) return;
    await this.tx(async (tx) => {
      if (!(await lockMessage(tx, m.ownerId, claim.messageId))) return;
      const now = await this.now(tx);
      const work = await tx.deliveryWork.findFirst({
        where: {
          id: claim.id,
          state: 'RUNNING',
          leaseToken: claim.token,
          leaseExpiresAt: { gt: now },
        },
      });
      if (!work) return;
      const exhausted = work.attempts >= work.attemptLimit;
      await tx.deliveryWork.update({
        where: { id: work.id },
        data: {
          state: exhausted ? 'FAILED' : 'READY',
          lastError: code,
          leaseToken: null,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(now.getTime() + retryDelay(work.attempts)),
        },
      });
      await tx.deliveryAttempt.updateMany({
        where: { workId: work.id, number: claim.attempt, state: 'STARTED' },
        data: {
          state: exhausted ? 'PERMANENT_FAILED' : 'RETRYABLE_FAILED',
          errorCode: code,
          finishedAt: now,
        },
      });
      if (exhausted) {
        const delivered = await tx.inboxItem.count({
          where: { messageId: claim.messageId },
        });
        await tx.draftMessage.updateMany({
          where: {
            id: claim.messageId,
            status: 'DISPATCHING',
            version: work.scheduleVersion + 1,
          },
          data: { status: delivered ? 'PARTIALLY_DELIVERED' : 'FAILED' },
        });
      }
    });
  }
  async retry(id: string) {
    const w = await this.db.deliveryWork.findUnique({
      where: { id },
      include: { message: { select: { ownerId: true } } },
    });
    if (!w) return false;
    return this.tx(async (tx) => {
      if (!(await lockMessage(tx, w.message.ownerId, w.messageId)))
        return false;
      const work = await tx.deliveryWork.findUniqueOrThrow({ where: { id } });
      const message = await tx.draftMessage.findUniqueOrThrow({
        where: { id: w.messageId },
      });
      if (
        work.state !== 'FAILED' ||
        work.attemptLimit >= deliveryPolicy.maxTotalAttempts ||
        message.version !== work.scheduleVersion + 1 ||
        !['FAILED', 'PARTIALLY_DELIVERED'].includes(message.status)
      )
        return false;
      await tx.deliveryWork.update({
        where: { id },
        data: {
          state: 'READY',
          attemptLimit: { increment: 5 },
          nextAttemptAt: await this.now(tx),
          lastError: null,
        },
      });
      await tx.draftMessage.update({
        where: { id: message.id },
        data: { status: 'DISPATCHING' },
      });
      return true;
    });
  }
}
