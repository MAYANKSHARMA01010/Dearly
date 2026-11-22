import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { parseEnvironment } from './env';
import { appDownloadUrl } from '../utils/deliveryLinks';

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env, environmentPath = resolve(__dirname, '../../.env')) {
  // Both src/configs and dist/configs resolve to backend/.env, regardless of cwd.
  // Production receives a deliberately selected service environment. Never fill
  // missing production credentials from the local profile in this master file.
  if (source.NODE_ENV !== 'production') {
    const local: Record<string, string> = {};
    dotenv.config({ path: environmentPath, processEnv: local });
    for (const [key, value] of Object.entries(local)) {
      if (!/^(HOSTED_|LOCAL_WAHA_SERVICE_|MAIL_RELAY_|RELEASE_)/.test(key) && source[key] === undefined) {
        source[key] = value;
      }
    }
  }
  const config = parseEnvironment(source);
  if (config.externalAccess) {
    if (!source.APP_DOWNLOAD_URL) throw new Error('APP_DOWNLOAD_URL is required.');
    appDownloadUrl(source.APP_DOWNLOAD_URL);
  }
  return config;
}
