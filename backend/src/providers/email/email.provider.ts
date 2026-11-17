import nodemailer from 'nodemailer';
import { z } from 'zod';
import type { SmtpConfig } from '../../configs/env';
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
) => Promise<EmailResult>;
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function emailTemplate(link: string) {
  const url = new URL(link);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw Error('Invalid email link');
  return {
    subject: 'Your Dearly message is ready',
    text: `Someone has sent you a private Dearly message.\n\nOpen message: ${link}\n\nThis link expires in seven days. Anyone with the link can open this message. The sender can revoke it.`,
    html: `<h1>Your Dearly message is ready</h1><p>Someone has sent you a private message.</p><p><a href="${escapeHtml(link)}">Open message</a></p><p>This link expires in seven days. Anyone with the link can open this message. The sender can revoke it.</p>`,
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
export function createEmailSender(config: SmtpConfig): EmailSender {
  return async (to, link, id) => {
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
          ...emailTemplate(link),
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
