# Deployment, operations and recovery

This runbook describes the configured topology and safe procedures. It is not a
fresh inspection of live settings. Dated deployment IDs, logs, credential-rollout
notes and test outcomes belong in private local context. Release orchestration is
in [releases](releases.md); key ownership is in [setup](setup.md).

## Hosted services

| Component | Role |
| --- | --- |
| Render backend, `https://dearly-z8zm.onrender.com` | Express API plus supervised delivery/push processes |
| Render WAHA, `https://dearly-waha-singapore.onrender.com` | Dedicated protected GOWS sender |
| Neon PostgreSQL | Application records, leases, submission markers and quotas |
| Neon private object storage | Durable media; Render disk is only disposable cache |
| Neon `dearlymail` Function | Protected Gmail SMTP relay over HTTPS from Render |
| Render Key Value | Optional Redis connection; not a durable queue or proven runtime dependency |
| SMSGate Cloud + physical Android/SIM | SMS transport; explicit intended device/SIM required |
| Expo/FCM | Generic Android push delivery |

Render backend: root directory empty, Dockerfile `./backend/Dockerfile`, build
context `.`, command `node dist/jobs/startHosted.js`, health path `/health/live`.
Apply the additive OTP cleanup migration before running the updated API/worker.
The delivery worker also sweeps tracked expired WhatsApp OTPs every poll (normally
15 seconds), claiming at most three per cycle. Failed deletions retry the same
message after two minutes, at most 20 attempts and within 24 hours of expiry.
Only matching sender scopes are eligible; old unscoped OTPs are not backfilled.
No new cron, credentials or env keys are needed. Keep the delivery worker running
locally too for local-sender cleanup. Sanitized `auth.otp.deletion_*` events indicate
retry/database failures; provider acceptance is not recipient-device deletion proof.

The hosted supervisor starts separate API/delivery/push processes after strict
configuration and connection-only Gmail preflight. One web instance is used;
process-local IP limits are not distributed abuse control.

Select only service-specific settings from the canonical private backend source.
Deploy the intended source, check CI and confirm actual service identity. The
release coordinator uses an exact-commit hook, which disables Render auto-deploy;
do not assume a main push deployed. Source, deployed service and published APK
versions are separate facts. Environment-only changes need deliberate private
platform synchronization and validation, not a whole-file upload.

### Provider persistence and boundaries

Neon objects stay private. APIs authorize before rehydrating into disposable
Render cache; do not set PERSISTENT_STORAGE_CONFIRMED=true for ephemeral disk.
STORAGE_PROVIDER=local is valid only with an actual private persistent volume.
Never migrate/delete objects without checking database references and recovery.

WAHA uses a pinned official image, API-key protection, disabled dashboard/Swagger
and QR logging, and stable namespace/worker/session identity. Hosted pairing has
a separate session-store role/database; local pairing uses its own volume. Never
copy/reset/log out one to repair the other. The former Oregon gateway is a rollback
target only: never run it and Singapore simultaneously against one session store.
Stop replacement before rollback; verify readiness without replaying messages.
WAHA_SERVER_SCOPE_ORIGIN preserves quota/receipt scope only for relocation of the
**same** sender; it does not change transport or merge unrelated accounts.

Render's SMTP restriction is handled by EMAIL_MODE=relay. The HTTPS Gmail relay
accepts timestamped HMAC requests containing durable delivery/challenge IDs,
resolves recipients server-side, and claims before SMTP I/O. Only the relay and
explicit local SMTP runtime need the Gmail app password. It is still Gmail delivery.
Build relay source with `npm run email:bundle --prefix backend`; review an explicit
Neon project/branch deployment plan before applying it. Do not overwrite `.env`
with a CLI pull or pass app passwords in arguments.

SMSGate requires a powered online phone, allowed SMS/phone permissions, selected
SIM and matching Signing Key. Cloud device readiness is recent activity, not exact
connectivity. Submission requests have a five-minute device queue TTL and one
carrier segment. Carrier allowance and OS restrictions are separate from software
availability. Status/init commands do not authorize live sends.

### Free-service limits

Free Render services may sleep and lose local files. Sleeping workers cannot
guarantee delivery at the scheduled instant; persistence permits catch-up, not
continuous compute. WAHA reconnect and OTP preparation may take time. Render hours
are shared with other services; provider, storage and database quotas also apply.
Do not enable billing, paid workers/cron, automatic upgrades or quota bypass.

The two user-requested cron-job.org liveness GETs run hourly (`0 * * * *`, UTC):
backend `/health/live` and WAHA `/ping`. They carry no credentials/body and do not
query the database in their handlers. Background processes may still access Neon.
These checks allow sleep between requests and do not guarantee uptime or a monthly
usage ceiling. A cold start can exceed the job timeout. Inspect actual provider
usage rather than treating a schedule as a resource guarantee.

## Health, diagnostics and logs

| Check | Meaning |
| --- | --- |
| `/health/live` | API process alive, no database access |
| `/health/ready` | Database connectivity; not every provider/worker healthy |
| `/health/worker` | Running delivery heartbeat within 90 seconds |
| `/auth/otp/status` | Read-only login sender readiness |
| Protected `/internal/operations/status` | Database, worker, overdue queue, push counts and WAHA categories |
| `npm run ops:check --prefix backend` | DB, storage access, ffprobe and delivery heartbeat |
| `npm run delivery:status --prefix backend` | Bounded work counts and safe failure IDs/codes |

Inspect backend and active WAHA logs separately around the affected request time.
Use request IDs, commit/version, stage timings, safe reason codes, queue counts and
restart history. Never copy raw environment, credentials, QR/session data, OTPs,
phone/email, message content, bearer links, request bodies or gateway payloads into
reports. Host/proxy logs need the same restrictions as application logs.

Fix a failed-work cause before explicitly using `npm run delivery:retry --prefix
backend -- <work-UUID>`. Only eligible failed work can receive a bounded extension;
successful, obsolete and uncertain external submissions are never blindly replayed.
An external timeout is not proof the message was not sent.

## Scheduled maintenance and monitoring

The checked-in [operations workflow](../.github/workflows/operations.yml) runs:

| UTC schedule | Work |
| --- | --- |
| `17 * * * *` | One bounded maintenance batch hourly |
| `43 */6 * * *` | Read-only backend/WAHA monitoring every six hours |

Activation requires GitHub variable OPERATIONS_ENABLED=true and
OPERATIONS_API_URL, plus separate private OPERATIONS_TOKEN and MONITORING_TOKEN
in Actions and the intended backend. Jobs are main-only, non-overlapping and use
no signing/provider credentials. To disable, unset activation and revoke the
corresponding endpoint credential. Missing configuration fails closed. GitHub
schedules can be delayed or disabled; they are not delivery scheduling.

Maintenance POST `/internal/operations/maintenance` requires Authorization: Bearer
with the operations token,
empty JSON and UUID X-Operations-Run. Monitoring GET uses only its separate token.
Credentials are never query parameters. Reusing a run UUID returns its existing
journal without rerunning, including failed/interrupted runs. A timed-out POST is
uncertain: inspect the journal instead of retrying it blindly.

A transaction-scoped cross-instance advisory lock prevents overlapping batches.
A batch stops starting work after 30 seconds, bounds object-store requests, and
processes at most 10 stale attachment rows, 10 old orphan objects, 100 expired
receipts/provider and 100 old finished journal records. Referenced READY objects
and active uploads are preserved. Completed deletions are not rolled back as one
transaction. Later batches mark abandoned RUNNING journals interrupted and process
remaining safe work with a new UUID. No provider resend/session reset occurs.

Manual tools remain available: attachments:cleanup, whatsapp:cleanup and sms:cleanup
from backend package scripts. Use the intended DB/object store and drain bounded
batches deliberately. Actions failures are operational alerts; enable account
failure notifications. No external SMS/email alert is implied.

## Encrypted backup and restore

Backups contain a PostgreSQL custom archive and private final objects in one
AES-256-GCM authenticated file plus a checksum/count sidecar. BACKUP_ENCRYPTION_KEY
is independent of app/access/webhook secrets and needs its own secure backup.
Use pg_dump/pg_restore compatible with the source server; the configured Neon
server is PostgreSQL 18. Set PG_DUMP_BIN/PG_RESTORE_BIN privately. The minimal
runtime container is not a maintenance host with backup dependencies installed.

**Stop all API, delivery/push and cleanup writers first.** The flag below records
an operator assertion; it cannot stop other instances. Keep writers stopped until
the DB/object snapshot finishes. Run from `backend/` with the correct private env:

```sh
npm run backup -- create /PRIVATE_BACKUP_DIRECTORY/dearly-YYYYMMDD.dearly --writers-stopped
```

Verify archive/sidecar before relying on it. Never upload plaintext dumps or put
private backups in Actions artifacts/releases. Keep durable copies away from the
application disk, and protect the key separately. Nightly backups, seven daily
generations and pre-migration capture are an operating policy to configure and
verify, **not an installed automatic backup schedule**. Check storage limits.

Restore only to a newly created **empty isolated database and storage directory**.
Keep services stopped; privately configure RESTORE_DATABASE_URL and
RESTORE_STORAGE_ROOT to those targets, never the live source. From `backend/`:

```sh
npm run backup -- restore /PRIVATE_BACKUP_DIRECTORY/dearly-YYYYMMDD.dearly --confirm-empty-target
```

Authentication and all payload hashes must pass before SQL runs. The tool refuses
occupied/source targets and does not clean a live DB or rewrite migration history.
SQL uses one transaction; failed partial object restores require discarding only
the new isolated targets, not changing the source.

`.restore-review-required` blocks production startup. Restore revokes sessions,
phone/email challenges, device registrations and bearer links; pending push work
is stopped and schedules paused. Uncertain submissions stay uncertain. Verify
counts, migrations, objects, access, provider evidence and sender budgets before
removing quarantine. Wait the full rolling quota window if send evidence is absent.
Require new logins/device registration and explicit future schedule review. Never
automatically replay restored messages. Preserve the old deployment/data offline
until recovery is verified. Roll back compatible code against the current schema;
do not restore a stale DB just to reverse code.

`npm run test:backup-drill --prefix backend` uses random disposable loopback
DBs and synthetic objects to test recovery. It does not establish hosted offsite
retention or authorize a live restore/reset.

## Retention and support limitations

Unfinished uploads expire after 24 hours; referenced READY media has no automatic
age deletion. Receipt cleanup retains minimal callback rows for 14 days. Links
expire after seven days; sessions/challenges enforce expiry/revocation on use,
which does not imply automatic record erasure. Deleting live data does not delete
independently retained encrypted backups.

Messages/history/preferences persist until supported mutations. Self-service
account deletion, full session-management UI and a complete hosted backup expiry
policy are not claimed. Keep support/privacy promises consistent with actual
behavior. A phone's offline cache cannot be cleared remotely at an exact instant;
online session checks and bounded local access are separate safeguards.
