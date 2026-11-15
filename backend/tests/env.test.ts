import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EnvironmentError, parseEnvironment } from '../src/configs/env';

const databaseUrl = 'postgresql://test:private-password@localhost:5432/dearly_test?sslmode=require&channel_binding=require';

test('environment defaults to the requested local port and preserves database query settings', () => {
  const config = parseEnvironment({ DATABASE_URL: databaseUrl });
  assert.equal(config.port, 8080);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.databaseUrl, databaseUrl);
  assert.equal(config.trustProxyHops, 0);
  assert.deepEqual(config.allowedOrigins, []);
});

test('invalid environment reports field names without supplied secrets', () => {
  for (const source of [
    { DATABASE_URL: 'private-password', PORT: 'invalid-port' },
    { DATABASE_URL: 'https://test:private-password@example.com' },
    { DATABASE_URL: databaseUrl, NODE_ENV: 'private-password' },
    { DATABASE_URL: databaseUrl, FRONTEND_URL: 'private-password' },
    { DATABASE_URL: databaseUrl, FRONTEND_URL: 'https://example.com/path' },
    { DATABASE_URL: databaseUrl, FRONTEND_URL: 'https://test:private-password@example.com' },
  ]) {
    assert.throws(() => parseEnvironment(source), (error: unknown) => {
      assert.ok(error instanceof EnvironmentError);
      assert.doesNotMatch(error.message, /private-password|invalid-port/);
      return true;
    });
  }
});

test('numeric limits reject empty, nonnumeric, negative, fractional and excessive values', () => {
  for (const [key, values] of Object.entries({
    PORT: ['', 'NaN', '-1', '8080.5', '65536'],
    BODY_LIMIT_BYTES: ['', 'Infinity', '-1', '10485761'],
    RATE_LIMIT_MAX: ['', 'NaN', '0', '1.5'],
    RATE_LIMIT_WINDOW_MS: ['999', '2147483648'],
    TRUST_PROXY_HOPS: ['-1', '11', 'true'],
    SHUTDOWN_TIMEOUT_MS: ['0', '60001'],
  })) {
    for (const value of values) {
      assert.throws(() => parseEnvironment({ DATABASE_URL: databaseUrl, [key]: value }), EnvironmentError);
    }
  }
});

test('origins are normalized and deduplicated without accepting wildcard configuration', () => {
  const config = parseEnvironment({
    DATABASE_URL: databaseUrl,
    FRONTEND_URL: 'http://localhost:8081/',
    CLIENT_URL: 'http://localhost:8081',
  });
  assert.deepEqual(config.allowedOrigins, ['http://localhost:8081']);
  assert.throws(() => parseEnvironment({ DATABASE_URL: databaseUrl, CLIENT_URL: '*' }), EnvironmentError);
});
