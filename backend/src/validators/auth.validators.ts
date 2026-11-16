import { z } from 'zod';
import { isSupportedCountry } from 'libphonenumber-js/max';
import { normalizePhone } from '../utils/phone';

const phoneInput = z.object({
  phone: z.string().trim().min(3).max(32),
  country: z.string().regex(/^[A-Z]{2}$/).refine(isSupportedCountry),
}).strict().transform((input, ctx) => {
  const phone = normalizePhone(input.phone, input.country);
  if (!phone) {
    ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Invalid phone number for country.' });
    return z.NEVER;
  }
  return { phone };
});
export const requestOtpSchema = phoneInput;
export const resendOtpSchema = z.object({ challengeId: z.string().uuid() }).strict();
export const verifyOtpSchema = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).strict();
export const refreshSchema = z.object({ refreshToken: z.string().max(101).min(101) }).strict();
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).nullable().optional(),
  // Destination only; changing this never changes login identity or verifies email.
  email: z.string().trim().email().max(254).nullable().optional(),
  timezone: z.string().min(1).max(100).refine((zone) => {
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
  }).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);
export type ProfileInput = z.infer<typeof profileSchema>;
