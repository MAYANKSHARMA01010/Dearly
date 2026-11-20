export class ApiConfigurationError extends Error {}

/**
 * Prefer the hosted URL; local is a development-only secondary configuration.
 * Release builds always require the hosted URL, even with a stale development env.
 * @param {{ localUrl?: string, serverUrl?: string, appEnv?: string, target?: string, isDevelopment: boolean }} settings
 */
export function resolveApiBaseUrl({ localUrl, serverUrl, appEnv, target, isDevelopment }) {
  if (appEnv && !['development', 'test', 'production'].includes(appEnv)) {
    throw new ApiConfigurationError('The app environment is not configured correctly.');
  }
  if (target && !['hosted', 'local'].includes(target)) throw new ApiConfigurationError('The service target is not configured correctly.');
  const production = !isDevelopment || appEnv === 'production';
  if (production && target === 'local') throw new ApiConfigurationError('Release builds require the hosted service.');
  const hosted = production || target === 'hosted' || (target !== 'local' && Boolean(serverUrl?.trim()));
  const value = (hosted ? serverUrl : localUrl)?.trim();
  if (!value) {
    throw new ApiConfigurationError('The service address has not been configured.');
  }
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Invalid API address');
    }
    if (hosted && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('Hosted API must use a remote HTTPS address');
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    // Never echo the supplied URL: a mistaken value could contain credentials.
    throw new ApiConfigurationError('The service address is not configured correctly.');
  }
}

export function getApiBaseUrl() {
  return resolveApiBaseUrl({
    localUrl: process.env.EXPO_PUBLIC_API_URL,
    serverUrl: process.env.EXPO_PUBLIC_SERVER_API_URL,
    appEnv: process.env.EXPO_PUBLIC_APP_ENV,
    target: process.env.EXPO_PUBLIC_API_TARGET,
    isDevelopment: __DEV__,
  });
}
