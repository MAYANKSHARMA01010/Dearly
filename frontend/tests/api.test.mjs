import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiConfigurationError, resolveApiBaseUrl } from '../src/config/api.js';
import { ApiError, createApiClient } from '../src/api/client.js';
import { checkServiceHealth } from '../src/services/health.js';

const getBaseUrl = () => 'http://localhost:8080';
const expectKind = (kind, status = null) => (error) => {
  assert.ok(error instanceof ApiError);
  assert.equal(error.kind, kind);
  assert.equal(error.status, status);
  return true;
};

test('development selects the local URL and normalizes a base path', () => {
  assert.equal(resolveApiBaseUrl({ localUrl: ' http://localhost:8080/api/ ', isDevelopment: true }),
    'http://localhost:8080/api');
});

test('release builds and explicit production reject a missing server URL instead of using localhost', () => {
  for (const settings of [
    { isDevelopment: false, appEnv: 'development' },
    { isDevelopment: true, appEnv: 'production' },
  ]) {
    assert.throws(() => resolveApiBaseUrl({ localUrl: 'http://localhost:8080', serverUrl: '', ...settings }),
      ApiConfigurationError);
  }
});

test('production selects only a remote HTTPS API', () => {
  assert.equal(resolveApiBaseUrl({ isDevelopment: false, serverUrl: 'https://api.example.com/' }),
    'https://api.example.com');
  for (const serverUrl of ['http://api.example.com', 'https://localhost:8080', 'https://127.0.0.1', 'https://[::1]']) {
    assert.throws(() => resolveApiBaseUrl({ isDevelopment: false, serverUrl }), ApiConfigurationError);
  }
});

test('configuration rejects invalid URLs, credentials and environments without echoing secrets', () => {
  for (const localUrl of ['invalid-private-value', 'postgresql://user:private-password@example.com/db',
    'https://user:private-password@example.com', 'https://example.com?token=private-token']) {
    assert.throws(() => resolveApiBaseUrl({ isDevelopment: true, localUrl }), (error) => {
      assert.ok(error instanceof ApiConfigurationError);
      assert.doesNotMatch(error.message, /private-|example\.com/);
      return true;
    });
  }
  assert.throws(() => resolveApiBaseUrl({ isDevelopment: true, localUrl: 'http://localhost:8080', appEnv: 'unknown' }),
    ApiConfigurationError);
});

test('client returns envelope data and preserves supplied headers', async () => {
  const client = createApiClient({ getBaseUrl, fetcher: async (url, options) => {
    assert.equal(url, 'http://localhost:8080/health');
    assert.equal(options.headers.get('Accept'), 'application/json');
    assert.equal(options.headers.get('X-Client'), 'dearly');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ success: true, data: { status: 'alive' }, requestId: 'test' });
  } });
  assert.deepEqual(await client.request('/health', { headers: { 'X-Client': 'dearly' } }), { status: 'alive' });
});

test('HTTP errors remain distinct from network errors and do not expose server error content', async () => {
  for (const status of [400, 401, 429, 503]) {
    const client = createApiClient({ getBaseUrl, fetcher: async () =>
      new Response('private-provider-error', { status }) });
    await assert.rejects(client.request('/health'), (error) => {
      expectKind('http', status)(error);
      assert.doesNotMatch(error.message, /private-provider-error/);
      return true;
    });
  }
});

test('network exceptions produce a recoverable message without leaking raw request details', async () => {
  const client = createApiClient({ getBaseUrl, fetcher: async () => { throw new Error('private-network-address'); } });
  await assert.rejects(client.request('/health'), (error) => {
    expectKind('network')(error);
    assert.doesNotMatch(error.message, /private-network-address/);
    return true;
  });
});

test('malformed JSON and invalid success envelopes are rejected', async () => {
  for (const response of [new Response('not JSON'), Response.json({ success: false }),
    Response.json(null), Response.json({ success: true }), Response.json([])]) {
    const client = createApiClient({ getBaseUrl, fetcher: async () => response });
    await assert.rejects(client.request('/health'), expectKind('invalid_response'));
  }
});

const waitForAbort = async (_url, options) => new Promise((_resolve, reject) => {
  options.signal.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')), { once: true });
});

test('request deadline aborts the transport and reports a timeout', async () => {
  const client = createApiClient({ getBaseUrl, fetcher: waitForAbort, timeoutMs: 20 });
  await assert.rejects(client.request('/health'), expectKind('timeout'));
});

test('caller cancellation is separate from timeout', async () => {
  const controller = new AbortController();
  const client = createApiClient({ getBaseUrl, fetcher: waitForAbort });
  const pending = client.request('/health', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, expectKind('aborted'));
});

test('already canceled requests never reach the network', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const client = createApiClient({ getBaseUrl, fetcher: async () => { calls++; return Response.json({}); } });
  await assert.rejects(client.request('/health', { signal: controller.signal }), expectKind('aborted'));
  assert.equal(calls, 0);
});

test('bad configuration and absolute route URLs never dispatch', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json({}); };
  const client = createApiClient({ getBaseUrl, fetcher });
  await assert.rejects(client.request('https://other.example/health'), expectKind('configuration'));
  await assert.rejects(client.request('//other.example/health'), expectKind('configuration'));
  const misconfigured = createApiClient({ fetcher, getBaseUrl: () => {
    throw new ApiConfigurationError('The service address has not been configured.');
  } });
  await assert.rejects(misconfigured.request('/health'), expectKind('configuration'));
  assert.equal(calls, 0);
});

test('requests are not automatically retried after failure', async () => {
  let calls = 0;
  const client = createApiClient({ getBaseUrl, fetcher: async () => { calls++; return new Response('', { status: 503 }); } });
  await assert.rejects(client.request('/health'), expectKind('http', 503));
  assert.equal(calls, 1);
});

test('health report handles partial failure and recovers using real response states', async () => {
  let databaseAvailable = false;
  const client = createApiClient({ getBaseUrl, fetcher: async (url) => url.endsWith('/db')
    ? databaseAvailable ? Response.json({ success: true, data: { status: 'ready' } }) : new Response('', { status: 503 })
    : Response.json({ success: true, data: { status: 'alive' } }) });
  const down = await checkServiceHealth({ client });
  assert.equal(down.serverAvailable, true);
  assert.equal(down.databaseAvailable, false);
  databaseAvailable = true;
  const ready = await checkServiceHealth({ client });
  assert.equal(ready.serverAvailable, true);
  assert.equal(ready.databaseAvailable, true);
});

test('health checks do not mistake arbitrary successful payloads for service readiness', async () => {
  const client = createApiClient({ getBaseUrl, fetcher: async () => Response.json({ success: true, data: {} }) });
  const result = await checkServiceHealth({ client });
  assert.equal(result.serverAvailable, false);
  assert.equal(result.databaseAvailable, false);
});

test('aborted health checks do not publish unavailable status', async () => {
  const controller = new AbortController();
  controller.abort();
  const client = createApiClient({ getBaseUrl });
  await assert.rejects(checkServiceHealth({ client, signal: controller.signal }), expectKind('aborted'));
});
