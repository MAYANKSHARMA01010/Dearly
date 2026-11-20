import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveRecipient } from '../src/services/drafts/contracts.js';

const owner = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

test('recipient correction replaces only the selected row without mutating saved content', () => {
  const original = [{ type: 'EMAIL', email: 'old@example.com', label: 'Alex' }, { type: 'SELF' }];
  const updated = saveRecipient(original, { type: 'EMAIL', email: ' NEW@example.com ', label: ' Alex corrected ' }, owner, 0);
  assert.deepEqual(updated[0], { type: 'EMAIL', email: 'new@example.com', label: 'Alex corrected' });
  assert.equal(updated.length, 2);
  assert.equal(updated[1], original[1]);
  assert.equal(original[0].email, 'old@example.com');
});

test('editing the same destination is allowed but another recipient cannot be duplicated', () => {
  const recipients = [{ type: 'EMAIL', email: 'alex@example.com' }, { type: 'EMAIL', email: 'casey@example.com' }];
  assert.equal(saveRecipient(recipients, { type: 'EMAIL', email: 'ALEX@example.com', label: 'New name' }, owner, 0)[0].label, 'New name');
  assert.throws(() => saveRecipient(recipients, { type: 'EMAIL', email: 'CASEY@example.com' }, owner, 0), /already added/);
  assert.throws(() => saveRecipient([{ type: 'SELF' }, { type: 'USER', userId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' }], { type: 'USER', userId: owner }, owner, 1), /already added/);
});

test('full recipient lists allow corrections but reject new additions', () => {
  const recipients = Array.from({ length: 50 }, (_, i) => ({ type: 'EMAIL', email: `user-${i}@example.com` }));
  const updated = saveRecipient(recipients, { type: 'EMAIL', email: 'corrected@example.com' }, owner, 49);
  assert.equal(updated.length, 50);
  assert.equal(updated[49].email, 'corrected@example.com');
  assert.throws(() => saveRecipient(recipients, { type: 'SELF' }, owner), /up to 50/);
});

test('corrected phone numbers retain country normalization and validation', () => {
  const recipients = [{ type: 'PHONE', phone: '+12025550173', country: 'US' }];
  assert.equal(saveRecipient(recipients, { type: 'PHONE', phone: '(202) 555-0174', country: 'US' }, owner, 0)[0].phone, '+12025550174');
  assert.throws(() => saveRecipient(recipients, { type: 'PHONE', phone: '123', country: 'US' }, owner, 0), /valid phone/);
  assert.throws(() => saveRecipient(recipients, { type: 'EMAIL', email: 'broken' }, owner, 0), /valid delivery email/);
  assert.equal(recipients[0].phone, '+12025550173');
});

test('self labels and unavailable account corrections keep their intended identity', () => {
  assert.deepEqual(saveRecipient([{ type: 'SELF' }], { type: 'SELF', label: 'Future me' }, owner, 0), [{ type: 'SELF', label: 'Future me' }]);
  const userId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  assert.deepEqual(saveRecipient([{ type: 'USER', userId: null, unavailable: true }], { type: 'USER', userId }, owner, 0), [{ type: 'USER', userId, label: null }]);
});

test('stale recipient indexes fail without appending or removing another recipient', () => {
  for (const index of [-1, 1, 0.5]) assert.throws(() => saveRecipient([{ type: 'SELF' }], { type: 'SELF' }, owner, index), /no longer available/);
});
