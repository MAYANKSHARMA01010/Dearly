import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { PassThrough, Readable } from 'node:stream';
import { LocalStorage } from '../src/providers/storage/local.storage';
import { signatureMatches, inspectFile } from '../src/providers/storage/inspectFile';
import { inspectPdf } from '../src/providers/storage/inspectPdf';
import { PDFDocument } from 'pdf-lib';
import { reserveAttachment } from '../src/validators/attachment.validators';

test('reservation rejects unknown types, dangerous names, size/type limits and excess fields', () => {
  const valid = { id: randomUUID(), name: 'hello.txt', mime: 'text/plain', bytes: 12 };
  assert.equal(reserveAttachment.safeParse(valid).success, true);
  for (const patch of [{ name: '../private.txt' }, { name: 'bad\nname' }, { mime: 'text/html' }, { bytes: 0 }, { bytes: 1048577 }, { ownerId: randomUUID() }]) assert.equal(reserveAttachment.safeParse({ ...valid, ...patch }).success, false);
});

test('private storage streams exact bytes, rejects traversal and discards partial/aborted transfers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dearly-storage-')); const store = new LocalStorage(root); const id = randomUUID();
  try {
    assert.throws(() => store.path('../secret'));
    const bytes = Buffer.from('private attachment');
    const hash = await store.write(id, randomUUID(), Readable.from([bytes.subarray(0, 5), bytes.subarray(5)]), bytes.length);
    assert.equal(hash, createHash('sha256').update(bytes).digest('hex')); assert.deepEqual(await readFile(store.path(id)), bytes);
    await assert.rejects(store.write(randomUUID(), randomUUID(), Readable.from([bytes]), 1));
    await assert.rejects(store.write(randomUUID(), randomUUID(), Readable.from([bytes]), bytes.length + 1));
    const controller = new AbortController(); controller.abort();
    await assert.rejects(store.write(randomUUID(), randomUUID(), Readable.from([bytes]), bytes.length, controller.signal));
    const mid = new PassThrough(); const abort = new AbortController(); const interrupted = randomUUID();
    const pending = store.write(interrupted, randomUUID(), mid, 30, abort.signal);
    mid.write(Buffer.from('first chunk'));
    let started = false;
    for (let i = 0; i < 100; i++) {
      if ((await store.entries()).some((entry) => entry.key.startsWith(`${interrupted}.`))) { started = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(started, true); abort.abort(); mid.end(); await assert.rejects(pending);
    assert.deepEqual((await store.entries()).map((entry) => entry.key), [id]);
    await inspectFile(store.path(id), 'text/plain', 'unused');
    await assert.rejects(inspectFile(store.path(id), 'image/png', 'unused'));
    await store.remove(id); assert.equal((await store.entries()).length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('file signatures do not trust a filename or declared MIME', () => {
  assert.equal(signatureMatches(Buffer.from('not a png'), 'image/png'), false);
  assert.equal(signatureMatches(Buffer.from('89504e470d0a1a0a', 'hex'), 'image/png'), true);
  assert.equal(signatureMatches(Buffer.from('%PDF-1.7'), 'application/pdf'), true);
  assert.equal(signatureMatches(Buffer.from('RIFFxxxxWAVE'), 'audio/wav'), true);
  assert.equal(signatureMatches(Buffer.from('<html>'), 'application/pdf'), false);
});

test('PDF validation parses a real document and rejects disguised or empty documents', async () => {
  const doc = await PDFDocument.create(); doc.addPage();
  assert.equal(await inspectPdf(Buffer.from(await doc.save())), true);
  assert.equal(await inspectPdf(Buffer.from('%PDF-1.4\nnot-a-document\n%%EOF')), false);
  const root = await mkdtemp(join(tmpdir(), 'dearly-pdf-limit-')); const file = join(root, 'test.pdf');
  try {
    await writeFile(file, await doc.save());
    const outcomes = await Promise.allSettled(Array.from({ length: 3 }, () => inspectFile(file, 'application/pdf', 'unused')));
    assert.equal(outcomes[0].status, 'fulfilled'); assert.equal(outcomes[1].status, 'fulfilled');
    assert.equal(outcomes[2].status, 'rejected');
    if (outcomes[2].status === 'rejected') assert.equal((outcomes[2].reason as {statusCode: number}).statusCode, 503);
    await inspectFile(file, 'application/pdf', 'unused');
  } finally { await rm(root, { recursive:true, force:true }); }
});
