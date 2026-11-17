import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { SmtpConfig } from '../../configs/env';

/** No logging, URL/file fetching, plaintext fallback or capture-as-delivery. */
export function smtpOptions(config: SmtpConfig): SMTPTransport.Options {
  return {
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: true,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    dnsTimeout: 10000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

export type SmtpCheck = 'READY' | 'DISABLED' | 'AUTH_FAILED' | 'CONNECTION_FAILED';

/** Checks connection/TLS/authentication only: never submits an email. */
export async function verifySmtp(config?: SmtpConfig): Promise<SmtpCheck> {
  if (!config) return 'DISABLED';
  const transport = nodemailer.createTransport(smtpOptions(config));
  try {
    await transport.verify();
    return 'READY';
  } catch (error: unknown) {
    // Deliberately discard raw SMTP responses, which may contain private data.
    return typeof error === 'object' && error !== null && 'code' in error &&
      error.code === 'EAUTH' ? 'AUTH_FAILED' : 'CONNECTION_FAILED';
  } finally {
    transport.close();
  }
}
