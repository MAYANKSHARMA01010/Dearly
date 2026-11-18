# Dearly implementation phases

## Goal and working agreement

Build a mobile app for messages that arrive at a chosen future moment. Login uses
phone number and OTP only. Messages support text, photos, video, voice, and files;
recipients may be the sender, another user, a phone number, or an email address.
Users manage created, scheduled, sent, received, draft, and failed messages, with
in-app, WhatsApp, SMS, and email delivery.

This expanded roadmap replaces the earlier seven-phase outline with **16 phases**.
Current completion status is tracked in the table and dated records below.
Each phase delivers a bounded capability, with what to build, how to approach it,
completion checks, and useful commit boundaries. Detailed rules live in
[../AGENTS.md](../AGENTS.md); folder responsibilities are in
[project-structure.md](project-structure.md).

See [environment-setup.md](environment-setup.md) for the configured Neon database,
local backend port `8080`, and separate local/future hosted API URL settings. Only
environment values are prepared; backend startup and API selection remain below.

Work only on the phase/task the user requests. Finish its checks, update the
completion record, and make focused commits before reporting back. Start the next
phase when requested. Within a phase, complete related backend/mobile work in
small reviewable increments. Do not use this roadmap as permission to build all
features at once or automatically select vendors.

The [messaging review](messaging-options.md) records ShopSmart findings and free
provider suggestions, restricted to usable free plans and free-to-use open-source
tools. Paid-only options, upgrades, and temporary trials are excluded; never enable
billing automatically. The user has skipped Meta/WhatsApp Cloud API because setup
takes too long. Other eligible choices remain editable proposals. Development
adapters allow local progress, but real OTP delivery is required before public login is released,
and a simulated delivery does not complete a real channel integration.

## Progress and dependencies

| Phase | Deliverable | Depends on | Status |
| --- | --- | --- | --- |
| 1 | Project structure | — | Complete — scaffold only |
| 2 | Backend runtime, database connection, and checks | 1 | Complete |
| 3 | Mobile foundation, routing, theme, and API client | 1; 2 for connectivity | Complete — restored 16 November |
| 4 | Phone OTP and session backend | 2 | Complete — real WhatsApp OTP added and self-tested 19 November |
| 5 | Mobile login, session restoration, and profile | 3–4 | Complete — WhatsApp OTP response supported; new native OTP entry not repeated |
| 6 | Draft message and recipient APIs | 4 | Complete |
| 7 | Mobile composer, recipients, and draft management | 5–6 | Complete |
| 8 | Attachment storage and mobile media tools | 6–7 | Complete |
| 9 | Schedule, reschedule, and cancellation | 7–8 | Complete — saved plans; automatic delivery not enabled |
| 10 | Durable workers and in-app delivery | 9 | Complete — native UI check unavailable |
| 11 | Dashboard, mailboxes, message details, and tracking | 10 | Complete |
| 12 | Email delivery and secure external content access | 10–11 | Complete — real self-inbox, private link and revocation verified 19 November |
| 13 | WhatsApp message delivery | 10–12 | Complete — scheduled self-delivery and login OTP verified 19 November |
| 14 | SMS message delivery | 10–12 | Not started |
| 15 | Notifications, preferences, and account settings | 11–14 | Not started |
| 16 | Release verification, operations, and handover | 2–15 | Not started |

Recommended execution order is numeric. Provider evaluation can happen earlier;
Phases 13 and 14 do not depend on one another. An OTP-specific adapter needed in
Phase 4 may be implemented early, without claiming its full future-message channel
is complete. If a required device/account/credential is unavailable, record the
blocker; do not turn a mock into an acceptance pass.

## Phase 1 — Project structure

**What was delivered**

- Preserved existing Expo SDK 58, NativeWind v4, Paper, backend conventions, source,
  configuration, dependencies, and Prisma schema.
- Added necessary message, recipient, notification, settings, media, job, worker,
  and provider directories with `.gitkeep`; documented folder responsibilities.

**How / verification:** Inspected the existing repository first, added only missing
paths, and checked that existing implementation/configuration remained unchanged.
Structure and whitespace checks passed. Planning documents do not make the runtime
complete.

**Baseline at Phase 1 (historical):** Backend scripts referenced missing `src/server.ts`; Prisma
has a generic email/password user template. The mobile app still uses `App.js` and
has no Expo Router despite its local instructions. There is no frontend lint script;
a direct TypeScript check previously parsed React Native dependencies unsuccessfully.
Backend runtime/checks were resolved in Phase 2; frontend tooling/routing were
resolved in Phase 3. The Prisma account template remains for Phase 4.

**Commit scope:** Structure/documentation work already exists in history; do not
rewrite it to match this new numbering.

## Phase 2 — Backend foundation and local database

**Build**

- Separate Express application assembly from server startup so tests can exercise
  HTTP behavior without binding the production port.
- Add validated environment config, Prisma client lifecycle, safe logging, request
  identifiers, consistent error responses, not-found handling, and Zod validation.
- Configure CORS, Helmet, request-size limits, and baseline rate limiting.
- Add liveness and database-readiness endpoints, graceful shutdown, and reproducible
  backend build/typecheck/lint/test commands.
- Document the configured Neon connection and optional local PostgreSQL setup;
  keep Redis optional.

**How:** Use the existing `configs/`, `middlewares/`, `utils/`, and `routes/` layers.
Reuse installed dependencies before adding packages. Validate required environment
at startup, redact secrets from logs, and separate public liveness from readiness
that can fail when PostgreSQL is unavailable. Do not redesign the user model yet.

**Done when:** Server starts/stops cleanly; readiness reflects database availability;
invalid requests and unknown routes return predictable safe errors. Backend checks
and focused HTTP/error tests pass. A clean local setup can follow the README.

**Commit groups:** Runtime/configuration and health endpoints; middleware/error
contracts with tests; remaining check/setup documentation when independently useful.

## Phase 3 — Mobile foundation and developer checks

**Build**

- Introduce Expo Router in line with `frontend/AGENTS.md` after consulting the
  matching SDK 58 documentation; retain feature components in `src/screens/`.
- Preserve NativeWind's CSS/Babel/Metro setup and Paper/Safe Area providers while
  establishing route layouts and a minimal navigable shell.
- Define shared theme tokens, common fields/buttons, loading/error/empty patterns,
  and accessible touch targets without building every feature screen upfront.
- Add an API client with a public base URL, safe timeout/error handling, and a
  clear distinction between network errors and rejected API responses.
- Establish lint and suitable JavaScript checking; resolve the prior dependency
  parsing problem instead of masking errors or checking generated source.

**How:** Keep frontend JavaScript unless a migration is explicitly requested.
Follow the nested Expo instructions for dependencies and generated native folders.
Document how a physical device reaches the local backend; never put server secrets
in `EXPO_PUBLIC_` settings. Reserve authenticated route behavior for Phase 5.

**Done when:** Mobile startup, basic navigation, Paper components, and NativeWind
styling work on target platforms; the API client reaches backend health. Required
frontend checks run with documented commands, and existing styling still works.

**Commit groups:** Routing/provider integration; theme/shared UI and API client;
validation tooling with its configuration and lockfile changes.

## Phase 4 — Phone authentication backend

**Build**

- Replace the email/password Prisma template with normalized phone identities,
  OTP challenges, sessions, and profile fields through reviewed migrations.
- Define request/verify/resend/logout/refresh/profile contracts and account creation
  on successful phone verification. Email remains an optional delivery destination.
- Add random short-lived OTPs, protected challenge storage, attempt/resend limits,
  challenge consumption, enumeration-resistant responses, and abuse controls.
- Choose access-token/session lifetimes and refresh rotation/revocation behavior.
- Introduce a small OTP adapter contract. Development mode is explicit and blocked
  in production. Trial real SMSGate or WAHA dispatch when the user selects one.

**How:** Use validated E.164 phone numbers with an explicit country, not ShopSmart's
implicit `+91` heuristic. Dispatch OTP immediately with a short expiry; do not queue
it as a future message. Preserve a structured provider failure result and do not
claim a code was sent if dispatch was rejected. Review the
[messaging options](messaging-options.md) before selecting the actual adapter.

**Done when:** Valid OTPs establish an account/session; expired, reused, incorrect,
and over-attempted codes fail. Logout/revocation and ownership checks pass tests;
concurrent verification cannot reuse a challenge. Real dispatch evidence is recorded
if configured; otherwise explicitly mark authentication as development-only.

**Commit groups:** Identity/challenge/session migration; auth endpoints and security
logic with tests; OTP adapter/configuration and setup notes if implemented.

## Phase 5 — Mobile login, profile, and session recovery

**Build**

- Phone/country entry, OTP verification, resend countdown, retry/error states, and
  a minimal first-login profile flow.
- Auth state initialization, protected routes, logout, profile read/update, and
  handling for revoked/expired sessions.
- Secure native session persistence with a suitable supported mechanism; serialize
  refresh behavior so simultaneous API failures do not race token rotation.

**How:** Keep transport/token logic in API/services and account state in the existing
context/hooks structure. Gate protected routes while restoring the session, clear
credentials on logout/revocation, and resume only authorized navigation after login.
Use server expiry/resend rules as the source of truth for UI countdowns.

**Done when:** Login, app restart, expiry, logout, and profile updates work end to
end. Slow/offline responses do not produce duplicate submissions or expose protected
screens. Device checks cover OTP entry, keyboard behavior, and accessibility labels.

**Commit groups:** Session storage/context and API integration; login/verification
screens; profile/logout flow and related verification notes.

## Phase 6 — Draft messages and recipients backend

**Build**

- Message ownership, text/subject as needed, occasion metadata, draft state, and
  recipient records for self, app users, phone numbers, and email addresses.
- Authenticated create/read/update/delete/list APIs with pagination, validation,
  recipient deduplication, and explicit response shapes.
- Clarify the relationship between a saved destination and a registered recipient;
  an unverified claimed phone/email must not grant account access to a message.

**How:** Add only the schema needed for drafts and recipients now; attachments and
schedules follow in later migrations. Keep controllers thin, services transactional,
and ownership enforced in queries. Define edit/version behavior so concurrent edits
can later be rejected rather than silently overwriting a scheduled message.

**Done when:** Users manage their own drafts with every supported recipient type;
other accounts cannot enumerate or access them. Invalid/duplicate destinations and
pagination boundaries are covered. Draft creation has no delivery side effects.

**Commit groups:** Draft/recipient schema; service/API logic with authorization tests;
API contract and setup documentation.

## Phase 7 — Mobile composer, recipient selection, and drafts

**Build**

- Text composer, occasion selection/custom occasion, self-recipient shortcut, and
  manual phone/email or app-user selection where supported by the API.
- Draft save/reopen/edit/delete, validation feedback, unsaved-change handling, and
  a draft list with useful loading/empty/error states.
- Recipient display/review and duplicate prevention. Start with manual entry;
  address-book import is optional and should not block this phase.

**How:** Keep reusable message and recipient UI in their component folders. Validate
locally for feedback and on the server for correctness. Make server-save state
visible; if local draft recovery is added, define what is stored and clear private
account data appropriately. Do not present attachments/scheduling as already working.

**Done when:** A user composes and reopens a draft with supported recipient types,
updates/deletes it, and sees clear failure/unsaved indicators. Failed saves do not
claim persistence; repeated taps do not create duplicate drafts.

**Commit groups:** Composer/draft integration; recipient UI and shared components;
draft list/recovery behavior with relevant verification.

## Phase 8 — Attachments, voice, and storage

**Build**

- Attachment metadata/migration, authenticated upload/finalization/removal, private
  storage access, and file type/count/size limits.
- Photo/video/file pickers, voice recording, media previews/playback, progress,
  cancel/retry, permission-denial states, and attachment removal in the composer.
- Cleanup for abandoned uploads and deleted drafts; storage/retention policy.

**How:** Choose a free-to-use storage option after reviewing capacity and costs.
Keep a storage adapter so local development does not dictate production hosting. Validate actual
file characteristics server-side, scope object access to the authorized user, and
avoid public permanent URLs. Use supported Expo modules after checking SDK 58 docs.
Do not load large videos entirely into mobile memory or base64 API JSON.

**Done when:** All promised media types can be uploaded, reopened, played/viewed,
and removed. Unauthorized access, oversized/mismatched files, interrupted transfers,
and denied permissions are handled. Orphan cleanup is verified without deleting
referenced media. Checks and device permission tests pass.

**Commit groups:** Attachment schema/storage API with access tests; pickers/upload
UI; voice recording/playback and cleanup behavior as coherent changes.

## Phase 9 — Schedule, reschedule, and cancel

**Build**

- Schedule and delivery-intent schema, requested channels per recipient, date/time/
  timezone input, and review/confirmation UI.
- APIs for scheduling, pre-delivery editing, rescheduling, and cancellation, with
  explicit allowed transitions and concurrency/version checks.
- Rules for past/ambiguous/nonexistent local times, delivery channel availability,
  and what happens if a recipient/channel is changed before dispatch.

**How:** Store the delivery instant in UTC and the user's IANA timezone. Convert
on the server using an appropriate maintained timezone library, checking ambiguous
DST input rather than guessing. Persist schedule changes transactionally. Keep one
source of truth for the current schedule/version; queued work will recheck it in
Phase 10. Reject unavailable channels or clearly label development-only options.

**Done when:** Users schedule, review the actual instant, edit, reschedule, and
cancel their own messages. Invalid times and conflicting updates are rejected.
Tests cover timezone boundaries and cancellation/schedule transitions. UI clearly
states that background delivery is not implemented until Phase 10.

**Commit groups:** Scheduling schema/API with transition tests; date/time review UI;
reschedule/cancel flow and documentation.

## Phase 10 — Durable workers and in-app delivery

**Build**

- Database-backed work claiming or an explicitly chosen Redis-backed queue, a
  separate worker process, retry/backoff limits, and recoverable failed work.
- Per-recipient/channel delivery attempts, unique identities, claim leases, and
  idempotent in-app delivery creation.
- Due-time enforcement, current schedule/version and cancellation rechecks,
  worker shutdown/restart recovery, and safe operational diagnostics.
- Verified phone-to-account recipient matching and an in-app inbox API; no early
  access to scheduled content or attachments.

**How:** Prefer the simplest durable mechanism that meets reliability requirements.
If Redis is chosen, document its role and persistence; PostgreSQL remains the
business-state source of truth. Use transactions/constraints for in-app uniqueness,
reclaim expired work safely, and avoid holding a DB transaction during slow external
calls. Define edits/cancellation once dispatch begins. External adapters follow later.

**Done when:** A due message becomes visible only to its intended verified recipient.
Restart, duplicate jobs, multiple workers, retries, and stale schedule versions do
not duplicate in-app records or bypass cancellation. Tests cover those races and
pre-delivery access. Worker operation/recovery is documented.

**Commit groups:** Delivery/work schema and queue decision; worker/in-app execution
with reliability tests; recovery diagnostics and operations documentation.

## Phase 11 — Dashboard, mailboxes, detail, and tracking

**Build**

- Home counts and created/scheduled/sent/received/draft/failed views with pagination,
  refresh, filters, and correct account-scoped queries.
- Message details with body, attachment access, recipients, timezone-aware times,
  status history, and permitted actions.
- A consistent status model: message state versus each recipient/channel outcome;
  mixed successes must remain visible rather than becoming a misleading global sent.

**How:** Build on the server's state machine instead of deriving success from the
mobile clock. Fetch counts/lists consistently, deduplicate paginated results, and
use explicit read/open events only where meaningful. A phone/email destination
alone is not proof that the current account owns that destination.

**Done when:** Two accounts can create/deliver/read messages with correctly isolated
mailboxes and media. All categories have useful empty/error/loading behavior;
reschedule/cancel actions reflect state. Unknown/unsupported external receipts do
not appear as confirmed delivery/opening.

**Commit groups:** Dashboard/list/detail queries; mobile mailbox/dashboard UI;
detail/history/actions and targeted access/status tests.

## Phase 12 — Email and secure external message access

**Implementation checkpoint — 17 November 2026:** Gmail SMTP delivery, secure
external recipient access, private attachment loading, owner revocation, mobile
email review and honest per-recipient statuses are implemented. Applied additive
email/revocation migrations without resetting existing data. Durable sender budgets,
bounded safe retries and uncertain-submission stop rules are in place. See
[email contracts and test instructions](email-delivery.md).

**Verified:** Backend lint/typecheck/build and 57 standard tests; frontend
lint/typecheck and 73 tests; backend integration suite 66 entries (59 scenarios,
7 parent suites); mobile integration 3 scenarios; Expo Doctor 20/20 and iOS export.
Browser functional check covered explicit opening, literal text rendering, private
file loading, token removal from history and revoked-link rejection. Synthetic
browser data was removed. Simulator window access was unavailable, so this phase
has no new native-device verification.

**Acceptance completed — 19 November 2026:** The user subsequently authorized
agent-run self-tests through Phase 13. A reviewed synthetic message reached the
configured sender's own real Gmail inbox through the durable worker. Its link
opened the exact private content on this Mac, and owner revocation then returned
404. An initial pre-submission SMTP connection failure safely retried; one email
was accepted. This supersedes the original user-run acceptance deferral. Hosted
URLs remain unconfigured and new native email interaction was not repeated.
Phases 1–13 are now complete within their documented scope; Phase 14 is not started.

**Build**

- Select email service from the review; implement a Nodemailer SMTP adapter or
  chosen API adapter, text/HTML templates, queue integration, and quota-aware errors.
- Design external recipient proof, secure link expiry/revocation, and attachment
  access before sending content links. Keep email out of the account-login flow.
- Add the minimum secure browser-readable message view or appropriate access flow
  so recipients without Dearly can actually open a link and view supported content.
- Track provider acceptance, bounces/confirmed events where available, and safe
  retries. Explicitly distinguish local capture mode from real email delivery.

**How:** Retain ShopSmart's reusable transport idea, but do not copy its silent JSON
fallback as successful sending. Keep templates escaped, credentials server-side,
and large media behind authorized links. Decide whether a link is bearer access
or needs additional recipient proof and document the tradeoff before implementation.
Keep revocable access state server-side; do not expose raw storage URLs or IDs.

**Done when:** A real test recipient without the app receives an email and opens
only the intended content after it is due. Expired/revoked links and other accounts
cannot bypass access rules. Missing credentials, quota exhaustion, bounce/rejection,
and timeout paths have honest outcomes and tests. Fake SMTP alone does not pass.

**Commit groups:** Secure access schema/API and minimal viewer with tests; email
adapter/templates/configuration; worker integration and event/error handling.

## Phase 13 — WhatsApp message delivery

**Implementation checkpoint — 17 November 2026:** Added the free WAHA Core
provider with separate local/server configuration, a dedicated persistent local
Docker instance, safe session recovery and a temporary loopback-only auto-refreshing
pairing page. After the initial engine rejected linking while official WhatsApp Web
worked, free GOWS paired successfully and verified READY. The existing ShopSmart and
official WhatsApp Web sessions were preserved. No real WhatsApp test was sent.

The shared external worker now handles reviewed WhatsApp choices, consent evidence,
private links and per-provider budgets; ambiguous submissions are never blindly
replayed. Exact-body signed callbacks are scoped/deduplicated, retain only relevant
outbound metadata, and distinguish notification delivery/read from private content
opening. Owner revocation works for either external channel. Existing email rows
and issued link proofs are preserved; legacy physical table names remain mapped.

**Verified:** Backend lint/typecheck/build and 66 standard tests; frontend
lint/typecheck and 76 tests; 75 full backend integration entries plus the expanded
WhatsApp-specific suite (10 entries / nine scenarios); three mobile integration
scenarios; Expo Doctor 20/20; iOS export. Applied the additive migration and verified
its checksum. The local service is confirmed Core 2026.10.1 on GOWS. Native UI was
not newly verified. No Android emulator or simulator reset was used.

**Acceptance completed — 19 November 2026:** The user authorized agent-run self-tests
through Phase 13 plus WhatsApp OTP. A real fresh OTP was accepted, verified, and
rejected on replay; the test session was logged out. A reviewed synthetic message
was scheduled through the durable worker to the paired account and own Gmail.
WhatsApp was accepted exactly once, and the user confirmed both the OTP and
scheduled notification arrived. Self-chat did not emit DEVICE/READ receipts, so
phone arrival is user-confirmed, not fabricated callback evidence. Gmail inbox
arrival, exact private content opening on this Mac and revocation/404 rejection
for both channels passed. The first email connection failed before acceptance;
bounded retry succeeded without replaying the accepted WhatsApp submission.

Live testing found a real Core GOWS response mismatch: `{ id, _data }` omits
`fromMe`/`to`. The adapter now accepts validated serialized outgoing IDs for this
engine and preserves UNKNOWN for malformed/mismatched responses. The earlier OTP
remains UNKNOWN and was superseded by a distinct fresh challenge, never replayed.
The selected `AUTH_MODE=whatsapp` has separate immediate dispatch and a persistent
OTP sender budget; development-code simulation remains opt-in and blocked in
production. Mobile copy/contracts distinguish real WhatsApp from local simulation.

**Follow-up verification:** Backend lint/typecheck/build and 69 standard tests;
frontend lint/typecheck and 77 tests; isolated auth/WhatsApp integration 25 runner
entries; final focused WhatsApp integration rerun 11. The existing iPhone 17 Pro Max
app bundled successfully; new native OTP entry was not separately automated.
No dependency upgrades, migration, Android launch or reset occurred. Hosted URLs
remain empty, and localhost links still work on this Mac only. The labeled
synthetic message remains as acceptance evidence with its test links revoked.
Phases 1–13 are complete within their documented scope; Phase 14 is not started.
See [WhatsApp setup and contracts](whatsapp-delivery.md) and
[real OTP configuration](authentication.md).

**Build**

- Reuse WAHA's free edition as the candidate and verify supported capabilities
  before selecting configuration. Keep paid editions out of scope.
- Implement reusable text/secure-link dispatch, provider IDs, session readiness,
  timeouts, and per-recipient/channel delivery records in the worker pipeline.
- Add authenticated/deduplicated callbacks where supported and operational handling
  for offline/unpaired sessions. Direct media is added only if required and supported
  by the selected edition/engine.

**How:** Adapt ShopSmart's WAHA HTTP boundary, not its boolean-only result or country
heuristic. Keep sender sessions private/persistent. Use supported provider idempotency
or reconciliation; treat a post-submit timeout as uncertain because the message
may already have been sent. Verify free-edition capability and recipient consent;
use text/secure links when direct media is unavailable without payment.

**Done when:** Real text/link delivery is demonstrated to a designated recipient;
session loss, provider rejection, unknown outcomes, and duplicate events are handled.
UI reflects supported receipt evidence only. Provider setup and public-release
limitations are documented; a logged simulation remains incomplete.

**Commit groups:** Provider adapter/configuration and contract tests; worker/event
integration; readiness/recovery and user-facing channel state.

## Phase 14 — SMS message delivery

**Build**

- Review SMSGate and InfiniReach's free plan only; select one with explicit
  device/SIM/credential requirements. Reuse the Phase 4 adapter foundation if real SMS OTP was added.
- Send short text/secure links through the worker pipeline with normalized numbers,
  length/segment handling, provider IDs, timeout classification, and safe retries.
- Add available authenticated delivery callbacks, offline-device/quota reporting,
  and clear unsupported-destination errors.

**How:** Keep provider selection separate from credential detection. Use SMS for
text/links rather than media. Preserve the distinction between an accepted gateway
request and a carrier delivery report. Share a low-level transport with OTP only
where appropriate; OTP priority/expiry must remain separate from scheduled messages.
Document carrier/device costs and constraints; no unlimited-free-delivery promise.

**Done when:** A real designated device receives a scheduled SMS/link. Gateway
offline, invalid number, carrier rejection, multipart limits, and uncertain timeout
paths are verified. Channel preference controls sending; no silent extra WhatsApp
or email dispatch. Real OTP readiness is rechecked before release.

**Commit groups:** Selected SMS adapter and contract tests; worker/callback and
segment handling; operational setup and channel-state UI.

## Phase 15 — Notifications, preferences, and settings

**Build**

- Durable in-app notifications, read/unread state, and notification-list pagination.
- Push permission/token registration, token rotation/removal, dispatch, receipts
  where available, and authenticated message deep links.
- Profile/account settings, timezone/default preferences, selected delivery channels,
  and notification controls; notification opt-out does not silently cancel scheduled
  message delivery unless that behavior is explicitly chosen.
- A clear policy for external fallback channels, including sender preference and
  recipient controls. No automatic all-channel sending as an undocumented default.

**How:** Choose supported Expo notification modules with version-matched docs.
Associate device tokens with sessions/accounts, remove stale associations on logout,
and avoid displaying private message content on a lock screen by default. Server
access checks still apply after opening a notification or external link.

**Done when:** A notification opens the intended message after login, read state
persists, and denied permission/stale tokens/logout are handled. Preferences persist
and affect only their defined scope. Test on real target devices; development-only
push simulation is reported explicitly.

**Commit groups:** In-app notification model/API/UI; push registration/worker and
links; settings/preference integration with behavioral tests.

## Phase 16 — Release verification and operations

**Build**

- Complete Android/iOS target-build smoke flows from phone verification to media,
  scheduling, restart recovery, each channel, inbox access, and notification links.
- Review accessibility, offline/error states, memory/performance, abuse controls,
  attachment privacy, secrets, and message/OTP/token log redaction.
- Add CI for established checks, production configuration validation, migration
  procedure, worker startup, health monitoring, backup/restore, and provider recovery.
- Document data retention/deletion behavior, deployment/build steps, known limits,
  selected providers/quotas, and a repeatable demonstration/release checklist.

**How:** Use earlier focused tests as the baseline; add cross-feature regressions
where integration reveals gaps. Exercise staging with explicit test accounts and
consenting recipients. Separate ordinary tests from opt-in live sends. Verify real
OTP and all promised channels; record any unavailable integration as a release
blocker. Prepare deployment artifacts without publishing until requested.

**Done when:** Required checks and target-device tests pass with recorded evidence;
configuration/migrations/recovery are reproducible; actual providers are documented;
no credentials or generated outputs are tracked. Remaining limitations are explicit,
and the user has a clear release checklist.

**Commit groups:** Focused fixes with regression tests; CI/operations configuration;
release/handover documents. Keep changes grouped by purpose, not a final bulk commit.

## Decisions and boundaries

- Keep vendor choices in [messaging-options.md](messaging-options.md) editable and
  record the selected option/rationale before implementation. Source evidence and
  suggested defaults are not user approvals for purchases, live sends, or deployment.
- Decide attachment storage/limits in Phase 8; timezone and state semantics in
  Phase 9; durable queue mechanism in Phase 10; external content access in Phase 12.
- Write API contracts and schema changes alongside the phase that needs them.
  Preserve applied migrations and working setup; do not prebuild the entire schema.
- Public login depends on real OTP dispatch even though local UI can use a clearly
  marked development adapter. Email delivery never introduces email/password login.
- Share low-level provider code without mixing OTPs, scheduled messages, push
  notifications, and in-app visibility into one untestable delivery function.
- Do not add recurring messages, collaborative capsules, AI content generation,
  payments, address-book import, or other unrequested features just to expand phases.
- These are implementation boundaries, not fixed estimates. If a phase grows, split
  its tasks/commits first; change numbering only when the user requests replanning.

## Phase completion record

At each boundary update the progress table and append a real record:

```text
Phase:
Status: Not started / In progress / Blocked / Complete
Delivered behavior:
Validation: commands/device checks, results, and relevant evidence
Decisions and required configuration:
Limitations or blockers:
Commits: actual IDs and purpose
Next phase:
```

Use explicit related staging paths and review each staged diff. Keep tests with
the behavior they validate, migrations with their model changes, and lockfiles
with dependency changes. Make as many coherent commits as needed; neither one
commit per file nor one commit for the whole phase is the default. Preserve
unrelated user work, and do not push or rewrite history unless requested.

### Phase 2 completion — 15 November 2026

- **Status:** Complete.
- **Delivered:** Separate Express app/startup, validated environment, one Prisma
  client per process, live/ready endpoints, safe response/error contracts,
  request IDs/logging, CORS/security headers/body limits/IP limits, reusable Zod
  body validation, graceful shutdown, developer commands, and a backend lockfile.
- **Validation:** `npm run check` passed lint, source/test typechecking, all 19
  automated tests, Prisma client generation, and production compilation.
  `npm audit` reported zero vulnerabilities after a fresh dependency install.
  Real compiled-server smoke on port `8080` returned live `200` and Neon-ready
  `200` using read-only `SELECT 1`. A controlled unavailable database returned
  live `200` and ready `503`. Both stopped cleanly on `SIGTERM`. Development
  nodemon start/graceful restart also passed; test processes were stopped afterward.
  Documentation links, whitespace, ignored private files, and absence of supplied
  database credentials in versioned candidates were checked.
- **Decisions:** Keep Express v4/Prisma v5; use lazy database connection so liveness
  survives an outage. Redis is not required. Zod deliberately moved to patched
  v4.6.7, with narrow patched-minimatch overrides for development tools; rationale
  and advisory sources are in the backend README. No schema or data changes,
  migrations, messaging-provider calls, or frontend modifications were made.
- **Limitations:** Memory rate limits are local to one process; auth, shared abuse
  controls, mobile configuration/routing, and delivery features remain in their
  planned phases. The Prisma user model remains a template, not a login system.
  No blocker remains for the Phase 2 scope.
- **Implementation commits:** `15a2214` — configuration/database setup and developer
  checks; `4958905` — HTTP runtime, safeguards, health endpoints, and tests.
- **Next:** Phase 3 — mobile foundation, routing, theme, API client, and frontend
  checks; begin when requested.

### Phase 2 follow-up — basic API routes

Added `GET /` with API information and endpoint links, `GET /health` for server
liveness, and `GET /health/db` for database readiness. The existing `/health/live`
and `/health/ready` paths remain supported. Liveness aliases remain independent
of the database and exempt from ordinary rate limits; health results are not
cached. `npm run check` passed all 21 tests, lint, typechecking, and build. The
user's running server on port `8080` returned `200` for all three basic routes,
including the read-only Neon check. No further feature routes were needed.

### Phase 3 completion — 15 November 2026

- **Status:** Complete for the mobile foundation scope.
- **Delivered:** Expo Router entry/root layout and home/status/not-found routes;
  preserved Safe Area/Paper providers; shared MD3 light/dark/navigation themes,
  spacing and minimum-touch-size tokens; scrollable responsive Screen, button,
  labeled field, and loading/error/empty-state components. API client adds explicit
  local/hosted URL selection, safe response parsing/error types, timeout, caller
  cancellation, and no automatic retries. The service-status screen checks the
  actual backend/server and database endpoints and supports recovery/retry.
- **Validation:** Frontend `npm run check` passed lint, strict JS/JSDoc checking,
  and all 16 API/configuration/health tests. `npx expo install --check` passed;
  Expo Doctor passed 20/20 checks. Production export succeeded for iOS, Android,
  and web. Audit reported zero vulnerabilities. Expo fingerprint generation also
  passed with the targeted dependency overrides.
- **Native evidence:** Current app rendered in Expo Go 58 on iPhone 17 Pro Max
  (iOS 26), iPad Pro 11-inch (M4, iOS 26), and Medium Phone (Android 36).
  iPhone in-app home-to-status navigation, loading, backend-offline error, retry,
  and successful real local backend/Neon results were observed. Light/dark and
  enlarged-text reflow were checked on iPhone and Android; a native Android
  1600×2560/density-240 display override checked a tablet-sized viewport, not
  separate tablet hardware. Generated captures stay ignored under
  `.impeccable/review/`; only source/configuration/documentation is committed.
- **Independent review:** `ship` for this bounded foundation and the supplied
  native simulator/emulator captures. No new visual identity was introduced:
  Paper's established semantic palette/system fonts are retained. No material
  code/layout fixes remained in that verified scope.
- **Preserved:** Existing Expo/React/React Native/NativeWind/Paper/animation core
  versions and Babel/Metro/Tailwind/global CSS configuration. The superseded
  `App.js` was replaced by Router's layout, not retained as a competing root.
  Backend source/schema, private environment files, and hosted API URL remain
  unchanged. No migrations, message sends, auth screens, or feature APIs added.
- **Decisions:** Keep JavaScript and strict JSDoc checking against dependency
  declarations; prevent jsconfig from checking vendor runtime JS. Use a 10-second
  request deadline and reject missing hosted configuration in every release build.
  Keep the hosted URL empty until deployment. Add only SDK-compatible Router,
  required peers, appearance/web support, and checking tools; preserve the rest.
- **Verification limits:** Physical-device gestures, enlarged-text scrolling to
  off-screen controls, Android status-screen interaction, and development-build
  deep links remain hands-on checks for subsequent flows/release verification.
  CUA scroll/drag calls returned `noWindowsAvailable`, so readable reflow/AX
  presence is not claimed as proof of a successful scroll gesture. Android tablet
  evidence is a viewport override; real tablet hardware remains untested.
- **Cleanup:** Android display/font/night settings and temporary adb reverse
  tunnels were restored; the QA emulator was stopped. The original iPhone's
  light appearance/large text setting was restored. Temporary services started
  for this verification are stopped after testing; the user's pre-existing Expo
  process is preserved. Existing user deletion of `docs/.gitkeep` is not included.
- **Commits:** `d12c65d` — API/configuration/health services and tests; `958e95b` —
  SDK-compatible dependencies and frontend checks; `31ca96d` — Router, themes,
  shared components, and the minimal mobile shell.
- **Next:** Phase 4 — phone OTP/session backend. Begin when requested.


### Phase 4 completion — 16 November 2026

- **Status:** Complete for the development-only backend scope. No real OTP provider
  has been selected/configured or tested. Public authentication remains blocked.
- **Delivered:** Phone identities and optional profile destinations/timezone;
  five-table initial Prisma migration; request/resend/verify, refresh, logout,
  own-profile read/update APIs; explicit country/E.164 validation; random five-minute
  OTPs stored as keyed hashes; durable per-phone resend/request/attempt budgets;
  transaction locks preventing concurrent challenge reuse; 15-minute opaque access
  tokens, absolute 30-day sessions, refresh rotation and replay-family revocation.
- **Adapter/config:** Structured simulated/accepted/rejected/unknown outcomes,
  pending/stale/failed dispatch protection, no automatic fallback or send retries.
  Simulation is opt-in, loopback-only, and blocked in production. The ignored local
  environment enables it with a private generated pepper; committed defaults disable
  auth. Deprecated JWT placeholders were removed. No SMS/WhatsApp/email was sent.
- **Validation:** `npm run check` passed lint, source/test typechecking, 26 ordinary
  tests and build. Real PostgreSQL tests passed all 13 security scenarios (14 runner
  entries with the parent), including concurrent OTP verification/refresh, consumed
  code rejection, durable budgets, expiry, logout isolation, profile ownership,
  provider failure/pending/replacement states and HTTP throttling/log redaction.
  `npm audit` reported zero vulnerabilities. Prisma schema validation passed;
  reviewed migration deployed to Neon and migration status is up to date.
- **Setup correction:** The first integration-test setup revealed that raw SQL
  through the pool uses the public search path despite Prisma's model schema URL
  setting. It created five empty tables before its isolation assertion stopped.
  Those exact empty tables were removed after checking table names and zero row
  counts; no user data was present. Test SQL now explicitly qualifies the random
  test schema. Subsequent integration tests passed and removed their schema.
- **Live checks:** Running backend on port 8080: `/`, `/health`, `/health/db` return
  200; unauthenticated `/auth/me` returns 401; invalid phone input returns 400.
  Temporary schema and application-record cleanup were checked after testing.
- **Preserved:** Existing uncommitted frontend rewrite/deletions and `docs/.gitkeep`
  deletion were left untouched and excluded from commits. No mobile auth screens,
  simulator reset, Android launch or native UI verification belongs to this phase.
- **Limits:** Real possession verification awaits provider selection and consenting
  recipient testing. IP throttles are per process; shared IP limits and retention
  maintenance remain deployment work. No phone-change/logout-all/account-delete
  flows, real channel delivery or mobile token storage is claimed. Full contracts
  and local setup are in [authentication.md](authentication.md).
- **Commits:** `49d1dce` — phone identities/challenges/session migration;
  `b9ea4ac` — development OTP/session/profile APIs, configuration and security tests.
  A separate documentation commit records contracts, setup and completion.
- **Next:** Phase 5 — mobile login, secure session recovery and own profile. Inspect
  the user's changed frontend before implementation. Begin only when requested.


### Frontend reset and runtime follow-up — 16 November 2026

- At the user's request, committed all remaining working-tree changes in focused
  groups. The user-provided reset replaces Router with a blank `App.js` Expo
  starter and removes NativeWind/Paper/navigation/API services, frontend checking
  configuration/tests, the frontend README/environment example and empty scaffold
  placeholders. The backend and its auth implementation remain unchanged.
- The earlier Phase 3 completion record is historical. Its mobile foundation is
  no longer present in the current frontend and must be restored before Phase 5.
  No login or API-connected mobile screen is claimed for this starter.
- Backend `npm run check` passed all 26 tests, lint/typechecking/build. Live root,
  health and database health pass. Expo dependency compatibility and Doctor 20/20
  pass, and the current starter bundles on iPhone 17 Pro Max. Android remains closed.
- Frontend `npm run lint` and `npm run typecheck` cannot run: the reset removed
  their scripts, configurations and dependencies. They were not silently restored.
  No visual/design review or preview capture was performed, as requested.
- Restored only the narrow `@expo/fingerprint` minimatch override removed by the
  reset; no Expo downgrade or unrelated dependency upgrade. The audit now reports
  zero vulnerabilities. The override addresses
  [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
- Backend port 8080 and Metro port 8081 are left running for interactive use.
  Startup/runtime logs were monitored during this session; continued unattended
  monitoring or automatic repairs after the session are not configured.


### Phase 3 restoration — 16 November 2026

- **Status:** Complete again. Phases 1–4 are now complete for their recorded scope;
  Phase 4 remains development-only. Phase 5 has not started.
- **Restored:** Previously verified Router home/status/not-found shell, Paper/Safe
  Area providers, shared themes/components, NativeWind v4 Babel/Metro/CSS pipeline,
  safe environment-aware API client, health service/hook, lint/typecheck tooling,
  16 tests, environment example and mobile setup documentation. The blank `App.js`
  root is removed. Empty future-feature placeholders were not recreated.
- **Preserved:** Original SDK 58, React, React Native and library versions; patched
  minimatch overrides; backend auth implementation, migrated schema and credentials.
  Dependencies were reinstalled through Expo without incidental upgrades.
- **Validation:** Frontend `npm run check` passed lint, strict JS checking and all
  16 tests; dependency compatibility passed, Expo Doctor passed 20/20, audit found
  zero vulnerabilities, and production exports passed for iOS/Android/web.
- **Native functional check:** Existing iPhone 17 Pro Max loaded the restored app;
  home-to-status navigation succeeded and both backend/server and real Neon storage
  reported available. No visual/design review, preview capture or additional
  device testing was performed, per the user's preference. Android stayed closed.
  The prior physical-device/gesture/deep-link limitations still apply.
- **Runtime:** Backend 8080 and Metro 8081 remain running with iOS open. A dependency
  ImageBackground deprecation warning is present; no startup/runtime error was
  observed. This warning does not prevent bundling or the health flow.
- **Commits:** `6cc7000` — API, styling pipeline and checks; `4354b97` — Router,
  shared components and screens; separate documentation commit records restoration.
- **Next:** Phase 5 — mobile phone login, session restoration and own profile.
  Begin when requested; no mobile authentication screens are included here.


### Phase 5 completion — 16 November 2026

- **Status:** Complete for the development-only authentication scope. Phases 1–5
  are complete; Phase 6 is not started. Real OTP delivery/public login remains
  blocked until a provider is selected and verified.
- **Delivered:** Searchable country/calling-code and phone entry, six-digit OTP,
  safe errors, server-driven resend/expiry countdown, replacement codes, duplicate
  submission latch and cancellation. First login requires profile name/timezone;
  optional email is an unverified destination. Protected profile editing and logout
  use the existing API. No auth/OTP data is placed in route parameters or logs.
- **Sessions:** Secure native credential persistence, web memory only, startup and
  foreground validation, protected-route gating, serialized refresh/profile work,
  scope binding, atomic token-pair writes and a refresh-intent journal. Uncertain or
  interrupted rotations require login rather than replay. Offline restoration
  hides protected data and offers retry/sign-out. Logout clears local credentials,
  revokes the server session when reachable, and reports unconfirmed revocation.
  Expired access can renew solely for revocation without persisting the new pair.
- **Verification:** Frontend lint, strict JS checking and all 34 tests pass. The
  opt-in real mobile-client/PostgreSQL integration test passes login, wrong code,
  profile update, restart, access expiry/refresh, concurrent reads, logout and
  revoked-session recovery. It uses a temporary schema and removes it afterward.
  Expo compatibility and Doctor 20/20 pass; audit reports zero vulnerabilities;
  final production exports pass for iOS, Android and web.
- **Native evidence:** iPhone 17 Pro Max/Expo Go 58: country search/selection,
  phone/code entry, incorrect-code recovery, resend countdown/replacement, initial
  profile save, returning-user login, secure session recovery after restart,
  server-forced access expiry and successful rotation, offline protected-content
  gate, backend restart/retry recovery, profile read, sign-out and signed-out state
  after reload. Field labels/focus, text entry, submit-time keyboard dismissal and
  disabled/busy controls were exercised. Server data confirmed profile persistence,
  refresh rotation and latest-session revocation.
- **Runtime recovery:** Desktop access temporarily failed while the Mac was not
  available; the user restored it and checks resumed. A transient database request
  timeout was handled safely; restarting the local backend restored successful
  auth. Safe diagnostics found no retained advisory locks. The checks were repeated
  successfully with no backend source/schema change.
- **Cleanup:** Reserved-number QA account/challenges/throttles and cascading session
  records were removed; temporary integration schemas were removed. Private env
  credentials stayed private. Backend 8080, Metro 8081 and the existing iPhone are
  left running, signed out. Android was not launched and no new simulator created.
- **Scope/limits:** Local OTP is explicitly simulated; no message was sent. No
  screenshots/preview/design review were performed, as requested. Android native
  gestures, physical-device behavior, software-keyboard layout variants, VoiceOver
  navigation and development-build deep links remain later device/release checks.
  Browser persistence is intentionally absent; secure-store errors block/retry
  rather than falling back to plaintext. See [mobile auth](mobile-auth.md).
- **Commits:** `c0c963d` — secure sessions/API/tests; `893b05d` — forms/profile and
  route guards; `615b407` — expired-access sign-out; `87e1409` — task-specific loading
  accessibility label. A separate docs commit records setup and completion.
- **Next:** Phase 6 — draft message and recipient APIs. Begin only when requested.


### Phase 6 completion — 16 November 2026

- **Status:** Complete. Phases 1–6 are complete for their recorded scope; login
  remains development-only. Phase 7 is not started.
- **Delivered:** Owned DRAFT records, text/subject/occasion fields, ordered recipient
  records for SELF/USER/PHONE/EMAIL, authenticated create/read/update/delete/list
  endpoints, safe response shapes, bounded cursor pagination and input validation.
  Phone destinations normalize through the same full metadata validator as auth;
  emails use an explicit case-insensitive destination policy. Canonical duplicates
  collapse in first-entry order; SELF and the owner's USER alias are one account.
- **Privacy:** Every draft operation is owner-scoped. Foreign and unknown draft IDs
  share 404. Intended recipients cannot see drafts. Saved phone/email destinations
  never discover/link account identities or grant access, even if profile contact
  fields match. Deleted account targets become unavailable rather than reassigned.
- **Concurrency/data:** Required versions protect update/delete; competing writes
  cannot both win. Content and recipient replacement are transactional. Detail reads
  use a repeatable snapshot; DB uniqueness, bounds and cascade constraints support
  integrity. Empty/incomplete drafts can autosave without scheduling or delivery.
- **Validation:** `npm run check` passed lint, source/test typechecking, all 31 standard
  tests and build; audit reports zero vulnerabilities; Prisma validation passed.
  Opt-in PostgreSQL integration passed 11 draft and 13 auth scenarios (26 runner
  entries including two parents), including cross-account access, revoked sessions,
  deduplication, rollback, concurrent edit/delete, equal-timestamp pagination,
  forged cursors, deleted targets, response bounds and safe errors/logging.
- **Migration/live check:** Additive `202611160002_draft_messages` creates the two
  draft/recipient tables, enums, indexes, FKs and checks. Applied to Neon; migration
  status is up to date. Live server health and draft create/list/read/update/conflict/
  delete checks passed using a reserved-number simulated-login account.
- **Cleanup/preservation:** Temporary PostgreSQL schemas and the live QA account,
  drafts, recipients, OTP challenges, throttle and session records were removed.
  Existing data/credentials, auth behavior and all frontend files are preserved.
  Backend 8080 and Metro 8081 remain running. No simulator reset, Android launch,
  visual/preview review, upload, schedule, queue job or provider send occurred.
- **Contract:** See [draft API](draft-api.md). USER destinations require known account
  UUIDs; no account directory/contact lookup is introduced. Cross-kind delivery
  deduplication, attachments, schedules and received-message access remain later
  work. POST creation has no idempotency guarantee; clients must not blindly retry.
- **Commits:** `a598531` — schema/migration; `a76b661` — APIs, shared auth/phone helpers
  and validation/security tests; a separate documentation commit records contracts.
- **Next:** Phase 7 — mobile composer, recipients and draft management. Begin when
  requested, using server versions and safe authenticated writes.


### Phase 7 completion — 16 November 2026

- **Status:** Complete. Phases 1–7 are complete for their recorded scope; phone
  login remains development-only. Phase 8 has not started.
- **Delivered:** Protected composer and draft-list routes, subject/message fields,
  preset/custom occasions, reviewed self/known-user-ID/phone/email recipients,
  canonical duplicate prevention, and explicit save/reopen/edit/delete. The list
  supports refresh, cursor pagination and loading/empty/error/retry states.
- **Recovery/privacy:** Visible saved versions and unsaved state; navigation
  confirmation covers edits and unfinished recipient entry. Conflicts retain local
  work until confirmed reload. Duplicate taps share one request. Unknown write
  outcomes block replay, including a session restoration during a pending write.
  Account/API-scoped memory models survive same-account restoration and clear on
  sign-out/scope changes; late results cannot repopulate cleared models. No draft
  content is persisted on device; process closure/reload loses unsaved work.
- **Validation:** Frontend `npm run check` passed lint, strict JSDoc/JS type checks
  and all 48 standard tests. Both opt-in mobile/auth and mobile/draft PostgreSQL
  integration scenarios passed against temporary schemas. Draft integration covers
  all four recipient types, one POST for repeated saves, persisted reopen, version
  conflict/reload/update, delete/cascade and signed-out rejection. Expo Doctor
  passed 20/20; final iOS, Android and web exports passed. No dependencies changed.
- **iPhone functional check:** iPhone 17 Pro Max, Expo Go SDK 58: simulated phone
  login/profile, empty list, compose/save, process reload/reopen with persisted
  content, self/email recipients with normalized email, custom occasion, confirmed
  version 2 update, keep-editing/discard navigation, recipient removal and delete
  confirmation/cancel. Signed out afterward. Final native delete dispatch,
  phone/other-account entry, offline/conflict UI, pagination and foreground recovery
  were not manually exercised on iPhone; core cases have unit/API integration
  coverage. No Android runtime or visual/preview review was performed.
- **Preservation/cleanup:** Existing Expo/NativeWind/Paper settings, backend sources,
  migration history and private environment files are preserved. Temporary test
  schemas and the reserved-number QA account/drafts/auth records were removed.
  Backend 8080 and Metro 8081 remain running; iPhone remains available and Android
  stays closed. No upload, schedule or provider message was sent.
- **Commits:** `becf12b` — authenticated persistence, editor/workspace state and
  tests; `d2e3ffb` — composer, recipients, protected routes and draft list; a separate
  documentation commit records contracts and completion.
- **Guide:** [Mobile drafts](mobile-drafts.md) documents manual save, recipient
  semantics and recovery limits. POST creation still has no server idempotency key.
- **Next:** Phase 8 — attachments, voice and private storage. Begin only when
  requested, after choosing a free-to-use storage option and defining limits.


### Phase 8 completion — 16 November 2026

- **Status:** Complete. Phases 1–8 are complete for their recorded scope. Phase 9
  has not started; OTP remains a local development simulation.
- **Delivered:** Private attachment metadata and additive migration; owner-only
  reservation, streamed upload, finalization, state/list, range content and removal
  APIs. Native photo/video/file pickers, voice recording, local review, explicit
  uploads, progress/cancel/retry, private downloads and photo/audio/video/text
  previews plus a PDF viewer/share handoff. Media saves separately from draft text.
- **Storage:** Free-to-use local filesystem adapter, private UUID paths, exclusive
  partial files, atomic publication, SHA-256, reserved count/byte quotas and low-disk
  protection. No paid/hosted provider or public object URL is configured. Hosting
  needs persistent private disk and consistent DB/object backups.
- **Validation/access:** Exact byte lengths, type/signature checks, bounded ffprobe
  media inspection, pixel/codec/duration limits, UTF-8 validation and isolated PDF
  parsing. At most two inspections per backend process. Only READY objects can be
  downloaded, with fresh ownership/session checks; recipients cannot read drafts.
- **Recovery/retention:** Reservation retries reuse an immutable UUID and reconcile
  state before sending bytes. Active uploads cannot be overwritten/removed. A
  retryable cleanup command handles expired reservations, stale leases, deleted
  drafts/accounts and old orphan files while preserving referenced READY media.
  It is manual locally; configure an external hourly job when hosted. Managed
  device previews/selections and Dearly-prefixed recordings clear on disposal,
  sign-out/startup. Picker-only inactivity no longer discards the composer session.
- **Checks:** Backend lint/typecheck/build and all 35 standard tests passed; frontend
  lint/strict JS checking and all 55 standard tests passed. The backend PostgreSQL
  integration suite passed all 31 runner entries (auth, drafts and attachments).
  Both mobile auth/draft integration scenarios passed. Attachment integration used
  real files for JPEG/PNG/WebP, MP4/MOV/WebM, M4A/MP3/WAV/audio WebM, PDF and text;
  it covered ownership, unready denial, ranges, length/MIME failures, retry, quotas,
  active-transfer protection and orphan/deleted-draft cleanup. Dedicated tests also
  verify mid-transfer cancellation, bounded inspections and safe retry behavior.
  Expo Doctor passed 20/20; final iOS/Android/web exports passed. Package installs
  reported zero vulnerabilities. Migration `202611160003_attachments` is applied.
- **iPhone functional evidence:** iPhone 17 Pro Max, SDK 58 Expo Go: selected a
  generated photo, uploaded/validated it, reopened its private preview; approved
  short voice capture, preview/playback, upload and downloaded playback; native
  video playback with elapsed-position controls; text-file preview; PDF menu open
  and dismiss without sharing; attachment removal confirmation/cancel. Video/text/
  PDF fixtures were seeded through the authenticated API for playback/view checks;
  complete native file-picker selection and video-picker completion were not
  verified because the desktop connection could not reliably click those system
  dialogs. API tests cover all supported format families and actual removal.
- **Permission/recording check:** Microphone grant and denied-access recovery were
  exercised. A filename-only recording override produced PCM under an M4A name;
  passing the full AAC/container preset fixed it and was verified by native
  playback and server finalization. Test captures were capped at one second;
  the normal 299-second native cap and early size/duration stop are restored.
  Microphone permission was reset to its initial prompt state afterward. Long
  recording sessions, physical-device behavior, Android runtime and browser media
  interactions were not manually exercised. No design/visual review was performed;
  system-picker screenshots were used only to locate functional controls.
- **Cleanup/runtime:** Temporary DB schemas were dropped by tests. The reserved QA
  account, its five attachments/objects, draft, OTP/throttle/session records and
  managed Simulator media cache were removed; zero QA records/objects remain.
  The simulator was cold-reopened after revoking the QA account; its final screen
  was not rechecked after the desktop window connection failed. Generated photo/
  video fixtures remain in the Simulator's Photos library. No device reset, Android
  launch, external sharing, provider send, scheduling, push or deployment occurred.
  Backend 8080 and Metro 8081 are running locally.
- **Commits:** `75ecdac` — metadata/migration; `0df544a` — streaming/storage APIs,
  validation and integration tests; `3fa00eb` — bounded inspection/cancellation
  coverage; `2aeadb3` — mobile media/voice flow and session/cache integration;
  a separate documentation commit records setup, contracts and completion.
- **Guide/limits:** [Attachments and storage](attachments.md) records exact supported
  formats, quotas, file retention, free storage choice, ffprobe requirement and
  cleanup operation. Format validation is not antivirus scanning or sanitization.
- **Next:** Phase 9 — schedule, reschedule and cancel, with timezone-aware review
  and durable schedule intent. Begin only when requested.


### Phase 9 completion — 16 November 2026

- **Status:** Complete. Phases 1–9 are complete for their recorded scope. The
  summary table now also reflects the already-recorded Phase 7/8 completion.
  Phone authentication remains development-only. No automatic delivery is running;
  Phase 10 has not started.
- **Delivered:** An additive schedule/delivery-intent migration, UTC instants with
  retained IANA timezone/local input, server-side Temporal conversion, a ten-minute
  content/attachment-bound review proof, explicit confirmation, versioned scheduled
  content edits, rescheduling, cancellation and return to drafts. Owner-only lists
  support scheduled/canceled filters and bounded pagination. Shared row locking
  coordinates schedule changes with attachment reservations/removal. Ready media
  stays private and readable by its owner; scheduled/canceled media mutations are
  frozen. In-app delivery choices are labeled planned; external channels reject
  scheduling instead of pretending to deliver.
- **Mobile:** Added guarded schedule routes, full time/content/recipient/manifest
  review, explicit confirmation dialogs, safe retry/reload guidance and unsaved
  choice/edit protection. Canceled messages can return to drafts with their text
  and recipients intact. Cached editors are cleared on transitions. Fixed a
  create-save navigation race that could show an unnecessary discard prompt;
  navigation now waits for the clean saved render. Rescheduling replaces the
  detail route so Back does not reopen an obsolete schedule snapshot.
- **Verification:** Backend `npm run check` passed lint, strict typechecking,
  40 standard tests and production compilation. Frontend `npm run check` passed
  lint, strict JavaScript/JSDoc checking and 60 standard tests. All 39 backend
  integration runner entries passed against isolated PostgreSQL schemas (35
  scenarios plus four parent tests). Both mobile integration tests passed using
  the real client/session/services, Express and disposable PostgreSQL schemas;
  the draft scenario now covers schedule review/confirmation/retry, edits,
  rescheduling, cancellation and reopening. Tests cover timezone day boundaries,
  quarter-hour offsets, New York/Lord Howe DST gaps/folds, unavailable channels,
  ownership, tampered/expired/stale reviews, attachment freeze, cursor privacy and
  competing mutations. Temporary schemas were removed. The additive migration
  applied to the configured Neon database successfully, without a reset.
- **Native check:** On the existing iPhone 17 Pro Max / iOS 26 simulator, created
  a synthetic self-recipient draft, reviewed the server-resolved Asia/Kolkata
  instant, confirmed version 2, saved a text edit as version 3, reviewed and
  confirmed 2 January 2027 at 00:15 (1 January at 18:45 UTC) as version 4,
  canceled through its confirmation dialog as version 5, and returned to an
  editable draft as version 6 with edited content/recipient intact. Read-only
  attachment controls were present on scheduled/canceled details. The synthetic
  test draft was removed afterward; existing user drafts and session were preserved.
  No microphone/picker test or external send was performed. Android stayed stopped;
  no reset or additional simulator was created. This was a functional check, not
  a visual/design review. Native conflict recovery and the deferred create-save
  navigation fix were checked in code/automated checks, not repeated on-device.
- **Bundling/runtime:** iOS production export succeeded in a temporary output
  directory. No frontend dependencies or Expo/NativeWind/Paper configuration
  changed. Backend 8080 and Metro 8081 remain running; database readiness is healthy.
- **Limits:** Due plans remain SCHEDULED, even after their time passes. Nothing
  is sent, delivered or exposed to recipients. Recipient/channel/media edits
  require cancel → return to drafts → new review. Cancellation keeps the current
  plan until reopening clears its schedule/intents; there is no permanent event
  history yet. Runtime timezone data must stay maintained. Future dispatch states
  must extend the database shape constraint and coordinate edits/cancellation
  with claiming. See [schedule contracts](scheduling.md).
- **Commits:** `880777f` schema/intents and migration fixtures; `7cead40` reviewed
  timezone APIs, locking and tests; `a9f92f1` mobile schedule flows and tests.
  A separate documentation commit records contracts, setup and completion.
- **Next:** Phase 10 — durable workers and in-app delivery. Start only when requested.


### Phase 10 completion — 17 November 2026

- **Status:** Complete for the durable in-app delivery and inbox API scope. Phases
  1–10 are complete for their recorded scope. Phase 11 has not started. Phone
  authentication remains a local development simulation, and external channels
  remain disabled.
- **Delivered:** Chose a PostgreSQL-backed queue using the existing database,
  without Redis, a new dependency or a paid messaging/queue service. The additive
  migration adds durable work, per-intent attempts, unique private inbox records,
  heartbeat records, dispatch/outcome states and bounded-work constraints. All
  existing Phase 9 plans remain paused (`deliveryEnabled=false`) until a new
  explicit review/confirmation. New confirmations enable in-app delivery.
- **Dispatch boundary/recovery:** The worker is a separate process. Due scans and
  versioned work identities survive restarts. Claims serialize against edits and
  cancellation on the shared message row; a committed DISPATCHING claim advances
  the version and blocks further sender changes. Random lease tokens and database
  time fence expired/replaced workers before and after inbox writes. Attachments
  are streamed/hashed outside the transaction; the final metadata/recipient checks,
  inbox writes, attempts and aggregate outcomes commit atomically. Retry backoff
  is bounded to five attempts; explicit operator recovery is capped at 20 total.
  Crashed attempts are abandoned/reclaimed; permanent recipient failures preserve
  successful deliveries as PARTIALLY_DELIVERED instead of inventing full success.
- **Recipient privacy:** Scheduling can bind a PHONE destination to its verified
  current Dearly account, with that binding in the signed review fingerprint.
  Dispatch checks the same account and exact phone again. A recycled number never
  redirects an old message. Reopening clears PHONE bindings. Inbox APIs and private
  file-range reads require the caller's own delivered record and due time, omit
  other recipients, and never grant early access through draft/media routes.
- **Mobile scope:** Existing schedule screens identify paused plans, show delivery
  service availability and accurate dispatch/delivery/partial/failure states, and
  remove edit/cancel/reopen actions after dispatch. Confirmation copy explicitly
  enables delivery; uncertain writes retain the existing manual-check/retry rules.
  Full inbox/mailbox/dashboard/history screens remain Phase 11 work.
- **Verification:** Backend `npm run check` passed lint, strict source/test checking,
  45 standard tests and production compilation. Frontend `npm run check` passed
  lint, strict JavaScript/JSDoc checking and 62 standard tests. All 50 backend
  integration runner entries passed (45 scenarios plus five parent tests) against
  disposable PostgreSQL schemas, including existing auth/draft/media/schedule
  regression coverage. Both real mobile client/API/PostgreSQL integration tests
  passed. The new delivery cases verify future/paused-plan access, early queued
  work, canceled/stale versions, competing claims/cancellation, private attachment
  ranges, duplicate execution, expired-token fencing, rollback when a lease expires
  during commit, retry exhaustion/recovery and its cap, phone binding changes
  before confirmation, recycled/deleted recipients, partial outcomes and independent
  processes recovering a claim left by an exited worker. Shutdown draining and
  recovery after a failed poll are covered. Temporary schemas/storage were removed.
- **Migration/runtime:** `202611160005_in_app_delivery` applied successfully without
  resetting the configured database. Backend liveness/database readiness, worker
  heartbeat and Metro status are healthy. The API (8080), Metro (8081) and separate
  local delivery worker were restarted after the pause and left running. An iOS
  production export succeeded in a temporary directory; Expo SDK 58, NativeWind,
  Paper and native configuration/dependency versions are preserved.
- **Native limitation:** The existing iPhone 17 Pro Max simulator was booted, but
  desktop access repeatedly returned `cgWindowNotFound`, including after rebinding
  and resetting the connection. No Phase 10 native UI/self-delivery check could be
  completed, and no native synthetic message/account was created. Native outcome
  controls therefore remain unverified on-device; client/API contracts and bundle
  checks passed. No visual/design review, microphone capture, device reset,
  additional simulator, Android launch or external send was performed.
- **Operations/limits:** `delivery:worker`, `delivery:status`, `delivery:retry` and
  `/health/worker` are documented in [delivery operations](delivery-workers.md).
  SIGTERM drains current work with a 45-second hard deadline; a killed worker's
  expired lease is recoverable. Delivery is at/after the requested instant, subject
  to worker/database/storage availability and the 15-second polling interval.
  Heartbeats show recent process activity, not a delivery guarantee. Polling and
  retained work consume existing database quotas; no billing/upgrades were enabled.
  Hosting/supervision, retention policy and real OTP/provider delivery remain later
  work. Delivered means an inbox record, not opened/read or an external receipt.
- **Commits:** `dd5fc95` durable schema and isolated migration fixtures;
  `0ceb299` fenced worker, inbox APIs, diagnostics and recovery tests;
  `125e664` mobile delivery availability/outcomes and contract tests. A separate
  documentation commit records the contracts, operations and completion evidence.
- **Next:** Phase 11 — dashboard, mailboxes, message details and tracking. Start
  only when requested.


### Phase 11 completion — 17 November 2026

- **Status:** Complete. Phases 1–11 are complete for their recorded scope. Phase 12
  has not started. Authentication remains development-only; email, WhatsApp and SMS
  delivery remain unavailable.
- **Delivered:** A signed-in dashboard with snapshot counts and Created, Scheduled,
  Sent, Received, Drafts and Needs attention mailboxes. Account-scoped lists provide
  state/opened filters, stable bounded cursor pages, refresh, empty/error/loading
  states and safe recovery. Categories overlap deliberately: partially delivered
  messages remain visible in both Sent and Needs attention, and self-deliveries
  appear in Sent and Received. Only committed IN_APP evidence establishes sending;
  unavailable external channels never become confirmed delivery/opened receipts.
- **Details/privacy:** Owned details include ready attachments, recipients, saved
  timezone/UTC instant, per-channel outcomes/attempt summaries and paged activity.
  Received details show only the recipient's delivered content and ready media,
  sender display name and own delivery/opened timestamps. They omit other recipients,
  sender phone details, private owner history, tokens and storage paths. Draft and
  schedule actions link to the existing versioned editors; dispatch locks remain
  enforced. Temporary private downloads are cleaned on close/unmount. Confirmed
  missing/denied reads clear retained content; transient refresh failures preserve a
  labeled previous snapshot. Focus changes clear private read state and ignore late
  results; account changes continue to remove all protected routes and draft state.
- **Tracking:** The additive migration adds nullable inbox opened timestamps and
  durable message events. Real mutations, claims, retries and outcomes append events
  in their transaction, ordered by an internal sequence that never appears publicly.
  Pre-existing messages receive a truthful BASELINE event, without invented earlier
  history. Viewing/refreshing/media access never marks a message opened. The explicit
  recipient choice records the first server timestamp once, even for concurrent or
  repeated requests, without changing message state/version. Opened does not claim
  reading/understanding or an external receipt.
- **Verification:** Backend `npm run check` passed lint, strict source/test checking,
  48 standard tests and production compilation. Frontend `npm run check` passed lint,
  strict JavaScript/JSDoc checking and 70 standard tests. All 58 backend integration
  runner entries passed (52 scenarios plus six parent tests), including existing
  authentication, drafts, media, schedules and delivery recovery tests. Seven new
  mailbox scenarios cover baseline migration, category overlap, two-account scope,
  tied-date/cross-filter pagination, explicit concurrent opened choices, durable
  history/no-op idempotency, private file ranges and unavailable external receipts.
  All three mobile integration tests passed; the new two-session scenario composes,
  schedules, delivers, opens separate mailboxes, marks opened explicitly, checks
  sender history and restores/signs out through the real client, Express and
  PostgreSQL. Temporary test schemas/storage were removed. Client tests cover
  malformed evidence, safe media paths, uncertain writes, stale reads, focus clearing
  and confirmed access-denial cleanup. Expo Doctor passed 20/20 checks; iOS production
  export succeeded. No dependency or Expo/NativeWind/Paper configuration changed.
- **Native:** On the existing iPhone 17 Pro Max / iOS 26 simulator, verified the new
  dashboard and created a synthetic self-recipient draft with a private synthetic
  text attachment. Reviewed/confirmed 17 November at 01:32 Asia/Kolkata (16 November
  20:02 UTC). The worker delivered at 01:32:17, advancing version 2 to version 3.
  Received details and private text preview worked and remained unmarked as opened.
  The explicit opened choice persisted at 01:35:10; the Opened filter included that
  receipt, and sender details showed its individual delivery/opened evidence plus
  CREATED → SCHEDULED → DISPATCH_STARTED → DELIVERED → OPENED history. The database
  confirmed one receipt and one OPENED event. Edit/cancel controls were absent after
  dispatch. Removed only that synthetic message, private file, receipt and related
  metadata; existing drafts/profile/session were preserved. Reloaded the app and
  verified its original dashboard counts. Two-account isolation, failure recovery
  and multi-page behavior were checked through automated client/API tests, not by
  switching native accounts. No microphone capture, OS picker, device reset,
  additional simulator, Android launch, external send or visual/design review ran.
- **Runtime:** Applied `202611170006_mailboxes` without a database reset. Drained
  the previous local worker, then started the new build with transactional activity
  recording. Cleared a stale Metro bundle and restarted the frontend in development
  watch mode. Backend 8080, Metro 8081 and the separate worker remain running with
  healthy database/worker checks. Full mailbox/tracking rules are in
  [mailbox contracts](mailboxes.md); queue operations remain in
  [delivery operations](delivery-workers.md).
- **Commits:** `02642fb` schema/baseline and isolated migration fixtures; `33b0e22`
  snapshot mailbox APIs, transactional activity and access tests; `f48bf63` mobile
  dashboard/details, explicit opened choice, private viewer and client tests. A
  separate documentation commit records contracts and completion.
- **Limits/next:** Opened is opt-in evidence, not a read guarantee. History before
  the tracking baseline is unavailable and message deletion cascades its history.
  Display names are profile information, not verified identity. The dispatch boundary,
  paused-plan protection, persistent storage requirement and bounded operator recovery
  remain unchanged. Next is Phase 12 — email delivery and secure external message
  access. Begin only when requested.
