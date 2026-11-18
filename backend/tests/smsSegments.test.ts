import assert from 'node:assert/strict';
import { test } from 'node:test';
import { smsSegments } from '../src/utils/smsSegments';

test('SMS lengths account for GSM extension characters and multipart boundaries', () => {
  assert.deepEqual(smsSegments(''), { encoding: 'GSM-7', units: 0, segments: 0 });
  assert.equal(smsSegments('a'.repeat(160)).segments, 1);
  assert.equal(smsSegments('a'.repeat(161)).segments, 2);
  assert.equal(smsSegments('a'.repeat(306)).segments, 2);
  assert.equal(smsSegments('a'.repeat(307)).segments, 3);
  assert.equal(smsSegments('^'.repeat(80)).segments, 1);
  assert.equal(smsSegments('^'.repeat(81)).segments, 2);
  assert.equal(smsSegments('^'.repeat(153)).segments, 3);
  assert.equal(smsSegments('€{}[]\\~|\f').units, 18);
});

test('Unicode SMS lengths count surrogate pairs without splitting them between parts', () => {
  assert.deepEqual(smsSegments('अ'.repeat(70)), { encoding: 'UTF-16', units: 70, segments: 1 });
  assert.equal(smsSegments('अ'.repeat(71)).segments, 2);
  assert.equal(smsSegments('😀'.repeat(35)).segments, 1);
  assert.equal(smsSegments('😀'.repeat(36)).segments, 2);
  assert.equal(smsSegments('😀'.repeat(67)).segments, 3);
  assert.equal(smsSegments('a'.repeat(159) + 'अ').encoding, 'UTF-16');
});
