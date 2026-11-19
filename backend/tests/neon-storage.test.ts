import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { NeonStorage } from '../src/providers/storage/neon.storage';
import { parseEnvironment } from '../src/configs/env';
const id = '00000000-0000-4000-8000-000000000001';
test('Neon storage survives cache loss, validates checksums and rejects public bucket access', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dearly-s3-')),
    objects = new Map<string, Buffer>();
  let publicBucket = false,
    broken = false,
    requests = 0;
  const server = createServer((req, res) => {
    void (async () => {
      requests++;
      const url = new URL(req.url!, 'http://localhost');
      assert(!url.search.includes('Credential'));
      assert(req.headers.authorization?.startsWith('AWS4-HMAC-SHA256 '));
      if (broken) {
        res.writeHead(500);
        res.end('synthetic-private-provider-detail');
        return;
      }
      if (url.searchParams.has('acl')) {
        res.setHeader('Content-Type', 'application/xml');
        res.end(
          `<AccessControlPolicy xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Owner><ID>owner</ID></Owner><AccessControlList><Grant><Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="${publicBucket ? 'Group' : 'CanonicalUser'}">${publicBucket ? '<URI>http://acs.amazonaws.com/groups/global/AllUsers</URI>' : '<ID>owner</ID>'}</Grantee><Permission>FULL_CONTROL</Permission></Grant></AccessControlList></AccessControlPolicy>`,
        );
        return;
      }
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      if (url.searchParams.get('list-type') === '2') {
        res.setHeader('Content-Type', 'application/xml');
        res.end(
          `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>false</IsTruncated>${[...objects].map(([key, bytes]) => `<Contents><Key>${key}</Key><LastModified>2026-11-19T00:00:00Z</LastModified><Size>${bytes.length}</Size></Contents>`).join('')}</ListBucketResult>`,
        );
        return;
      }
      const key = url.pathname.split('/').at(-1)!;
      if (req.method === 'PUT') {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(Buffer.from(c));
        objects.set(key, Buffer.concat(chunks));
        res.setHeader('ETag', '"synthetic"');
        res.end();
        return;
      }
      if (req.method === 'DELETE') {
        objects.delete(key);
        res.writeHead(204);
        res.end();
        return;
      }
      const bytes = objects.get(key);
      if (!bytes) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader('Content-Length', bytes.length);
      res.end(bytes);
    })().catch(() => {
      res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const config = {
      endpoint: `http://127.0.0.1:${address.port}`,
      region: 'ap-southeast-1',
      bucket: 'dearly-private',
      accessKeyId: 'synthetic-access-key',
      secretAccessKey: 'synthetic-private-secret',
    };
    const original = new NeonStorage(join(root, 'first'), config),
      bytes = Buffer.from('synthetic private file'),
      sha = createHash('sha256').update(bytes).digest('hex');
    assert.equal(await original.ready(), true);
    publicBucket = true;
    assert.equal(await original.ready(), false);
    publicBucket = false;
    assert.equal(
      await original.write(
        id,
        randomUUID(),
        Readable.from(bytes),
        bytes.length,
      ),
      sha,
    );
    await rm(join(root, 'first'), { recursive: true, force: true });
    const fresh = new NeonStorage(join(root, 'fresh'), config);
    const path = await fresh.prepare(id, bytes.length, sha);
    assert.deepEqual(await readFile(path), bytes);
    assert.equal((await fresh.entries())[0].bytes, bytes.length);
    await rm(path);
    await assert.rejects(
      fresh.prepare(id, bytes.length, 'f'.repeat(64)),
      (error) =>
        error instanceof Error && !error.message.includes('provider-detail'),
    );
    const count = requests;
    await assert.rejects(fresh.prepare('../escape', bytes.length, sha));
    assert.equal(requests, count);
    broken = true;
    assert.equal(await fresh.ready(), false);
    await assert.rejects(
      fresh.remove(id),
      (error) =>
        error instanceof Error &&
        error.message === 'Private media storage is unavailable.',
    );
    broken = false;
    await fresh.remove(id);
    assert.equal(objects.size, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
test('Neon storage rejects missing credentials and off-provider endpoints', () => {
  const base = {
    DATABASE_URL: 'postgresql://test:test@127.0.0.1/db',
    STORAGE_PROVIDER: 'neon',
  };
  assert.throws(() => parseEnvironment(base));
  assert.throws(() =>
    parseEnvironment({
      ...base,
      NEON_STORAGE_ENDPOINT: 'https://untrusted.example',
      NEON_STORAGE_REGION: 'ap-southeast-1',
      NEON_STORAGE_ACCESS_KEY_ID: 'synthetic-access-key',
      NEON_STORAGE_SECRET_ACCESS_KEY: 'f'.repeat(64),
    }),
  );
  const c = parseEnvironment({
    ...base,
    NEON_STORAGE_ENDPOINT:
      'https://br-synthetic.storage.c-1.ap-southeast-1.aws.neon.tech',
    NEON_STORAGE_REGION: 'ap-southeast-1',
    NEON_STORAGE_ACCESS_KEY_ID: 'synthetic-access-key',
    NEON_STORAGE_SECRET_ACCESS_KEY: 'f'.repeat(64),
  });
  assert(c.remoteStorage);
  assert.equal(c.remoteStorage.bucket, 'dearly-private');
});
