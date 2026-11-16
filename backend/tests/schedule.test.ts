import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { resolveScheduleTime } from '../src/utils/scheduleTime';
import {
  scheduleChoice,
  scheduleEdit,
  scheduleVersion,
} from '../src/validators/schedule.validators';
import { ApiError } from '../src/utils/ApiError';
import { createApp } from '../src/app';
import { config, fakeDatabase, captureLogger } from './helpers';
const now = new Date('2026-01-01T00:00:00Z');
const failure = (code: string) => (error: unknown) =>
  error instanceof ApiError && error.code === code;
test('wall time converts to the actual UTC instant across date and fractional-offset boundaries', () => {
  assert.equal(
    resolveScheduleTime('2026-01-02T00:15', 'Asia/Kolkata', now).scheduledFor,
    '2026-01-01T18:45:00.000Z',
  );
  assert.equal(
    resolveScheduleTime('2026-01-02T00:15', 'Pacific/Kiritimati', now)
      .scheduledFor,
    '2026-01-01T10:15:00.000Z',
  );
  assert.equal(
    resolveScheduleTime('2026-01-02T23:30', 'Pacific/Pago_Pago', now)
      .scheduledFor,
    '2026-01-03T10:30:00.000Z',
  );
  assert.equal(
    resolveScheduleTime('2026-01-02T12:00', 'Asia/Kathmandu', now).offset,
    '+05:45',
  );
});
test('DST gaps and folds, including thirty-minute transitions, are rejected instead of guessed', () => {
  assert.throws(
    () => resolveScheduleTime('2026-03-08T02:30', 'America/New_York', now),
    failure('NONEXISTENT_TIME'),
  );
  assert.throws(
    () => resolveScheduleTime('2026-11-01T01:30', 'America/New_York', now),
    failure('AMBIGUOUS_TIME'),
  );
  assert.throws(
    () => resolveScheduleTime('2026-10-04T02:15', 'Australia/Lord_Howe', now),
    failure('NONEXISTENT_TIME'),
  );
  assert.throws(
    () => resolveScheduleTime('2026-04-05T01:45', 'Australia/Lord_Howe', now),
    failure('AMBIGUOUS_TIME'),
  );
});
test('invalid dates, numeric offsets, past/too-near times and excessive horizons fail safely', () => {
  for (const [date, zone] of [
    ['2026-02-30T12:00', 'UTC'],
    ['2026-01-02T24:00', 'UTC'],
    ['2026-01-02T12:00', '+05:30'],
    ['2026-01-02T12:00', 'Not/A_Zone'],
    ['2026-01-02T12:00Z', 'UTC'],
  ])
    assert.throws(
      () => resolveScheduleTime(date, zone, now),
      failure('INVALID_SCHEDULE_TIME'),
    );
  assert.throws(
    () => resolveScheduleTime('2026-01-01T00:00', 'UTC', now),
    failure('SCHEDULE_TOO_SOON'),
  );
  assert.equal(
    resolveScheduleTime('2026-01-01T00:01', 'UTC', now).scheduledFor,
    '2026-01-01T00:01:00.000Z',
  );
  assert.throws(
    () => resolveScheduleTime('2037-01-01T00:00', 'UTC', now),
    failure('SCHEDULE_TOO_FAR'),
  );
});
test('schedule validators reject forged state/owners, malformed versions and recipient edits on scheduled messages', () => {
  const valid = {
    version: 1,
    localDateTime: '2026-02-01T12:00',
    timezone: 'UTC',
    deliveries: [
      {
        recipientId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        channels: ['IN_APP'],
      },
    ],
  };
  assert.equal(scheduleChoice.safeParse(valid).success, true);
  for (const patch of [
    { status: 'SCHEDULED' },
    { ownerId: 'other' },
    { version: 0 },
    { version: 1.2 },
    { deliveries: [] },
    { deliveries: [{ recipientId: 'bad', channels: ['IN_APP'] }] },
  ])
    assert.equal(
      scheduleChoice.safeParse({ ...valid, ...patch }).success,
      false,
    );
  assert.equal(scheduleEdit.safeParse({ version: 1 }).success, false);
  assert.equal(
    scheduleEdit.safeParse({ version: 1, text: 'Changed', recipients: [] })
      .success,
    false,
  );
  assert.equal(
    scheduleVersion.safeParse({ version: 1, scheduledFor: 'forged' }).success,
    false,
  );
});
test('scheduling endpoints require authentication while health remains available', async () => {
  const app = createApp(config, fakeDatabase(), captureLogger().logger);
  await request(app).get('/messages/schedules/capabilities').expect(503);
  await request(app)
    .post('/messages/schedules/invalid/confirm')
    .send({})
    .expect(503);
  await request(app).get('/health').expect(200);
});
