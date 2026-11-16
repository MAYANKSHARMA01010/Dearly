import { ApiError } from '../../api/client.js';
import { uuid } from '../drafts/contracts.js';
export const MiB = 1024 * 1024;
export const limits = { 'image/jpeg': 10 * MiB, 'image/png': 10 * MiB, 'image/webp': 10 * MiB, 'video/mp4': 50 * MiB, 'video/quicktime': 50 * MiB, 'video/webm': 50 * MiB, 'audio/mp4': 10 * MiB, 'audio/mpeg': 10 * MiB, 'audio/wav': 10 * MiB, 'audio/webm': 10 * MiB, 'application/pdf': 20 * MiB, 'text/plain': MiB };
/** @typedef {{ id: string, name: string, mime: string, bytes: number, state: 'PENDING'|'UPLOADING'|'UPLOADED'|'READY'|'DELETING', createdAt: string, expiresAt: string }} Attachment */
/** @typedef {{ id: string, uri: string, name: string, mime: string, bytes: number, file?: File }} Selection */
const invalid = () => new ApiError('The attachment response could not be confirmed. Refresh attachments before trying again.', 'invalid_response');
/** @param {unknown} value @returns {Attachment} */
export function parseAttachment(value) {
  if (!value || typeof value !== 'object') throw invalid();
  const row = /** @type {Record<string, unknown>} */ (value);
  if (typeof row.id !== 'string' || !uuid.test(row.id) || typeof row.name !== 'string' || row.name.length > 120 || typeof row.mime !== 'string' || !Object.hasOwn(limits, row.mime) || !Number.isInteger(row.bytes) || Number(row.bytes) < 1 || Number(row.bytes) > limits[/** @type {keyof typeof limits} */ (row.mime)] || !['PENDING','UPLOADING','UPLOADED','READY','DELETING'].includes(String(row.state)) || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt)) || typeof row.expiresAt !== 'string' || !Number.isFinite(Date.parse(row.expiresAt))) throw invalid();
  return /** @type {Attachment} */ ({ id: row.id, name: row.name, mime: row.mime, bytes: row.bytes, state: row.state, createdAt: row.createdAt, expiresAt: row.expiresAt });
}
/** @param {string} name @param {string|undefined|null} provided @param {number} bytes */
export function validateSelection(name, provided, bytes) {
  const aliases = /** @type {Record<string,string>} */ ({ 'audio/x-m4a':'audio/mp4', 'audio/m4a':'audio/mp4', 'audio/x-wav':'audio/wav', 'video/mov':'video/quicktime' });
  const extensions = /** @type {Record<string,string>} */ ({ jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', mp4:'video/mp4', mov:'video/quicktime', webm:'video/webm', m4a:'audio/mp4', mp3:'audio/mpeg', wav:'audio/wav', pdf:'application/pdf', txt:'text/plain' });
  const mime = aliases[provided ?? ''] ?? (provided && provided !== 'application/octet-stream' ? provided : extensions[name.split('.').at(-1)?.toLowerCase() ?? '']);
  if (!mime || !Object.hasOwn(limits, mime)) throw new ApiError('Choose JPEG, PNG, WebP, MP4/MOV/WebM, M4A/MP3/WAV, PDF or plain text.', 'configuration');
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > limits[/** @type {keyof typeof limits} */ (mime)]) throw new ApiError('This file is empty or exceeds its type limit. Photos/audio: 10 MB, video: 50 MB, PDF: 20 MB, text: 1 MB.', 'configuration');
  const safeName = [...name].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127 && !['/', '\\'].includes(c)).join('').trim().slice(0, 120) || 'attachment';
  return { name: safeName, mime, bytes };
}
