import { emailVerificationCode } from '../utils/emailVerificationCode';
import { z } from "zod";
import type {
  EmailResult,
  EmailSender,
} from "../providers/email/email.provider";
import type { SmtpCheck } from "../providers/email/smtp.transport";
import {
  relayAuthorized,
  relayResult,
} from "../providers/email/relay.protocol";
import { accessToken } from "../utils/externalAccessToken";
export type RelayClaim =
  | { kind: "claimed"; to: string }
  | { kind: "duplicate"; result: EmailResult | null }
  | { kind: "inactive" };
export interface EmailRelayRepository {
  ready(): Promise<boolean>;
  claimVerification?(id: string): Promise<RelayClaim>;
  completeVerification?(id: string, result: EmailResult): Promise<void>;
  claim(id: string): Promise<RelayClaim>;
  complete(id: string, result: EmailResult): Promise<void>;
}
const uncertain: EmailResult = {
  state: "UNKNOWN",
  code: "EMAIL_RELAY_UNCERTAIN",
  providerMessageId: null,
};
/** Sender identity, recipient and private link come only from a live durable intent. */
export function createEmailRelayHandler(c: {
  secret: string;
  publicUrl: string;
  accessSecret: string;
  repository: EmailRelayRepository;
  send: EmailSender;
  sendVerification?: EmailSender;
  verify: () => Promise<SmtpCheck>;
}) {
  const json = (data: unknown, status = 200) =>
    Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  return {
    async fetch(request: Request): Promise<Response> {
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === "/health")
        return json({ status: "ready" });
      if (request.method !== "POST" || !["/send", "/verify", "/verify-email"].includes(path))
        return json({ error: "NOT_FOUND" }, 404);
      try {
        if (
          request.headers.get("content-type")?.split(";")[0] !==
          "application/json"
        )
          return json({ error: "INVALID_BODY" }, 400);
        const reader = request.body?.getReader();
        if (!reader) return json({ error: "INVALID_BODY" }, 400);
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 2048) {
              await reader.cancel();
              return json({ error: "BODY_TOO_LARGE" }, 413);
            }
            chunks.push(chunk.value);
          }
        } finally {
          reader.releaseLock();
        }
        const raw = Buffer.concat(chunks).toString("utf8");
        if (
          !relayAuthorized(
            c.secret,
            request.headers.get("X-Dearly-Timestamp"),
            request.headers.get("X-Dearly-Signature"),
            path,
            raw,
          )
        )
          return json({ error: "UNAUTHORIZED" }, 401);
        if (path === "/verify") {
          if (raw !== "{}") return json({ error: "INVALID_BODY" }, 400);
          const database = await c.repository.ready(),
            smtp = await c.verify();
          const status = database ? smtp : "CONNECTION_FAILED";
          return json({ status, database }, status === "READY" ? 200 : 503);
        }
        const input = z
          .object({ id: z.string().uuid() })
          .strict()
          .safeParse(JSON.parse(raw));
        if (!input.success) return json({ error: "INVALID_BODY" }, 400);
        const id = input.data.id, verification = path === '/verify-email';
        if (verification && (!c.sendVerification || !c.repository.claimVerification || !c.repository.completeVerification)) return json({ error: 'NOT_CONFIGURED' }, 503);
        const claim = verification ? await c.repository.claimVerification!(id) : await c.repository.claim(id);
        if (claim.kind === "inactive")
          return json({
            state: "REJECTED",
            code: "EMAIL_RELAY_NOT_ACTIVE",
            providerMessageId: null,
          });
        if (claim.kind === "duplicate") return json(claim.result ?? uncertain);
        let result: EmailResult;
        try {
          const parsed = relayResult.safeParse(
            await (verification ? c.sendVerification! : c.send)(
              claim.to,
              verification ? emailVerificationCode(id, c.accessSecret) : `${c.publicUrl}/external/#${accessToken(id, c.accessSecret)}`,
              id,
            ),
          );
          result = parsed.success ? parsed.data : uncertain;
        } catch {
          result = uncertain;
        }
        try {
          if (verification) await c.repository.completeVerification!(id, result);
          else await c.repository.complete(id, result);
        } catch {
          return json(uncertain);
        }
        return json(result);
      } catch {
        return json(uncertain, 503);
      }
    },
  };
}
