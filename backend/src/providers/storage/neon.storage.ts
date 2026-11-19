import {
  S3Client,
  HeadBucketCommand,
  GetBucketAclCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { LocalStorage, type ObjectStore } from './local.storage';
import { ApiError } from '../../utils/ApiError';
import { MiB, attachmentLimits } from '../../constants/attachments';
export interface NeonStorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}
const unavailable = () =>
  new ApiError(
    503,
    'STORAGE_UNAVAILABLE',
    'Private media storage is unavailable.',
  );
/** Neon owns final objects; ephemeral disk holds only verified, recoverable cache bytes. */
export class NeonStorage implements ObjectStore {
  readonly capacityBytes = attachmentLimits.totalBytes;
  private readonly cache: LocalStorage;
  private readonly client: S3Client;
  private readonly pending = new Map<string, Promise<string>>();
  constructor(
    root: string,
    private readonly config: NeonStorageConfig,
    client?: S3Client,
  ) {
    this.cache = new LocalStorage(root);
    this.client =
      client ??
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        maxAttempts: 2,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        requestHandler: { connectionTimeout: 10000, requestTimeout: 120000 },
      });
  }
  path(key: string) {
    return this.cache.path(key);
  }
  async ready() {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.bucket }),
      );
      const acl = await this.client.send(
        new GetBucketAclCommand({ Bucket: this.config.bucket }),
      );
      return (
        Boolean(acl.Grants?.length) &&
        acl.Grants!.every(
          (g) => g.Grantee?.Type === 'CanonicalUser' && !g.Grantee.URI,
        )
      );
    } catch {
      return false;
    }
  }
  async write(
    key: string,
    attempt: string,
    input: Readable,
    bytes: number,
    signal?: AbortSignal,
  ) {
    const sha256 = await this.cache.write(key, attempt, input, bytes, signal),
      body = createReadStream(this.path(key));
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: body,
          ContentLength: bytes,
          ContentType: 'application/octet-stream',
          CacheControl: 'private, no-store',
          Metadata: { sha256 },
        }),
        { abortSignal: signal ?? AbortSignal.timeout(120000) },
      );
      return sha256;
    } catch {
      throw unavailable();
    } finally {
      body.destroy();
    }
  }
  async prepare(
    key: string,
    bytes: number,
    sha256?: string | null,
  ): Promise<string> {
    this.path(key);
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 50 * MiB)
      throw unavailable();
    const pending = this.pending.get(key);
    if (pending) return pending;
    const work = this.download(key, bytes, sha256).finally(() => {
      this.pending.delete(key);
    });
    this.pending.set(key, work);
    return work;
  }
  private async download(key: string, bytes: number, sha256?: string | null) {
    try {
      const info = await stat(this.path(key));
      if (info.isFile() && info.size === bytes) {
        if (!sha256) return this.path(key);
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(this.path(key)))
          hash.update(chunk);
        if (hash.digest('hex') === sha256) return this.path(key);
      }
    } catch {
      /* Rehydrate a missing cache from private storage. */
    }
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(120000) },
      );
      if (!result.Body || result.ContentLength !== bytes) {
        if (result.Body instanceof Readable) result.Body.destroy();
        throw unavailable();
      }
      if (!(result.Body instanceof Readable)) throw unavailable();
      const hash = await this.cache.write(
        key,
        randomUUID(),
        result.Body,
        bytes,
      );
      if (sha256 && hash !== sha256) {
        await this.cache.remove(key);
        throw unavailable();
      }
      return this.path(key);
    } catch {
      throw unavailable();
    }
  }
  async remove(key: string) {
    this.path(key);
    try {
      if (!key.endsWith('.part'))
        await this.client.send(
          new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
        );
      await this.cache.remove(key);
    } catch {
      throw unavailable();
    }
  }
  async entries() {
    const rows: { key: string; modified: number; bytes?: number }[] = [];
    let token: string | undefined;
    try {
      for (let page = 0; page < 100; page++) {
        const result = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.config.bucket,
            MaxKeys: 1000,
            ContinuationToken: token,
          }),
        );
        for (const object of result.Contents ?? []) {
          if (!object.Key || !/^[0-9a-f-]{36}$/.test(object.Key)) continue;
          const modified = object.LastModified?.getTime(),
            bytes = object.Size;
          if (
            modified === undefined ||
            !Number.isFinite(modified) ||
            bytes === undefined ||
            !Number.isSafeInteger(bytes) ||
            bytes < 1 ||
            bytes > 50 * MiB
          )
            throw unavailable();
          rows.push({ key: object.Key, modified, bytes });
        }
        if (!result.IsTruncated) {
          for (const entry of await this.cache.entries())
            if (entry.key.endsWith('.part')) rows.push(entry);
          return rows;
        }
        if (
          !result.NextContinuationToken ||
          result.NextContinuationToken === token
        )
          throw unavailable();
        token = result.NextContinuationToken;
      }
      throw unavailable();
    } catch {
      throw unavailable();
    }
  }
}
