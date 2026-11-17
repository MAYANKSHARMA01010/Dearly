# Dearly backend

Phase 2 provides a runnable Node.js/Express/TypeScript API with Prisma/PostgreSQL,
health checks, request safeguards, safe JSON logging, and focused automated tests.
Phase 4 adds phone OTP, rotating sessions and own-profile APIs, explicitly for local
development simulation only. See [authentication setup and contracts](../docs/authentication.md).
Phase 6 adds private versioned draft/recipient APIs; see [the draft contract](../docs/draft-api.md).
Scheduling and real channel delivery follow later.

## Setup

Use Node.js 22.16 or a later Node 22 release and npm. From the repository root:

```bash
cd backend
npm ci
```

On a fresh checkout only, copy `.env.example` to `.env` and fill `DATABASE_URL`.
If `.env` already exists, preserve it. The current local file has the user's Neon
connection; neither its contents nor credentials are committed.

```bash
npm run prisma:generate
npm run dev
```

Default address: `http://localhost:8080`, bound to `127.0.0.1`. For a compiled run:

```bash
npm run build
npm start
```

Environment loading resolves `backend/.env` relative to the application files,
so it also works when starting the built entry point from another directory.
Actual process environment settings take precedence over `.env`. Changing `.env`
requires a server restart. Development source changes restart through nodemon.

## Database setup

The current setup uses Neon while Express runs locally. Use the supplied pooled
connection privately and retain its SSL/channel-binding parameters. One Prisma
client/pool is created per process. It connects lazily on readiness/first query,
not at startup, and disconnects during shutdown. Default connect/pool/socket
query parameters of five seconds are added internally only when absent; the
private URL is not rewritten. Concurrent readiness probes share an in-flight check.

For an optional local PostgreSQL instance, create a dedicated development database
and role using your local PostgreSQL tools, grant that role access, then set a URL
such as the following in the private `.env` (replace the placeholders):

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/dearly_db?schema=public"
```

No application tables are needed for the health probe. Phase 4 adds a reviewed
initial phone-auth migration, applied with `npm run prisma:deploy`. It creates
users, OTP challenges, durable phone budgets, sessions and refresh-token history.
Phase 6 adds a separate additive migration for draft messages and recipients.
Never reset a database or use `db push` to bypass migration history.

## Health endpoints and response contract

```bash
curl http://localhost:8080/
curl http://localhost:8080/health
curl http://localhost:8080/health/db
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
```

- `GET /`: API name, running status, and links to the available health endpoints;
  does not query the database.
- `GET /health` (also `/health/live`): `200` if the HTTP process is responsive; does not access
  PostgreSQL and is exempt from the ordinary request limiter.
- `GET /health/db` (also `/health/ready`): read-only `SELECT 1`; `200` when PostgreSQL responds or `503`
  with `NOT_READY` when it is unavailable. Readiness is rate-limited.

Health responses use `Cache-Control: no-store` so cached results do not hide an
outage or recovery. Both naming styles remain supported.

Success responses contain `success: true`, `data`, and `requestId`. Errors contain
`success: false`, `error: { code, message }`, optional safe validation field/code
details, and `requestId`. `X-Request-Id` matches the response ID and is generated
by the server. Unknown routes return `404 NOT_FOUND`; malformed JSON returns
`400 INVALID_BODY`; oversized JSON returns `413 PAYLOAD_TOO_LARGE`; unsupported
encoding returns `415`; rejected origins return `403`; rate limiting returns `429`
with `Retry-After`. Unexpected errors are safe `500` responses without raw stacks.

## Configuration

| Variable | Default / requirement |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL URL; backend only |
| `PORT` | `8080` |
| `HOST` | `127.0.0.1`; set `0.0.0.0` explicitly when testing over LAN |
| `NODE_ENV` | `development`, `test`, or `production`; default `development` |
| `FRONTEND_URL`, `CLIENT_URL` | Optional exact HTTP(S) browser origins; configured examples use `8081`/`3000` |
| `LOG_LEVEL` | `info`; also `error`, `warn`, `debug` |
| `BODY_LIMIT_BYTES` | `1048576` (1 MiB JSON); maximum configurable value 10 MiB |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 minutes) |
| `RATE_LIMIT_MAX` | `100` requests/IP/window |
| `TRUST_PROXY_HOPS` | `0`; review the actual proxy topology before changing |
| `SHUTDOWN_TIMEOUT_MS` | `10000` |
| `AUTH_MODE` | `disabled`; `development` enables loopback-only simulated OTP |
| `OTP_PEPPER` | Required for development auth: private random 64 lowercase hex characters |

Missing/invalid required settings fail startup with safe field names. Redis remains
optional. Opaque database-backed tokens replace the unused JWT placeholders. Never expose `DATABASE_URL` or credentials via frontend variables.

CORS uses exact allowed origins; requests without `Origin` are accepted for native
clients/tools. CORS is a browser policy, not authentication. Keep proxy trust at
zero for direct local traffic; blindly trusting forwarded headers undermines IP
limits. The baseline and auth IP limiters use per-process memory and reset on
restart. Phase 4 phone budgets persist in PostgreSQL; shared IP limits remain a
public-deployment requirement.

Helmet sets baseline security headers. Only bounded JSON parsing is enabled; media
uploads are designed in Phase 8. Draft endpoints use owner filters, version
preconditions and recipient validation; they do not send or schedule messages. Logs include generated request ID, method, status,
and elapsed time, not URL/query strings, bodies, headers, raw errors, OTPs, or tokens.
Logging goes to stdout as JSON; `logs/` is reserved, not an active file sink.

`SIGINT`/`SIGTERM` stop new connections, drain active requests, then disconnect
Prisma. Keep-alive sockets are closed as responses finish. A deadline forces stuck
connections closed and exits unsuccessfully rather than hanging indefinitely.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
# All four in order:
npm run check
```

Standard tests use Node's test runner, tsx, and Supertest. They inject database
availability instead of connecting to Neon. The separate, opt-in
`npm run test:integration` requires `AUTH_TEST_DATABASE_URL`, creates a temporary
PostgreSQL schema, and removes it after the auth security tests. No messages are
sent. See [the test setup](../docs/authentication.md#verification).
Coverage includes recovery from readiness failure, config validation, safe errors,
body limits, CORS, request IDs/logging, rate limits, request validation, startup
conflicts, and shutdown draining/deadlines. Typechecking includes source and tests;
production compilation emits only `src/` into ignored `dist/`.

Zod was deliberately updated from the scaffold's v3 range to patched v4.6.7 for
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). No previous
backend validation implementation existed to migrate. Narrow npm overrides pin
patched minimatch ranges for nodemon and TypeScript ESLint because their upstream
ranges resolve an affected major; see
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Validate
these overrides when upgrading either tool. Express remains v4 and Prisma v5.

See [environment setup](../docs/environment-setup.md),
[project structure](../docs/project-structure.md), and
[implementation phases](../docs/implementation-phases.md) for remaining work.

## Private attachments

Phase 8 adds owner-only reservation/upload/finalization/content/removal endpoints
under `/messages/drafts/:draftId/attachments`. Apply the additive migration with
`npm run prisma:deploy`. File bytes stay outside PostgreSQL in a private ignored
directory. Install ffprobe, preserve the private environment, and use a persistent
volume when hosting. Run `npm run attachments:cleanup` explicitly in development;
configure an external hourly cleanup job when hosted. See
[attachments and storage](../docs/attachments.md) for exact limits, retention, API
contracts and verification. No public media URLs or paid storage service is enabled.

## Scheduling

Phase 9 adds owner-only `/messages/schedules` APIs for timezone-aware review,
confirmation, text edits, rescheduling, cancellation and return to drafts. Apply
the additive migration with `npm run prisma:deploy`. In-app choices and configured EMAIL destinations are accepted. Phase 10/12 deliver through a separate durable
worker; WhatsApp and SMS remain unavailable. See [schedule contracts](../docs/scheduling.md).

## In-app delivery worker

After applying migrations and building, run `npm run delivery:worker` in a separate
terminal from backend/. PostgreSQL stores the work queue; Redis is not required.
New confirmations enable delivery; Phase 9 plans stay paused until explicitly
reviewed again. Run `npm run delivery:status` for safe queue diagnostics and
`npm run delivery:retry -- <work-UUID>` for bounded operator recovery after fixing
a failure. `/health/worker` reports recent worker activity separately from API
liveness and database readiness. Inbox APIs enforce delivered-recipient access,
including private attachment ranges. See [delivery rules and operations](../docs/delivery-workers.md).

## Mailboxes and activity

Phase 11 adds `/messages/dashboard`, filtered `/messages/mailboxes`, owned detail/
history APIs and explicit `POST /messages/inbox/:id/open`. Apply the additive
tracking migration and restart the built delivery worker. Existing records get a
truthful tracking baseline; earlier history is not invented. GETs never mark a
message opened. See [mailbox contracts](../docs/mailboxes.md).

## Gmail SMTP and recipient links

Phase 12 adds configured EMAIL scheduling and a minimal private browser viewer.
Configure SMTP and external-access settings using `.env.example`; app passwords
and the separate random signing key stay in private `.env`. Run `npm run email:verify`
for a connection/authentication-only check: it never submits mail. Rebuild/restart
the separate delivery worker after migrations. Gmail acceptance is submission,
not confirmed inbox delivery, and uncertain attempts are never automatically resent.
Local recipient links work only on this Mac; set a reachable HTTPS origin when hosted.
See [email contracts](../docs/email-delivery.md) for endpoints, limits and manual testing.
