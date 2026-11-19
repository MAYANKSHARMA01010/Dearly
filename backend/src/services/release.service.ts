import { isAbsolute } from 'node:path';
import type { AppConfig } from '../configs/env';
const remoteHttps = (value?: string) => {
  try {
    const u = new URL(value!);
    return (
      u.protocol === 'https:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) &&
      !u.hostname.endsWith('.trycloudflare.com')
    );
  } catch {
    return false;
  }
};
/** Offline, value-free release checks; never echoes credentials or performs a send. */
export function releaseIssues(
  c: AppConfig,
  options: {
    persistentStorage: boolean;
    backupKey?: string;
    smsCallback?: string;
  },
) {
  const issues: string[] = [];
  const backend = remoteHttps(c.backendServerUrl)
    ? new URL(c.backendServerUrl!).origin
    : undefined;
  if (c.nodeEnv !== 'production') issues.push('PRODUCTION_MODE_REQUIRED');
  if (!remoteHttps(c.backendServerUrl)) issues.push('HOSTED_BACKEND_REQUIRED');
  if (
    !remoteHttps(c.externalAccess?.publicUrl) ||
    (c.externalAccess
      ? new URL(c.externalAccess.publicUrl).origin
      : undefined) !== backend
  )
    issues.push('PUBLIC_CONTENT_ORIGIN_MISMATCH');
  if (c.authMode !== 'whatsapp' || !c.otpPepper)
    issues.push('REAL_PHONE_AUTH_REQUIRED');
  if (!c.email) issues.push('EMAIL_CONFIGURATION_REQUIRED');
  if (!c.whatsapp) issues.push('WHATSAPP_CONFIGURATION_REQUIRED');
  if (!c.sms) issues.push('SMS_CONFIGURATION_REQUIRED');
  if (!c.push?.enabled) issues.push('PUSH_CONFIGURATION_REQUIRED');
  if (
    !remoteHttps(c.whatsapp?.callbackUrl) ||
    c.whatsapp?.callbackUrl !== backend + '/webhooks/waha'
  )
    issues.push('WHATSAPP_CALLBACK_REQUIRED');
  if (
    !remoteHttps(options.smsCallback) ||
    options.smsCallback !== backend + '/webhooks/smsgate'
  )
    issues.push('SMS_CALLBACK_REQUIRED');
  if (
    !isAbsolute(c.storageRoot) ||
    (!options.persistentStorage && !c.remoteStorage)
  )
    issues.push('PERSISTENT_PRIVATE_STORAGE_REQUIRED');
  if (!/^[0-9a-f]{64}$/.test(options.backupKey ?? ''))
    issues.push('BACKUP_ENCRYPTION_KEY_REQUIRED');
  if (c.allowedOrigins.some((v) => !remoteHttps(v)))
    issues.push('HTTPS_CLIENT_ORIGINS_REQUIRED');
  const database = new URL(c.databaseUrl);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) &&
    !['require', 'verify-ca', 'verify-full'].includes(
      database.searchParams.get('sslmode') ?? '',
    )
  )
    issues.push('DATABASE_TLS_REQUIRED');
  return issues;
}
