export type OtpDispatchResult =
  | { status: 'simulated'; developmentCode: string }
  | { status: 'accepted'; providerMessageId: string }
  | { status: 'rejected' | 'unknown'; code: string };

export interface OtpProvider {
  readonly channel?: 'whatsapp';
  readonly budget?: { key: string; dailyLimit: number };
  dispatch(input: { phone: string; code: string; challengeId: string }): Promise<OtpDispatchResult>;
}

// Explicit local simulation: no logging, network request or delivery claim.
export function developmentOtpProvider(): OtpProvider {
  return { dispatch: async ({ code }) => ({ status: 'simulated', developmentCode: code }) };
}
