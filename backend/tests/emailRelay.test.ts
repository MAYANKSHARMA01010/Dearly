import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { parseEnvironment, EnvironmentError } from "../src/configs/env";
import { EmailRelay } from "../src/providers/email/relay.provider";
import {
  relaySignature,
  relayAuthorized,
} from "../src/providers/email/relay.protocol";
import {
  createEmailRelayHandler,
  type EmailRelayRepository,
} from "../src/services/emailRelay.service";
import type { EmailResult } from "../src/providers/email/email.provider";
import { accessToken } from "../src/utils/externalAccessToken";

const secret = "b".repeat(64),
  accessSecret = "c".repeat(64),
  id = randomUUID();
const accepted: EmailResult = {
  state: "ACCEPTED",
  code: null,
  providerMessageId: "synthetic",
};
function signed(
  path: string,
  body = "{}",
  time = String(Math.floor(Date.now() / 1000)),
) {
  return new Request("https://dearlymail.example" + path, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "X-Dearly-Timestamp": time,
      "X-Dearly-Signature": relaySignature(secret, time, path, body),
    },
  });
}
function fixture() {
  let claims = 0,
    sends = 0,
    verifies = 0;
  const ledger = new Map<string, EmailResult | null>();
  let outcome: EmailResult = accepted,
    failPersist = false;
  const repository: EmailRelayRepository = {
    ready: async () => true,
    claim: async (key) => {
      claims++;
      if (key !== id) return { kind: "inactive" };
      if (ledger.has(key))
        return { kind: "duplicate", result: ledger.get(key)! };
      ledger.set(key, null);
      return { kind: "claimed", to: "canonical@example.com", senderName: "Alex Morgan" };
    },
    complete: async (key, result) => {
      if (failPersist) throw Error("synthetic persistence failure");
      if (result.state === "RETRYABLE") ledger.delete(key);
      else ledger.set(key, result);
    },
  };
  const handler = createEmailRelayHandler({
    secret,
    accessSecret,
    publicUrl: "https://dearly.example",
    repository,
    send: async (to, link, key, senderName) => {
      assert.equal(senderName, "Alex Morgan");
      sends++;
      assert.equal(to, "canonical@example.com");
      assert.equal(
        link,
        `https://dearly.example/external/#${accessToken(id, accessSecret)}`,
      );
      assert.equal(key, id);
      return outcome;
    },
    verify: async () => {
      verifies++;
      return "READY";
    },
  });
  return {
    handler,
    ledger,
    counts: () => ({ claims, sends, verifies }),
    result: (r: EmailResult) => {
      outcome = r;
    },
    fail: () => {
      failPersist = true;
    },
  };
}

test("relay authentication binds time, path and exact body; stale and malformed signatures fail closed", () => {
  const now = Date.now(),
    time = String(Math.floor(now / 1000)),
    body = JSON.stringify({ id }),
    signature = relaySignature(secret, time, "/send", body);
  assert.equal(
    relayAuthorized(secret, time, signature, "/send", body, now),
    true,
  );
  for (const [timestamp, sig, path, payload] of [
    [time, signature, "/verify", body],
    [time, signature, "/send", body + " "],
    [String(Number(time) - 301), signature, "/send", body],
    [time, "bad", "/send", body],
  ])
    assert.equal(
      relayAuthorized(secret, timestamp, sig, path, payload, now),
      false,
    );
});
test("unauthenticated, oversized and recipient-injection requests never query the ledger or send", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.handler.fetch(
        new Request("https://example.com/send", {
          method: "POST",
          body: "{}",
          headers: { "Content-Type": "application/json" },
        }),
      )
    ).status,
    401,
  );
  assert.equal(
    (await f.handler.fetch(signed("/send", "x".repeat(2049)))).status,
    413,
  );
  assert.equal(
    (
      await f.handler.fetch(
        signed("/send", JSON.stringify({ id, to: "attacker@example.com" })),
      )
    ).status,
    400,
  );
  assert.deepEqual(f.counts(), { claims: 0, sends: 0, verifies: 0 });
});
test("relay uses canonical recipient/link and durable outcome on duplicate submissions", async () => {
  const f = fixture();
  const results = await Promise.all([
    f.handler.fetch(signed("/send", JSON.stringify({ id }))),
    f.handler.fetch(signed("/send", JSON.stringify({ id }))),
  ]);
  assert.equal(f.counts().sends, 1);
  assert.ok(
    (await Promise.all(results.map((r) => r.json()))).some(
      (r) => r.state === "ACCEPTED",
    ),
  );
  assert.deepEqual(
    await (
      await f.handler.fetch(signed("/send", JSON.stringify({ id })))
    ).json(),
    accepted,
  );
  assert.equal(f.counts().sends, 1);
});
test("an uncertain or unpersisted submission never resends; known pre-send rejection can retry", async () => {
  for (const persistFailure of [false, true]) {
    const f = fixture();
    if (persistFailure) f.fail();
    else
      f.result({
        state: "UNKNOWN",
        code: "SMTP_UNCERTAIN",
        providerMessageId: null,
      });
    await f.handler.fetch(signed("/send", JSON.stringify({ id })));
    assert.equal(
      (
        await (
          await f.handler.fetch(signed("/send", JSON.stringify({ id })))
        ).json()
      ).state,
      "UNKNOWN",
    );
    assert.equal(f.counts().sends, 1);
  }
  const f = fixture();
  f.result({ state: "RETRYABLE", code: "SMTP_AUTH", providerMessageId: null });
  await f.handler.fetch(signed("/send", JSON.stringify({ id })));
  f.result(accepted);
  assert.deepEqual(
    await (
      await f.handler.fetch(signed("/send", JSON.stringify({ id })))
    ).json(),
    accepted,
  );
  assert.equal(f.counts().sends, 2);
});
test("inactive intent is rejected and connection verification never sends email", async () => {
  const f = fixture();
  assert.equal(
    (
      await (
        await f.handler.fetch(
          signed("/send", JSON.stringify({ id: randomUUID() })),
        )
      ).json()
    ).state,
    "REJECTED",
  );
  assert.equal(
    (await (await f.handler.fetch(signed("/verify"))).json()).status,
    "READY",
  );
  assert.deepEqual(f.counts(), { claims: 1, sends: 0, verifies: 1 });
});
test("HTTP adapter sends only a signed delivery ID and treats response loss as uncertainty", async () => {
  const f = fixture(),
    config = {
      mode: "relay" as const,
      url: "https://dearlymail.example",
      secret,
      user: "sender@gmail.com",
      from: "sender@gmail.com",
    };
  const relay = new EmailRelay(config, async (input, init) => {
    assert.equal(init?.redirect, "error");
    assert.deepEqual(JSON.parse(String(init?.body)), { id });
    return f.handler.fetch(new Request(String(input), init));
  });
  assert.deepEqual(
    await relay.send("ignored@example.com", "https://ignored.example", id),
    accepted,
  );
  const lost = new EmailRelay(config, async () => {
    throw Error("synthetic network loss");
  });
  assert.equal(
    (await lost.send("ignored@example.com", "https://ignored.example", id))
      .state,
    "UNKNOWN",
  );
});
test("relay configuration requires a credential-free Neon HTTPS function origin and independent key", () => {
  const source = {
    DATABASE_URL: "postgresql://test:test@localhost/test",
    EMAIL_MODE: "relay",
    SMTP_USER: "sender@gmail.com",
    SMTP_FROM: "sender@gmail.com",
    EMAIL_RELAY_SECRET: secret,
    EMAIL_RELAY_URL:
      "https://dearlymail.branch.compute.c-1.ap-southeast-1.aws.neon.tech",
  };
  assert.equal(parseEnvironment(source).email?.mode, "relay");
  for (const url of [
    "http://evil.example",
    "https://user:pass@x.compute.c-1.aws.neon.tech",
    "https://example.com",
    "https://x.compute.c-1.aws.neon.tech/?key=secret",
  ])
    assert.throws(
      () => parseEnvironment({ ...source, EMAIL_RELAY_URL: url }),
      EnvironmentError,
    );
});

test('verification relay derives its code from the durable ID and never accepts client destinations or repeats a claim', async () => {
  const { emailVerificationCode } = await import('../src/utils/emailVerificationCode');
  let claims=0, sends=0, completed=0;
  const handler=createEmailRelayHandler({secret,accessSecret,publicUrl:'https://dearly.example',verify:async()=>'READY',send:async()=>{throw Error('Wrong transport');},sendVerification:async(to,code,key)=>{
    sends++;assert.equal(to,'canonical@example.com');assert.equal(key,id);assert.equal(code,emailVerificationCode(id,accessSecret));return accepted;
  },repository:{ready:async()=>true,claim:async()=>({kind:'inactive'}),complete:async()=>{},claimVerification:async()=>++claims===1?{kind:'claimed',to:'canonical@example.com'}:{kind:'inactive'},completeVerification:async()=>{completed++;}}});
  const raw=JSON.stringify({id});
  const first=await handler.fetch(signed('/verify-email',raw));assert.equal(first.status,200);assert.equal((await first.json()).state,'ACCEPTED');
  await handler.fetch(signed('/verify-email',raw));assert.equal(sends,1);assert.equal(completed,1);
  assert.equal((await handler.fetch(signed('/verify-email',JSON.stringify({id,to:'other@example.com',code:'123456'})))).status,400);
});
