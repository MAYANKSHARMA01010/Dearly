# Release verification — 19 November 2026

All planned implementation through Phase 16 is present. Phases 1–14 retain their
recorded acceptance. Phases 15–16 have completed non-device engineering checks;
final native/push and hosted operational acceptance are deferred. This is not
public-release approval. The user explicitly asked to finish other work and test
the APK later. No new live provider messages, device recordings, store submission
or deployment occurred in Phase 16.

## Recorded checks

| Check | Result |
| --- | --- |
| Backend lint, strict source/test types, production compilation | Passed |
| Backend standard tests | 90 passed |
| Backend PostgreSQL integration runner | 90 passed, including parent entries; disposable PostgreSQL 16, fake providers |
| Frontend lint, strict JavaScript/JSDoc types, standard tests | Passed; 81 tests |
| Mobile client/API/PostgreSQL integration | All 3 passed against disposable local PostgreSQL |
| Expo Doctor | 20/20 after three recommended SDK 58 patch updates |
| iOS and Android production JavaScript bundles | Both exported successfully; no native installation implied |
| Encrypted backup/restore | Real PostgreSQL 17 dump and restore of synthetic data, all 11 applied migrations, private attachment, revoked restored session and quarantine marker; occupied target refused |
| Backup failure/security tests | Wrong key, ciphertext tampering, existing archive/target refusal, pgpass injection and failed-restore quarantine covered |
| Logger regression tests | Actual Winston output drops raw bodies, arbitrary events, errors, credentials and OTP-like codes |
| Release preflight | Unit checks passed; incomplete local configuration correctly rejected without sending or printing values |
| Backend runtime container | Built successfully; non-root production startup refused incomplete config with exit 1 in an isolated network, no exposed ports |
| GitHub Actions workflow / Compose definitions | actionlint and Compose configuration validation passed locally; hosted CI has not run because nothing was pushed |
| Local operations check | Database, private-storage read/write, ffprobe and delivery heartbeat ready; push dispatch disabled |
| Android native APK | Phase 15 ARM64 signed APK built; physical installation/push acceptance deferred |

No applied migration was modified in Phase 16. The release work adds configuration
checks, runtime log filtering, encrypted operations and CI/container definitions.
The targeted patches are Expo 58.0.26, file-system 58.0.14 and Router 58.0.32;
NativeWind, Paper, Babel, Metro and navigation architecture are preserved. Existing
native APK predates those patches: rebuild the release candidate before final
phone acceptance. Exports do not update the existing APK.

## Security, reliability and practical limits

Automated coverage exercises account/recipient ownership, private media access,
range requests, OTP attempts/expiry, revoked sessions, review/version conflicts,
scheduling/timezones, duplicate workers and leases, crash/unknown submissions,
callback verification/replay, channel consent/budgets, mailboxes, notification
pagination/preferences, token rotation and logout. Existing mobile tests exercise
stale requests, unavailable service and session recovery. Tests use synthetic
content and fake provider transports; they cannot establish real push arrival.

A single API process is the supported initial topology because IP rate limits are
process-local. PostgreSQL leases support durable worker recovery, but database,
provider, phone and storage availability determine delivery latency. Unknown
external outcomes are not automatically replayed. There is no automatic provider
fallback. Media validation is not antivirus scanning. No large-load benchmark,
independent penetration test, legal compliance sign-off or target-device
accessibility certification is claimed. Screen-reader, font scaling, keyboard,
media memory and background behavior remain part of deferred native acceptance.

Use [operations and recovery](release-operations.md) for production environments,
monitoring, retention, migration and backup commands. The runbook distinguishes
implemented deletion/expiry from proposed hosted backup retention.

## Deferred acceptance checklist

Resume this checklist when the user is ready; it does not require further code to
be claimed as already tested:

- Supply the permanent HTTPS backend URL, provision a persistent private volume,
  review proxy settings and configure permanent signed callbacks. Recheck provider
  readiness, run release/operations checks and execute the deployment runbook on
  the chosen host. Temporary local callback tunnels are not production hosting.
- Configure hosted backup scheduling/retention and restore a synthetic hosted
  sample into isolated targets. Store the backup encryption and Android signing
  keys independently. Confirm worker restarts and alerting on the actual host.
- Rebuild the signed APK with the hosted URL and current source using the local
  preview profile. Install/update on the iQOO; test login, media, draft conflict,
  schedule/reschedule/cancel, restart/offline recovery, inbox and owned access.
- On real Android, exercise denied/granted notification permission, token
  registration/rotation, one explicitly authorized generic push, foreground and
  background/terminated opening, login before protected navigation, opt-out and
  logout. Never include private content on the lock screen. Verify no delivery to
  a token after session/account change. Existing Expo/Firebase Android setup is
  prepared; these behaviors have not yet been physically accepted.
- On iOS, use the chosen iPhone target for native smoke/accessibility and media
  checks. Real iOS push additionally needs appropriate Apple signing/APNs setup;
  it is not configured or claimed, and no paid enrollment is recommended here.
- With designated consenting recipients and fresh explicit authorization, run a
  hosted end-to-end demo for each channel and verify receipt/opened distinctions,
  private-link expiry/revocation and non-recipient denial. Earlier Phase 12–14
  live evidence remains recorded; this phase sent no additional live messages.
- Agree public data-erasure/support and hosted backup-expiry policy before public
  distribution. Review the source and focused history, then authorize any future
  push/deployment/store release separately.

## Repeatable demonstration

Use two consenting test accounts. Log in by phone OTP, create a text/media draft,
add a recipient, review the timezone and channels, then schedule a near-future
instant. Verify it remains hidden from the recipient before delivery; restart the
worker and check one durable outcome. Open the received message, then explicitly
mark it opened and observe the sender tracking. Repeat cancellation/rescheduling
before dispatch, revoke a private external link and verify denial, change alert
preferences without cancelling schedules, and sign out before opening a push.
Record actual timestamps/outcomes without saving OTPs, bearer links or private
content in logs. External sends require separate permission; do not automate a
live demo as part of ordinary CI.

## Focused implementation commits

- `cf02962` — runtime-safe logging, production preflight and operations diagnostics.
- `6627759` — encrypted backups, isolated restore quarantine and recovery drill.
- `7606cbd` — disposable CI, production template and supervised container definitions.
- `e55fcf0` — SDK 58 patch alignment and matching lockfile.
- Release documents and phase status are recorded in the following documentation commit.
