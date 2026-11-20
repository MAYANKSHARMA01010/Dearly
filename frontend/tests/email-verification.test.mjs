import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEmailChallenge } from "../src/services/auth/emailVerification.js";
import { parseUser } from "../src/services/auth/contracts.js";
const id = "00000000-0000-4000-8000-000000000000",
  date = "2026-11-20T00:00:00Z";
test("email challenge validates its identifier, expiry and resend budget", () => {
  assert.equal(
    parseEmailChallenge({
      challengeId: id,
      expiresAt: date,
      resendAfterSeconds: 60,
    }).id,
    id,
  );
  for (const c of [
    null,
    {},
    { challengeId: id, expiresAt: "invalid", resendAfterSeconds: 60 },
    { challengeId: id, expiresAt: date, resendAfterSeconds: -1 },
  ])
    assert.throws(() => parseEmailChallenge(c));
});
test("verified email state is preserved and malformed proof is rejected", () => {
  const u = {
    id,
    phone: "+12025550181",
    name: "Casey",
    email: "casey@example.com",
    timezone: "UTC",
    phoneVerifiedAt: date,
    createdAt: date,
  };
  assert.equal(
    parseUser({ ...u, emailVerifiedAt: date }).emailVerifiedAt,
    date,
  );
  assert.equal(
    parseUser({ ...u, emailVerifiedAt: null }).emailVerifiedAt,
    null,
  );
  assert.throws(() => parseUser({ ...u, emailVerifiedAt: "invalid" }));
  assert.throws(() => parseUser({ ...u, email: null, emailVerifiedAt: date }));
});
