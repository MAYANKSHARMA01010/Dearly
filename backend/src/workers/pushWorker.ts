import { ExpoPushProvider } from '../providers/push/expo.provider';
import type { PrismaClient } from '@prisma/client';
import { boundedJson } from '../utils/boundedJson';
/** Persist before POST; a crash/timeout after reservation is never blindly replayed. */
export class PushWorker {
  private provider: ExpoPushProvider;
  constructor(private db: PrismaClient, request: typeof fetch = fetch, accessToken?: string) {
    this.provider = new ExpoPushProvider(request, accessToken);
  }
  async run(signal?: AbortSignal) {
    await this.db.pushJob.updateMany({
      where: {
        state: 'SUBMITTING',
        submittedAt: { lt: new Date(Date.now() - 60000) },
      },
      data: { state: 'UNKNOWN', errorCode: 'PUSH_UNCERTAIN' },
    });
    const ready = await this.db.pushJob.findMany({
      where: { state: 'READY' },
      take: 20,
      orderBy: { id: 'asc' },
    });
    for (const work of ready) {
      if (signal?.aborted) break;
      const job = await this.db.$transaction(async (tx) => {
        if (
          !(
            await tx.pushJob.updateMany({
              where: { id: work.id, state: 'READY' },
              data: { state: 'SUBMITTING', submittedAt: new Date() },
            })
          ).count
        )
          return null;
        const row = await tx.pushJob.findUniqueOrThrow({
          where: { id: work.id },
          include: {
            notification: true,
            device: {
              include: {
                session: true,
                user: { include: { preferences: true } },
              },
            },
          },
        });
        const d = row.device,
          p = d.user.preferences;
        if (
          d.disabledAt ||
          d.userId !== row.notification.userId ||
          d.updatedAt > row.notification.createdAt ||
          d.session.revokedAt ||
          d.session.expiresAt <= new Date() ||
          !p?.pushAlerts ||
          !p.inAppAlerts ||
          row.notification.readAt
        ) {
          await tx.pushJob.update({
            where: { id: row.id },
            data: { state: 'SKIPPED' },
          });
          return null;
        }
        return row;
      });
      if (!job) continue;
      try {
        const r = await this.provider.post('send', {
          to: job.device.token,
          title: 'Dearly',
          body: 'You have a new update in Dearly.',
          data: { notificationId: job.notificationId },
          ttl: 3600,
          channelId: 'dearly-updates',
        });
        if (!r.ok) {
          await this.db.pushJob.update({
            where: { id: job.id },
            data: {
              state: r.status < 500 ? 'FAILED' : 'UNKNOWN',
              errorCode: 'PUSH_HTTP',
            },
          });
          continue;
        }
        const body = await boundedJson(r),
          ticket = body.data as {
            status?: string;
            id?: string;
            details?: { error?: string };
          };
        if (
          ticket?.status === 'ok' &&
          typeof ticket.id === 'string' &&
          ticket.id.length <= 128
        )
          await this.db.pushJob.update({
            where: { id: job.id },
            data: { state: 'ACCEPTED', ticketId: ticket.id },
          });
        else {
          await this.db.pushJob.update({
            where: { id: job.id },
            data: {
              state: ticket?.status === 'error' ? 'FAILED' : 'UNKNOWN',
              errorCode:
                ticket?.details?.error === 'DeviceNotRegistered'
                  ? 'DEVICE_NOT_REGISTERED'
                  : 'PUSH_REJECTED',
            },
          });
          if (ticket?.details?.error === 'DeviceNotRegistered')
            await this.db.pushDevice.updateMany({
              where: { id: job.deviceId, token: job.device.token },
              data: { disabledAt: new Date() },
            });
        }
      } catch {
        await this.db.pushJob.updateMany({
          where: { id: job.id, state: 'SUBMITTING' },
          data: { state: 'UNKNOWN', errorCode: 'PUSH_UNCERTAIN' },
        });
      }
    }
    const receipts = await this.db.pushJob.findMany({
      where: {
        state: 'ACCEPTED',
        submittedAt: { lt: new Date(Date.now() - 15 * 60000) },
      },
      take: 20,
      include: { device: true },
    });
    for (const job of receipts) {
      if (signal?.aborted) break;
      if (!job.ticketId) continue;
      try {
        const r = await this.provider.post('getReceipts', { ids: [job.ticketId] });
        if (!r.ok) continue;
        const body = await boundedJson(r),
          receipt = (
            body.data as Record<
              string,
              { status?: string; details?: { error?: string } }
            >
          )?.[job.ticketId];
        if (!receipt) {
          if (job.submittedAt! < new Date(Date.now() - 24 * 3600000))
            await this.db.pushJob.update({
              where: { id: job.id },
              data: { state: 'UNKNOWN', errorCode: 'RECEIPT_UNAVAILABLE' },
            });
          continue;
        }
        const invalid = receipt.details?.error === 'DeviceNotRegistered';
        await this.db.pushJob.update({
          where: { id: job.id },
          data: {
            state: receipt.status === 'ok' ? 'PROVIDER_ACCEPTED' : 'FAILED',
            checkedAt: new Date(),
            errorCode:
              receipt.status === 'ok'
                ? null
                : invalid
                  ? 'DEVICE_NOT_REGISTERED'
                  : 'PUSH_RECEIPT_ERROR',
          },
        });
        if (
          invalid &&
          job.submittedAt &&
          job.device.updatedAt <= job.submittedAt
        )
          await this.db.pushDevice.updateMany({
            where: { id: job.deviceId, updatedAt: job.device.updatedAt },
            data: { disabledAt: new Date() },
          });
      } catch {
        /* Receipt lookup is read-only and safe to repeat next tick. */
      }
    }
  }
}
