import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { databaseTime } from '../utils/databaseTime';
import { lockMessage } from '../utils/lockMessage';
import { recordMessageEvent } from './messageEvent.service';
const missing = () =>
  new ApiError(
    404,
    'LINK_UNAVAILABLE',
    'This link is unavailable, expired or revoked. Ask the sender for help.',
  );
export function accessToken(id: string, secret: string) {
  return `${id}.${createHmac('sha256', secret).update(`dearly.email.access.v1:${id}`).digest('base64url')}`;
}
export function accessId(token: string, secret: string): string | null {
  if (!/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const id = token.slice(0, 36),
    expected = Buffer.from(accessToken(id, secret)),
    actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual)
    ? id
    : null;
}
export function fileHandle(access: string, file: string, secret: string) {
  return createHmac('sha256', secret)
    .update(`dearly.email.file.v1:${access}:${file}`)
    .digest('base64url');
}
export class ExternalAccessService {
  constructor(
    private readonly db: PrismaClient,
    private readonly secret: string,
  ) {}
  private async authorized(
    tx: Prisma.TransactionClient | PrismaClient,
    token: string,
  ) {
    const id = accessId(token, this.secret);
    if (!id) throw missing();
    const row = await tx.emailDelivery.findUnique({
      where: { id },
      include: {
        intent: { include: { message: { include: { attachments: true } } } },
      },
    });
    const now = await databaseTime(tx);
    if (
      !row ||
      row.revokedAt ||
      row.expiresAt <= now ||
      !['SUBMITTING', 'ACCEPTED', 'UNKNOWN'].includes(row.state) ||
      row.intent.channel !== 'EMAIL' ||
      !row.intent.message.deliveryEnabled ||
      !row.intent.message.scheduledFor ||
      row.intent.message.scheduledFor > now
    )
      throw missing();
    return { row, now };
  }
  async open(token: string) {
    return this.db.$transaction(
      async (tx) => {
        const initial = await this.authorized(tx, token);
        const initialMessage = initial.row.intent.message;
        if (!(await lockMessage(tx, initialMessage.ownerId, initialMessage.id)))
          throw missing();
        const { row, now } = await this.authorized(tx, token);
        const message = row.intent.message;
        if (!row.openedAt) {
          await tx.emailDelivery.update({
            where: { id: row.id },
            data: { openedAt: now },
          });
          await recordMessageEvent(
            tx,
            message.id,
            'OPENED',
            message.status,
            message.version,
          );
        }
        return {
          subject: message.subject,
          text: message.text,
          occasion: message.occasion,
          expiresAt: row.expiresAt,
          attachments: message.attachments
            .filter((a) => a.state === 'READY')
            .map((a) => ({
              handle: fileHandle(row.id, a.id, this.secret),
              name: a.name,
              mime: a.mime,
              bytes: a.bytes,
            })),
        };
      },
      { timeout: 15000, maxWait: 15000 },
    );
  }
  async file(token: string, handle: string) {
    const { row } = await this.authorized(this.db, token);
    const file = row.intent.message.attachments.find(
      (a) =>
        a.state === 'READY' && fileHandle(row.id, a.id, this.secret) === handle,
    );
    if (!file) throw missing();
    return file;
  }
  async revoke(ownerId: string, intentId: string) {
    return this.db.$transaction(async (tx) => {
      const intent = await tx.deliveryIntent.findFirst({
        where: { id: intentId, channel: 'EMAIL', message: { ownerId } },
        include: { emailDelivery: true, message: true },
      });
      if (
        !intent?.emailDelivery ||
        !(await lockMessage(tx, ownerId, intent.messageId))
      )
        throw missing();
      const revoked = await tx.emailDelivery.updateMany({
        where: { id: intent.emailDelivery.id, revokedAt: null },
        data: { revokedAt: await databaseTime(tx) },
      });
      const current = await tx.draftMessage.findUniqueOrThrow({
        where: { id: intent.messageId },
      });
      if (revoked.count)
        await recordMessageEvent(
          tx,
          intent.messageId,
          'EMAIL_LINK_REVOKED',
          current.status,
          current.version,
        );
      return { revoked: true };
    });
  }
}
