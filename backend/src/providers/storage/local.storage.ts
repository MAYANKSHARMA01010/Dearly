import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, readdir, stat, statfs } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { ApiError } from '../../utils/ApiError';
import { MiB } from '../../constants/attachments';

const keyPattern = /^[0-9a-f-]{36}(?:\.[0-9a-f-]{36}\.part)?$/;
export interface ObjectStore {
  path(key: string): string;
  write(key: string, attempt: string, input: Readable, bytes: number, signal?: AbortSignal): Promise<string>;
  remove(key: string): Promise<void>;
  entries(): Promise<{ key: string; modified: number }[]>;
}
// Private directory only; never mounted with express.static or named by a client filename.
export class LocalStorage implements ObjectStore {
  readonly root: string;
  constructor(root: string) { this.root = resolve(root); }
  path(key: string) { if (!keyPattern.test(key)) throw new Error('Invalid storage key'); return join(this.root, key); }
  async write(key: string, attempt: string, input: Readable, bytes: number, signal?: AbortSignal) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const free = await statfs(this.root);
    if (free.bavail * free.bsize < bytes + 50 * MiB) throw new ApiError(507, 'STORAGE_FULL', 'Attachment storage is full.');
    const part = this.path(`${key}.${attempt}.part`);
    let received = 0; const hash = createHash('sha256');
    const counter = new Transform({ transform(chunk: Buffer, _encoding, done) {
      received += chunk.length;
      if (received > bytes) return done(new ApiError(413, 'ATTACHMENT_SIZE', 'File size does not match its reservation.'));
      hash.update(chunk); done(null, chunk);
    } });
    const failure = () => counter.destroy(new ApiError(400, 'UPLOAD_INTERRUPTED', 'Upload was interrupted.'));
    const deadline = setTimeout(failure, 10 * 60000); deadline.unref();
    input.once('aborted', failure); input.once('error', failure); signal?.addEventListener('abort', failure, { once: true });
    try {
      if (signal?.aborted) throw new ApiError(400, 'UPLOAD_INTERRUPTED', 'Upload was interrupted.');
      // Keep the request outside pipeline so a bounded rejection can still return JSON.
      input.pipe(counter);
      await pipeline(counter, createWriteStream(part, { flags: 'wx', mode: 0o600 }));
      if (received !== bytes) throw new ApiError(400, 'ATTACHMENT_SIZE', 'File size does not match its reservation.');
      await rename(part, this.path(key)); return hash.digest('hex');
    } catch (error) {
      input.unpipe(counter); input.resume(); await rm(part, { force: true }); throw error;
    } finally { clearTimeout(deadline); input.off('aborted', failure); input.off('error', failure); signal?.removeEventListener('abort', failure); }
  }
  async remove(key: string) { await rm(this.path(key), { force: true }); }
  async entries() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const files = await readdir(this.root);
    const rows = await Promise.all(files.filter((key) => keyPattern.test(key)).map(async (key) => {
      try { const info = await stat(this.path(key)); return info.isFile() ? { key, modified: info.mtimeMs } : null; } catch { return null; }
    }));
    return rows.filter((row): row is { key: string; modified: number } => row !== null);
  }
}
export const openObject = (path: string) => createReadStream(path);
