import { publicDeliveryLink } from '../../utils/deliveryLinks';
import { createHash } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { SmsGateConfig } from '../../configs/env';
import type { SubmissionResult } from '../external.provider';
import { smsSegments } from '../../utils/smsSegments';
import { boundedJson } from '../../utils/boundedJson';

export type SmsGateStatus = 'READY' | 'OFFLINE' | 'AUTH_FAILED' | 'DISABLED' | 'MISCONFIGURED';
export const smsScope = (c: SmsGateConfig) => createHash('sha256')
  .update(`smsgate:${c.baseUrl}:${c.connection}:${c.deviceId ?? 'local'}:${c.simNumber}:${createHash('sha256').update(c.webhookSecret).digest('hex')}`).digest('hex');
export const smsText = (link: string) => `Dearly private message: ${link}`;
export const smsLinkFits = (origin: string) => publicDeliveryLink(origin) && smsSegments(smsText(`${origin}/external/#00000000-0000-4000-8000-000000000000.${'a'.repeat(43)}`)).segments === 1;
const outcome = (state: SubmissionResult['state'], code: string | null, providerMessageId: string | null = null): SubmissionResult => ({ state, code, providerMessageId });

export class SmsGateProvider {
  readonly scope: string;
  constructor(readonly config: SmsGateConfig, private readonly request: typeof fetch = fetch) {
    this.scope = smsScope(config);
  }
  private http(path: string, options: RequestInit = {}) {
    const authorization = this.config.token ? `Bearer ${this.config.token}`
      : `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`;
    return this.request(`${this.config.baseUrl}${path}`, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    });
  }
  async readiness(): Promise<SmsGateStatus> {
    try {
      const response = await this.http(this.config.connection === 'local' ? '/health' : '/devices');
      if ([401, 403].includes(response.status)) return 'AUTH_FAILED';
      if (!response.ok) return 'OFFLINE';
      const body = await boundedJson(response);
      if (this.config.connection === 'local') return body.status === 'pass' ? 'READY' : 'OFFLINE';
      const r = Array.isArray(body) ? body.find((d) => d?.id === this.config.deviceId) : undefined;
      if (!r) return 'OFFLINE';
      if (r.id !== this.config.deviceId) return 'MISCONFIGURED';
      const lastSeen = typeof r.lastSeen === 'string' ? Date.parse(r.lastSeen) : NaN;
      // Cloud fallback polls every 15 minutes. Allow one interval plus five
      // minutes' grace; lastSeen is recent activity, not a live connection test.
      return Number.isFinite(lastSeen) && Date.now() - lastSeen <= 1200000 && lastSeen <= Date.now() + 60000 ? 'READY' : 'OFFLINE';
    } catch { return 'OFFLINE'; }
  }
  async send(phone: string, link: string, id: string): Promise<SubmissionResult> {
    const parsed = parsePhoneNumberFromString(phone);
    if (!parsed?.isValid() || parsed.number !== phone || !/^\+[1-9]\d{5,14}$/.test(phone))
      return outcome('REJECTED', 'INVALID_RECIPIENT');
    try {
      if (!publicDeliveryLink(link)) return outcome('REJECTED', 'INVALID_CONTENT_URL');
      const u = new URL(link);
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || !/^[0-9a-f-]{36}$/.test(id)) throw Error();
    } catch { return outcome('REJECTED', 'INVALID_RECIPIENT'); }
    // One carrier segment per notification. No media, message body or shortening service.
    const text = smsText(link);
    if (smsSegments(text).segments !== 1) return outcome('REJECTED', 'SMS_TOO_LONG');
    const readiness = await this.readiness();
    if (readiness !== 'READY') return outcome('RETRYABLE', readiness === 'AUTH_FAILED' ? 'SMSGATE_AUTH' : 'SMSGATE_OFFLINE');
    try {
      const response = await this.http(this.config.connection === 'local' ? '/message' : '/messages', {
        method: 'POST', body: JSON.stringify({
          id, textMessage: { text }, phoneNumbers: [phone],
          ...(this.config.connection === 'cloud' ? { deviceId: this.config.deviceId } : {}),
          simNumber: this.config.simNumber, withDeliveryReport: true, ttl: 300, priority: 0,
        }),
      });
      if ([401, 403].includes(response.status)) return outcome('RETRYABLE', 'SMSGATE_AUTH');
      if (response.status === 429) return outcome('RETRYABLE', 'SMSGATE_THROTTLED');
      if ([400, 404, 422].includes(response.status)) return outcome('REJECTED', 'SMSGATE_REJECTED');
      if (!response.ok) return outcome('UNKNOWN', 'SMSGATE_UNCERTAIN');
      const r = await boundedJson(response);
      const recipients = Array.isArray(r.recipients) ? r.recipients as { phoneNumber?: unknown }[] : [];
      if (r.id !== id || typeof r.deviceId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(r.deviceId) ||
          (this.config.deviceId && r.deviceId !== this.config.deviceId) || recipients.length !== 1 ||
          ![phone, phone.slice(1)].includes(String(recipients[0].phoneNumber)) || !['Pending', 'Processed', 'Sent', 'Delivered', 'Failed'].includes(String(r.state)))
        return outcome('UNKNOWN', 'SMSGATE_UNCERTAIN');
      // Queue acceptance is not a carrier report; only signed device events strengthen it.
      return r.state === 'Failed' ? outcome('REJECTED', 'SMSGATE_REJECTED') : outcome('ACCEPTED', null, id);
    } catch { return outcome('UNKNOWN', 'SMSGATE_UNCERTAIN'); }
  }
  async registerCallbacks(callbackUrl: string) {
    const u = new URL(callbackUrl);
    if ((u.protocol !== 'https:' && !(u.protocol === 'http:' && u.hostname === '127.0.0.1')) ||
        u.pathname !== '/webhooks/smsgate' || u.username || u.password || u.search || u.hash) throw Error('Invalid callback');
    const existing = await this.http('/webhooks');
    if (!existing.ok) throw Error('Callback setup unavailable');
    const rows: unknown = await boundedJson(existing);
    if (!Array.isArray(rows)) throw Error('Callback setup unavailable');
    const events = ['sms:sent', 'sms:delivered', 'sms:failed', 'sms:cancelled'];
    for (const event of events) {
      if (rows.some((r) => r?.url === callbackUrl && r?.event === event &&
          (this.config.connection === 'local' || (r?.deviceId ?? r?.device_id) === this.config.deviceId))) continue;
      const r = await this.http('/webhooks', { method: 'POST', body: JSON.stringify({ url: callbackUrl, event,
        ...(this.config.connection === 'cloud' ? { deviceId: this.config.deviceId } : {}) }) });
      if (!r.ok) throw Error('Callback setup unavailable');
    }
    // Narrow only legacy unscoped registrations for this exact Dearly URL, after
    // their scoped replacements exist. Never modify another URL/device's hooks.
    if (this.config.connection === 'cloud') {
      for (const r of rows) {
        if (r?.url !== callbackUrl || !events.includes(r?.event) || r?.deviceId || r?.device_id ||
            typeof r?.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(r.id)) continue;
        const removed = await this.http(`/webhooks/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
        if (!removed.ok && removed.status !== 404) throw Error('Callback narrowing unavailable');
      }
    }
  }
}
