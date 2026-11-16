import { ApiConfigurationError, getApiBaseUrl } from '../config/api.js';

/** @typedef {'configuration' | 'network' | 'timeout' | 'aborted' | 'http' | 'invalid_response'} ErrorKind */

export class ApiError extends Error {
  /** @param {string} message @param {ErrorKind} kind @param {number | null} [status] */
  constructor(message, kind, status = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = /** @type {string | null} */ (null);
    this.retryAfterSeconds = /** @type {number | null} */ (null);
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
          const failure = new ApiError(response.status === 429
            ? 'Too many attempts. Please wait a moment and try again.'
            : 'The service is temporarily unavailable. Please try again.', 'http', response.status);
          const messages = /** @type {Record<string, string>} */ ({
            INVALID_OTP: 'That code is incorrect, expired, or already used. Check it or request a new code.',
            UNAUTHORIZED: 'Your session ended. Please sign in again.',
            AUTH_RATE_LIMITED: 'Too many attempts. Please wait before trying again.',
            AUTH_DISABLED: 'Sign-in is not enabled on this server yet.',
            OTP_UNAVAILABLE: 'A new code could not be confirmed. Wait a minute before trying again.',
            VALIDATION_ERROR: 'Check the entered details and try again.',
            MESSAGE_NOT_FOUND: 'This message is unavailable.',
            MAILBOX_UNAVAILABLE: 'Mailboxes are unavailable. Try again shortly.',
            INBOX_NOT_FOUND: 'This delivered message is unavailable.',
            INBOX_UNAVAILABLE: 'Your inbox is unavailable. Try again shortly.',
            SCHEDULE_NOT_FOUND: 'This scheduled message is unavailable or has returned to drafts.',
            SCHEDULE_STATE: 'This message changed state. Reload it before continuing.',
            SCHEDULES_UNAVAILABLE: 'Scheduling is unavailable. Please try again later.',
            INVALID_SCHEDULE_TIME: 'Enter a valid date, time and IANA timezone.',
            NONEXISTENT_TIME: 'This local time is skipped by a clock change. Choose another time.',
            AMBIGUOUS_TIME: 'This local time occurs twice because of a clock change. Choose another time.',
            SCHEDULE_TOO_SOON: 'Choose a time at least one minute in the future.',
            SCHEDULE_TOO_FAR: 'Choose a time within the next ten years.',
            REVIEW_EXPIRED: 'The review expired or the message changed. Review the schedule again.',
            INVALID_DELIVERIES: 'Choose a delivery channel for every recipient.',
            CHANNEL_UNAVAILABLE: 'Only planned in-app delivery to Dearly accounts is available. Return to drafts to update recipients.',
            MESSAGE_EMPTY: 'Add message text or a ready attachment before scheduling.',
            ATTACHMENTS_NOT_READY: 'Finish or remove every pending attachment before scheduling.',
            MESSAGE_LOCKED: 'Cancel the schedule and return to drafts before changing attachments.',
            ATTACHMENT_NOT_FOUND: 'This attachment is unavailable or has been removed.',
            ATTACHMENT_TYPE: 'The file format or media duration is unsupported. Choose another file.',
            ATTACHMENT_SIZE: 'The transferred size did not match. Refresh attachments and retry.',
            ATTACHMENT_QUOTA: 'Attachment count or storage allowance is full. Remove an attachment first.',
            UPLOAD_STATE: 'The upload state changed. Refresh attachments before retrying.',
            UPLOAD_INTERRUPTED: 'Upload was interrupted. Refresh attachments and retry.',
            MEDIA_UNAVAILABLE: 'Media validation is unavailable. Please try again later.',
            STORAGE_FULL: 'Attachment storage is full. Please try again later.',
            DRAFT_NOT_FOUND: 'This draft is unavailable or has been deleted.',
            INVALID_RECIPIENTS: 'An account recipient is unavailable. Check the selected recipients.',
            VERSION_CONFLICT: 'This draft changed elsewhere. Reload it before saving or deleting.',
            DRAFT_NOT_EDITABLE: 'This message is no longer an editable draft.',
            DRAFTS_UNAVAILABLE: 'Draft storage is unavailable. Please try again later.',
            RATE_LIMITED: 'Too many requests. Please wait before trying again.',
          });
          try {
            const body = await response.json();
            const code = body?.error?.code;
            if (typeof code === 'string' && Object.hasOwn(messages, code)) { failure.code = code; failure.message = messages[code]; }
          } catch { /* Raw server error bodies are intentionally discarded. */ }
          const wait = Number(response.headers.get('Retry-After'));
          if (Number.isInteger(wait) && wait > 0 && wait <= 3600) failure.retryAfterSeconds = wait;
          throw failure;
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
