import { deleteExpiredOtpMessages } from '../jobs/deleteExpiredOtpMessages';
import { SmsGateProvider } from '../providers/sms/smsgate.provider';
import { SmsReceiptService } from '../services/smsReceipt.service';
import { WahaProvider } from '../providers/whatsapp/waha.provider';
import { WahaReceiptService } from '../services/wahaReceipt.service';
import type {
  ExternalProvider,
  ExternalChannel,
} from '../providers/external.provider';
import { ExternalDelivery } from './externalDelivery';
import { createEmailSender } from '../providers/email/email.provider';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { loadEnvironment } from '../configs/loadEnvironment';
import { createDatabase } from '../configs/database';
import { createObjectStore } from '../providers/storage/createObjectStore';
import { enqueueDeliveries } from '../jobs/enqueueDeliveries';
import { DeliveryWorker, deliveryPolicy } from './deliveryWorker';
import { createLogger } from '../utils/logger';

export interface WorkerLoop {
  enqueue(): Promise<unknown>;
  claim(): Promise<import('./deliveryWorker').Claim | null>;
  execute(claim: import('./deliveryWorker').Claim): Promise<unknown>;
  heartbeat(stopped?: boolean): Promise<unknown>;
}
/** Stop taking work on SIGTERM; finish the current bounded transaction, then close. */
export async function runWorkerLoop(
  worker: WorkerLoop,
  signal: AbortSignal,
  pollMs = deliveryPolicy.pollMs,
  onError: () => void = () => {},
) {
  let pulse: Promise<unknown> | undefined;
  const timer = setInterval(
    () => {
      if (!signal.aborted && !pulse)
        pulse = worker
          .heartbeat()
          .catch(onError)
          .finally(() => {
            pulse = undefined;
          });
    },
    Math.min(pollMs, 30000),
  );
  timer.unref();
  try {
    while (!signal.aborted) {
      try {
        await worker.heartbeat();
        if (signal.aborted) break;
        await worker.enqueue();
        for (let n = 0; n < 20 && !signal.aborted; n++) {
          const claim = await worker.claim();
          if (!claim) break;
          await worker.execute(claim);
          await worker.heartbeat();
        }
      } catch {
        onError();
      }
      if (!signal.aborted)
        try {
          await delay(pollMs, undefined, { signal });
        } catch {
          /* shutdown wakes the poll */
        }
    }
  } finally {
    clearInterval(timer);
    await pulse;
    try {
      await worker.heartbeat(true);
    } catch {
      onError();
    }
  }
}
async function main() {
  const config = loadEnvironment(),
    db = createDatabase(config.databaseUrl),
    log = createLogger(config.logLevel),
    id = randomUUID();
  const providers: Partial<Record<ExternalChannel, ExternalProvider>> = {};
  if (config.email && config.externalAccess)
    providers.EMAIL = {
      senderKey: config.email.user,
      dailyLimit: config.externalAccess.dailyLimit,
      send: createEmailSender(config.email),
    };
  if (config.whatsapp && config.externalAccess) {
    const waha = new WahaProvider(config.whatsapp),
      receipts = new WahaReceiptService(db.prisma!, config.whatsapp);
    providers.WHATSAPP = {
      senderKey: `whatsapp:${waha.scope}`,
      scope: waha.scope,
      dailyLimit: config.whatsapp.dailyLimit,
      send: (to, link) => waha.send(to, link),
      reconcile: (id) => receipts.reconcile(id),
    };
  }
  if (config.sms) {
    const sms = new SmsGateProvider(config.sms), receipts = new SmsReceiptService(db.prisma!, config.sms);
    providers.SMS = { senderKey: `sms:${sms.scope}`, scope: sms.scope, dailyLimit: config.sms.dailyLimit,
      send: (to, link, id) => sms.send(to, link, id), reconcile: (id) => receipts.reconcile(id) };
  }
  const worker = new DeliveryWorker(
    db.prisma!,
    createObjectStore(config),
    undefined,
    undefined,
    config.externalAccess
      ? new ExternalDelivery(db.prisma!, config.externalAccess, providers)
      : undefined,
  );
  const otpGateway = config.whatsapp ? new WahaProvider(config.whatsapp) : undefined;
  const stop = new AbortController();
  let deadline: NodeJS.Timeout | undefined;
  const shutdown = () => {
    stop.abort();
    deadline ??= setTimeout(() => {
      log.error('delivery.worker.shutdown_deadline', {
        code: 'SHUTDOWN_DEADLINE',
      });
      process.exit(1);
    }, 45000);
    deadline.unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  try {
    log.info('delivery.worker.started');
    await runWorkerLoop(
      {
        enqueue: async () => {
          if (otpGateway) {
            try {
              const result = await deleteExpiredOtpMessages(db.prisma!, otpGateway);
              if (result.failed) log.warn('auth.otp.deletion_retry_pending');
            } catch { log.error('auth.otp.deletion_cycle_failed'); }
          }
          return enqueueDeliveries(db.prisma!);
        },
        claim: () => worker.claim(),
        execute: (c) => worker.execute(c),
        heartbeat: (stopped) => worker.heartbeat(id, stopped),
      },
      stop.signal,
      deliveryPolicy.pollMs,
      () =>
        log.error('delivery.worker.cycle_failed', {
          code: 'DELIVERY_CYCLE_FAILED',
        }),
    );
  } finally {
    process.off('SIGTERM', shutdown);
    process.off('SIGINT', shutdown);
    await db.disconnect();
    clearTimeout(deadline);
    log.info('delivery.worker.stopped');
  }
}
if (require.main === module)
  void main().catch(() => {
    process.stderr.write(
      'Delivery worker stopped. Check database availability and applied migrations.\n',
    );
    process.exitCode = 1;
  });
