import { z } from 'zod';
import { normalizePhone } from '../utils/phone';

const label = z.string().trim().min(1).max(80).nullable().optional();
export const recipientSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SELF'), label }).strict(),
  z.object({ type: z.literal('USER'), userId: z.string().uuid(), label }).strict(),
  z.object({ type: z.literal('PHONE'), phone: z.string().trim().min(3).max(32), country: z.string().regex(/^[A-Z]{2}$/), label }).strict(),
  z.object({ type: z.literal('EMAIL'), email: z.string().trim().email().max(254), label }).strict(),
]).transform((input, ctx) => {
  if (input.type === 'PHONE') {
    const phone = normalizePhone(input.phone, input.country);
    if (!phone) { ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Invalid phone number for country.' }); return z.NEVER; }
    return { ...input, phone };
  }
  if (input.type === 'EMAIL') return { ...input, email: input.email.toLowerCase() };
  return input;
});
const nullableTitle = z.string().trim().max(160).transform((value) => value || null).nullable();
const nullableOccasion = z.string().trim().max(80).transform((value) => value || null).nullable();
const fields = {
  subject: nullableTitle.optional(),
  text: z.string().max(20000).optional(),
  occasion: nullableOccasion.optional(),
  recipients: z.array(recipientSchema).max(50).optional(),
};
export const createDraftSchema = z.object(fields).strict();
export const updateDraftSchema = z.object({
  version: z.number().int().min(1).max(2147483646), ...fields,
}).strict().refine((input) => ['subject', 'text', 'occasion', 'recipients'].some((key) => Object.hasOwn(input, key)));
export const draftParamsSchema = z.object({ id: z.string().uuid() }).strict();
const cursorPayloadSchema = z.object({ createdAt: z.string().datetime(), id: z.string().uuid() }).strict();
export const listDraftsSchema = z.object({
  limit: z.string().regex(/^[1-9]\d?$/).transform(Number).pipe(z.number().max(50)).optional().default(20),
  cursor: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).transform((value, ctx) => {
    try {
      const bytes = Buffer.from(value, 'base64url');
      if (bytes.toString('base64url') !== value) throw new Error('Noncanonical cursor');
      return cursorPayloadSchema.parse(JSON.parse(bytes.toString('utf8')));
    } catch { ctx.addIssue({ code: 'custom', message: 'Invalid cursor.' }); return z.NEVER; }
  }).optional(),
}).strict();
export const deleteDraftSchema = z.object({
  version: z.string().regex(/^[1-9]\d{0,9}$/).transform(Number).pipe(z.number().int().max(2147483647)),
}).strict();
export type RecipientInput = z.infer<typeof recipientSchema>;
export type CreateDraftInput = z.infer<typeof createDraftSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type ListDraftsInput = z.infer<typeof listDraftsSchema>;
