import { ApiError } from './ApiError';
/** Metadata-only authorization: never rehydrate an object or create an opened receipt. */
export function mediaAccess(row: { id: string; state: string; sha256: string | null; bytes: number; mime: string }, now = Date.now()) {
  if (row.state !== 'READY' || !row.sha256 || !/^[a-f0-9]{64}$/.test(row.sha256))
    throw new ApiError(409, 'UPLOAD_STATE', 'Refresh the attachment state before trying again.');
  return { id: row.id, sha256: row.sha256, bytes: row.bytes, mime: row.mime,
    checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300000).toISOString() };
}
