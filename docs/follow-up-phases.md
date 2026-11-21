# Dearly follow-up phases 17–24

This continues [Phases 1–16](implementation-phases.md). Work starts only on the
phase requested by the user. Phase 17 changes documentation only; subsequent
entries are commitments to scope and checks, not implemented features.

## Current baseline — 21 November 2026

- Source/release baseline: commit `819c41bc547b7a32e91fa8579a9c5d89098bed4b`,
  version `1.1.3`, Android versionCode `7`, iOS build `7`.
- [1.1.3 RC1](https://github.com/MAYANKSHARMA01010/Dearly/releases/tag/v1.1.3-rc.1)
  is published with signed ARM64 APK, source ZIP, manifest and checksums. Fresh
  downloaded assets verified; GitHub release verification passed. It is not stable.
- Backend checks: 110 tests plus lint/types/build; frontend: 106 tests plus
  lint/types. Full CI passed for the release commit, including disposable database
  integration, backup drill and both platform exports. These are baseline results,
  not substitutes for checks on future changes.
- User confirmed that Render reports `819c41b` Live. Dashboard access had failed
  during that check; this is user-confirmed deployment evidence, not an independent
  dashboard observation or a new live audit on this date.
- One authorized hosted WhatsApp OTP request returned accepted in 15.157 seconds;
  user confirmed arrival after a noticeable wait. OTP speed remains unresolved.
  A read-only timestamp comparison placed challenge creation about 2.3 seconds
  into that request; this does not isolate provider time or prove the bottleneck.
- Native iPhone welcome rendering and browser synthetic entry/permission checks
  passed for the release. Physical Android permission behavior, push/background
  acceptance, hosted backup scheduling/retention and recovery acceptance remain
  open. Historical channel tests do not prove these later gates.
- Hosted architecture: Neon PostgreSQL/private objects; Render API with supervised
  delivery/push processes, Key Value and separate WAHA GOWS; Gmail via the protected
  Neon relay; SMSGate via the configured physical Android/SIM. See
  [deployment details](render-deployment.md).
- Mobile media currently uses a temporary file cache, cleared on initialization
  and viewer cleanup. SQLite and reusable persistent media are not yet installed.
- CI checks code/version and verifies already published release assets. Coordinated
  signed-build/deploy/publish automation, Swagger docs and maintenance schedules
  are not yet delivered by these phases.

## Single progress and acceptance checklist

Ownership below names the responsible application layer, not another person or
agent. The implementing agent owns execution, checks and focused commits; phone
arrival/device acceptance requires actual evidence from an authorized device test.
Do not infer authorization for a new live message from a historical test.

| Phase | Owner / dependencies | Implementation and verification | Deployment / release / device evidence |
| --- | --- | --- | --- |
| 17 Rules and audit | Documentation; baseline inspection | Complete: rules, roadmap, current-state reconciliation; links/paths and whitespace checked | Not required: documentation only; commit IDs are in Git history |
| 18 Environment and sensitive data | Backend config / operations; 17 | Examples, private config reconciliation and 114 backend checks passed; credential acceptance open | Backend/WAHA config deployments and Gmail replacement verified; old Gmail revocation, SMSGate and shared-role review pending; see [audit](environment-audit.md) |
| 19 Render logs and OTP performance | Auth / WAHA / operations; 18 | Pending; 15.157-second baseline remains unresolved | Pending measured hosted rollout; separately authorized real OTP and arrival evidence |
| 20 SQLite foundation | Mobile storage / auth boundary; 19 | Pending | Pending rebuilt APK and native cache/migration checks |
| 21 Synchronization and fewer reads | Mobile services / backend reads; 20 | Pending | Pending request-count comparison and account/revocation checks |
| 22 Persistent media and viewer UI | Mobile media / UI; 21 | Pending | Pending rebuilt APK, native media/cleanup/accessibility checks |
| 23 API docs and scheduled operations | API contracts / operations; 19 and 22 | Pending | Pending route deployment, scheduler setup and observed job outcomes |
| 24 Coordinated CI/CD and acceptance | Release tooling / operations; 18–23 | Pending | Pending exact-commit APK, deployment and published assets; device checks remain separately recorded |

For each phase, record dated results here (or link its detailed evidence), focused
commit IDs, deployed SHA/version, release URL and native acceptance separately.
Use “not applicable” for docs-only steps; use “pending” or “failed” with a reason
for missing checks. Never equate implementation complete with production accepted.

## Phase 17 — Project rules and current-state audit

**Scope:** reconcile root/frontend instructions, historical roadmap references,
current topology, release guidance and open acceptance gaps. Preserve useful
historical evidence and unrelated working-tree changes.

**Delivered:** this checklist/roadmap; explicit paired UI consultation; privacy,
cache and scheduler boundaries; local APK preference; current release baseline;
clear distinction between existing CI and future orchestration. No runtime, env,
Render configuration, signing credentials or scheduled jobs changed.

**Gate:** local Markdown links/paths resolve, whitespace checks pass, instructions
agree on current architecture and release semantics. Documentation commits need no
new app version, APK, deployment or provider test.

**Commit groups:** project rules and follow-up roadmap; deployment/release guide
reconciliation and current verification addendum.

## Phase 18 — Environment and sensitive data

**Owner/dependency:** backend configuration and operations; Phase 17.

1. Inventory variable names and consumers without printing private values. Compare
   Zod validation, local env, examples, release configuration, Render backend/WAHA
   settings and relay dependencies. Define local/hosted precedence explicitly.
2. Group safe examples by API, database, Redis, auth, WhatsApp, Gmail, SMS, storage,
   backup and operations. Remove obsolete aliases only after tracing consumers;
   introduce compatibility handling where deployed settings require it.
3. Coordinate private replacement of exposed credentials, update consumers and
   verify availability. Preserve signing identity, pairing and existing encrypted
   data/access contracts. Do not bulk-regenerate secrets or invalidate access
   accidentally. Keep operational sender/test identities private; user phone/email
   records remain database data. Scan tracked source and build/release archives.

**Gate:** local/hosted configurations validate independently; no real secrets or
personal identities in examples/public Expo variables; private Render comparison
reports only names/status. Record configuration-only rollout separately from code.

**Commit groups:** validation/compatibility plus tests; safe examples and setup
instructions. No private env files in commits.

## Phase 19 — Render logs and OTP performance

**Owner/dependency:** auth/provider services and operations; Phase 18.

1. Inspect backend and WAHA deployment/runtime logs for a bounded time window.
   Correlate safe request IDs, errors, restarts, readiness and worker health.
2. Measure readiness, reservation, provider dispatch and final persistence without
   logging phone numbers, message content, codes or tokens. Compare warm/cold runs
   and resolve only evidenced bottlenecks; do not weaken locks, limits or durable
   submission handling to make a benchmark look faster.
3. Verify a matching hosted rollout, record latency distribution where sufficient
   samples exist, and distinguish server acceptance from actual arrival. Live OTP
   tests need specific authorization; automated checks use fake transports.

**Gate:** stage timings explain remaining latency, before/after measurements are
recorded, no automatic POST replay/fallback, and free-host startup limitations are
stated. If latency is not improved, keep this gate open rather than claiming fixed.

**Commit groups:** safe instrumentation/tests; evidenced optimization/tests;
measured deployment/release evidence.

## Phase 20 — SQLite foundation and data cache

**Owner/dependency:** mobile persistence and account isolation; Phase 19.

1. Add SDK-matched Expo SQLite with versioned migrations and a repository/service
   boundary. Namespace by account and API origin; use parameterized SQL. Retain
   tokens in SecureStore. Decide encryption/key lifecycle before storing content;
   prove encryption is present in the rebuilt native binary when enabled.
2. Add fetchedAt/expiresAt, record version and deletion metadata. Cache only
   previously authorized data: profile, preferences, mailbox summaries and eligible
   message details. Neon remains authoritative; no early scheduled content.
3. Handle first run, app restart, upgrades, corrupt cache, logout/account switch
   and storage failure. Cache failure must not block recovery through the server.

**Gate:** expiry is checked before reads, migration/isolation/purge tests pass,
private content policy is documented, and native persistence works in a rebuilt
APK. Never cache authoritative OTP/auth or schedule-confirmation decisions.

**Commit groups:** database/migrations/tests; cache repositories/integration.

## Phase 21 — Synchronization and fewer reads

**Owner/dependency:** mobile data services and backend read paths; Phase 20.

1. Connect screens to account-scoped cached data; deduplicate concurrent reads and
   invalidate affected records after successful mutations. Define stale/offline
   presentation and a bounded offline authorization window before enabling it.
2. Refresh on expiry, foreground/reconnection and explicit refresh with backoff,
   cancellation and deletion handling. Use conditional requests where supported;
   never automatically replay offline OTPs, sends or schedule confirmations.
3. Measure request/query counts. Introduce Redis TTL caching only for safe measured
   read hotspots with invalidation; preserve PostgreSQL queues and authoritative
   access checks. Verify missing Redis still has a safe path.

**Starting policy to validate:** profile/preferences 5 minutes, mailbox summaries
60 seconds, message details 5 minutes. Refresh delivery status only while useful,
with bounded foreground polling. Shorten retention when access validity requires
it; local clocks and remote revocation need explicit handling.

**Gate:** repeat navigation reduces requests, edits/deletions become visible,
accounts never share cache, stale data cannot authorize a write, and offline limits
are honest. UI changes follow Impeccable + Stitch and rendered checks.

**Commit groups:** refresh/invalidation plus tests; measured API optimization;
related screen states, one completed screen per coherent commit.

## Phase 22 — Persistent media cache and viewer completion

**Owner/dependency:** mobile media services and UI; Phase 21.

1. Keep media bytes in private local files; SQLite holds attachment/version,
   ownership, local URI, size, access validity, expiry and last access. Reuse valid
   downloads by identity/version; verify bytes before committing a completed file.
2. Separate pending selections/recordings from reusable downloads. Replace current
   delete-on-initialize/dismiss behavior deliberately; preserve account/logout
   cleanup and enforce access expiry before opening a retained file. Handle partial
   downloads, canceled requests, low disk space and orphan files.
3. Propose image/video/audio/file viewer and storage-control refinements through
   Impeccable + Stitch. Preserve native controls, player teardown, accessible seek,
   dark/light themes and the existing violet identity.

**Starting policy to validate:** up to 7 days and 250 MB total, bounded by access
validity; evict least recently used files. Do not predownload every attachment or
store files in a public gallery. Define device-backup exclusions and at-rest media
protection before retaining private downloads. Offline remote revocation cannot be
instant; do not promise otherwise.

**Gate:** repeated valid opens avoid download; changed/revoked/missing files,
expiry, logout, interrupted transfers and disk limits work. Native playback and
accessibility checked. Commit each finished screen before moving to the next.

**Commit groups:** cache lifecycle/tests; each viewer/storage screen with its
relevant checks; release evidence.

## Phase 23 — API documentation and scheduled operations

**Owner/dependency:** API contracts and operations; Phases 19 and 22.

1. Inventory actual routes; document them in OpenAPI with Swagger UI at `/api/docs`
   and schema at `/api/openapi.json`. Cover bearer auth, request/response schemas,
   errors, pagination and webhooks with synthetic examples. Review documentation
   exposure separately from authenticated API access; dangerous live actions must
   not become accidental “Try it out” provider sends.
2. Inventory existing jobs before adding schedules. Select free-compatible hosting
   for real maintenance: bounded cleanup/retention and queue/worker checks. Schedule
   backups only after validating consistency, durable encrypted storage and restore.
3. Monitor backend and WAHA separately, using protected status checks and alerts;
   never schedule WAHA logout/relink/reset or resending uncertain work. Jobs require
   least-privilege authentication, overlap prevention, timeouts, safe logs and a
   recorded outcome. Define retry/missed-run behavior and UTC schedules.

**Gate:** docs match routes and expose no secrets; jobs run observed bounded work
with failure evidence. No paid Render cron service or artificial keepalive. Free
scheduler availability/limits must be verified at implementation; GitHub scheduled
workflows are not an exact-time delivery guarantee. Existing durable workers remain
responsible for message delivery. Sleeping hosts can delay them.

**Commit groups:** OpenAPI/Swagger/contracts checks; job authentication/execution
and tests; scheduler runbook and observed setup evidence.

## Phase 24 — Coordinated CI/CD and final acceptance

**Owner/dependency:** release tooling and operations; Phases 18–23.

1. Extend existing CI/version and release-asset checks, rather than replacing them.
   Automate proposed semantic versions/changelogs with an explicit breaking-change
   marker. Synchronize VERSION, package/lockfiles and Expo version, with new native
   build numbers for each distributed binary. Documentation-only commits do not
   create app releases.
2. Coordinate trusted local signed APK builds, exact-commit deployment, health and
   migration checks, then publication of APK/source ZIP/manifest/checksums. Protect
   runner access/signing credentials from forks and untrusted pull requests. If the
   local runner is offline, leave the release pending, not falsely completed.
3. Verify downloadable assets independently, record device/push/provider acceptance
   separately and exercise a compatible application rollback plan. Never overwrite
   published tags/assets, reuse native build numbers or restore stale data merely
   to roll back application code. Partial rollout failure needs an explicit state.

**Gate:** clean end-to-end run links source SHA, APK identity/signature, deployment
and immutable release. Failed checks block publication; RC stays prerelease until
required acceptance is observed. No automatic live provider test or paid upgrade.

**Version policy:** PATCH for compatible fixes; MINOR for compatible features such
as persistent caching; MAJOR for breaking changes. Choose versions from actual
published history at release time, not phase numbers. Current baseline is 1.1.3;
this plan does not reserve future versions.

**Commit groups:** release preparation/validation; protected build/deploy workflow;
publication/recovery checks and final evidence.

## Phase 17 verification record

21 November 2026: inspected instructions, existing workflows, package/release
configuration and deployment documentation. Confirmed the published 1.1.3 RC1
metadata through GitHub. Reconciled current guidance while preserving dated
historical checks. Checked changed Markdown links/paths and `git diff --check`.
No dependencies installed, runtime tests rerun, new live provider message sent,
Render log inspection claimed, environment changed or deployment performed.
The pre-existing `.gitignore` edit is outside scope and remains untouched.

## Phase 18 progress — 21 November 2026

[Environment audit](environment-audit.md) records changed consumers, configuration
rollouts, private-value scan scope and open credential actions. No runtime source
or APK changed. Phase 19 has not started; OTP latency remains unresolved.
