import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export const relayResult = z
  .object({
    state: z.enum(["ACCEPTED", "REJECTED", "RETRYABLE", "UNKNOWN"]),
    code: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,39}$/)
      .nullable(),
    providerMessageId: z.string().max(255).nullable(),
  })
  .strict();
export const relaySignature = (
  secret: string,
  time: string,
  path: string,
  body: string,
) =>
  createHmac("sha256", secret)
    .update(`dearly.mail.relay.v1\n${time}\n${path}\n${body}`)
    .digest("hex");
export function relayAuthorized(
  secret: string,
  time: string | null,
  signature: string | null,
  path: string,
  body: string,
  now = Date.now(),
) {
  if (
    !time ||
    !signature ||
    !/^\d{10}$/.test(time) ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    Math.abs(now / 1000 - Number(time)) > 300
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(relaySignature(secret, time, path, body), "hex"),
  );
}
