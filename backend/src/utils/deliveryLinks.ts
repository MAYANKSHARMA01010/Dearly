import { isIP } from 'node:net';

export const appDownloadUrl = 'https://github.com/MAYANKSHARMA01010/Dearly/releases';
export const appDownloadInstructions = 'Download the Dearly Android APK from GitHub Releases (prerelease builds are marked). Register or sign in with your mobile number; login codes arrive on WhatsApp first. For messages sent to your number, use that same number and open Received. For email messages, sign in with your mobile number, add this email address in Profile and verify it, then open Received. Email is not a login method. You can also read this message using the private link.';

/** External recipients cannot reach the sender's loopback or private network. */
export function publicDeliveryLink(value: string): boolean {
  try {
    const u = new URL(value), host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && !u.username && !u.password &&
      !isIP(host.replace(/^\[|\]$/g, '')) && host.includes('.') &&
      !['localhost', 'local', 'internal', 'test', 'invalid'].some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch { return false; }
}
