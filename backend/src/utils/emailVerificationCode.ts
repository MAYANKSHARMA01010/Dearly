import { createHmac } from "node:crypto";
/** Domain-separated derivation lets the trusted relay send without storing plaintext codes. */
export function emailVerificationCode(id: string, secret: string) {
  return String(
    createHmac("sha256", secret)
      .update(`dearly.email-verification.v1:${id}`)
      .digest()
      .readUInt32BE(0) % 1000000,
  ).padStart(6, "0");
}
