# Release operations and recovery

Phase 16 prepares reproducible operations; no hosted deployment has been performed.
The user deferred APK/physical-device acceptance on 19 November 2026. See
[verification and remaining gates](release-verification.md) before public release.

## Configuration and startup

Use Node 22, PostgreSQL, ffprobe/ffmpeg, and persistent private attachment storage.
Redis remains optional and is not a runtime queue dependency. The durable queues
and fencing live in PostgreSQL. Never use a Render web URL or an incomplete Redis
resource name as a connection string. Keep local API port 8080 and the separate
hosted URL; production never falls back to localhost.

Copy `backend/.env.production.example` into ignored `backend/.env.production` and
fill values privately. It is deliberately incomplete. Set the permanent HTTPS
backend origin, the same CONTENT_PUBLIC_URL, `/webhooks/waha` and
`/webhooks/smsgate` callback URLs, TLS database connection, real auth and provider
keys, and an absolute persistent storage directory. Set
PERSISTENT_STORAGE_CONFIRMED=true only after verifying the mount survives restarts.
Copy the actual SMS webhook key to the phone. Keep existing WAHA session volumes
and local Android signing files. Configure the phone for SIM 1.

Generate a separate random 32-byte hex BACKUP_ENCRYPTION_KEY privately; keep an
independent secure copy. It is not the OTP pepper, bearer-link secret or webhook
key. Do not put credentials, private runtime URLs, signing material or server keys
in Git, Expo public variables or build archives. The production example contains
no real passwords. Existing local `.env` is not changed into a production file.

The Compose file reads the private production file, uses non-root processes, a
persistent attachment volume and separate API/delivery/push processes. Build and
inspect without deploying:

```sh
docker compose -f scripts/compose.release.yaml config --no-env-resolution --no-interpolate
docker compose -f scripts/compose.release.yaml build
```

Before a future rollout, stop writers and take an encrypted backup. Run migrations
once with the operations profile, then start services only after configuration
review. These commands are deployment instructions, not actions performed here:

```sh
docker compose -f scripts/compose.release.yaml --profile operations run --rm migrate
docker compose -f scripts/compose.release.yaml up -d api delivery-worker push-worker
```

API publishes only to host loopback 8080; arrange HTTPS termination separately.
Expose the API through the reviewed proxy, not the WAHA dashboard or database.
Set TRUST_PROXY_HOPS for the actual proxy chain; do not blindly trust arbitrary
forwarded headers. Use one API instance until shared IP limiting is implemented.
The current process-local IP limiter is not a distributed abuse-control service.
This configuration does not provision hosting or enable billing.

`npm run start:production`, `worker:production` and `push:production` run a strict
preflight before startup. It rejects missing production channels/auth, local or
temporary public origins, missing TLS for a remote database, absent persistent
storage assertions, missing backup keys and restore quarantine. Run the compiled
preflight in the configured runtime with `node dist/jobs/checkRelease.js`.
A successful preflight proves configuration shape, not provider availability or
phone delivery. Local development correctly fails this release-only gate.

## Monitoring and maintenance

Check `/` for service discovery, `/health` for liveness, `/health/db` for database
readiness and `/health/ready` for API readiness. Readiness does not prove worker or
provider health. `node dist/jobs/checkOperations.js` checks DB, read/write access to
private storage, ffprobe and recent delivery-worker heartbeat; exit nonzero on
failure. Push enabled/disabled is reported separately and is not a push heartbeat.
Use process supervision for both workers and alert on restarts, offline heartbeat,
storage capacity, DB failures and queues that stop advancing. Health paths expose
no database URLs or credentials. No external monitoring account was created.

From a trusted maintenance checkout with dependencies and the correct private
environment, run `npm run attachments:cleanup` hourly through the host scheduler;
repeat to drain batches. Run `whatsapp:cleanup` and `sms:cleanup` for receipt
retention. No unattended cron installation is claimed. Never run maintenance
against a different storage mount from the API/worker.

The logger now filters event names and metadata at runtime. It accepts only
operational IDs/status/duration/code/port/method fields. Do not add request bodies,
headers, raw errors, SQL URLs, provider payloads, OTPs or bearer links. Application
logs do not replace host/proxy logging policy: disable body/header/query logging
there too and restrict access to operational records.

## Encrypted backup and tested restore

A backup includes the PostgreSQL custom archive and final private attachment
objects in one AES-256-GCM authenticated encrypted file. Its sidecar records only
format version, object count, encrypted byte size and SHA-256. Temporary plaintext
lives in a private temporary directory and is removed on completion/failure.
Database credentials use a temporary mode-600 pgpass file, never command arguments.
The CLI uses generic failures rather than echoing credentials or database stderr.

Install pg_dump/pg_restore compatible with the source database major version
(pg_dump must support that server). On this Mac the PostgreSQL 17 binaries are at
`/opt/homebrew/opt/postgresql@17/bin/`; set PG_DUMP_BIN and PG_RESTORE_BIN privately
when those executables are outside PATH. A maintenance host needs the full backend
dependencies for the TypeScript CLI. The minimal runtime image does not include
backup tools. Do not upload unencrypted dumps.

Stop API, delivery/push workers and cleanup before capture. The explicit
`--writers-stopped` flag records the operator assertion; it cannot stop independent
writers. Keep them stopped until capture finishes so DB and attachment snapshots
agree. From backend/ with private configuration already loaded:

```sh
npm run backup -- create /PRIVATE_BACKUP_DIRECTORY/dearly-YYYYMMDD.dearly --writers-stopped
```

Never overwrite an existing archive. Copy archive, sidecar and separately protected
encryption key to durable storage outside the application disk. Proposed operating
policy: one nightly backup, seven daily generations, plus a pre-migration backup;
retain pre-migration copies until the rollback window closes. This is a policy to
configure on the chosen host, not an installed scheduler or an automatic deletion
job. Confirm storage quotas before choosing retention; no paid service is needed
for the tooling, but storage/hosting/SIM usage has its own limits.

Restore only a trusted Dearly archive to a newly created empty database and empty
storage directory. Keep all services stopped. Privately set RESTORE_DATABASE_URL
and RESTORE_STORAGE_ROOT to those separate targets, then run from backend/:

```sh
npm run backup -- restore /PRIVATE_BACKUP_DIRECTORY/dearly-YYYYMMDD.dearly --confirm-empty-target
```

The archive must authenticate and all file checksums must pass before SQL runs.
The tool refuses the configured source DB/storage and any occupied destination;
there is no `--clean`, overwrite or automatic migration-history rewrite. Restore
uses a single SQL transaction. A failure may leave partial attachment state;
discard only the newly created isolated targets and start again. Never point a
live API at an unfinished restore.

A `.restore-review-required` marker is created before SQL is restored and blocks
production startup, including after failure. Successful restore additionally
revokes all sessions, consumes OTP challenges, disables devices, stops pending push
jobs, pauses scheduled delivery work and revokes external bearer links. Uncertain
external submissions stay uncertain. Verify row/migration/object counts, access
controls, configured targets and provider evidence before proceeding. Reconcile
sender budgets against sends since the backup; wait out the full rolling 24-hour
quota window if evidence is unavailable. Never bulk replay or refund uncertain
sends. Review DISPATCHING/failed work through existing recovery contracts rather
than force-changing rows. Old revoked links must remain unusable.

Remove the marker only after that explicit operator review, before enabling the
new target. New logins/device registration and explicitly reviewed future schedules
are required; restoration does not automatically resend messages. Preserve the
old deployment/data offline until the new one is verified. For routine application
rollback use a compatible previous image against the current schema. Never reset
Prisma history or restore a stale DB merely to roll back code.

The automated `npm run test:backup-drill` requires DRILL_DATABASE_URL on loopback,
creates/drops only its random disposable databases, applies all migrations, and
checks real dump/restore plus a private object and session quarantine. It never
uses live Neon data. Actual production backup scheduling/offsite retention and a
hosted recovery drill remain deployment acceptance.

## Provider and data policy

Gmail SMTP, free WAHA Core, SMSGate Cloud with the user's Android/SIM, and Expo/FCM
remain the selected integrations. Follow their existing contract documents and
configured sender budgets; free software does not mean unlimited carrier messages
or free server capacity. No Meta integration, paid upgrade or automatic fallback
is introduced. Pairing/session issues pause WhatsApp availability. SMTP acceptance,
SMS carrier receipts, WhatsApp receipts, push tickets/receipts and content opening
remain distinct evidence. Do not replay a timed-out external submission blindly.

| Data | Implemented behavior |
| --- | --- |
| Unfinished uploads | Reservations expire after 24 hours; explicit cleanup handles stale transfers and orphan files in bounded batches. |
| Ready attachments | Retained while referenced; explicit removal/deleted drafts feed cleanup. No age-based deletion of valid media. |
| External links | Expire seven days after dispatch; owner revocation blocks future access. Restore revokes them all. |
| Sessions, OTPs, push tokens | Expiry/revocation is enforced on use; restore invalidates restored access. Expiry does not imply automatic row erasure. |
| Messages, inbox, activity, preferences | Persist until supported explicit mutations; no global history-purge or self-service account-deletion feature is claimed. |
| Backups | Separate operator retention; deleting live data does not remove historical encrypted backups. |

Keep published privacy/deletion promises consistent with these rules. A support
workflow for account erasure and agreed hosted backup expiry is required before
public distribution; do not claim a regulatory review or an in-app deletion flow.

## Public notification links and app downloads

All real notifications, including local-worker sends, use CONTENT_PUBLIC_URL or
BACKEND_SERVER_URL before the legacy EMAIL_PUBLIC_URL alias. Configure the same
hosted HTTPS origin, database, access-signing key and attachment storage for the
API, worker and Gmail relay. Local API access remains on port 8080; this is not a
recipient-facing URL. Provider adapters reject local-only content links before
submission. Previously delivered notifications are not rewritten or replayed.

Email and WhatsApp include the public GitHub Releases page; the SMS companion
viewer includes the same download instructions without exceeding the one-segment
SMS budget. The releases page supports both stable builds and explicitly labeled
release candidates; `/releases/latest` cannot identify an RC-only release.
Registration currently verifies a phone number. External email/phone link
notifications do not automatically appear in the app inbox, and email login or
verified email association must not be promised until implemented.

Use x.x.x semantic versions for releases: PATCH fixes, MINOR compatible features,
MAJOR breaking changes. Prepare the version through `scripts/release.mjs prepare
X.Y.Z`, validate all manifests/native build numbers, build from the matching
commit, and publish a matching `vX.Y.Z` tag or `vX.Y.Z-rc.N` prerelease with verified
APK, source ZIP, release manifest and checksums. Never replace published assets
or reuse build numbers. Record deployment commit/version separately from mobile
artifacts; do not claim a newly committed UI exists in an older downloadable APK.
