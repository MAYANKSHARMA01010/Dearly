import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';
import { EnvironmentError, parseEnvironment } from '../src/configs/env';
import { releaseIssues } from '../src/services/release.service';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const names = (text: string) => new Set([...text.matchAll(/^\s*(?:#\s*)?([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));
const local = read('backend/.env.example');
const profiles = createRequire(__filename)(resolve(root, 'scripts/environment.mjs')) as {
  selectEnvironment(source: Record<string, string>, target: string): NodeJS.ProcessEnv;
};
const hosted = profiles.selectEnvironment(dotenv.parse(local), 'backend-hosted');

test('backend examples document every validated variable and operational input', () => {
  const compatibilityAliases = new Set(['REDIS_URL', 'EMAIL_PUBLIC_URL', 'SMTP_FROM', 'SMSGATE_LOCAL_API_URL', 'SMSGATE_SERVER_API_URL']);
  const schemaNames = [...read('backend/src/configs/env.ts').matchAll(/^ {4}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]);
  assert.ok(schemaNames.length > 50);
  for (const text of [local]) {
    const documented = names(text);
    for (const key of [...schemaNames.filter(key => !compatibilityAliases.has(key)), 'SMSGATE_CALLBACK_URL', 'PERSISTENT_STORAGE_CONFIRMED', 'BACKUP_ENCRYPTION_KEY', 'PG_DUMP_BIN', 'PG_RESTORE_BIN', 'RESTORE_DATABASE_URL', 'RESTORE_STORAGE_ROOT']) {
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
  const template = Object.fromEntries(Object.entries(hosted).filter(([, value]) => value !== ''));
  assert.throws(() => parseEnvironment(template), EnvironmentError);
  const env = {
    ...template,
    AUTH_MODE: 'whatsapp', WHATSAPP_MODE: 'waha', SMS_PROVIDER: 'smsgate', STORAGE_PROVIDER: 'neon',
    DATABASE_URL: 'postgresql://synthetic:synthetic@db.example.com/dearly?sslmode=require',
    OTP_PEPPER: 'a'.repeat(64), EXTERNAL_ACCESS_SECRET: 'b'.repeat(64),
    EMAIL_RELAY_URL: 'https://br-synthetic-dearlymail.compute.c-1.ap-southeast-1.aws.neon.tech',
    EMAIL_RELAY_SECRET: 'c'.repeat(64),
    SMTP_USER: 'sender@example.com', SMTP_FROM: 'sender@example.com',
    WAHA_API_KEY: 'synthetic-client-key-only', WAHA_WEBHOOK_SECRET: 'd'.repeat(64),
    SMSGATE_DEVICE_ID: 'synthetic-device', SMSGATE_USERNAME: 'synthetic-user',
    SMSGATE_PASSWORD: 'synthetic-password', SMSGATE_WEBHOOK_SECRET: 'e'.repeat(64),
    NEON_STORAGE_ENDPOINT: 'https://br-synthetic.storage.c-1.ap-southeast-1.aws.neon.tech',
    NEON_STORAGE_REGION: 'ap-southeast-1',
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
  for (const path of ['backend/.env.example', 'frontend/.env.example']) {
    const text = read(path);
    assert.doesNotMatch(text, /\b(?:npg_|gh[pousr]_|AIza)[A-Za-z0-9_-]{16,}/);
    assert.doesNotMatch(text, /\b[0-9a-f]{64,128}\b/i, 'Provisioned-looking key in an example');
    assert.doesNotMatch(text, /[A-Z0-9._%+-]+@(?:gmail|outlook|yahoo)\.com/i);
    assert.doesNotMatch(text, /\+91\d{10}\b/);
  }
  const frontend = dotenv.parse(read('frontend/.env.example'));
  assert.deepEqual(Object.keys(frontend).sort(), ['EXPO_OWNER', 'EXPO_PUBLIC_API_TARGET', 'EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_APP_ENV', 'EXPO_PUBLIC_PROJECT_ID', 'EXPO_PUBLIC_SERVER_API_URL']);
  assert.equal(frontend.EXPO_PUBLIC_API_URL, 'http://localhost:8080');
  assert.equal(frontend.EXPO_PUBLIC_SERVER_API_URL, 'https://dearly-z8zm.onrender.com');
  for (const value of Object.values(frontend)) if (/^https?:/.test(value)) {
    const u = new URL(value);
    assert.equal(u.username + u.password + u.search + u.hash, '');
  }
  const gateway = dotenv.parse(local);
  assert.equal(gateway.GATEWAY_DASHBOARD_ENABLED, 'false');
  assert.equal(gateway.GATEWAY_SWAGGER_ENABLED, 'false');
  assert.equal(gateway.GATEWAY_PRINT_QR, 'False');
  assert.equal(gateway.GATEWAY_API_KEY, undefined, 'Gateway verifier is derived, not duplicated');
});

test('canonical examples avoid aliases and repeated shared profile values', () => {
  const values = dotenv.parse(local);
  for (const legacy of ['REDIS_URL', 'EMAIL_PUBLIC_URL', 'SMTP_FROM', 'RELEASE_API_URL', 'SMSGATE_LOCAL_API_URL', 'SMSGATE_SERVER_API_URL']) {
    assert.equal(names(local).has(legacy), false, `Redundant alias: ${legacy}`);
  }
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith('HOSTED_') && !key.startsWith('HOSTED_GATEWAY_')) {
      assert.notEqual(value, values[key.slice(7)], `Redundant hosted override: ${key}`);
    }
  }
});

test('one SMSGate Cloud endpoint works in both local and production runtimes', () => {
  const common = {
    DATABASE_URL: 'postgresql://synthetic:synthetic@db.example.com/test',
    SMS_PROVIDER: 'smsgate', SMSGATE_CONNECTION: 'cloud',
    SMSGATE_API_URL: 'https://api.sms-gate.app/3rdparty/v1',
    SMSGATE_DEVICE_ID: 'synthetic-device', SMSGATE_USERNAME: 'synthetic-user',
    SMSGATE_PASSWORD: 'synthetic-password', SMSGATE_WEBHOOK_SECRET: 'synthetic-webhook-secret',
  };
  for (const NODE_ENV of ['development', 'production']) {
    assert.equal(parseEnvironment({ ...common, NODE_ENV }).sms?.baseUrl, common.SMSGATE_API_URL);
  }
});
