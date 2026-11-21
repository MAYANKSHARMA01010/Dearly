import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import winston from 'winston';
import { timeOtpStage } from '../src/utils/otpTiming';
import { createLogger, type AppLogger } from '../src/utils/logger';
import { captureLogger } from './helpers';

test('OTP timing preserves results, errors and exactly one execution even if logging fails', async () => {
  let calls = 0;
  const broken: AppLogger = { info() { throw Error('logging failure'); }, warn() {}, error() {} };
  const value = { privateCode: 'synthetic-code' };
  assert.equal(await timeOtpStage('DISPATCH', async () => { calls++; return value; }, broken), value);
  assert.equal(calls, 1);
  const error = Error('private raw failure');
  await assert.rejects(timeOtpStage('RESERVATION', async () => { throw error; }, broken), (e) => e === error);
});

test('OTP timing records stage, bounded duration and request correlation without private results/errors', async () => {
  const logs = captureLogger();
  const id = '00000000-0000-4000-8000-000000000001';
  await timeOtpStage('DISPATCH', async () => ({ token: 'private-token' }), logs.logger, id);
  await assert.rejects(timeOtpStage('FINALIZATION', async () => { throw Error('private-body'); }, logs.logger, id));
  assert.deepEqual(logs.entries.map(e => e.metadata?.code), ['DISPATCH_COMPLETED', 'FINALIZATION_FAILED']);
  for (const entry of logs.entries) {
    assert.equal(entry.event, 'auth.otp.stage');
    assert.equal(entry.metadata?.requestId, id);
    assert.ok(Number.isFinite(entry.metadata?.durationMs));
    assert.ok(entry.metadata!.durationMs! >= 0);
  }
  assert.doesNotMatch(JSON.stringify(logs.entries), /private|token|body/);
  const stream = new PassThrough();
  const line = new Promise<Buffer>(resolve => stream.once('data', resolve));
  await timeOtpStage('TOTAL', async () => {}, createLogger('info', [new winston.transports.Stream({stream})]), id);
  assert.equal(JSON.parse((await line).toString()).message, 'auth.otp.stage');
});
