import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import {
  mailboxQuery,
  historyQuery,
  ownedMessageParams,
} from '../src/validators/mailbox.validators';
import { createApp } from '../src/app';
import { config, captureLogger, fakeDatabase } from './helpers';
const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
test('mailbox filters are bounded, strict and tied to cursor scope', () => {
  assert.equal(mailboxQuery.parse({}).box, 'created');
  for (const input of [
    { box: 'all-users' },
    { limit: '51' },
    { ownerId: id },
    { box: 'received', status: 'DELIVERED' },
    { box: 'sent', read: 'opened' },
    { cursor: '%%%%' },
  ])
    assert.equal(mailboxQuery.safeParse(input).success, false);
  const cursor = Buffer.from(
    JSON.stringify({
      box: 'created',
      status: null,
      read: 'all',
      at: '2026-11-17T00:00:00.000Z',
      id,
    }),
  ).toString('base64url');
  assert.equal(mailboxQuery.parse({ cursor }).cursor?.id, id);
  assert.equal(mailboxQuery.safeParse({ box: 'sent', cursor }).success, false);
  assert.equal(
    mailboxQuery.safeParse({ status: 'DRAFT', cursor }).success,
    false,
  );
});
test('history uses bounded UUID cursors and never accepts a caller-supplied owner', () => {
  assert.equal(historyQuery.parse({}).limit, 20);
  assert.equal(historyQuery.safeParse({ cursor: 'not-an-id' }).success, false);
  assert.equal(
    ownedMessageParams.safeParse({ id, ownerId: id }).success,
    false,
  );
});
test('dashboard and mailbox endpoints are protected without intercepting liveness', async () => {
  const app = createApp(config, fakeDatabase(), captureLogger().logger);
  for (const route of [
    '/messages/dashboard',
    '/messages/mailboxes',
    `/messages/mailboxes/owned/${id}`,
    `/messages/mailboxes/owned/${id}/history`,
  ])
    await request(app).get(route).expect(503);
  await request(app).get('/health').expect(200);
});
