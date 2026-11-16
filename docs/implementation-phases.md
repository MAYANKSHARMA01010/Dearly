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
| 4 | Phone OTP and session backend | 2 | Complete — development only |
| 5 | Mobile login, session restoration, and profile | 3–4 | Complete — development only |
| 6 | Draft message and recipient APIs | 4 | Complete |
| 7 | Mobile composer, recipients, and draft management | 5–6 | Not started |
| 8 | Attachment storage and mobile media tools | 6–7 | Not started |
| 9 | Schedule, reschedule, and cancellation | 7–8 | Not started |
| 10 | Durable workers and in-app delivery | 9 | Not started |
| 11 | Dashboard, mailboxes, message details, and tracking | 10 | Not started |
| 12 | Email delivery and secure external content access | 10–11 | Not started |
| 13 | WhatsApp message delivery | 10–12 | Not started |
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
