import { waitForOtpReady } from './otpReadiness.js';
import { apiClient } from '../../api/client.js';
import { parseChallenge } from './contracts.js';

/** @param {ReturnType<typeof import('../../api/client.js').createApiClient>} [client] @param {boolean} [development] */
export function createAuthService(client = apiClient, development = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_APP_ENV !== 'production') {
  /** @param {string} path @param {object} body @param {AbortSignal} [signal] */
  const post = (path, body, signal) => client.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  return {
    /** @param {string} phone @param {string} country @param {AbortSignal} [signal] @param {(phase:'connecting'|'requesting')=>void} [onPhase] */
    requestOtp: async (phone, country, signal, onPhase) => {
      onPhase?.('connecting'); if(!development) await waitForOtpReady(client,signal);
      onPhase?.('requesting'); return parseChallenge(await post('/auth/otp/request',{phone,country},signal),development);
    },
    /** @param {string} challengeId @param {AbortSignal} [signal] @param {(phase:'connecting'|'requesting')=>void} [onPhase] */
    resendOtp: async (challengeId, signal, onPhase) => { onPhase?.('connecting'); if(!development) await waitForOtpReady(client,signal); onPhase?.('requesting'); return parseChallenge(await post('/auth/otp/resend', { challengeId }, signal), development); },
    /** @param {string} challengeId @param {string} code @param {AbortSignal} [signal] */
    verifyOtp: (challengeId, code, signal) => post('/auth/otp/verify', { challengeId, code }, signal),
  };
}
export const authService = createAuthService();
