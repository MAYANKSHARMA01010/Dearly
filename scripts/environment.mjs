// One private source per package. Select service settings in memory, never by
// sourcing a backend file into a frontend build or sharing the whole file.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'backend/package.json'));
const { parse } = require('dotenv');
const schema = readFileSync(resolve(root, 'backend/src/configs/env.ts'), 'utf8');
const backendKeys = new Set([
  ...[...schema.matchAll(/^ {4}([A-Z][A-Z0-9_]*):/gm)].map(match => match[1]),
  'APP_DOWNLOAD_URL', 'SMSGATE_CALLBACK_URL', 'PERSISTENT_STORAGE_CONFIRMED',
  'BACKUP_ENCRYPTION_KEY', 'PG_DUMP_BIN', 'PG_RESTORE_BIN',
  'RESTORE_DATABASE_URL', 'RESTORE_STORAGE_ROOT', 'SOURCE_STORAGE_ROOT',
]);
const publicKeys = new Set(['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SERVER_API_URL',
  'EXPO_PUBLIC_APP_ENV', 'EXPO_PUBLIC_API_TARGET', 'EXPO_PUBLIC_PROJECT_ID', 'EXPO_OWNER']);
const releaseKeys = new Set(['RELEASE_API_URL', 'RELEASE_DEPLOY_HOOK_FILE',
  'RELEASE_RENDER_SERVICE_ID']);
const relayKeys = new Set(['DATABASE_URL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER',
  'SMTP_FROM', 'SMTP_PASSWORD', 'EXTERNAL_ACCESS_SECRET', 'EMAIL_RELAY_SECRET',
  'CONTENT_PUBLIC_URL', 'APP_DOWNLOAD_URL']);
const wahaKeys = new Set(['PORT', 'WHATSAPP_API_PORT', 'WHATSAPP_DEFAULT_ENGINE',
  'WAHA_IMAGE', 'WAHA_API_KEY', 'WAHA_DASHBOARD_ENABLED', 'WAHA_DASHBOARD_USERNAME',
  'WAHA_DASHBOARD_PASSWORD', 'WHATSAPP_SWAGGER_ENABLED', 'WHATSAPP_SWAGGER_USERNAME',
  'WHATSAPP_SWAGGER_PASSWORD', 'WAHA_PRINT_QR', 'WAHA_LOG_LEVEL', 'WAHA_HTTP_LOG_LEVEL',
  'WAHA_NAMESPACE', 'WAHA_SESSION_NAMESPACE', 'WAHA_WORKER_ID',
  'WHATSAPP_RESTART_ALL_SESSIONS', 'WHATSAPP_SESSIONS_POSTGRESQL_URL',
  'WAHA_API_KEY_EXCLUDE_PATH', 'WHATSAPP_API_KEY_EXCLUDE_PATH',
  'WAHA_GOWS_DEVICE_REQUIRE_FULL_SYNC', 'WAHA_GOWS_DEVICE_HISTORY_SYNC_FULL_SYNC_DAYS_LIMIT',
  'WAHA_GOWS_DEVICE_HISTORY_SYNC_INITIAL_SYNC_MAX_MESSAGES_PER_CHAT',
  'WAHA_GOWS_DEVICE_HISTORY_SYNC_RECENT_SYNC_DAYS_LIMIT', 'WAHA_NOWEB_WA_VERSION']);

// Only these settings are specific to one API runtime. Everything else in the
// backend schema is deliberately shared, with HOSTED_* only for real differences.
const runtimeSpecific = new Set(['NODE_ENV', 'HOST', 'TRUST_PROXY_HOPS', 'EMAIL_MODE',
  'STORAGE_ROOT', 'PUSH_PROVIDER', 'FRONTEND_URL', 'CLIENT_URL', 'WAHA_CALLBACK_URL',
  'SMSGATE_CALLBACK_URL', 'REDIS_LOCAL_URL', 'REDIS_URL', 'WAHA_LOCAL_API_URL', 'PG_DUMP_BIN', 'PG_RESTORE_BIN',
  'RESTORE_DATABASE_URL', 'RESTORE_STORAGE_ROOT', 'SOURCE_STORAGE_ROOT', 'SMTP_PASSWORD']);

const gatewayFields = {
  PORT: 'PORT', WHATSAPP_API_PORT: 'PORT', WHATSAPP_DEFAULT_ENGINE: 'ENGINE',
  WAHA_IMAGE: 'IMAGE', WAHA_API_KEY: 'API_KEY',
  WAHA_DASHBOARD_ENABLED: 'DASHBOARD_ENABLED', WAHA_DASHBOARD_USERNAME: 'ADMIN_USERNAME',
  WAHA_DASHBOARD_PASSWORD: 'DASHBOARD_PASSWORD',
  WHATSAPP_SWAGGER_ENABLED: 'SWAGGER_ENABLED', WHATSAPP_SWAGGER_USERNAME: 'ADMIN_USERNAME',
  WHATSAPP_SWAGGER_PASSWORD: 'SWAGGER_PASSWORD', WAHA_PRINT_QR: 'PRINT_QR',
  WAHA_LOG_LEVEL: 'LOG_LEVEL', WAHA_HTTP_LOG_LEVEL: 'HTTP_LOG_LEVEL',
  WAHA_NAMESPACE: 'NAMESPACE', WAHA_SESSION_NAMESPACE: 'NAMESPACE', WAHA_WORKER_ID: 'WORKER_ID',
  WHATSAPP_RESTART_ALL_SESSIONS: 'RESTART_SESSIONS',
  WHATSAPP_SESSIONS_POSTGRESQL_URL: 'DATABASE_URL',
  WAHA_API_KEY_EXCLUDE_PATH: 'PUBLIC_PATHS', WHATSAPP_API_KEY_EXCLUDE_PATH: 'LEGACY_PUBLIC_PATHS',
  WAHA_GOWS_DEVICE_REQUIRE_FULL_SYNC: 'FULL_SYNC',
  WAHA_GOWS_DEVICE_HISTORY_SYNC_FULL_SYNC_DAYS_LIMIT: 'HISTORY_FULL_DAYS',
  WAHA_GOWS_DEVICE_HISTORY_SYNC_INITIAL_SYNC_MAX_MESSAGES_PER_CHAT: 'HISTORY_INITIAL_MESSAGES',
  WAHA_GOWS_DEVICE_HISTORY_SYNC_RECENT_SYNC_DAYS_LIMIT: 'HISTORY_RECENT_DAYS',
  WAHA_NOWEB_WA_VERSION: 'WEB_VERSION',
};

function backendProfile(source, hosted) {
  const selected = {};
  for (const key of backendKeys) {
    const value = hosted
      ? (source['HOSTED_' + key] ?? (runtimeSpecific.has(key) ? undefined : source[key]))
      : source[key];
    if (value !== undefined && value !== '') selected[key] = value;
  }
  // Gmail's From address is the authenticated account; keep its identity once.
  if (!selected.SMTP_FROM && selected.SMTP_USER) selected.SMTP_FROM = selected.SMTP_USER;
  // A relay-mode API must never receive the Gmail app password.
  if (hosted && selected.EMAIL_MODE !== 'smtp') delete selected.SMTP_PASSWORD;
  return selected;
}

export function readPrivateEnvironment(packageName = 'backend') {
  if (!['backend', 'frontend'].includes(packageName)) throw Error('Unknown package.');
  const text = readFileSync(resolve(root, packageName, '.env'), 'utf8');
  const keys = [...text.matchAll(/^\s*([A-Z][A-Z0-9_]*)=/gm)].map(match => match[1]);
  if (new Set(keys).size !== keys.length) throw Error('Duplicate environment keys.');
  return parse(text);
}

export function selectEnvironment(source, target) {
  const output = {};
  let keys;
  switch (target) {
    case 'backend-local': return backendProfile(source, false);
    case 'backend-hosted': {
      const selected = backendProfile(source, true);
      if (selected.NODE_ENV !== 'production') throw Error('Hosted runtime must explicitly select production.');
      return selected;
    }
    case 'waha-local':
    case 'waha-hosted': {
      const hosted = target === 'waha-hosted';
      const api = backendProfile(source, hosted);
      for (const key of wahaKeys) {
        const name = gatewayFields[key];
        let value = source[(hosted ? 'HOSTED_GATEWAY_' : 'LOCAL_GATEWAY_') + name] ?? source['GATEWAY_' + name];
        if (key === 'WHATSAPP_DEFAULT_ENGINE') value ??= api.WAHA_ENGINE;
        if (key === 'WAHA_IMAGE' && !hosted) value ??= source.WAHA_IMAGE;
        if (key === 'WAHA_API_KEY' && value === undefined && api.WAHA_API_KEY) {
          // Preserve local plaintext / hosted verifier format without storing
          // another copy of the same credential in the master file.
          value = hosted ? 'sha512:' + createHash('sha512').update(api.WAHA_API_KEY).digest('hex') : api.WAHA_API_KEY;
        }
        if (value !== undefined && value !== '') output[key] = value;
      }
      return output;
    }
    case 'mail-relay': {
      const shared = backendProfile(source, true);
      for (const key of relayKeys) {
        if (key === 'DATABASE_URL') continue; // Neon injects this, not the local app owner.
        const value = source['MAIL_RELAY_' + key] ?? (key === 'SMTP_PASSWORD' ? source.SMTP_PASSWORD : shared[key]);
        if (value !== undefined && value !== '') output[key] = value;
      }
      if (!output.CONTENT_PUBLIC_URL && shared.BACKEND_SERVER_URL) output.CONTENT_PUBLIC_URL = shared.BACKEND_SERVER_URL;
      if (source.MAIL_RELAY_SMTP_USER !== undefined && source.MAIL_RELAY_SMTP_FROM === undefined) output.SMTP_FROM = output.SMTP_USER;
      return output;
    }
    case 'release':
      keys = releaseKeys;
      if (source.RELEASE_API_URL ?? source.HOSTED_BACKEND_SERVER_URL ?? source.BACKEND_SERVER_URL) output.RELEASE_API_URL = source.RELEASE_API_URL ?? source.HOSTED_BACKEND_SERVER_URL ?? source.BACKEND_SERVER_URL;
      break;
    case 'frontend-release': keys = publicKeys; break;
    default: throw Error('Unknown environment target.');
  }
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== '') {
      output[key] = source[key];
    }
  }
  if (target === 'frontend-release') {
    const url = new URL(output.EXPO_PUBLIC_SERVER_API_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('Invalid hosted API URL.');
    output.EXPO_PUBLIC_APP_ENV = 'production';
    output.EXPO_PUBLIC_API_TARGET = 'hosted';
    // EAS local archives exclude .env; pass only these public values in memory.
    output.EXPO_NO_DOTENV = '1';
  }
  return output;
}

export function childEnvironment(selected, parent = process.env) {
  // Preserve OS/toolchain inputs, not arbitrary inherited provider credentials.
  const safe = {};
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TMP', 'TEMP',
    'LANG', 'LC_ALL', 'TERM', 'CI', 'JAVA_HOME', 'ANDROID_HOME', 'ANDROID_SDK_ROOT',
    'GRADLE_OPTS', 'EAS_NO_VCS', 'EXPO_TOKEN', 'SSH_AUTH_SOCK']) {
    if (parent[key] !== undefined) safe[key] = parent[key];
  }
  return { ...safe, ...selected };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, target, ...args] = process.argv.slice(2);
    const source = readPrivateEnvironment(target === 'frontend-release' ? 'frontend' : 'backend');
    const selected = selectEnvironment(source, target);
    if (mode === 'check') {
      console.log(JSON.stringify({ target, keys: Object.keys(selected).sort() }));
    } else if (mode === 'run' && args[0] === '--' && args[1]) {
      const child = spawn(args[1], args.slice(2), { cwd: target === 'frontend-release' ? resolve(root, 'frontend') : root,
        env: childEnvironment(selected), stdio: 'inherit' });
      child.once('error', () => { console.error('Environment command unavailable.'); process.exitCode = 1; });
      child.once('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
    } else throw Error('Use check TARGET or run TARGET -- COMMAND.');
  } catch {
    // Parser/URL errors may include supplied secrets. Never echo raw exceptions.
    console.error('Environment configuration invalid or command unavailable.');
    process.exitCode = 1;
  }
}
