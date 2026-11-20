import type { RelayEmailConfig } from "../../configs/env";
import type { EmailResult, EmailSender } from "./email.provider";
import type { SmtpCheck } from "./smtp.transport";
import { relayResult, relaySignature } from "./relay.protocol";
import { boundedJson } from "../../utils/boundedJson";
export class EmailRelay {
  constructor(
    private readonly config: RelayEmailConfig,
    private readonly request: typeof fetch = fetch,
  ) {}
  private post(path: string, body: string) {
    const time = String(Math.floor(Date.now() / 1000));
    return this.request(this.config.url + path, {
      method: "POST",
      body,
      redirect: "error",
      signal: AbortSignal.timeout(60000),
      headers: {
        "Content-Type": "application/json",
        "X-Dearly-Timestamp": time,
        "X-Dearly-Signature": relaySignature(
          this.config.secret,
          time,
          path,
          body,
        ),
      },
    });
  }
  readonly send: EmailSender = (to, link, id) => this.submit(to, link, id, "/send");
  readonly sendVerification: EmailSender = (to, code, id) => this.submit(to, code, id, "/verify-email");
  private submit: (to: string, value: string, id: string, path: string) => ReturnType<EmailSender> = async (_to, _link, id, path) => {
    try {
      const r = await this.post(path, JSON.stringify({ id }));
      if (r.status === 401 || r.status === 403)
        return {
          state: "RETRYABLE",
          code: "EMAIL_RELAY_AUTH",
          providerMessageId: null,
        };
      const result = relayResult.safeParse(await boundedJson(r));
      if (result.success) return result.data;
    } catch {
      /* A timeout may happen after SMTP acceptance: never replay blindly. */
    }
    return {
      state: "UNKNOWN",
      code: "EMAIL_RELAY_UNCERTAIN",
      providerMessageId: null,
    } satisfies EmailResult;
  };
  async verify(): Promise<SmtpCheck> {
    try {
      const r = await this.post("/verify", "{}");
      const b = await boundedJson(r);
      return r.ok && b.status === "READY"
        ? "READY"
        : b.status === "AUTH_FAILED"
          ? "AUTH_FAILED"
          : "CONNECTION_FAILED";
    } catch {
      return "CONNECTION_FAILED";
    }
  }
}
