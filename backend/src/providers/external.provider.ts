export type ExternalChannel = 'EMAIL' | 'WHATSAPP' | 'SMS';
export type SubmissionResult = {
  state: 'ACCEPTED' | 'REJECTED' | 'RETRYABLE' | 'UNKNOWN';
  code: string | null;
  providerMessageId: string | null;
};
export interface ExternalProvider {
  senderKey: string;
  dailyLimit: number;
  scope?: string;
  send(to: string, link: string, id: string, senderName?: string | null): Promise<SubmissionResult>;
  reconcile?(providerMessageId: string): Promise<void>;
}
