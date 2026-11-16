import { ApiConfigurationError, getApiBaseUrl } from '../config/api.js';

/** @typedef {'configuration' | 'network' | 'timeout' | 'aborted' | 'http' | 'invalid_response'} ErrorKind */

export class ApiError extends Error {
  /** @param {string} message @param {ErrorKind} kind @param {number | null} [status] */
  constructor(message, kind, status = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * No automatic retries: later write/OTP requests must not be duplicated silently.
 * @param {{ getBaseUrl?: () => string, fetcher?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createApiClient({ getBaseUrl = getApiBaseUrl, fetcher = fetch, timeoutMs = 10000 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Invalid request timeout');
  return {
    /** @param {string} path @param {RequestInit} [options] @returns {Promise<unknown>} */
    async request(path, options = {}) {
      if (!path.startsWith('/') || path.startsWith('//')) {
        throw new ApiError('The service request is not configured correctly.', 'configuration');
      }
      let baseUrl;
      try { baseUrl = getBaseUrl(); }
      catch (error) {
        if (error instanceof ApiConfigurationError) throw new ApiError(error.message, 'configuration');
        throw new ApiError('The service address has not been configured.', 'configuration');
      }
      if (options.signal?.aborted) throw new ApiError('Request canceled.', 'aborted');
      const controller = new AbortController();
      let timedOut = false;
      const cancel = () => controller.abort();
      options.signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        const headers = new Headers(options.headers);
        headers.set('Accept', 'application/json');
        const response = await fetcher(`${baseUrl}${path}`, { ...options, headers, signal: controller.signal });
        if (!response.ok) {
          throw new ApiError(response.status === 429
            ? 'Too many attempts. Please wait a moment and try again.'
            : 'The service is temporarily unavailable. Please try again.', 'http', response.status);
        }
        let payload;
        try { payload = await response.json(); }
        catch { throw new ApiError('The service returned an unreadable response. Please try again.', 'invalid_response'); }
        if (!payload || typeof payload !== 'object' || payload.success !== true || !('data' in payload)) {
          throw new ApiError('The service returned an unexpected response. Please try again.', 'invalid_response');
        }
        return payload.data;
      } catch (error) {
        if (controller.signal.aborted) {
          throw new ApiError(timedOut ? 'The service took too long to respond. Please try again.' : 'Request canceled.',
            timedOut ? 'timeout' : 'aborted');
        }
        if (error instanceof ApiError) throw error;
        throw new ApiError('We couldn’t reach Dearly. Check your connection and try again.', 'network');
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', cancel);
      }
    },
  };
}

export const apiClient = createApiClient();
