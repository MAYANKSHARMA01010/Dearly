import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseIssues } from '../src/services/release.service';
import { config } from './helpers';
import type { AppConfig } from '../src/configs/env';
const secret = 'a'.repeat(64);
const ready: AppConfig = {
  ...config,
  nodeEnv: 'production',
  allowedOrigins: [],
  backendServerUrl: 'https://dearly.example',
  authMode: 'whatsapp',
  otpPepper: secret,
  storageRoot: '/var/lib/dearly/attachments',
  externalAccess: {
    publicUrl: 'https://dearly.example',
    secret,
    dailyLimit: 20,
  },
  email: {
    host: 'smtp.gmail.com',
    port: 465,
    user: 'synthetic@example.com',
    password: 'synthetic-private',
    from: 'synthetic@example.com',
  },
  whatsapp: {
    baseUrl: 'http://127.0.0.1:3100',
    apiKey: secret,
    webhookSecret: secret,
    engine: 'GOWS',
    session: 'default',
    dailyLimit: 20,
    callbackUrl: 'https://dearly.example/webhooks/waha',
  },
  sms: {
    baseUrl: 'https://sms.example/3rdparty/v1',
    connection: 'cloud',
    webhookSecret: secret,
    simNumber: 1,
    dailyLimit: 20,
  },
  push: { enabled: true, projectId: '00000000-0000-4000-8000-000000000001' },
};
const options = {
  persistentStorage: true,
  backupKey: secret,
  smsCallback: 'https://dearly.example/webhooks/smsgate',
};
test('production release preflight rejects local/simulated/incomplete configuration without secrets', () => {
  const issues = releaseIssues(config, { persistentStorage: false });
  assert(issues.includes('REAL_PHONE_AUTH_REQUIRED'));
  assert(issues.includes('HOSTED_BACKEND_REQUIRED'));
  assert.deepEqual(releaseIssues(ready, options), []);
  assert(
    releaseIssues(
      { ...ready, backendServerUrl: 'https://temporary.trycloudflare.com' },
      options,
    ).includes('HOSTED_BACKEND_REQUIRED'),
  );
  assert(
    releaseIssues({ ...ready, storageRoot: './data' }, options).includes(
      'PERSISTENT_PRIVATE_STORAGE_REQUIRED',
    ),
  );
  assert(
    !JSON.stringify(
      releaseIssues({ ...ready, authMode: 'development' }, options),
    ).includes(secret),
  );
});
test('a release cannot silently disable a promised channel or use HTTP callbacks', () => {
  assert(
    releaseIssues(
      { ...ready, sms: undefined, push: undefined },
      options,
    ).includes('SMS_CONFIGURATION_REQUIRED'),
  );
  assert(
    releaseIssues(ready, {
      ...options,
      smsCallback: 'http://localhost:8080/webhooks/smsgate',
    }).includes('SMS_CALLBACK_REQUIRED'),
  );
  assert(
    releaseIssues(
      {
        ...ready,
        databaseUrl: 'postgresql://synthetic:private@remote.example/db',
      },
      options,
    ).includes('DATABASE_TLS_REQUIRED'),
  );
});
