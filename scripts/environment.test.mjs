import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectEnvironment, childEnvironment } from './environment.mjs';

test('hosted backend never inherits local secrets or service-only credentials', () => {
  const selected = selectEnvironment({ DATABASE_URL: 'local-private', SMTP_PASSWORD: 'local-mail',
    HOSTED_DATABASE_URL: 'hosted-private', HOSTED_NODE_ENV: 'production',
    HOSTED_WAHA_SERVICE_WAHA_API_KEY: 'gateway-verifier', RELEASE_DEPLOY_HOOK_FILE: 'private-path',
    HOSTED_UNKNOWN_SECRET: 'unapproved' }, 'backend-hosted');
  assert.deepEqual(selected, { NODE_ENV: 'production', DATABASE_URL: 'hosted-private' });
});
test('WAHA and relay scopes cannot expose unrelated application credentials', () => {
  const source = { DATABASE_URL: 'application-owner', HOSTED_WAHA_SERVICE_WAHA_API_KEY: 'verifier',
    MAIL_RELAY_SMTP_PASSWORD: 'relay-secret', SMTP_PASSWORD: 'local-secret' };
  assert.deepEqual(selectEnvironment(source, 'waha-hosted'), { WAHA_API_KEY: 'verifier' });
  assert.deepEqual(selectEnvironment(source, 'mail-relay'), { SMTP_PASSWORD: 'relay-secret' });
});
test('frontend releases receive only public/build identity and reject unsafe URLs', () => {
  const selected = selectEnvironment({ EXPO_PUBLIC_SERVER_API_URL: 'https://app.example.com',
    EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_API_TARGET: 'local',
    EXPO_PUBLIC_SECRET: 'must-not-pass', DATABASE_URL: 'private', SMTP_PASSWORD: 'private' }, 'frontend-release');
  assert.deepEqual(selected, { EXPO_PUBLIC_SERVER_API_URL: 'https://app.example.com',
    EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_API_TARGET: 'hosted', EXPO_NO_DOTENV: '1' });
  for (const url of ['http://localhost:8080', 'https://user:password@app.example.com', 'https://app.example.com/?key=secret']) {
    assert.throws(() => selectEnvironment({ EXPO_PUBLIC_SERVER_API_URL: url }, 'frontend-release'));
  }
});
test('child commands do not inherit backend secrets, shell injection or stale public overrides', () => {
  assert.deepEqual(childEnvironment({ EXPO_PUBLIC_APP_ENV: 'production' }, {
    PATH: '/tools', DATABASE_URL: 'private', WAHA_API_KEY: 'private', NODE_OPTIONS: '--import malicious',
    EXPO_PUBLIC_SERVER_API_URL: 'https://wrong.example.com', HOSTED_SMTP_PASSWORD: 'private',
  }), { PATH: '/tools', EXPO_PUBLIC_APP_ENV: 'production' });
});
