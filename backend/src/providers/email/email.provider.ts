import { senderDisplayName } from '../../utils/senderDisplayName';
import { appDownloadUrl, appDownloadInstructions, publicDeliveryLink } from '../../utils/deliveryLinks';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { EmailRelay } from './relay.provider';
import type { SmtpConfig, RelayEmailConfig } from '../../configs/env';
import { smtpOptions } from './smtp.transport';
export type EmailResult = {
  state: 'ACCEPTED' | 'REJECTED' | 'RETRYABLE' | 'UNKNOWN';
  code: string | null;
  providerMessageId: string | null;
};
export type EmailSender = (
  to: string,
  link: string,
  id: string,
  senderName?: string | null,
) => Promise<EmailResult>;
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function emailTemplate(link: string, senderName?: string | null) {
  if (!publicDeliveryLink(link)) throw Error('Invalid public message link');
  const sender = senderDisplayName(senderName);
  return {
    subject: `${sender} sent you a private message via Dearly`,
    text: `${sender} sent you a private message via Dearly.\n\nOpen message: ${link}\n\nDownload Android app: ${appDownloadUrl()}\n${appDownloadInstructions}\n\nThis link expires in seven days. Anyone with the link can open this message. The sender can revoke it.`,
    html: `<h1>Your Dearly message is ready</h1><p style="overflow-wrap:anywhere;word-break:break-word">${escapeHtml(sender)} sent you a private message.</p><p><a href="${escapeHtml(link)}">Open message</a></p><h2>Get the Dearly app</h2><p><a href="${appDownloadUrl()}">Download Android app from GitHub Releases</a></p><p>${appDownloadInstructions}</p><p>This link expires in seven days. Anyone with the link can open this message. The sender can revoke it.</p>`,
  };
}
export function smtpFailure(error: unknown): EmailResult {
  const e =
    typeof error === 'object' && error !== null
      ? (error as { responseCode?: number; command?: string; code?: string })
      : {};
  if (e.responseCode && e.responseCode >= 400 && e.responseCode < 600)
    return {
      state: e.responseCode < 500 ? 'RETRYABLE' : 'REJECTED',
      code:
        e.responseCode === 421 ||
        e.responseCode === 450 ||
        e.responseCode === 452
          ? 'SMTP_THROTTLED'
          : 'SMTP_REJECTED',
      providerMessageId: null,
    };
  if (
    [
      'CONN',
      'EHLO',
      'HELO',
      'STARTTLS',
      'AUTH',
      'AUTH PLAIN',
      'AUTH LOGIN',
    ].includes(e.command ?? '') ||
    e.code === 'EAUTH'
  )
    return {
      state: 'RETRYABLE',
      code: e.code === 'EAUTH' ? 'SMTP_AUTH' : 'SMTP_CONNECTION',
      providerMessageId: null,
    };
  return { state: 'UNKNOWN', code: 'SMTP_UNCERTAIN', providerMessageId: null };
}
export function verificationEmailTemplate(code: string) {
  if (!/^\d{6}$/.test(code)) throw Error('Invalid verification code');
  return { subject: 'Verify your Dearly email address', text: `Your Dearly email verification code is ${code}. It expires in 5 minutes. Enter it in Profile to link this address to your phone-verified account. Do not share it. If you did not request this, ignore this email.`, html: `<h1>Verify your email</h1><p>Your Dearly verification code is <strong>${code}</strong>.</p><p>It expires in 5 minutes. Enter it in Profile to link this address to your phone-verified account. Do not share it. If you did not request this, ignore this email.</p>` };
}
export function createEmailSender(config: SmtpConfig | RelayEmailConfig, verification = false): EmailSender {
  if (config.mode === 'relay') return verification ? new EmailRelay(config).sendVerification : new EmailRelay(config).send;
  return async (to, link, id, senderName) => {
    if (!(verification ? /^\d{6}$/.test(link) : publicDeliveryLink(link))) return { state: 'REJECTED', code: 'INVALID_CONTENT_URL', providerMessageId: null };
    if (!z.email().safeParse(to).success)
      return {
        state: 'REJECTED',
        code: 'INVALID_RECIPIENT',
        providerMessageId: null,
      };
    const transport = nodemailer.createTransport(smtpOptions(config));
    let timeout: NodeJS.Timeout | undefined;
    try {
      const info = await Promise.race([
        transport.sendMail({
          from: { name: 'Dearly', address: config.from },
          to: { address: to, name: '' },
          envelope: { from: config.from, to: [to] },
          messageId: `<${id}@dearly.local>`,
          ...(verification ? verificationEmailTemplate(link) : emailTemplate(link, senderName)),
        }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            transport.close();
            reject(Error('Submission deadline'));
          }, 30000);
        }),
      ]);
      const accepted = info.accepted.some(
        (a) => String(a).toLowerCase() === to.toLowerCase(),
      );
      const rejected = info.rejected.some(
        (a) => String(a).toLowerCase() === to.toLowerCase(),
      );
      return {
        state: accepted ? 'ACCEPTED' : rejected ? 'REJECTED' : 'UNKNOWN',
        code: accepted ? null : rejected ? 'SMTP_REJECTED' : 'SMTP_UNCERTAIN',
        providerMessageId: accepted
          ? (info.response.match(/\bOK ([A-Za-z0-9.-]{1,200}) - gsmtp/)?.[1] ??
            null)
          : null,
      };
    } catch (error) {
      return smtpFailure(error);
    } finally {
      clearTimeout(timeout);
      transport.close();
    }
  };
}
