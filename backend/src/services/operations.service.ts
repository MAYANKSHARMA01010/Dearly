import { releaseIdentity } from './releaseIdentity.service';
import { Client } from 'pg';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../configs/env';
import { AttachmentService } from './attachment.service';
import type { ObjectStore } from '../providers/storage/local.storage';
import { databaseTime } from '../utils/databaseTime';
import { workerStatus } from './workerStatus.service';
import { WahaProvider } from '../providers/whatsapp/waha.provider';
import { ApiError } from '../utils/ApiError';
type Lock = <T>(work: (signal: AbortSignal) => Promise<T>) => Promise<T>;
/** Keep a transaction-scoped lock pinned even through a transaction pooler.
 * Never use a session-level advisory lock through PgBouncer. Losing the pinned
 * connection cancels further work. Existing destructive operations are idempotent. */
export function operationsLock(databaseUrl: string): Lock {
    return async (work) => {
        const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, query_timeout: 5000, application_name: 'dearly-maintenance' });
        const canceled = new AbortController();
        client.on('error', () => canceled.abort());
        client.on('end', () => canceled.abort());
        let begun = false;
        try {
            await client.connect();
            await client.query('BEGIN');
            begun = true;
            await client.query("SET LOCAL idle_in_transaction_session_timeout = '60s'");
            await client.query("SET LOCAL statement_timeout = '5s'");
            const result = await client.query<{
                locked: boolean;
            }>('SELECT pg_try_advisory_xact_lock(582823) AS locked');
            if (!result.rows[0].locked)
                throw new ApiError(409, 'OPERATIONS_BUSY', 'Another maintenance batch is running.');
            return await work(AbortSignal.any([canceled.signal, AbortSignal.timeout(30000)]));
        }
        finally {
            if (begun)
                await client.query('ROLLBACK').catch(() => { });
            await client.end().catch(() => { });
        }
    };
}
export class OperationsService {
    private readonly lock: Lock;
    constructor(private readonly db: PrismaClient, private readonly config: AppConfig, private readonly store: ObjectStore, lock?: Lock) { this.lock = lock ?? operationsLock(config.databaseUrl); }
    async maintenance(id: string) {
        return this.lock(async (signal) => {
            const previous = await this.db.operationsRun.findUnique({ where: { id } });
            if (previous)
                return previous; // Never replay a completed, failed or uncertain run ID.
            const now = await databaseTime(this.db);
            signal.throwIfAborted();
            // A previous process may have died without finishing its journal record.
            const abandoned = await this.db.operationsRun.findMany({ where: { state: 'RUNNING', startedAt: { lt: new Date(now.getTime() - 60000) } }, select: { id: true }, take: 100 });
            await this.db.operationsRun.updateMany({ where: { id: { in: abandoned.map(r => r.id) }, state: 'RUNNING' }, data: { state: 'INTERRUPTED', finishedAt: now } });
            await this.db.operationsRun.create({ data: { id, state: 'RUNNING', startedAt: now } });
            try {
                const attachments = await new AttachmentService(this.db, this.store, this.config.ffprobePath).cleanup(now, { signal, limit: 10 });
                signal.throwIfAborted();
                const waha = await this.db.wahaReceipt.findMany({ where: { expiresAt: { lte: now } }, select: { id: true }, take: 100 });
                const sms = await this.db.smsReceipt.findMany({ where: { expiresAt: { lte: now } }, select: { id: true }, take: 100 });
                signal.throwIfAborted();
                const whatsapp = await this.db.wahaReceipt.deleteMany({ where: { id: { in: waha.map(r => r.id) }, expiresAt: { lte: now } } });
                signal.throwIfAborted();
                const texts = await this.db.smsReceipt.deleteMany({ where: { id: { in: sms.map(r => r.id) }, expiresAt: { lte: now } } });
                const old = await this.db.operationsRun.findMany({ where: { startedAt: { lt: new Date(now.getTime() - 30 * 86400000) }, state: { not: 'RUNNING' } }, select: { id: true }, take: 100 });
                signal.throwIfAborted();
                await this.db.operationsRun.deleteMany({ where: { id: { in: old.map(r => r.id) } } });
                return await this.db.operationsRun.update({ where: { id }, data: { state: 'SUCCEEDED', finishedAt: await databaseTime(this.db), counts: { attachments: attachments.removed, orphans: attachments.orphans, whatsappReceipts: whatsapp.count, smsReceipts: texts.count, oldRuns: old.length } } });
            }
            catch {
                await this.db.operationsRun.update({ where: { id }, data: { state: 'FAILED', finishedAt: await databaseTime(this.db) } }).catch(() => { });
                throw new ApiError(503, 'OPERATIONS_FAILED', 'Maintenance stopped. Completed cleanup is not rolled back; inspect the sanitized run journal.');
            }
        });
    }
    async status() {
        // Both checks finish independently; no WAHA reset, pairing or send call exists here.
        const [backend, waha] = await Promise.allSettled([
            (async () => { const now = await databaseTime(this.db); const [worker, overdueDeliveryWork, expiredLeases, pendingPush, lastMaintenance] = await Promise.all([workerStatus(this.db), this.db.deliveryWork.count({ where: { state: 'READY', nextAttemptAt: { lt: new Date(now.getTime() - 3600000) }, message: { deliveryEnabled: true, status: { in: ['SCHEDULED', 'DISPATCHING'] } } } }), this.db.deliveryWork.count({ where: { state: 'RUNNING', leaseExpiresAt: { lt: now } } }), this.db.pushJob.count({ where: { state: 'READY' } }), this.db.operationsRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { id: true, state: true, startedAt: true, finishedAt: true, counts: true } })]); return { worker: worker.status, queueHealthy: overdueDeliveryWork === 0, overdueDeliveryWork, expiredLeases, pendingPush, lastMaintenance }; })(),
            this.config.whatsapp ? new WahaProvider(this.config.whatsapp).readiness(65000) : Promise.resolve('DISABLED'),
        ]);
        return { release: releaseIdentity(), backend: backend.status === 'fulfilled' ? { database: 'ready', ...backend.value } : { database: 'unavailable', worker: 'unavailable', lastMaintenance: null }, waha: { status: waha.status === 'fulfilled' ? waha.value : 'UNAVAILABLE' } };
    }
}
