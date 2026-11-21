import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import dotenv from 'dotenv';
import { EnvironmentError, parseEnvironment } from '../src/configs/env';
import { releaseIssues } from '../src/services/release.service';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const names = (text: string) => new Set([...text.matchAll(/^\s*(?:#\s*)?([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));
const local = read('backend/.env.example');
const hosted = read('backend/.env.production.example');

test('backend examples document every validated variable and operational input', () => {
  const schemaNames = [...read('backend/src/configs/env.ts').matchAll(/^ {4}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]);
  assert.ok(schemaNames.length > 50);
  for (const text of [local, hosted]) {
    const documented = names(text);
    for (const key of [...schemaNames, 'SMSGATE_CALLBACK_URL', 'PERSISTENT_STORAGE_CONFIRMED', 'BACKUP_ENCRYPTION_KEY', 'PG_DUMP_BIN', 'PG_RESTORE_BIN', 'RESTORE_DATABASE_URL', 'RESTORE_STORAGE_ROOT']) {
      assert.ok(documented.has(key), `Example is missing ${key}`);
    }
    const active = [...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
    assert.equal(new Set(active).size, active.length, 'Duplicate active example keys');
  }
});

test('local template validates with disabled providers and explicit hosted content origin', () => {
  const config = parseEnvironment(dotenv.parse(local));
  assert.equal(config.port, 8080);
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.authMode, 'disabled');
  assert.equal(config.email, undefined);
  assert.equal(config.sms, undefined);
  assert.equal(config.whatsapp, undefined);
  assert.equal(config.remoteStorage, undefined);
  assert.equal(config.backendServerUrl, 'https://dearly-z8zm.onrender.com');
});

test('hosted template fails closed until provisioned, then supports relay without SMTP password', () => {
  const template = dotenv.parse(hosted);
  assert.throws(() => parseEnvironment(template), EnvironmentError);
  const env = {
    ...template,
    DATABASE_URL: 'postgresql://synthetic:synthetic@db.example.com/dearly?sslmode=require',
    OTP_PEPPER: 'a'.repeat(64), EXTERNAL_ACCESS_SECRET: 'b'.repeat(64),
    EMAIL_RELAY_URL: 'https://br-synthetic-dearlymail.compute.c-1.ap-southeast-1.aws.neon.tech',
    EMAIL_RELAY_SECRET: 'c'.repeat(64),
    SMTP_USER: 'sender@example.com', SMTP_FROM: 'sender@example.com',
    WAHA_API_KEY: 'synthetic-client-key-only', WAHA_WEBHOOK_SECRET: 'd'.repeat(64),
    SMSGATE_DEVICE_ID: 'synthetic-device', SMSGATE_USERNAME: 'synthetic-user',
    SMSGATE_PASSWORD: 'synthetic-password', SMSGATE_WEBHOOK_SECRET: 'e'.repeat(64),
    NEON_STORAGE_ENDPOINT: 'https://br-synthetic.storage.c-1.ap-southeast-1.aws.neon.tech',
    NEON_STORAGE_ACCESS_KEY_ID: 'synthetic-storage-id',
    NEON_STORAGE_SECRET_ACCESS_KEY: 'f'.repeat(64),
    PUSH_PROVIDER: 'expo', EXPO_PROJECT_ID: '00000000-0000-4000-8000-000000000001',
    BACKUP_ENCRYPTION_KEY: '1'.repeat(64),
  };
  assert.equal('SMTP_PASSWORD' in env, false);
  const config = parseEnvironment(env);
  assert.equal(config.email?.mode, 'relay');
  assert.equal(config.redisUrl, undefined);
  assert.deepEqual(releaseIssues(config, { persistentStorage: false,
    backupKey: env.BACKUP_ENCRYPTION_KEY, smsCallback: template.SMSGATE_CALLBACK_URL }), []);
});

test('examples contain no provisioned keys or personal destinations and mobile config is public-only', () => {
  for (const path of ['backend/.env.example', 'backend/.env.production.example', 'backend/waha.env.example', 'frontend/.env.example']) {
    const text = read(path);
    assert.doesNotMatch(text, /\b(?:npg_|gh[pousr]_|AIza)[A-Za-z0-9_-]{16,}/);
    assert.doesNotMatch(text, /\b[0-9a-f]{64,128}\b/i, 'Provisioned-looking key in an example');
    assert.doesNotMatch(text, /[A-Z0-9._%+-]+@(?:gmail|outlook|yahoo)\.com/i);
    assert.doesNotMatch(text, /\+91\d{10}\b/);
  }
  const frontend = dotenv.parse(read('frontend/.env.example'));
  assert.deepEqual(Object.keys(frontend).sort(), ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_APP_ENV', 'EXPO_PUBLIC_SERVER_API_URL']);
  assert.equal(frontend.EXPO_PUBLIC_API_URL, 'http://localhost:8080');
  assert.equal(frontend.EXPO_PUBLIC_SERVER_API_URL, 'https://dearly-z8zm.onrender.com');
  for (const value of Object.values(frontend)) if (/^https?:/.test(value)) {
    const u = new URL(value);
    assert.equal(u.username + u.password + u.search + u.hash, '');
  }
  const waha = dotenv.parse(read('backend/waha.env.example'));
  assert.equal(waha.WAHA_DASHBOARD_ENABLED, 'false');
  assert.equal(waha.WHATSAPP_SWAGGER_ENABLED, 'false');
  assert.equal(waha.WAHA_PRINT_QR, 'False');
  assert.ok(waha.WAHA_API_KEY.startsWith('sha512:'));
});
