import { ApiError } from "../../api/client.js";
/** @param {unknown} value */
export function parseEmailChallenge(value) {
  const c =
    /** @type {{challengeId?:unknown,expiresAt?:unknown,resendAfterSeconds?:unknown}} */ (
      value ?? {}
    );
  if (
    typeof c.challengeId !== "string" ||
    !/^[0-9a-f-]{36}$/.test(c.challengeId) ||
    typeof c.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(c.expiresAt)) ||
    !Number.isInteger(c.resendAfterSeconds) ||
    Number(c.resendAfterSeconds) < 0 ||
    Number(c.resendAfterSeconds) > 3600
  )
    throw new ApiError(
      "The email verification response could not be confirmed.",
      "invalid_response",
    );
  return {
    id: c.challengeId,
    expiresAt: c.expiresAt,
    resendAt: Date.now() + Number(c.resendAfterSeconds) * 1000,
  };
}
