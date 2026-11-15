# Dearly implementation phases

## Goal and working agreement

Build a mobile application for messages that arrive at a chosen future moment.
Users sign in with a phone number and OTP, create text/media messages, choose
themselves or others, and manage created, scheduled, sent, received, draft, and
failed messages. Delivery will support in-app, WhatsApp, SMS, and email.

Implement the project in seven phases. Each phase ends with acceptance checks,
updated documentation, and focused commits. Start the next phase when the user
requests it. This document plans the work; it does not authorize executing all
phases at once. Detailed repository rules are in [../AGENTS.md](../AGENTS.md).

## Progress

| Phase | Outcome | Status |
| --- | --- | --- |
| 1 | Organized project structure | Complete — scaffold only |
| 2 | Runnable backend and mobile foundations | Not started |
| 3 | Phone authentication and account access | Not started |
| 4 | Message creation, recipients, and attachments | Not started |
| 5 | Reliable scheduling and in-app delivery | Not started |
| 6 | External delivery and notifications | Not started |
| 7 | Release verification and deployment readiness | Not started |

Do not equate an existing directory or placeholder with an implemented feature.
Update statuses and record evidence/blockers as work progresses.

## Phase 1 — Project structure

**Delivered:** Existing frontend and backend conventions inspected; missing
message, recipient, notification, settings, media, job, worker, and provider
folders added with `.gitkeep`. Structure and responsibilities documented in
[project-structure.md](project-structure.md). Working source/configuration,
dependencies, and Prisma schema were preserved.

**Acceptance:** Intended paths exist, existing setup is unchanged, documentation
matches the folders, and whitespace checks pass. This phase does not establish
runtime readiness or implement authentication, scheduling, or delivery.

**Known baseline:** Backend scripts refer to an absent `src/server.ts`; Prisma
still has the generic email/password user template. Frontend is an `App.js`
starter without Expo Router, despite its local instructions requiring Router.
No lint script exists; a direct TypeScript check previously failed on React
Native dependency syntax. Resolve relevant tooling issues in Phase 2.

## Phase 2 — Application foundations

**Scope:**

- Add Express app/server entry points, validated environment configuration,
  Prisma connection lifecycle, health/readiness endpoints, consistent responses,
  error handling, request logging, and baseline security middleware.
- Establish usable backend build/check commands and frontend lint/check commands
  appropriate to its JavaScript setup; resolve the baseline validation problems.
- Introduce Expo Router in line with `frontend/AGENTS.md`, preserving SDK 58,
  NativeWind v4, Paper/Safe Area providers, and feature screen organization.
- Establish the shared theme, mobile shell, API client, and environment handling.
  Do not make temporary placeholder routes appear to be implemented features.
- Document local PostgreSQL and app startup. Leave Redis optional at this stage.

**Acceptance:** Backend starts, handles errors, and reports database readiness
correctly. Mobile app starts and renders/navigates with working Paper and
NativeWind styling. Documented checks run successfully; no secrets are tracked.

**Suggested commit groups:** Backend runtime/configuration; frontend routing and
shell; remaining development tooling and setup documentation. Keep configuration
and lockfile changes with the implementation that needs them.

## Phase 3 — Phone login and accounts

**Scope:**

- Replace the generic user schema with normalized phone identities and implement
  OTP challenges, expiration, resend/attempt limits, sessions, logout, and profile.
- Define safe token persistence and refresh/revocation behavior. Protect API
  endpoints and authenticated routes; support login persistence and expiry.
- Add phone entry, OTP verification, and profile UI with loading/error states.
- Use an explicit development OTP adapter until a real provider is configured;
  keep it disabled in production and never report it as real SMS delivery.

**Acceptance:** Phone-only login, session restoration, logout, and profile updates
work. Invalid/expired OTPs, repeated attempts, and unauthorized requests are
rejected. Tests cover authentication boundaries. Migrations and setup are recorded.

**Suggested commit groups:** Account/session schema and migration; auth API and
tests; mobile auth/profile flow with its verification and documentation.

## Phase 4 — Messages, recipients, and media

**Scope:**

- Model message drafts, recipients, occasions, and attachments with migrations.
  Support self, app-user, phone, and email destinations without requiring every
  external recipient to install Dearly.
- Implement draft CRUD, recipient validation, authorized attachment upload/access,
  and message detail APIs. Record who created each message.
- Build compose, recipient selection, media previews, voice recording, draft
  management, and created-message/detail screens.
- Support text, photos, video, audio, and files with explicit size/type limits,
  permission handling, upload progress, and failure recovery.

**Acceptance:** A signed-in user creates, reopens, edits, and deletes their own
drafts with supported attachments and recipients. Other accounts cannot access
them. Media validation and denied-device-permission cases are tested. Drafts do
not accidentally trigger delivery.

**Suggested commit groups:** Message/recipient/attachment schema; draft and storage
APIs with tests; mobile compose/recipient/media flow and documentation.

## Phase 5 — Scheduling and in-app delivery

**Scope:**

- Add durable schedules and per-recipient/channel delivery records. Store UTC
  instants plus IANA timezone; define validation and daylight-saving behavior.
- Implement schedule, edit, reschedule, and cancel operations with clear state
  transitions and protection against races with delivery.
- Implement due-work claiming, workers, bounded retries, and idempotent handling
  across restarts. Choose PostgreSQL-backed work or Redis-backed queues based on
  demonstrated requirements; document the choice.
- Deliver to verified Dearly recipients and populate created, scheduled, sent,
  received, drafts, and failed views with timestamps and meaningful statuses.
- Match an external phone recipient to an account only after phone verification.
  Keep content hidden from recipients until its scheduled delivery time.

**Acceptance:** A due message appears only for its intended recipient. Reschedule
and cancellation work before delivery. Restart, repeated work, retries, and
concurrent workers do not create duplicate in-app messages. Unauthorized/early
access, timezone boundaries, and cancellation races are covered by tests.

**Suggested commit groups:** Scheduling/delivery schema; scheduler/worker and
in-app APIs with reliability tests; mobile scheduling and mailbox flows.

## Phase 6 — WhatsApp, SMS, email, and notifications

**Scope:**

- Verify and select practical providers, preferring free/open-source options
  where suitable; document real quotas, setup, and any unavoidable costs.
- Implement provider adapters for WhatsApp, SMS, and email using the durable
  delivery pipeline. Use secure content links for attachments where appropriate;
  define link expiry and recipient access before exposing content externally.
- Add signature-verified provider callbacks where supported, channel-specific
  failures, retry limits, and deduplication. Distinguish accepted, delivered,
  failed, and opened using actual evidence.
- Add the in-app notification list, push notifications, preferences, and links
  that open the correct message after authentication/access checks.
- Finish account and app settings, including timezone and notification preferences.

**Acceptance:** Each configured channel is exercised with a real test recipient;
provider failure and duplicate-callback tests pass. Notifications open authorized
content. Unconfigured channels report their state honestly. A stub-only channel
stays incomplete, with its provider/credential blocker recorded.

**Suggested commit groups:** Shared delivery/provider configuration; coherent
WhatsApp, SMS, and email adapter changes with tests; notification and settings
integration. Do not make one commit containing all unrelated channel work.

## Phase 7 — Release readiness

**Scope:**

- Verify complete flows on Android and iOS target builds, including media,
  scheduling, background delivery, notification links, and session recovery.
- Review accessibility, loading/empty/error states, permissions, performance,
  privacy, rate limits, upload access, and token/OTP handling.
- Configure CI using the established checks, production environment validation,
  migrations, worker operation, logs/health monitoring, backup/restore procedures,
  and provider failure recovery.
- Prepare reproducible deployment/build instructions, a sample configuration,
  and a release checklist. Deploy/publish only when the user requests it.

**Acceptance:** Required automated checks and documented device smoke tests pass.
All promised delivery channels have real integration evidence or are explicitly
identified as release blockers. Deployment, migration, recovery, and known
limitations are documented. No credentials, user content, or build artifacts are
committed.

**Suggested commit groups:** Focused fixes with regression tests; CI/operations
configuration; release and handover documentation. Keep each commit reviewable.

## Decisions to make during implementation

- Phase 2: local database setup and supported mobile validation commands.
- Phase 3: OTP provider, phone normalization, session lifetime, and recovery.
- Phase 4: attachment storage provider and size/type/retention limits.
- Phase 5: queue mechanism, timezone policy, retry policy, and state transitions.
- Phase 6: real channel providers, secure external links, push provider, and
  whether optional channel fallback is appropriate. Never silently send through
  an additional channel without a defined user preference.
- Phase 7: hosting, operational ownership, and mobile release targets.

Record decisions with rationale as they are made. Do not pick vendors or introduce
credentials merely to fill out the plan. Defer recurring messages, collaborative
capsules, AI generation, payments, and other unrequested features.

## Completion record template

At each phase boundary, update its status and add a concise record here:

```text
Phase:
Status: Not started / In progress / Blocked / Complete
Delivered:
Validation results:
Decisions and configuration:
Known limitations or blockers:
Commits: <actual short IDs and purposes>
Next phase:
```

Follow the root Git workflow: stage explicit related paths, review staged diffs,
commit by purpose in dependency order, and preserve unrelated work. A phase may
need several commits, but neither every file nor the whole project is a useful
default commit boundary. Do not push or rewrite existing history unless requested.
