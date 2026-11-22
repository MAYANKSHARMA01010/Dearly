# Dearly hosted deployment

Topology established 20 November 2026; Phase 19 routing verified 22 November.
See [current release evidence and open gates](follow-up-phases.md). This document
is a deployment runbook, not a fresh inspection of live settings or logs.

Neon holds the PostgreSQL database and private media. Render hosts the API,
workers, Key Value and WAHA. Gmail remains the email sender. No Supabase account,
paid plan, trial, public media bucket or app-store submission is used.

| Component | Configuration |
| --- | --- |
| Backend | https://dearly-z8zm.onrender.com; `srv-dbvbkc67bikc7385bv8g` |
| WAHA active | https://dearly-waha-singapore.onrender.com; `srv-dc0ndfe7bikc73bas48g`; Free, Singapore |
| WAHA rollback | https://dearly-waha.onrender.com; `srv-dbvbrcek1f9s73c3dl2g`; Oregon, suspended |
| Key Value | Existing `red-d7ek15t7vvec73cqu2u0`, internal connection only |
| Database | Existing Neon production branch, PostgreSQL 18 |
| Media | Neon private `dearly-private` bucket; local disk is a disposable cache |
| Email | Gmail SMTP through the authenticated `dearlymail` Neon Function |
| Local API | http://localhost:8080; explicit development override only; hosted is preferred by default |

## Render backend

Root Directory is empty, Dockerfile Path is `./backend/Dockerfile`, and Docker
Build Context Directory is `.`. The earlier `backend` root broke Docker COPY
paths. Docker Command is `node dist/jobs/startHosted.js`; Health Check Path is
`/health/live`. Keep Free compute and the existing private environment.

The hosted entrypoint runs strict preflight and a connection-only Gmail check,
then supervises separate API, delivery and push processes in the web instance.
PostgreSQL work leases, fencing and submission markers remain authoritative.
Redis is optional and is never used as the durable delivery queue. No independent
paid worker service is required. The recorded Auto-Deploy policy is After CI Checks Pass for main. Inspect CI
and the actual Render deploy result before calling a release healthy; Phase 24
uses a service-scoped exact-commit deploy hook after CI/build checks; an explicit
hook ref disables auto-deploys. See [the coordinated pipeline](release-pipeline.md). Do not push during docs-only work merely
to trigger a deployment.

## Private durable media and WhatsApp sessions

`STORAGE_PROVIDER=neon` uploads verified objects into the private Neon bucket.
Authenticated owner/recipient/external-link checks precede rehydration into the
local cache. An unsigned object request is denied. The synthetic durability probe
uploaded an object, removed its local copy, retrieved and verified its bytes, then
removed only that test object. The existing-media migration copied zero objects;
no user local files were deleted.

WAHA Core uses GOWS and the pinned official AMD64 image documented in the private
service configuration. Its public API requires a key, stored on WAHA as a SHA512
verifier. Dashboard, Swagger, QR logging and history sync are restricted. The
hosted session uses a separate Neon role and WAHA-owned databases through
`WHATSAPP_SESSIONS_POSTGRESQL_URL`. Namespace and worker identifiers stay stable
across deploys. Local and hosted senders were paired independently; never copy,
reset or log out either session to repair the other.

## Gmail relay

Render Free blocks SMTP ports. `EMAIL_MODE=relay` sends a timestamped HMAC-signed
HTTPS request containing only the durable delivery ID to the existing project's
Neon Function. The function obtains the recipient from an active database intent,
constructs the private link, and uses the existing Gmail account and app password.
It is not another email provider. Missing, revoked or inactive intents cannot send.
The additive twelfth migration claims each submission before SMTP I/O; duplicate
requests retain accepted/uncertain results rather than sending again. Known safe
pre-send failures can retry through the existing worker budget. A timeout is
UNKNOWN, never proof of rejection or delivery.

Build with `npm run email:bundle --prefix backend`. From `backend/`, inspect
`neon config plan` with explicit project/branch, config and private env-file paths;
apply with `neon deploy --no-env-pull` only after reviewing the plan. The policy
changes only this function. Never pass app passwords in arguments, commit the
private file, pull over backend/.env, or log deployment secrets. The connection-only
check reached READY; this deployment did not submit a real test email.

## Verification and free-service limits

See [release verification](release-verification.md) for dated evidence and remaining
physical-device checks, and [releases](releases/README.md) for the signed APK/source
ZIP/checksum workflow. A private encrypted backup was taken while the backend was
suspended before applying the additive relay migration. PostgreSQL 18 tools are
required for backups of the live PostgreSQL 18 database. Keep the backup key and
Android signing files independently protected.

[Render Free](https://render.com/docs/free) sleeps after inactivity, loses local
files on restart and shares its monthly running-hour allowance across free web
services. PostgreSQL/object storage preserve data and session state; they do not
make a sleeping worker run on time. Scheduled dispatch and WhatsApp reconnection
can be delayed until services wake. The user-requested liveness jobs below do not
guarantee unlimited uptime, and no paid upgrade is configured. Neon and Gmail quotas still apply. Stop at
quota exhaustion instead of enabling billing. Hosted backup scheduling/retention
and real Android push/background acceptance remain operational follow-up items.

### External liveness schedule — 22 November 2026

At the user's explicit request, two enabled cron-job.org jobs use GET every five
minutes (`*/5 * * * *`, UTC; interval is unchanged in IST):

| Job | ID | URL |
| --- | --- | --- |
| Dearly backend — liveness | 8916060 | `https://dearly-z8zm.onrender.com/health/live` |
| Dearly WAHA — liveness | 8916069 | `https://dearly-waha-singapore.onrender.com/ping` |

Both endpoints returned HTTP 200 during setup. Neither liveness handler queries
the database; normal background workers/session activity can still access Neon.
No credentials, custom headers or request body were added. Jobs use the default
30-second timeout and do not expire. A cold start can exceed that timeout.
Existing GitHub maintenance/monitoring schedules remain unchanged.

[Render Free](https://render.com/docs/free) provides 750 instance-hours shared by
the workspace each month. Two continuously running services consume two hours
per elapsed hour, so these jobs cannot guarantee full-month availability. Quota
exhaustion must not trigger billing or attempts to bypass the cap. This external
configuration record changes no app code and requires no APK/version bump.

## Phase 18 private configuration reconciliation — 21 November 2026

See [environment audit](environment-audit.md). Backend and WAHA environment-update
deployments succeeded on their existing code/image. The relay-mode API no longer
stores the unused Gmail password; explicit OTP quota preserves its previous
default. WAHA interfaces remain disabled with explicit private admin credentials
to avoid auto-generation at startup. Gmail replacement authentication passed
locally and through the hosted relay, without sending an email. The user confirmed
old Gmail password revocation, and the application Neon role password was rotated
and applied to local/Render/relay consumers. The corrected Render rollout is Live
and API/database readiness passed. SMSGate retains its existing password by explicit
user request; this exception is recorded in the audit. OTP latency remains open.


## Phase 19 regional cutover

The API stays in Oregon at its existing public origin. The active WAHA gateway
runs in Singapore beside Neon, using the same pinned image, direct session-store
connection, namespace, worker and paired data. No re-pair/reset was required.
Never run the old suspended gateway and replacement simultaneously against that
store. Rollback requires stopping the replacement before starting the old gateway,
then changing the API transport URL and verifying readiness without replaying OTPs.

`WAHA_SERVER_API_URL` is the Singapore transport. `WAHA_SERVER_SCOPE_ORIGIN`
retains the old hosted origin solely for this same sender's existing quota and
receipt scope. Development ignores this override. Never use it to merge unrelated
senders. See [measured rollout and release evidence](otp-performance.md).
