import { createHmac } from "node:crypto";
/** Keep the existing bearer-token format stable across SMTP transports. */
export function accessToken(id: string, secret: string) {
  return `${id}.${createHmac("sha256", secret).update(`dearly.email.access.v1:${id}`).digest("base64url")}`;
}
