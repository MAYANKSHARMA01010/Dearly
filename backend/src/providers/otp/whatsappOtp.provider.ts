import type { OtpProvider } from './otp.provider';
import { WahaProvider } from '../whatsapp/waha.provider';

/** Immediate auth dispatch; never enqueue or automatically replay an OTP. */
export function whatsappOtpProvider(
  gateway: WahaProvider,
  dailyLimit: number,
): OtpProvider {
  return {
    channel: 'whatsapp',
    deletionScope: gateway.scope,
    async readiness() {
      const state = await gateway.otpReadiness(10000);
      return state === 'READY' ? 'READY' : ['OFFLINE', 'UNPAIRED'].includes(state) ? 'WARMING' : 'UNAVAILABLE';
    },
    budget: { key: `whatsapp-otp:${gateway.scope}`, dailyLimit },
    async dispatch({ phone, code }) {
      const result = await gateway.sendOtp(phone, code);
      if (result.state === 'ACCEPTED' && result.providerMessageId)
        return {
          status: 'accepted',
          providerMessageId: result.providerMessageId,
        };
      return {
        status: result.state === 'UNKNOWN' ? 'unknown' : 'rejected',
        code: result.code ?? 'OTP_UNAVAILABLE',
      };
    },
  };
}
