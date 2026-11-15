import { apiClient, ApiError } from '../api/client.js';

/** @typedef {{ serverAvailable: boolean, databaseAvailable: boolean, checkedAt: number, message: string }} HealthReport */

/**
 * @param {{ signal?: AbortSignal, client?: ReturnType<typeof import('../api/client').createApiClient> }} [options]
 * @returns {Promise<HealthReport>}
 */
export async function checkServiceHealth({ signal, client = apiClient } = {}) {
  const [server, database] = await Promise.allSettled([
    client.request('/health', { signal }),
    client.request('/health/db', { signal }),
  ]);
  if (signal?.aborted) throw new ApiError('Request canceled.', 'aborted');
  /** @param {PromiseSettledResult<unknown>} result @param {string} expected */
  const available = (result, expected) => result.status === 'fulfilled' &&
    result.value !== null && typeof result.value === 'object' &&
    'status' in result.value && result.value.status === expected;
  const serverAvailable = available(server, 'alive');
  const databaseAvailable = available(database, 'ready');
  const failure = server.status === 'rejected' ? server.reason
    : database.status === 'rejected' ? database.reason : null;
  return {
    serverAvailable,
    databaseAvailable,
    checkedAt: Date.now(),
    message: serverAvailable && databaseAvailable ? 'Dearly can reach its server and message storage.'
      : failure instanceof ApiError ? failure.message : 'Some services are unavailable. Please try again.',
  };
}
