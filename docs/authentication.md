# Phone authentication backend — Phase 4

Implemented on 16 November 2026. **Development-only authentication.** No SMS or
WhatsApp provider is configured; no real messages have been sent. The local
adapter returns a random code in the response with `dispatch: "simulated"`.
It does not prove possession of a phone. Do not publish this mode or treat its
accounts as evidence of real phone verification.

## Enable local testing

The existing private `backend/.env` now enables the development adapter. New
checkouts start with `AUTH_MODE=disabled` and return `503 AUTH_DISABLED` on `/auth`.
To enable local simulation, configure all of:

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=8080
AUTH_MODE=development
# Set OTP_PEPPER privately to 64 lowercase hex characters, generated below.
```

Generate the key locally with
`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Put it in `OTP_PEPPER` in the ignored `.env`; never use a frontend/public variable.
Keep it stable across restarts. Replacing it invalidates outstanding OTP hashes.
The supplied Neon URL stays private and retains SSL/channel-binding parameters.

From `backend/`, run `npm run prisma:deploy`, `npm run prisma:generate`, then
`npm run dev`. Restart after changing `.env`. Prisma remains v5; no database
reset, schema push, or destructive migration is needed. The initial migration
creates five auth tables because the inspected database had no application tables.
If another checkout already contains an older generic user table, review/back up
and migrate it separately; do not apply a reset or fabricate migration history.

Production rejects `AUTH_MODE=development`, including when `HOST` is loopback.
Development mode also rejects non-loopback binds and missing/malformed peppers.
Keep auth disabled on hosted servers until a real adapter is implemented and
verified. A local proxy/tunnel must not expose this simulation endpoint publicly.

## HTTP contracts

All paths below are relative to `http://localhost:8080`. Existing `/`, `/health`,
and `/health/db` remain. Responses retain the `success/data/requestId` or
`success/error/requestId` envelope. All auth responses are `Cache-Control: no-store`.
Send JSON; use `Authorization: Bearer <accessToken>` where indicated. No cookies
or browser token storage are introduced. Dates are UTC ISO strings in JSON.

| Method/path | Input | Result |
| --- | --- | --- |
| `POST /auth/otp/request` | `phone`, `country` (ISO two-letter uppercase) | `challengeId`, `expiresAt`, `resendAfterSeconds: 60`, `dispatch`; simulation additionally includes `developmentCode` |
| `POST /auth/otp/resend` | `challengeId` | Replacement challenge with the same response shape; old code immediately becomes unusable |
| `POST /auth/otp/verify` | `challengeId`, six-digit `code` | `user`, `accessToken`, `refreshToken`, `accessExpiresAt`, `sessionExpiresAt`, `tokenType: "Bearer"` |
| `POST /auth/refresh` | `refreshToken` | New access/refresh pair and expiry fields; client must replace both together |
| `POST /auth/logout` | Access bearer; no body required | `{ "loggedOut": true }`; revokes this session and its refresh family |
| `GET /auth/me` | Access bearer | Own profile |
| `PATCH /auth/me` | Access bearer; any of `name`, `email`, `timezone` | Updated own profile; no user ID, phone, role, or arbitrary fields accepted |

Example request body: `{ "phone": "(202) 555-0123", "country": "US" }`.
This is a reserved documentation number; simulation does not contact it. National
and international input normalize to E.164 using full libphonenumber metadata.
Country must match the parsed number; extensions, unsupported countries, invalid
numbers, and phone numbers embedded in arbitrary text are rejected. No implicit
India country code is added. This checks numbering validity, not possession.

Profile fields: immutable `id` and `phone`, `phoneVerifiedAt`, optional `name`
(max 80), optional delivery `email` (max 254), IANA `timezone` (default UTC),
`createdAt`. Name/email may be cleared with null. Email is an unverified delivery
destination, never an alternative login. Phone-change, account deletion, logout-all,
and session-management UI are outside the backend phase. Phase 5 implements
[mobile login/profile/session recovery](mobile-auth.md) with secure native storage.

## Security behavior

- OTP: cryptographically random six digits, five-minute expiry; HMAC-SHA256 with
  a private 256-bit pepper and challenge ID. Plaintext codes are never persisted
  or logged. Challenge IDs are random UUIDs. Correct codes are single-use.
- Phone budget: at least 60 seconds between reservations and at most five requests
  per hour. Resends and failed dispatches count. Five incorrect codes exhaust one
  challenge; ten failed comparisons per phone in 15 minutes prevent bypass through
  fresh challenges. Budgets persist in PostgreSQL across process restarts.
- Request and verify responses do not distinguish existing accounts. Unknown,
  consumed, expired, failed-dispatch and exhausted challenges share `401 INVALID_OTP`.
  Account creation happens only after successful challenge verification.
- Requests/resends supersede all previous active challenges for the phone. Network
  dispatch occurs outside a DB transaction. Only an active, unexpired challenge
  with confirmed adapter acceptance or explicit simulation may verify. Rejected,
  uncertain, pending, or superseded submissions cannot authenticate.
- PostgreSQL transaction advisory locks serialize work for each phone or session.
  These are transaction-scoped (compatible with pooled connections); fixed keys
  are derived server-side. Wrong attempts and replay revocations commit even though
  the HTTP operation fails. Concurrent OTP verification creates exactly one session.
- Access tokens are opaque random 256-bit secrets with a session UUID prefix,
  hashed with SHA-256 in the database. They expire after 15 minutes and require a
  live, unrevoked database session on every authenticated request; no JWT dependency
  or JWT signing secret is used.
- Refresh tokens use independent random secrets. Absolute session expiry is 30
  days and never extends. Each refresh replaces both tokens and invalidates the
  previous access token. Used refresh hashes remain until session cleanup so replay
  revokes that whole session. Two simultaneous refresh calls produce one winner,
  then replay revokes it: clients must serialize refresh operations. A random or
  forged token cannot revoke a session. Access and refresh tokens are not interchangeable.
- Logout requires a valid access token; if it expired, refresh first. Other devices'
  sessions remain active. An already-authorized in-flight operation may finish
  concurrently with revocation; subsequent requests must fail.
- Profile identity comes exclusively from the bearer session, never client-supplied
  IDs. Validation rejects unknown fields and does not expose raw input in errors.
- A supplemental 30 requests/IP/15-minute auth limiter applies to all auth routes,
  alongside the baseline limiter. IP limits use process memory and reset on restart;
  phone limits are durable. Scale-out/public deployment needs shared IP budgets,
  retention/cleanup jobs, real delivery and deployment review before release.

Errors: malformed input `400 VALIDATION_ERROR`; invalid session `401 UNAUTHORIZED`;
phone/IP budget `429 AUTH_RATE_LIMITED`; disabled auth `503 AUTH_DISABLED`; rejected
or uncertain submission `503 OTP_UNAVAILABLE`. IP 429 responses include `Retry-After`;
phone throttles use the safe generic error without exposing remaining account quota.
Unexpected database errors retain the safe 500 contract. `/health/db` checks
connectivity only, not migration completeness.

## Adapter boundary and next provider decision

`src/providers/otp/otp.provider.ts` defines simulated/accepted/rejected/unknown
outcomes. Accepted submissions retain provider message IDs. Exceptions/timeouts
become uncertain and do not trigger automatic retries or channel fallback. Adapter
acceptance is not proof of delivery; never label simulation as sent. No real
SMSGate/WAHA implementation or dependency is included. The user must select a free
option from [messaging options](messaging-options.md) before integration, with an
explicit consenting test recipient before any live test. Public login remains blocked.

The implementation follows the OTP/session hygiene in the
[OWASP OTP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
and [session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
Phone parsing uses [libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js)
(MIT); transaction locks follow
[PostgreSQL advisory locking](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS).

## Verification

`npm run check` runs lint, source/test typechecking, 26 ordinary tests and the
production build. It does not connect to Neon. `npm audit` reports zero vulnerabilities.

`npm run test:integration` is an explicit opt-in requiring private
`AUTH_TEST_DATABASE_URL`. Use a dedicated test database where possible. The suite
creates a uniquely named `dearly_auth_test_<uuid>` schema, applies the migration
with **schema-qualified raw SQL**, exercises actual PostgreSQL/HTTP transactions,
and drops only that schema in `finally`. Prisma's URL schema setting qualifies
model queries but does not reliably change raw SQL search paths through the pool.
Never print or put the test URL on a shared command line. A crash/forced termination
may require cleanup of the exact test schema; never drop `public` for cleanup.

The 13 integration scenarios (14 test-runner entries including their parent) cover
hashed storage/log redaction; wrong, expired, reused and concurrent OTPs; persisted
request/failure budgets; replacement codes; access/refresh expiry; replay/concurrent
refresh; logout isolation; profile ownership; rejected/uncertain/pending/stale dispatch;
validation and auth-IP throttling. No real provider calls occur.
