import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { ApiError } from '../../api/client.js';

export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** @typedef {{ type: 'SELF' | 'USER' | 'PHONE' | 'EMAIL', label?: string | null, userId?: string | null, phone?: string, country?: import('libphonenumber-js').CountryCode, email?: string, unavailable?: boolean }} Recipient */
/** @typedef {{ subject: string | null, text: string, occasion: string | null, recipients: Recipient[] }} DraftContent */
/** @typedef {DraftContent & { id: string, version: number, createdAt: string, updatedAt: string }} Draft */
/** @typedef {{ id: string, subject: string | null, textPreview: string, occasion: string | null, version: number, recipientCount: number, createdAt: string, updatedAt: string }} DraftSummary */
const invalid = () => new ApiError('The service returned an unexpected draft response. Please try again.', 'invalid_response');
/** @param {string} message */
const validation = (message) => new ApiError(message, 'configuration');
/** @param {Recipient} input @param {string} ownerId @returns {Recipient} */
export function normalizeRecipient(input, ownerId) {
  const label = input.label?.trim() || null;
  if (label && label.length > 80) throw validation('Recipient names can have up to 80 characters.');
  if (input.type === 'SELF' || (input.type === 'USER' && input.userId?.toLowerCase() === ownerId.toLowerCase())) return { type: 'SELF', label };
  if (input.type === 'USER') {
    if (input.unavailable || !input.userId || !uuid.test(input.userId)) throw validation('Enter a valid Dearly account ID, or remove an unavailable account.');
    return { type: 'USER', label, userId: input.userId.toLowerCase() };
  }
  if (input.type === 'PHONE') {
    const parsed = parsePhoneNumberFromString(input.phone?.trim() ?? '', { defaultCountry: input.country, extract: false });
    if (!parsed?.isValid() || parsed.ext || !input.country || parsed.country !== input.country) throw validation('Enter a valid phone number for the selected country.');
    return { type: 'PHONE', label, phone: parsed.number, country: input.country };
  }
  if (input.type === 'EMAIL') {
    const email = input.email?.trim().toLowerCase() ?? '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw validation('Enter a valid delivery email address.');
    return { type: 'EMAIL', label, email };
  }
  throw validation('Choose a recipient type.');
}
/** @param {Recipient} recipient @param {string} ownerId */
export function recipientKey(recipient, ownerId) {
  if (recipient.type === 'SELF') return `user:${ownerId.toLowerCase()}`;
  if (recipient.type === 'USER') return `user:${recipient.userId?.toLowerCase() ?? 'unavailable'}`;
  return recipient.type === 'PHONE' ? `phone:${recipient.phone}` : `email:${recipient.email?.toLowerCase()}`;
}
/** Replace one recipient or append a new one without changing the original list.
 * @param {Recipient[]} recipients @param {Recipient} input @param {string} ownerId
 * @param {number|null} [editingIndex] @returns {Recipient[]}
 */
export function saveRecipient(recipients, input, ownerId, editingIndex = null) {
  if (editingIndex !== null && (!Number.isInteger(editingIndex) || editingIndex < 0 || editingIndex >= recipients.length)) throw validation('This recipient is no longer available. Cancel and try again.');
  if (editingIndex === null && recipients.length >= 50) throw validation('Choose up to 50 recipients.');
  const normalized = normalizeRecipient(input, ownerId);
  if (recipients.some((r, index) => index !== editingIndex && recipientKey(r, ownerId) === recipientKey(normalized, ownerId))) throw validation('This recipient is already added.');
  return editingIndex === null ? [...recipients, normalized] : recipients.map((r, index) => index === editingIndex ? normalized : r);
}
/** @param {DraftContent} content @param {string} ownerId @returns {DraftContent} */
export function prepareContent(content, ownerId) {
  if (content.subject && content.subject.trim().length > 160) throw validation('The subject can have up to 160 characters.');
  if (content.text.length > 20000) throw validation('The message can have up to 20,000 characters.');
  if (content.occasion && content.occasion.trim().length > 80) throw validation('The occasion can have up to 80 characters.');
  if (content.recipients.length > 50) throw validation('Choose up to 50 recipients.');
  const seen = new Set();
  const recipients = content.recipients.map((r) => normalizeRecipient(r, ownerId)).filter((r) => {
    const key = recipientKey(r, ownerId); if (seen.has(key)) return false; seen.add(key); return true;
  });
  return { subject: content.subject?.trim() || null, text: content.text, occasion: content.occasion?.trim() || null, recipients };
}
/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) { if (!value || typeof value !== 'object') throw invalid(); return /** @type {Record<string, unknown>} */ (value); }
/** @param {unknown} value */
const date = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
/** @param {unknown} value */
const nullableString = (value) => value === null || typeof value === 'string';
/** @param {unknown} value @returns {Recipient} */
function parseRecipient(value) {
  const r = record(value);
  if (!nullableString(r.label)) throw invalid();
  const label = /** @type {string | null} */ (r.label);
  if (r.type === 'SELF' || r.type === 'USER') {
    if (!(r.userId === null || (typeof r.userId === 'string' && uuid.test(r.userId))) || typeof r.unavailable !== 'boolean') throw invalid();
    return { type: r.type, label, userId: /** @type {string|null} */ (r.userId), unavailable: r.unavailable };
  }
  if (r.type === 'PHONE' && typeof r.phone === 'string' && typeof r.country === 'string') return { type: 'PHONE', label, phone: r.phone, country: /** @type {import('libphonenumber-js').CountryCode} */ (r.country) };
  if (r.type === 'EMAIL' && typeof r.email === 'string') return { type: 'EMAIL', label, email: r.email };
  throw invalid();
}
/** @param {unknown} value @returns {DraftSummary} */
export function parseSummary(value) {
  const d = record(value);
  if (typeof d.id !== 'string' || !uuid.test(d.id) || d.status !== 'DRAFT' || !nullableString(d.subject) || !nullableString(d.occasion) ||
    !Number.isInteger(d.version) || Number(d.version) < 1 || !date(d.createdAt) || !date(d.updatedAt) ||
    typeof d.textPreview !== 'string' || !Number.isInteger(d.recipientCount) || Number(d.recipientCount) < 0) throw invalid();
  return /** @type {DraftSummary} */ ({ id: d.id, subject: d.subject, occasion: d.occasion, version: d.version, createdAt: d.createdAt, updatedAt: d.updatedAt, textPreview: d.textPreview, recipientCount: d.recipientCount });
}
/** @param {unknown} value @returns {Draft} */
export function parseDraft(value) {
  const d = record(value);
  if (typeof d.text !== 'string' || d.text.length > 20000 || !Array.isArray(d.recipients) || d.recipients.length > 50) throw invalid();
  const summary = parseSummary({ ...d, textPreview: '', recipientCount: d.recipients.length });
  return { id: summary.id, version: summary.version, subject: summary.subject, text: d.text, occasion: summary.occasion,
    createdAt: summary.createdAt, updatedAt: summary.updatedAt, recipients: d.recipients.map(parseRecipient) };
}
/** @param {unknown} value @returns {{ items: DraftSummary[], nextCursor: string | null }} */
export function parsePage(value) {
  const page = record(value);
  if (!Array.isArray(page.items) || page.items.length > 50 || !(page.nextCursor === null || (typeof page.nextCursor === 'string' && page.nextCursor.length <= 512))) throw invalid();
  return { items: page.items.map(parseSummary), nextCursor: /** @type {string|null} */ (page.nextCursor) };
}
