import assert from "node:assert/strict";
import { test } from "node:test";
import { waitForOtpReady } from "../src/services/auth/otpReadiness.js";
import { createAuthService } from "../src/services/auth/authService.js";
const id = "00000000-0000-4000-8000-000000000000";
test("warmup polls only reads until ready", async () => {
  const calls = [],
    states = ["WARMING", "WARMING", "READY"];
  await waitForOtpReady(
    {
      request: async (path, options) => {
        calls.push({ path, options });
        return { status: states.shift() };
      },
    },
    undefined,
    { pause: async () => {} },
  );
  assert.equal(calls.length, 3);
  assert.ok(
    calls.every((c) => c.path === "/auth/otp/status" && !c.options.method),
  );
});
test("unavailable, malformed and canceled probes never dispatch", async () => {
  for (const result of [{ status: "UNAVAILABLE" }, { status: "INVALID" }, null])
    await assert.rejects(
      waitForOtpReady({ request: async () => result }, undefined),
    );
  const c = new AbortController();
  c.abort();
  let calls = 0;
  await assert.rejects(
    waitForOtpReady(
      {
        request: async () => {
          calls++;
          return { status: "READY" };
        },
      },
      c.signal,
    ),
  );
  assert.equal(calls, 0);
});
test("production OTP is posted exactly once after read-only readiness, and uncertainty is never replayed", async () => {
  const calls = [];
  const client = {
    request: async (path, options) => {
      calls.push({ path, method: options?.method });
      if (path.endsWith("/status")) return { status: "READY" };
      throw Error("synthetic uncertain write");
    },
  };
  const auth = createAuthService(client, false);
  await assert.rejects(auth.requestOtp("2025550181", "US"));
  assert.deepEqual(calls, [
    { path: "/auth/otp/status", method: undefined },
    { path: "/auth/otp/request", method: "POST" },
  ]);
});
test("accepted OTP transitions through connecting and requesting phases", async () => {
  const phases = [];
  const client = {
    request: async (path) =>
      path.endsWith("/status")
        ? { status: "READY" }
        : {
            challengeId: id,
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            dispatch: "accepted",
            channel: "whatsapp",
            resendAfterSeconds: 60,
          },
  };
  const c = await createAuthService(client, false).requestOtp(
    "2025550181",
    "US",
    undefined,
    (p) => phases.push(p),
  );
  assert.equal(c.channel, "whatsapp");
  assert.deepEqual(phases, ["connecting", "requesting"]);
});

test('opening the login flow warms only the status endpoint and never sends a code', async () => {
  const calls = [];
  const service = createAuthService({ request: async (path, options) => { calls.push({ path, method: options?.method }); return { status: 'WARMING' }; } }, false);
  await service.prepareOtp();
  assert.deepEqual(calls, [{ path: '/auth/otp/status', method: undefined }]);
});
