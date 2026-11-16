import { z } from 'zod';
import { mimeLimits } from '../constants/attachments';
export const attachmentParams = z.object({ draftId: z.string().uuid(), id: z.string().uuid().optional() }).strict();
export const reserveAttachment = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).refine((name) => ![...name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === '/' || char === '\\')),
  mime: z.string().refine((mime) => Object.hasOwn(mimeLimits, mime)),
  bytes: z.number().int().min(1).max(50 * 1024 * 1024),
}).strict().refine((input) => input.bytes <= mimeLimits[input.mime], { path: ['bytes'], message: 'File exceeds its type limit.' });
export type Reservation = z.infer<typeof reserveAttachment>;
