import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createNotificationRouter } from '../src/routes/notification.routes';
import express from 'express';
import {
  deviceInput,
  preferencesInput,
} from '../src/validators/notification.validators';
import { errorHandler } from '../src/middlewares/errorHandler';
import { captureLogger } from './helpers';
test('notification settings cannot add fallback channels or accept arbitrary push targets', () => {
  assert.equal(
    preferencesInput.safeParse({
      inAppAlerts: true,
      pushAlerts: false,
      defaultPhoneChannel: 'SMS',
    }).success,
    true,
  );
  assert.equal(
    preferencesInput.safeParse({
      inAppAlerts: true,
      pushAlerts: false,
      defaultPhoneChannel: 'SMS',
      fallback: 'ALL',
    }).success,
    false,
  );
  assert.equal(
    deviceInput.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      token: 'https://untrusted.example',
      platform: 'ios',
    }).success,
    false,
  );
});
test('notification APIs expose no unauthenticated account or device data', async () => {
  const app = express();
  app.use('/notifications', createNotificationRouter());
  app.use(errorHandler(captureLogger().logger));
  for (const path of [
    '/notifications',
    '/notifications/preferences',
    '/notifications/00000000-0000-4000-8000-000000000001',
  ])
    await request(app)
      .get(path)
      .expect(503)
      .expect('Cache-Control', 'private, no-store');
});

test('push configuration is explicit and rejects missing or invalid projects', async () => {
  const { parseEnvironment } = await import('../src/configs/env');
  const base = {
    DATABASE_URL: 'postgresql://synthetic:synthetic@localhost/dearly',
  };
  assert.equal(parseEnvironment(base).push, undefined);
  assert.throws(() => parseEnvironment({ ...base, PUSH_PROVIDER: 'expo' }));
  assert.throws(() =>
    parseEnvironment({ ...base, EXPO_PROJECT_ID: 'not-a-project' }),
  );
  assert.equal(
    parseEnvironment({
      ...base,
      PUSH_PROVIDER: 'expo',
      EXPO_PROJECT_ID: '00000000-0000-4000-8000-000000000001',
    }).push?.enabled,
    true,
  );
});
