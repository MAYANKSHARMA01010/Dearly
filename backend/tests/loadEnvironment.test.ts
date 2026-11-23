import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvironment } from '../src/configs/loadEnvironment';

test('production never fills missing settings from a local private environment', () => {
  const folder = mkdtempSync(join(tmpdir(), 'dearly-env-'));
  try {
    const fixture = join(folder, 'settings');
    writeFileSync(fixture, 'DATABASE_URL=postgresql://local:private@localhost/local\nSMTP_PASSWORD=local-private-only\nHOSTED_DATABASE_URL=private-hosted-only\nMAIL_RELAY_SMTP_PASSWORD=private-relay-only\n', { mode: 0o600 });
    const source: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
    assert.throws(() => loadEnvironment(source, fixture), /DATABASE_URL/);
    assert.equal(source.SMTP_PASSWORD, undefined);
    const development: NodeJS.ProcessEnv = { NODE_ENV: 'development' };
    assert.equal(loadEnvironment(development, fixture).nodeEnv, 'development');
    assert.equal(development.SMTP_PASSWORD, 'local-private-only');
    assert.equal(development.HOSTED_DATABASE_URL, undefined);
    assert.equal(development.MAIL_RELAY_SMTP_PASSWORD, undefined);
    assert.equal(source.DATABASE_URL, undefined);
    source.DATABASE_URL = 'postgresql://synthetic:synthetic@db.example.com/hosted';
    assert.equal(loadEnvironment(source, fixture).databaseUrl, source.DATABASE_URL);
    assert.equal(source.SMTP_PASSWORD, undefined);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
