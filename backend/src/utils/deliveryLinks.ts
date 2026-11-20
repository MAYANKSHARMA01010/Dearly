import { isIP } from 'node:net';

export const appDownloadUrl = 'https://github.com/MAYANKSHARMA01010/Dearly/releases';
export const appDownloadInstructions = 'Download the Dearly Android APK from GitHub Releases (check whether the build is marked prerelease). Register or sign in with your phone number and verification code. Email sign-in is not supported. Use the private message link to read this delivery; external deliveries are not automatically added to the app inbox.';

/** External recipients cannot reach the sender's loopback or private network. */
export function publicDeliveryLink(value: string): boolean {
  try {
    const u = new URL(value), host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && !u.username && !u.password &&
      !isIP(host.replace(/^\[|\]$/g, '')) && host.includes('.') &&
      !['localhost', 'local', 'internal', 'test', 'invalid'].some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch { return false; }
}
