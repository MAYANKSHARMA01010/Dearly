import { z } from 'zod';
export const preferencesInput = z
  .object({
    inAppAlerts: z.boolean(),
    pushAlerts: z.boolean(),
    defaultPhoneChannel: z.enum(['WHATSAPP', 'SMS']),
  })
  .strict();
export const deviceInput = z
  .object({
    id: z.string().uuid(),
    token: z
      .string()
      .max(255)
      .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/),
    platform: z.enum(['ios', 'android']),
    projectId: z.string().uuid(),
  })
  .strict();
export const notificationId = z.object({ id: z.string().uuid() }).strict();
export const notificationQuery = z
  .object({ cursor: z.string().uuid().optional() })
  .strict();
