import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app';
import { createDraftSchema, updateDraftSchema, listDraftsSchema, deleteDraftSchema } from '../src/validators/draft.validators';
import { canonicalRecipients } from '../src/services/draft.service';
import { captureLogger, config, fakeDatabase } from './helpers';

test('empty drafts and explicit content clearing support incremental autosave', () => {
  assert.deepEqual(createDraftSchema.parse({}), {});
  assert.deepEqual(createDraftSchema.parse({ subject: '   ', occasion: '  ', text: '  hello\n' }), { subject: null, occasion: null, text: '  hello\n' });
  assert.deepEqual(updateDraftSchema.parse({ version: 1, recipients: [], subject: null }), { version: 1, recipients: [], subject: null });
  assert.equal(updateDraftSchema.safeParse({ version: 1 }).success, false);
});

test('draft validators bound fields and reject status, ownership, delivery and malformed recipients', () => {
  for (const input of [
    { ownerId: randomUUID() }, { status: 'SENT' }, { scheduledAt: '2027-01-01T00:00:00Z' }, { attachments: [] },
    { subject: 'x'.repeat(161) }, { text: 'x'.repeat(20001) }, { occasion: 'x'.repeat(81) },
    { recipients: Array.from({ length: 51 }, () => ({ type: 'SELF' })) },
    { recipients: [{ type: 'SELF', userId: randomUUID() }] }, { recipients: [{ type: 'USER', userId: 'bad' }] },
    { recipients: [{ type: 'EMAIL', email: 'invalid' }] }, { recipients: [{ type: 'PHONE', phone: '123', country: 'IN' }] },
    { recipients: [{ type: 'PHONE', phone: '+12025550123', country: 'IN' }] },
    { recipients: [{ type: 'PHONE', phone: '+12025550123 ext 1', country: 'US' }] },
    { recipients: [{ type: 'PHONE', phone: '9876543210' }] },
  ]) assert.equal(createDraftSchema.safeParse(input).success, false);
  for (const version of [0, -1, 1.5, '1', 2147483647]) assert.equal(updateDraftSchema.safeParse({ version, text: '' }).success, false);
});

test('canonical recipients normalize and deduplicate while preserving first order/label', () => {
  const owner = randomUUID(); const target = randomUUID();
  const { recipients } = createDraftSchema.parse({ recipients: [
    { type: 'SELF', label: 'For me' }, { type: 'USER', userId: owner },
    { type: 'USER', userId: target }, { type: 'USER', userId: target },
    { type: 'PHONE', phone: '(202) 555-0123', country: 'US' }, { type: 'PHONE', phone: '+12025550123', country: 'US' },
    { type: 'EMAIL', email: ' Person@Example.COM ' }, { type: 'EMAIL', email: 'person@example.com' },
  ] });
  const rows = canonicalRecipients(owner, recipients!);
  assert.equal(rows.length, 4); assert.deepEqual(rows.map((r) => r.position), [0, 1, 2, 3]);
  assert.equal(rows[0].type, 'SELF'); assert.equal(rows[0].label, 'For me');
  assert.equal(rows[2].phone, '+12025550123'); assert.equal(rows[2].targetUserId, null);
  assert.equal(rows[3].email, 'person@example.com'); assert.equal(rows[3].targetUserId, null);
  const alias = canonicalRecipients(owner, [{ type: 'USER', userId: owner }, { type: 'SELF' }]);
  assert.equal(alias.length, 1); assert.equal(alias[0].type, 'SELF');
});

test('pagination and delete preconditions reject ambiguous or unsafe query shapes', () => {
  assert.deepEqual(listDraftsSchema.parse({}), { limit: 20 });
  assert.equal(listDraftsSchema.parse({ limit: '50' }).limit, 50);
  for (const input of [{ limit: '0' }, { limit: '51' }, { limit: '1.5' }, { limit: ['1', '2'] }, { limit: '' }, { cursor: 'bad' }, { cursor: '' }, { ownerId: randomUUID() }, { cursor: 'x'.repeat(513) }]) {
    assert.equal(listDraftsSchema.safeParse(input).success, false);
  }
  const payload = { createdAt: new Date().toISOString(), id: randomUUID() };
  const cursor = Buffer.from(JSON.stringify(payload)).toString('base64url');
  assert.deepEqual(listDraftsSchema.parse({ cursor }).cursor, payload);
  for (const value of ['0', '-1', '1.1', '2147483648', '', ['1']]) assert.equal(deleteDraftSchema.safeParse({ version: value }).success, false);
  assert.equal(deleteDraftSchema.parse({ version: '2147483647' }).version, 2147483647);
});

test('draft routes are auth-gated even when storage is absent', async () => {
  const app = createApp(config, fakeDatabase(), captureLogger().logger);
  for (const method of ['get', 'post', 'patch', 'delete'] as const) {
    const response = await request(app)[method]('/messages/drafts').send({ text: 'private-draft' }).expect(503);
    assert.equal(response.body.error.code, 'AUTH_DISABLED'); assert.equal(response.headers['cache-control'], 'no-store');
    assert.ok(!JSON.stringify(response.body).includes('private-draft'));
  }
});
