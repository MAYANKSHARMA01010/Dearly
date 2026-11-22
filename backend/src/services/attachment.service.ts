import { mediaAccess } from '../utils/mediaAccess';
import { lockMessage } from '../utils/lockMessage';
import { Prisma, type PrismaClient, type Attachment } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { objectPath, type ObjectStore } from '../providers/storage/local.storage';
import { inspectFile } from '../providers/storage/inspectFile';
import { attachmentLimits as limits } from '../constants/attachments';
import type { Reservation } from '../validators/attachment.validators';
import { ApiError } from '../utils/ApiError';
const missing = () => new ApiError(404, 'ATTACHMENT_NOT_FOUND', 'Attachment is unavailable.');
const conflict = () => new ApiError(409, 'UPLOAD_STATE', 'Refresh the attachment state before trying again.');
export const publicAttachment = (row: Attachment) => ({ id: row.id, name: row.name, mime: row.mime, bytes: row.bytes, state: row.state, createdAt: row.createdAt, expiresAt: row.expiresAt });

export class AttachmentService {
  constructor(private readonly db: PrismaClient, readonly store: ObjectStore, private readonly ffprobe = 'ffprobe') {}
  private async owned(ownerId: string, draftId: string, id?: string, editable = false) {
    const message = await this.db.draftMessage.findFirst({ where: { id: draftId, ownerId }, select: { status: true } });
    if (!message) throw missing();
    if (editable && message.status !== 'DRAFT') throw new ApiError(409, 'MESSAGE_LOCKED', 'Return this message to drafts before changing attachments.');
    if (id) {
      const row = await this.db.attachment.findFirst({ where: { id, ownerId, draftId, state: { not: 'DELETING' } } });
      if (!row) throw missing(); return row;
    }
  }
  async list(ownerId: string, draftId: string) {
    await this.owned(ownerId, draftId);
    return { items: (await this.db.attachment.findMany({ where: { ownerId, draftId, state: { not: 'DELETING' } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limits.count })).map(publicAttachment) };
  }
  async read(ownerId: string, draftId: string, id: string) { return publicAttachment((await this.owned(ownerId, draftId, id))!); }
  async reserve(ownerId: string, draftId: string, input: Reservation) {
    return this.db.$transaction(async (tx) => {
      // Serialize reservations across processes before evaluating global/account quotas.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(582817)`;
      if (!await lockMessage(tx, ownerId, draftId)) throw missing();
      const message = await tx.draftMessage.findUniqueOrThrow({where: {id: draftId}, select: {status: true}});
      if (message.status !== 'DRAFT') throw new ApiError(409, 'MESSAGE_LOCKED', 'Return this message to drafts before changing attachments.');
      const existing = await tx.attachment.findUnique({ where: { id: input.id } });
      if (existing) {
        if (existing.ownerId !== ownerId || existing.draftId !== draftId) throw missing();
        if (existing.name !== input.name || existing.bytes !== input.bytes || existing.mime !== input.mime || existing.state === 'DELETING') throw conflict();
        return publicAttachment(existing);
      }
      const [draft, account, total] = await Promise.all([
        tx.attachment.aggregate({ where: { draftId }, _sum: { bytes: true }, _count: true }),
        tx.attachment.aggregate({ where: { ownerId }, _sum: { bytes: true } }), tx.attachment.aggregate({ _sum: { bytes: true } }),
      ]);
      if (draft._count >= limits.count || (draft._sum.bytes ?? 0) + input.bytes > limits.draftBytes || (account._sum.bytes ?? 0) + input.bytes > limits.accountBytes || (total._sum.bytes ?? 0) + input.bytes > Math.min(limits.totalBytes, this.store.capacityBytes ?? limits.totalBytes)) throw new ApiError(409, 'ATTACHMENT_QUOTA', 'Attachment count or storage allowance is full.');
      return publicAttachment(await tx.attachment.create({ data: { ...input, ownerId, draftId, expiresAt: new Date(Date.now() + limits.reservationMs) } }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 15000, timeout: 15000 });
  }
  async upload(ownerId: string, draftId: string, id: string, input: Readable, signal?: AbortSignal) {
    const row = (await this.owned(ownerId, draftId, id, true))!;
    if (row.expiresAt.getTime() <= Date.now() || row.state !== 'PENDING') throw conflict();
    const attemptId = randomUUID();
    const claimed = await this.db.attachment.updateMany({ where: { id, ownerId, draftId, state: 'PENDING', expiresAt: { gt: new Date() } }, data: { state: 'UPLOADING', attemptId } });
    if (claimed.count !== 1) throw conflict();
    try {
      const sha256 = await this.store.write(id, attemptId, input, row.bytes, signal);
      const changed = await this.db.attachment.updateMany({ where: { id, draftId, ownerId, state: 'UPLOADING', attemptId }, data: { state: 'UPLOADED', sha256 } });
      if (changed.count !== 1) throw conflict();
      return this.read(ownerId, draftId, id);
    } catch (error) {
      await this.db.attachment.updateMany({ where: { id, state: 'UPLOADING', attemptId }, data: { state: 'PENDING', attemptId: null } }); throw error;
    }
  }
  async finalize(ownerId: string, draftId: string, id: string) {
    const row = (await this.owned(ownerId, draftId, id, true))!;
    if (row.state === 'READY') return publicAttachment(row);
    if (row.state !== 'UPLOADED' || row.expiresAt.getTime() <= Date.now()) throw conflict();
    await inspectFile(await objectPath(this.store, id, row.bytes, row.sha256), row.mime, this.ffprobe);
    const changed = await this.db.attachment.updateMany({ where: { id, ownerId, draftId, state: 'UPLOADED', expiresAt: { gt: new Date() } }, data: { state: 'READY' } });
    if (changed.count !== 1) {
      const current = (await this.owned(ownerId, draftId, id))!;
      if (current.state !== 'READY') throw conflict();
    }
    return this.read(ownerId, draftId, id);
  }
  async access(ownerId: string, draftId: string, id: string) { return mediaAccess((await this.owned(ownerId, draftId, id))!); }
  async content(ownerId: string, draftId: string, id: string) {
    const row = (await this.owned(ownerId, draftId, id))!;
    if (row.state !== 'READY') throw conflict(); return { path: await objectPath(this.store, id, row.bytes, row.sha256), mime: row.mime };
  }
  async remove(ownerId: string, draftId: string, id: string) {
    const removed = await this.db.$transaction(async (tx) => {
      if (!await lockMessage(tx, ownerId, draftId)) throw missing();
      const message = await tx.draftMessage.findUniqueOrThrow({where: {id: draftId}, select: {status: true}});
      if (message.status !== 'DRAFT') throw new ApiError(409, 'MESSAGE_LOCKED', 'Return this message to drafts before changing attachments.');
      const row = await tx.attachment.findFirst({ where: { id, draftId, ownerId } });
      if (!row) return false;
      if (row.state === 'UPLOADING' && Date.now() - row.updatedAt.getTime() < limits.leaseMs) throw conflict();
      const marked = await tx.attachment.updateMany({ where: { id, ownerId, draftId, state: row.state, updatedAt: row.updatedAt }, data: { state: 'DELETING' } });
      if (!marked.count) throw conflict();
      return true;
    }, {maxWait:15000,timeout:15000});
    if (!removed) return {id,deleted:true};
    await this.erase(id); return { id, deleted: true };
  }
  private async erase(id: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    await this.store.remove(id, signal);
    for (const entry of await this.store.entries(signal)) if (entry.key.startsWith(`${id}.`)) { signal?.throwIfAborted(); await this.store.remove(entry.key, signal); }
    await this.db.attachment.deleteMany({ where: { id, state: 'DELETING' } });
  }
  async cleanup(now = new Date(), options: {signal?:AbortSignal;limit?:number} = {}) {
    const {signal} = options; const limit = Math.min(100,Math.max(1,options.limit ?? 100));
    signal?.throwIfAborted();
    let removed = 0; let orphans = 0;
    const stale = new Date(now.getTime() - limits.leaseMs);
    const rows = await this.db.attachment.findMany({ where: { OR: [{ draftId: null }, { state: 'DELETING' }, { state: { not: 'READY' }, expiresAt: { lte: now } }, { state: 'UPLOADING', updatedAt: { lt: stale } }] }, take: limit });
    for (const row of rows) {
      signal?.throwIfAborted();
      if (row.state === 'UPLOADING' && row.updatedAt >= stale) continue;
      const marked = await this.db.attachment.updateMany({ where: { id: row.id, updatedAt: row.updatedAt, state: row.state }, data: { state: 'DELETING' } });
      if (marked.count) { await this.erase(row.id, signal); removed++; }
    }
    for (const entry of await this.store.entries(signal)) {
      signal?.throwIfAborted();
      if (entry.modified > now.getTime() - limits.reservationMs || orphans >= limit) continue;
      const id = entry.key.slice(0, 36);
      await this.db.$transaction(async (tx) => {
        // A reservation using the same UUID cannot race an orphan's last check.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(582817)`;
        const row = await tx.attachment.findUnique({ where: { id }, select: { state: true } });
        if (!row || (entry.key.endsWith('.part') && row.state !== 'UPLOADING')) { signal?.throwIfAborted(); await this.store.remove(entry.key, signal); orphans++; }
      });
    }
    return { removed, orphans };
  }
}
