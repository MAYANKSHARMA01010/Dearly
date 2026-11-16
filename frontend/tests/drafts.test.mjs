import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../src/api/client.js';
import { normalizeRecipient, prepareContent, parseDraft, parsePage } from '../src/services/drafts/contracts.js';
import { createDraftEditor, createDraftWorkspace } from '../src/services/drafts/editor.js';
import { createDraftService } from '../src/services/drafts/service.js';

const owner = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const date = '2026-11-16T00:00:00.000Z';
const content = () => ({ subject: null, text: '', occasion: null, recipients: [] });
const draft = (patch = {}) => ({ ...content(), id, version: 1, createdAt: date, updatedAt: date, ...patch });
const api = (overrides = {}) => ({ create: async (value) => draft(value), read: async () => draft(), update: async (_id, version, value) => draft({ ...value, version: version + 1 }), remove: async () => {}, ...overrides });
const coded = (code, status = 409) => { const error = new ApiError('Safe error', 'http', status); error.code = code; return error; };

test('recipient validation canonicalizes self/user aliases, phone and email without account discovery', () => {
  assert.deepEqual(normalizeRecipient({ type: 'USER', userId: owner.toUpperCase() }, owner), { type: 'SELF', label: null });
  assert.equal(normalizeRecipient({ type: 'PHONE', phone: '(202) 555-0123', country: 'US' }, owner).phone, '+12025550123');
  assert.equal(normalizeRecipient({ type: 'EMAIL', email: ' Test@Example.COM ' }, owner).email, 'test@example.com');
  for (const recipient of [{ type: 'PHONE', phone: '123', country: 'IN' }, { type: 'USER', userId: null, unavailable: true }, { type: 'EMAIL', email: 'bad' }, { type: 'USER', userId: 'bad' }]) assert.throws(() => normalizeRecipient(recipient, owner));
  const value = prepareContent({ ...content(), recipients: [{ type: 'SELF' }, { type: 'USER', userId: owner }, { type: 'EMAIL', email: 'a@example.com' }, { type: 'EMAIL', email: 'A@example.com' }] }, owner);
  assert.equal(value.recipients.length, 2);
});

test('content limits preserve text formatting and reject invalid/unavailable destinations', () => {
  assert.equal(prepareContent({ ...content(), text: '  Hello\n', subject: '  Title ' }, owner).text, '  Hello\n');
  assert.equal(prepareContent({ ...content(), subject: '   ', occasion: '  ' }, owner).subject, null);
  for (const patch of [{ text: 'x'.repeat(20001) }, { subject: 'x'.repeat(161) }, { occasion: 'x'.repeat(81) }, { recipients: Array.from({ length: 51 }, () => ({ type: 'SELF' })) }]) assert.throws(() => prepareContent({ ...content(), ...patch }, owner));
});

test('draft responses and pagination reject malformed success data', () => {
  assert.equal(parseDraft({ ...draft(), status: 'DRAFT' }).version, 1);
  assert.throws(() => parseDraft({ ...draft(), status: 'SENT' }));
  assert.throws(() => parseDraft({ ...draft(), status: 'DRAFT', recipients: [{}] }));
  assert.throws(() => parsePage({ items: [], nextCursor: 123 }));
});

test('double save taps share one create; confirmed drafts use versioned updates', async () => {
  let finish; let creates = 0; const writes = [];
  const model = createDraftEditor({ ownerId: owner, api: api({ create: (value) => { creates++; return new Promise((resolve) => { finish = () => resolve(draft(value)); }); }, update: async (_id, version, value) => { writes.push(version); return draft({ ...value, version: version + 1 }); } }) });
  model.edit({ text: 'Private thought' });
  const first = model.save(); const second = model.save(); assert.equal(first, second); assert.equal(creates, 1);
  model.edit({ text: 'Must not change while saving' }); assert.equal(model.getSnapshot().content.text, 'Private thought');
  assert.equal(await model.remove(), false); finish(); await first;
  assert.equal(model.getSnapshot().dirty, false); assert.equal(model.getSnapshot().id, id);
  model.edit({ text: 'Edited' }); await model.save(); assert.deepEqual(writes, [1]); assert.equal(creates, 1); assert.equal(model.getSnapshot().version, 2);
});

test('a failed validation keeps edits unsaved and does not dispatch', async () => {
  let calls = 0;
  const model = createDraftEditor({ ownerId: owner, api: api({ create: async () => { calls++; return draft(); } }) });
  model.edit({ text: 'x'.repeat(20001) }); assert.equal(await model.save(), false);
  assert.equal(calls, 0); assert.equal(model.getSnapshot().dirty, true); assert.equal(model.getSnapshot().uncertain, false);
});

test('uncertain creates never automatically retry or claim persistence', async () => {
  let calls = 0;
  const model = createDraftEditor({ ownerId: owner, api: api({ create: async () => { calls++; throw new ApiError('Timeout', 'timeout'); } }) });
  model.edit({ text: 'Keep this edit' }); assert.equal(await model.save(), false);
  assert.equal(model.getSnapshot().id, null); assert.equal(model.getSnapshot().uncertain, true); assert.equal(model.getSnapshot().content.text, 'Keep this edit');
  await model.save(); assert.equal(calls, 1); assert.equal(model.getSnapshot().savedAt, null);
});

test('version conflicts retain local content until an explicit reload', async () => {
  let writes = 0;
  const model = createDraftEditor({ id, ownerId: owner, api: api({ read: async () => draft({ text: 'Server text', version: 2 }), update: async () => { writes++; throw coded('VERSION_CONFLICT'); } }) });
  await model.open(); model.edit({ text: 'Local text' }); await model.save(); await model.save();
  assert.equal(writes, 1); assert.equal(model.getSnapshot().conflict, true); assert.equal(model.getSnapshot().content.text, 'Local text');
  await model.open(); assert.equal(model.getSnapshot().content.text, 'Local text');
  await model.reload(); assert.equal(model.getSnapshot().content.text, 'Server text'); assert.equal(model.getSnapshot().dirty, false);
});

test('reopening a clean draft fetches latest data but keeps unsaved edits', async () => {
  let text = 'First'; let reads = 0;
  const model = createDraftEditor({ id, ownerId: owner, api: api({ read: async () => { reads++; return draft({ text }); } }) });
  await model.open(); text = 'Elsewhere'; await model.open(); assert.equal(model.getSnapshot().content.text, 'Elsewhere');
  model.edit({ text: 'Unsaved' }); await model.open(); assert.equal(reads, 2); assert.equal(model.getSnapshot().content.text, 'Unsaved');
  model.discard(); assert.equal(model.getSnapshot().content.text, 'Elsewhere');
});

test('delete uses the saved version, rejects repeats and clears removed content', async () => {
  const versions = [];
  const model = createDraftEditor({ id, ownerId: owner, api: api({ read: async () => draft({ text: 'Private', version: 3 }), remove: async (_id, version) => { versions.push(version); } }) });
  await model.open(); await model.remove(); await model.remove();
  assert.deepEqual(versions, [3]); assert.equal(model.getSnapshot().deleted, true); assert.equal(model.getSnapshot().content.text, '');
});

test('missing drafts clear stale content instead of pretending to be editable', async () => {
  let missing = false;
  const model = createDraftEditor({ id, ownerId: owner, api: api({ read: async () => { if (missing) throw coded('DRAFT_NOT_FOUND', 404); return draft({ text: 'Private' }); } }) });
  await model.open(); missing = true; await model.reload(); assert.equal(model.getSnapshot().deleted, true); assert.equal(model.getSnapshot().content.text, '');
});

test('workspace retains same-account edits but clears on sign-out/account switch and ignores late saves', async () => {
  let finish;
  const workspace = createDraftWorkspace(api({ create: (value) => new Promise((resolve) => { finish = () => resolve(draft(value)); }) }));
  workspace.bind(`local|${owner}`); const first = workspace.editor(owner, null); first.edit({ text: 'Private' });
  workspace.bind(`local|${owner}`); assert.equal(workspace.editor(owner, null), first);
  const save = first.save(); workspace.bind(null); finish(); assert.equal(await save, false); assert.equal(first.getSnapshot().content.text, '');
  workspace.bind(`different|${owner}`); const second = workspace.editor(owner, null); assert.notEqual(first, second); assert.equal(second.getSnapshot().content.text, '');
});

test('draft service includes versions, encodes cursors and rejects invalid draft addresses', async () => {
  const calls = [];
  const service = createDraftService({ request: async (path, options) => { calls.push({ path, options }); if (options?.method === 'DELETE') return { id, deleted: true }; if (path.includes('?limit=')) return { items: [], nextCursor: null }; return { ...draft(), status: 'DRAFT' }; } });
  await service.list('opaque+/cursor'); assert.match(calls[0].path, /opaque%2B%2Fcursor/);
  await service.update(id, 2, content()); assert.equal(JSON.parse(calls[1].options.body).version, 2);
  await service.remove(id, 3); assert.equal(calls[2].path, `/messages/drafts/${id}?version=3`);
  await assert.rejects(service.read('invalid')); assert.equal(calls.length, 3);
});
