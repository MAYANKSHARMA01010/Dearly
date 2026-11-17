import { z } from 'zod';
import { createDraftSchema } from './draft.validators';
export const scheduleVersion = z
  .object({ version: z.number().int().min(1).max(2147483646) })
  .strict();
const time = {
  whatsappConsent: z.boolean().optional(),
  localDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  timezone: z.string().min(1).max(80),
};
export const scheduleChoice = scheduleVersion
  .extend({
    ...time,
    deliveries: z
      .array(
        z
          .object({
            recipientId: z.string().uuid(),
            channels: z
              .array(z.enum(['IN_APP', 'WHATSAPP', 'SMS', 'EMAIL']))
              .min(1)
              .max(4),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export const rescheduleChoice = scheduleVersion.extend(time).strict();
export const scheduleConfirm = scheduleChoice
  .extend({ reviewToken: z.string().min(1).max(512) })
  .strict();
export const rescheduleConfirm = rescheduleChoice
  .extend({ reviewToken: z.string().min(1).max(512) })
  .strict();
export const scheduleEdit = createDraftSchema
  .pick({ subject: true, text: true, occasion: true })
  .extend({ version: scheduleVersion.shape.version })
  .strict()
  .refine((value) =>
    ['subject', 'text', 'occasion'].some((key) => Object.hasOwn(value, key)),
  );
export const scheduleParams = z.object({ id: z.string().uuid() }).strict();
const cursor = z
  .object({ scheduledFor: z.string().datetime(), id: z.string().uuid() })
  .strict();
export const scheduleList = z
  .object({
    status: z
      .enum([
        'SCHEDULED',
        'CANCELED',
        'DISPATCHING',
        'DELIVERED',
        'PARTIALLY_DELIVERED',
        'SUBMITTED',
        'PARTIALLY_SUBMITTED',
        'DELIVERY_UNKNOWN',
        'FAILED',
      ])
      .default('SCHEDULED'),
    limit: z
      .string()
      .regex(/^[1-9]\d?$/)
      .transform(Number)
      .pipe(z.number().max(50))
      .optional()
      .default(20),
    cursor: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((value, ctx) => {
        try {
          const bytes = Buffer.from(value, 'base64url');
          if (bytes.toString('base64url') !== value) throw Error();
          return cursor.parse(JSON.parse(bytes.toString('utf8')));
        } catch {
          ctx.addIssue({ code: 'custom', message: 'Invalid cursor.' });
          return z.NEVER;
        }
      })
      .optional(),
  })
  .strict();
export type ScheduleChoice = z.infer<typeof scheduleChoice>;
export type RescheduleChoice = z.infer<typeof rescheduleChoice>;
export type ScheduleEdit = z.infer<typeof scheduleEdit>;
