import { senderDisplayName } from '../../utils/senderDisplayName';
import { appDownloadUrl, appDownloadInstructions, publicDeliveryLink } from '../../utils/deliveryLinks';
import { boundedJson } from '../../utils/boundedJson';
export { boundedJson } from '../../utils/boundedJson';
import { createHash } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { WahaConfig } from '../../configs/env';
import type { SubmissionResult } from '../external.provider';
export type WahaStatus =
  | 'READY'
  | 'DISABLED'
  | 'UNPAIRED'
  | 'STOPPED'
  | 'OFFLINE'
  | 'AUTH_FAILED'
  | 'RESTRICTED'
  | 'MISCONFIGURED';
export const wahaScope = (config: WahaConfig) =>
  createHash('sha256')
    .update(`${config.scopeOrigin ?? config.baseUrl}/${config.session}/${config.engine}`)
    .digest('hex');
export function whatsappJid(phone: string) {
  const parsed = parsePhoneNumberFromString(phone);
  if (
    !parsed?.isValid() ||
    parsed.number !== phone ||
    !/^\+[1-9]\d{5,14}$/.test(phone)
  )
    throw Error('Invalid WhatsApp destination');
  return `${phone.slice(1)}@c.us`;
}
export class WahaProvider {
  readonly scope: string;
  private otpReadyUntil = 0;
  private otpProbe: Promise<WahaStatus> | null = null;
  constructor(
    readonly config: WahaConfig,
    private readonly request: typeof fetch = fetch,
    private readonly clock: () => number = Date.now,
  ) {
    this.scope = wahaScope(config);
  }
  private http(path: string, options: RequestInit = {}, timeoutMs = 10000) {
    return this.request(`${this.config.baseUrl}${path}`, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'X-Api-Key': this.config.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  }
  async start(): Promise<'STARTED' | 'PAIRING' | 'PRESERVED'> {
    const r = await this.http('/api/sessions/default');
    if (!r.ok) throw Error('Session unavailable');
    const state = await boundedJson(r);
    if (state.status === 'WORKING') return 'PRESERVED';
    if (
      [
        'SCAN_QR_CODE',
        'STARTING',
        'PASSKEY_REQUIRED',
        'PASSKEY_CONFIRMATION_REQUIRED',
      ].includes(String(state.status))
    )
      return 'PAIRING';
    if (!['FAILED', 'STOPPED'].includes(String(state.status)))
      throw Error('Unexpected session state');
    const response = await this.http(
      `/api/sessions/default/${state.status === 'FAILED' ? 'restart' : 'start'}`,
      { method: 'POST' },
    );
    if (!response.ok) throw Error('Session start unavailable');
    return 'STARTED';
  }
  async initialize(callbackUrl: string): Promise<'CREATED' | 'EXISTS'> {
    const url = new URL(callbackUrl);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/webhooks/waha'
    )
      throw Error('Invalid callback address');
    const old = await this.http('/api/sessions/default');
    if (old.ok) return 'EXISTS';
    if (old.status !== 404) throw Error('Gateway unavailable');
    const r = await this.http('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        name: 'default',
        start: true,
        config: {
          ...(this.config.engine === 'WEBJS'
            ? { webjs: { tagsEventsOn: true } }
            : this.config.engine === 'GOWS'
              ? {
                  gows: {
                    storage: {
                      messages: false,
                      groups: false,
                      chats: false,
                      labels: false,
                      contacts: false,
                      messageSecrets: false,
                    },
                  },
                }
              : {
                  noweb: {
                    store: { enabled: false, fullSync: false },
                    markOnline: false,
                  },
                }),
          ignore: {
            groups: true,
            channels: true,
            status: true,
            broadcast: true,
          },
          webhooks: [
            {
              url: callbackUrl,
              events: ['message.ack'],
              hmac: { key: this.config.webhookSecret },
              retries: { delaySeconds: 5, attempts: 5, policy: 'exponential' },
            },
          ],
        },
      }),
    });
    if (!r.ok) throw Error('Session initialization unavailable');
    return 'CREATED';
  }
  async pairingImage(): Promise<Buffer> {
    const r = await this.http('/api/default/auth/qr?format=image', {
      headers: { Accept: 'image/png' },
    });
    if (
      !r.ok ||
      !r.headers.get('content-type')?.includes('image/png') ||
      !r.body
    )
      throw Error('QR unavailable');
    const reader = r.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 262144) throw Error('QR too large');
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks);
    if (
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw Error('Invalid QR');
    return bytes;
  }
  async readiness(timeoutMs?: number): Promise<WahaStatus> {
    try {
      const response = await this.http(
        `/api/sessions/${this.config.session}`, {},
        timeoutMs ?? (this.config.baseUrl.startsWith('https://') ? 60000 : 10000),
      );
      if (response.status === 401 || response.status === 403)
        return 'AUTH_FAILED';
      if (response.status === 404) return 'STOPPED';
      if (!response.ok) return 'OFFLINE';
      const r = await boundedJson(response);
      if (r.name !== this.config.session || typeof r.status !== 'string')
        return 'MISCONFIGURED';
      if (r.status === 'FAILED') return 'OFFLINE';
      if (r.status !== 'WORKING')
        return [
          'SCAN_QR_CODE',
          'STARTING',
          'PASSKEY_REQUIRED',
          'PASSKEY_CONFIRMATION_REQUIRED',
        ].includes(r.status)
          ? 'UNPAIRED'
          : 'STOPPED';
      const me =
        r.me && typeof r.me === 'object'
          ? (r.me as Record<string, unknown>)
          : {};
      const data =
        r.data && typeof r.data === 'object'
          ? (r.data as Record<string, unknown>)
          : {};
      const restricted = [me.reachoutTimelock, data.reachoutTimelock].some(
        (v) =>
          v && typeof v === 'object' && 'isActive' in v && v.isActive === true,
      );
      const capping = me.messageCapping as
        { cappingStatus?: unknown } | undefined;
      return restricted || capping?.cappingStatus === 'CAPPED'
        ? 'RESTRICTED'
        : 'READY';
    } catch {
      return 'OFFLINE';
    }
  }
  /** Share only a very recent successful auth probe. Never cache failures or sends. */
  async otpReadiness(timeoutMs?: number): Promise<WahaStatus> {
    if (this.clock() < this.otpReadyUntil) return 'READY';
    if (this.otpProbe) return this.otpProbe;
    this.otpProbe = this.readiness(timeoutMs).then((state) => {
      this.otpReadyUntil = state === 'READY' ? this.clock() + 5000 : 0;
      return state;
    });
    try { return await this.otpProbe; }
    finally { this.otpProbe = null; }
  }
  async send(to: string, link: string, senderName?: string | null): Promise<SubmissionResult> {
    const result = (
      state: SubmissionResult['state'],
      code: string | null,
      providerMessageId: string | null = null,
    ) => ({ state, code, providerMessageId });
    let chatId: string;
    try {
      chatId = whatsappJid(to);
      if (!publicDeliveryLink(link)) return result('REJECTED', 'INVALID_CONTENT_URL');
      const url = new URL(link);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw Error();
    } catch {
      return result('REJECTED', 'INVALID_RECIPIENT');
    }
    return this.sendText(
      chatId,
      `${senderDisplayName(senderName).replace(/[*_~`]/g, '') || 'Someone'} sent you a private message via Dearly.\n\n${link}\n\nDownload Android app: ${appDownloadUrl()}\n${appDownloadInstructions}\n\nThis link expires in seven days. Anyone with the link can open it; the sender can revoke it.`,
    );
  }
  /** Revoke only one recorded outgoing OTP; never enumerate or clear chats. */
  async deleteOtpMessage(messageId: string): Promise<boolean> {
    const match = /^true_([0-9]{5,20}@(c\.us|lid))_[A-Za-z0-9_-]+$/.exec(messageId);
    if (!match || messageId.length > 255) return false;
    try {
      const response = await this.http(
        `/api/${encodeURIComponent(this.config.session)}/chats/${encodeURIComponent(match[1])}/messages/${encodeURIComponent(messageId)}?forMe=false`,
        { method: 'DELETE' },
      );
      // A 404 can mean a missing session, not proof of deletion.
      return response.ok;
    } catch { return false; }
  }
  async sendOtp(phone: string, code: string): Promise<SubmissionResult> {
    if (!/^\d{6}$/.test(code))
      return { state: 'REJECTED', code: 'INVALID_OTP', providerMessageId: null };
    let chatId: string;
    try {
      chatId = whatsappJid(phone);
    } catch {
      return { state: 'REJECTED', code: 'INVALID_RECIPIENT', providerMessageId: null };
    }
    return this.sendText(
      chatId,
      `Your Dearly verification code is ${code}. It expires in 5 minutes. Do not share this code. If you did not request it, ignore this message.`,
      true,
    );
  }
  private async sendText(chatId: string, text: string, otp = false): Promise<SubmissionResult> {
    const result = (
      state: SubmissionResult['state'],
      code: string | null,
      providerMessageId: string | null = null,
    ) => {
      if (state !== 'ACCEPTED') this.otpReadyUntil = 0;
      return { state, code, providerMessageId };
    };
    const status = await (otp ? this.otpReadiness() : this.readiness());
    if (status !== 'READY')
      return result(
        'RETRYABLE',
        status === 'UNPAIRED'
          ? 'WAHA_UNPAIRED'
          : status === 'RESTRICTED'
            ? 'WAHA_RESTRICTED'
            : status === 'AUTH_FAILED'
              ? 'WAHA_AUTH'
              : 'WAHA_OFFLINE',
      );
    try {
      const response = await this.http('/api/sendText', {
        method: 'POST',
        body: JSON.stringify({
          session: this.config.session,
          chatId,
          text,
          linkPreview: false,
        }),
      }, this.config.baseUrl.startsWith('https://') ? 30000 : 10000);
      if (response.status === 429) return result('RETRYABLE', 'WAHA_THROTTLED');
      if (response.status === 401 || response.status === 403)
        return result('RETRYABLE', 'WAHA_AUTH');
      if ([400, 404, 422].includes(response.status))
        return result('REJECTED', 'WAHA_REJECTED');
      // Other failures can occur after the gateway actually sends. Do not auto replay.
      if (!response.ok) return result('UNKNOWN', 'WAHA_UNCERTAIN');
      const r = await boundedJson(response);
      if (
        typeof r.id !== 'string' ||
        r.id.length > 255 ||
        !/^true_[0-9]{5,20}@(c\.us|lid)_[A-Za-z0-9_-]+$/.test(r.id) ||
        (r.fromMe !== true &&
          !(this.config.engine === 'GOWS' && r.fromMe === undefined))
      )
        return result('UNKNOWN', 'WAHA_UNCERTAIN');
      // Core GOWS returns { id, _data }, without the redundant fromMe/to fields.
      // The serialized ID must still prove outbound direction and the PN destination.
      const idChat = r.id.split('_')[1];
      if (idChat.endsWith('@c.us') && idChat !== chatId)
        return result('UNKNOWN', 'WAHA_UNCERTAIN');
      if (typeof r.to === 'string' && r.to.endsWith('@c.us') && r.to !== chatId)
        return result('UNKNOWN', 'WAHA_UNCERTAIN');
      return result('ACCEPTED', null, r.id);
    } catch {
      return result('UNKNOWN', 'WAHA_UNCERTAIN');
    }
  }
}
