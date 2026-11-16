import { Prisma, type DraftMessage, type DraftRecipient, type PrismaClient } from '@prisma/client';
import type { CreateDraftInput, UpdateDraftInput, ListDraftsInput, RecipientInput } from '../validators/draft.validators';
import { ApiError } from '../utils/ApiError';

const notFound = () => new ApiError(404, 'DRAFT_NOT_FOUND', 'Draft not found.');
const conflict = () => new ApiError(409, 'VERSION_CONFLICT', 'This draft changed. Reload it before saving or deleting.');
const unavailable = () => new ApiError(400, 'INVALID_RECIPIENTS', 'One or more account recipients are unavailable.');
const includeRecipients = { recipients: { orderBy: { position: 'asc' as const } } };
type WithRecipients = DraftMessage & { recipients: DraftRecipient[] };

// Deduplicate only within the same destination kind; SELF and the owner's USER
// reference are the same account. Never discover accounts from phone/email input.
export function canonicalRecipients(ownerId: string, input: RecipientInput[]) {
  const seen = new Set<string>();
  const rows: Omit<Prisma.DraftRecipientCreateManyInput, 'messageId'>[] = [];
  for (const recipient of input) {
    const targetUserId = recipient.type === 'SELF' ? ownerId : recipient.type === 'USER' ? recipient.userId : null;
    const type = targetUserId === ownerId ? 'SELF' : recipient.type;
    const key = targetUserId ? `user:${targetUserId}` : recipient.type === 'PHONE' ? `phone:${recipient.phone}` : recipient.type === 'EMAIL' ? `email:${recipient.email}` : '';
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ type, targetUserId, destinationKey: key, position: rows.length, label: recipient.label ?? null,
      phone: recipient.type === 'PHONE' ? recipient.phone : null,
      country: recipient.type === 'PHONE' ? recipient.country : null,
      email: recipient.type === 'EMAIL' ? recipient.email : null });
  }
  return rows;
}

export function publicDraft(message: WithRecipients) {
  return {
    id: message.id, status: message.status, subject: message.subject, text: message.text,
    occasion: message.occasion, version: message.version, createdAt: message.createdAt, updatedAt: message.updatedAt,
    recipients: message.recipients.map((r) => ({ id: r.id, type: r.type, label: r.label,
      ...(['SELF', 'USER'].includes(r.type) && { userId: r.targetUserId, unavailable: r.targetUserId === null }),
      ...(r.type === 'PHONE' && { phone: r.phone, country: r.country }),
      ...(r.type === 'EMAIL' && { email: r.email }),
    })),
  };
}

export class DraftService {
  constructor(private readonly db: PrismaClient) {}

  private async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 });
    } catch (error) {
      // A recipient account may disappear between validation and its FK insert.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw unavailable();
      throw error;
    }
  }

  private async validateTargets(tx: Prisma.TransactionClient, rows: ReturnType<typeof canonicalRecipients>) {
    const ids = [...new Set(rows.flatMap((r) => r.targetUserId ? [r.targetUserId] : []))];
    if (!ids.length) return;
    const found = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (found.length !== ids.length) throw unavailable();
  }

  private async owned(tx: Prisma.TransactionClient, ownerId: string, id: string) {
    const message = await tx.draftMessage.findFirst({ where: { id, ownerId } });
    if (!message) throw notFound();
    if (message.status !== 'DRAFT') throw new ApiError(409, 'DRAFT_NOT_EDITABLE', 'This message is no longer a draft.');
    return message;
  }

  async create(ownerId: string, input: CreateDraftInput) {
    return this.transaction(async (tx) => {
      const rows = canonicalRecipients(ownerId, input.recipients ?? []);
      await this.validateTargets(tx, rows);
      const message = await tx.draftMessage.create({ data: {
        ownerId, subject: input.subject ?? null, text: input.text ?? '', occasion: input.occasion ?? null,
        recipients: { createMany: { data: rows } },
      }, include: includeRecipients });
      return publicDraft(message);
    });
  }

  async read(ownerId: string, id: string) {
    // Nested reads may issue separate SQL statements. Keep version/content and
    // recipients in the same snapshot while another client replaces recipients.
    return this.db.$transaction(async (tx) => {
      const message = await tx.draftMessage.findFirst({ where: { id, ownerId, status: 'DRAFT' }, include: includeRecipients });
      if (!message) throw notFound();
      return publicDraft(message);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 15000 });
  }

  async list(ownerId: string, input: ListDraftsInput) {
    const cursor = input.cursor;
    const messages = await this.db.draftMessage.findMany({
      where: { ownerId, status: 'DRAFT', ...(cursor && { OR: [
        { createdAt: { lt: new Date(cursor.createdAt) } },
        { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
      ] }) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: input.limit + 1,
      select: { id: true, status: true, subject: true, text: true, occasion: true, version: true, createdAt: true, updatedAt: true, _count: { select: { recipients: true } } },
    });
    const more = messages.length > input.limit;
    const page = messages.slice(0, input.limit);
    const last = page.at(-1);
    return {
      items: page.map(({ text, _count, ...row }) => ({ ...row, textPreview: Array.from(text).slice(0, 160).join(''), recipientCount: _count.recipients })),
      nextCursor: more && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null,
    };
  }

  async update(ownerId: string, id: string, input: UpdateDraftInput) {
    return this.transaction(async (tx) => {
      const current = await this.owned(tx, ownerId, id);
      if (current.version !== input.version) throw conflict();
      const rows = input.recipients === undefined ? undefined : canonicalRecipients(ownerId, input.recipients);
      if (rows) await this.validateTargets(tx, rows);
      const changed = await tx.draftMessage.updateMany({ where: { id, ownerId, status: 'DRAFT', version: input.version }, data: {
        ...(input.subject !== undefined && { subject: input.subject }), ...(input.text !== undefined && { text: input.text }),
        ...(input.occasion !== undefined && { occasion: input.occasion }), version: { increment: 1 },
      } });
      if (changed.count !== 1) { await this.owned(tx, ownerId, id); throw conflict(); }
      if (rows) {
        await tx.draftRecipient.deleteMany({ where: { messageId: id } });
        if (rows.length) await tx.draftRecipient.createMany({ data: rows.map((r) => ({ ...r, messageId: id })) });
      }
      const message = await tx.draftMessage.findFirstOrThrow({ where: { id, ownerId }, include: includeRecipients });
      return publicDraft(message);
    });
  }

  async delete(ownerId: string, id: string, version: number) {
    return this.transaction(async (tx) => {
      const current = await this.owned(tx, ownerId, id);
      if (current.version !== version) throw conflict();
      const removed = await tx.draftMessage.deleteMany({ where: { id, ownerId, status: 'DRAFT', version } });
      if (removed.count !== 1) { await this.owned(tx, ownerId, id); throw conflict(); }
      return { id, deleted: true };
    });
  }
}
