import { z } from 'zod';
export const mailboxBox = z.enum([
  'created',
  'scheduled',
  'sent',
  'received',
  'drafts',
  'failed',
]);
export const messageState = z.enum([
  'DRAFT',
  'SCHEDULED',
  'CANCELED',
  'DISPATCHING',
  'DELIVERED',
  'PARTIALLY_DELIVERED',
  'FAILED',
]);
const reading = z.enum(['all', 'opened', 'unopened']);
const cursor = z
  .object({
    box: mailboxBox,
    status: messageState.nullable(),
    read: reading,
    at: z.string().datetime(),
    id: z.string().uuid(),
  })
  .strict();
export const mailboxQuery = z
  .object({
    box: mailboxBox.default('created'),
    status: messageState.optional(),
    read: reading.default('all'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((v, ctx) => {
        try {
          const b = Buffer.from(v, 'base64url');
          if (b.toString('base64url') !== v) throw Error();
          return cursor.parse(JSON.parse(b.toString()));
        } catch {
          ctx.addIssue({ code: 'custom', message: 'Invalid mailbox cursor.' });
          return z.NEVER;
        }
      })
      .optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      (v.box === 'received' && v.status) ||
      (v.box !== 'received' && v.read !== 'all')
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid filters for this mailbox.',
      });
    if (
      v.cursor &&
      (v.cursor.box !== v.box ||
        v.cursor.status !== (v.status ?? null) ||
        v.cursor.read !== v.read)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Cursor belongs to different filters.',
      });
  });
export const ownedMessageParams = z.object({ id: z.string().uuid() }).strict();
export const historyQuery = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
