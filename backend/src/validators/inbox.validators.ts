import { z } from 'zod';
const uuid = z.string().uuid();
export const inboxParams = z
  .object({ id: uuid, attachmentId: uuid.optional() })
  .strict();
export const inboxList = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((value, ctx) => {
        try {
          const b = Buffer.from(value, 'base64url');
          if (b.toString('base64url') !== value) throw Error();
          return z
            .object({ id: uuid, deliveredAt: z.string().datetime() })
            .strict()
            .parse(JSON.parse(b.toString()));
        } catch {
          ctx.addIssue({ code: 'custom', message: 'Invalid inbox cursor.' });
          return z.NEVER;
        }
      })
      .optional(),
  })
  .strict();
