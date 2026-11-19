# Dearly — project instructions

## Product and scope

Dearly lets users create messages now and deliver them later to themselves or
others for any occasion. Support text, photos, video, voice recordings, and files;
recipients may be Dearly users, phone numbers, or email addresses. Login is by
phone number and OTP only. Email is a delivery destination, not a login method.

Users must be able to view messages they created, scheduled, sent, or received,
including content, attachments, recipients, timestamps, and delivery status.
Planned channels are in-app, WhatsApp, SMS, and email. Support drafts and editing,
rescheduling, and canceling messages before delivery.

Read [the 16-phase plan](docs/implementation-phases.md) and
[the structure guide](docs/project-structure.md) before implementation. Consult
[messaging options](docs/messaging-options.md) before provider work; it records
ShopSmart reuse evidence and editable suggestions, not final provider decisions. Work on
the phase or task requested by the user. Finish, verify, document, and commit that
scope before moving on; do not implement all phases in one run. Report completion
and the next phase, then wait for the user to start it. A request for a small task
within a phase does not authorize the entire phase.

## Inspect first and preserve conventions

- Inspect the working tree, relevant source/configuration, package scripts, and
  nested `AGENTS.md` files before editing. Preserve unrelated user changes.
- Keep the existing Expo SDK 58, NativeWind v4, React Native Paper, Safe Area,
  Babel, Metro, Tailwind, and global CSS setup working. Read actual package
  versions; do not upgrade packages or replace configuration incidentally.
- Frontend instructions live in [frontend/AGENTS.md](frontend/AGENTS.md), including
  version-matched Expo documentation and Expo Router requirements. The current
  Router setup uses `index.js` for global CSS and Router registration, with
  providers in `src/app/_layout.js` and feature UI in `src/screens/`. Do not
  reintroduce a second `App.js` root or a separate navigation container.
- Keep frontend JavaScript unless a scoped migration is requested. Backend uses
  TypeScript, Node.js, Express, Prisma, PostgreSQL, and Zod. Preserve the layered
  `routes → controllers → services` pattern and plural `backend/src/configs/`.
- Keep vendor calls in `providers/`, scheduling in `jobs/`, execution in `workers/`,
  and shared code in the existing folders. Redis is optional until required.
- Add only directories and files needed by the current task. Use `.gitkeep` for
  intentionally empty directories; avoid empty implementation files, duplicate
  abstractions, generated native folders, and speculative dependencies.

## Implementation requirements

- Replace the existing generic email/password Prisma template when implementing
  phone authentication. Review schema changes and create traceable migrations;
  never reset a database or rewrite applied migrations without explicit direction.
- Validate requests and enforce ownership/recipient access on the server. Do not
  expose scheduled content to recipients before its delivery time.
- Normalize phone numbers; verify possession through OTP. Limit OTP attempts and
  resends, expire challenges, and keep development OTP behavior out of production.
- Store delivery instants in UTC and retain the user's IANA timezone. Use durable
  schedules, bounded retries, and idempotent delivery handling; do not depend on
  the mobile app staying open or a process-local timer for reliable delivery.
- Phase 10 uses PostgreSQL-backed delivery work, leases/fencing and a separate
  worker. Follow [delivery contracts](docs/delivery-workers.md) and
  [schedule contracts](docs/scheduling.md). Use the shared message lock for
  dispatch/schedule/media mutations, preserve reviewed UTC instants and versions,
  and never bypass the DISPATCHING edit/cancel boundary. Existing paused plans
  require a new explicit review; do not bulk-enable them. Inbox/attachment access
  requires a committed recipient-owned delivery. PHONE bindings must never redirect
  a recycled number to a replacement account. Phase 12 enables explicitly reviewed
  EMAIL destinations through configured Gmail SMTP. Phase 13 enables explicitly
  chosen PHONE/WHATSAPP destinations through the configured free WAHA Core sender;
  SMS is enabled separately in Phase 14. Follow [WhatsApp contracts](docs/whatsapp-delivery.md) for
  sender pairing/readiness, scoped HMAC receipts and separate notification/content
  read evidence. Keep gateway credentials and session volumes private, ignore unrelated
  personal-account receipts, and never reset or relink another application's session.
  Follow [email contracts](docs/email-delivery.md): durable submission markers,
  no automatic resending after uncertainty, private expiring/revocable bearer links,
  and acceptance distinct from confirmed delivery. Live self-tests were explicitly
  authorized on 19 November 2026; this is not standing permission for arbitrary
  future test messages. Automated suites must use fake transports. Real login OTP
  now uses `AUTH_MODE=whatsapp` and the separate immediate auth adapter/budget;
  simulation remains explicitly local and never falls back from real auth.
- Phase 11 mailbox rules are in [mailbox contracts](docs/mailboxes.md). Keep counts
  and list/detail projections scoped to the current owner or delivered inbox user.
  Preserve partial outcomes and explicit opened choices; GET/refresh/media viewing
  must never create an opened receipt. Record activity inside the same transaction
  as each mutation, with no fabricated pre-tracking history or private payloads.
- Phase 14 selects free SMSGate using the user's physical Android/SIM. Follow
  [SMS contracts](docs/sms-delivery.md): one carrier segment per private-link
  notification, explicit review-bound SMS consent, separate sender budget, scoped
  signed outbound-only callbacks and no blind replay of uncertainty. Distinguish
  queue acceptance, carrier submission, single-part delivery and content opening.
  Keep SMS disabled until the intended phone/private credentials are configured.
  Do not launch an emulator, expose phone APIs publicly, subscribe to incoming SMS,
  copy ShopSmart credentials, or send to undesignated recipients. Real phone arrival
  is required before marking Phase 14 complete; WhatsApp login OTP stays separate.
  Phase 14 physical acceptance passed on 19 November: user-confirmed arrival, signed
  single-part sent/delivered receipts and revoked-test-link rejection. The current
  iQOO sender uses SIM 1. Temporary callback tunneling exposes only port 8082;
  hosted content/backend URLs remain release work.
- Track delivery per recipient and channel. Distinguish provider acceptance,
  delivery confirmation, and opening; only claim statuses supported by evidence.
- Phase 8 uses private filesystem attachments with owner-only APIs, bounded
  reservations and an explicit cleanup job. Follow [attachment contracts](docs/attachments.md);
  keep objects out of public/static serving and require persistent storage when hosted.
  Media validation needs ffprobe. Pass the full Expo recording preset when overriding
  a recording filename; filename-only preparation can silently change the container.
  Use synthetic media for checks and ask before capturing the user’s microphone.
- Validate media type/size and authorize attachment access. Keep message content,
  OTPs, tokens, and credentials out of logs.
- Suggest only services with a usable free plan or open-source tools that are
  free to use. Exclude paid-only tools, paid upgrades, and temporary trials as
  recommendations. The user explicitly skipped Meta/WhatsApp Cloud API because
  setup takes too long; do not suggest or plan that integration unless asked.
  Verify free-tier capabilities, limits, licensing, and infrastructure costs. Stop
  or report quota exhaustion instead of automatically upgrading or enabling billing.
  Do not promise unlimited free SMS/WhatsApp/email or label a stub as real delivery.
- ShopSmart is a read-only implementation reference at
  `/Users/mayanksharma/Downloads/New_Projects/shopsmart`: WAHA for WhatsApp,
  SMSGate/InfiniReach for SMS, and Nodemailer/SMTP for email. Adapt patterns to
  Dearly's versions and architecture; do not copy credentials, sessions, personal
  data, branding, or its email JSON fallback as successful delivery. Do not run
  its live messaging tests during inspection. Provider proposals remain open for
  user review; no automatic provider replacement or live test sends.
- Record provider IDs and accepted/rejected/unknown outcomes. A submission timeout
  can occur after actual sending; use supported idempotency/reconciliation and
  document uncertainty rather than promising exactly-once external delivery.
- Keep immediate OTP dispatch separate from scheduled messages. Real OTP dispatch
  must be verified before public login is released even if local development uses
  an explicit development adapter.
- Keep secrets out of Git and client-visible environment variables. Document
  required configuration with safe `.env.example` values.
- Use the supplied Neon PostgreSQL connection through `backend/.env` only; never
  copy its credentials into documentation, commits, logs, or frontend variables.
  The local backend port is `8080`. Frontend `EXPO_PUBLIC_API_URL` is the local
  URL (`http://localhost:8080`); `EXPO_PUBLIC_SERVER_API_URL` stays empty until
  hosting is configured. The API client selects the local URL for development
  and requires a remote HTTPS hosted URL for release builds;
  the backend is started separately with the documented scripts.

## Verification and documentation

- The user requests an audible alert when work finishes or needs their input,
  because Do Not Disturb can hide banners. Run `sh scripts/attention-sound.sh`
  before asking a blocking question/handoff and before the final reply. Do not
  change system volume, output device or Focus settings. Report sound failures;
  do not claim the user heard a sound just because playback returned successfully.

- Use a single iOS simulator: iPhone 18 Pro Max if installed; otherwise iPhone
  17 Pro Max. Do not create additional iPhone or iPad targets for routine work.
  Keep one suitable Android phone emulator for Android checks, and leave it
  stopped unless Android verification is needed. Default interactive development
  runs the iOS app and backend; do not launch Android automatically. Simulator
  resets erase local device data and are performed when requested, not on every
  startup. This preference supersedes earlier multi-device QA habits.
- Establish the baseline and use existing scripts where available. For frontend
  implementation, follow the lint/typecheck requirements in `frontend/AGENTS.md`.
  For backend implementation, run relevant build/type checks and focused tests.
- Add meaningful tests for authentication, access control, scheduling, retries,
  and delivery behavior as they are implemented. Exercise affected mobile flows.
- For documentation/placeholder-only work, check links, paths, scope, and
  `git diff --check`; do not install dependencies just to validate Markdown.
- Report exactly what passed, failed, or could not run. Both packages now have
  `npm run check`. Frontend checking uses strict JSDoc/JavaScript with Expo's base
  configuration and `maxNodeModuleJsDepth: 0`: check application source against
  dependency declarations, not vendor runtime JavaScript. Do not suppress app
  errors to make checks pass. Use `npx expo-doctor` and platform exports for
  dependency/bundling changes; record native-device verification separately.
- Keep the phase plan current. Mark a phase complete only when its acceptance
  checks pass; record unresolved blockers instead of claiming success.
- At a phase boundary, report delivered behavior, validation, limitations,
  commits, and the next phase. Do not push or deploy unless requested.

## Professional Git workflow

The user wants understandable history with focused commits after each phase.
Create commits for completed work within the requested scope; split a phase into
coherent changes when that improves review. Do not save an entire phase as one
unrelated bundle, and do not split every file into a separate commit.

1. Inspect `git status`, the diff, and recent history first.
2. Group changes by purpose, for example database model/migration, backend API,
   frontend flow, and supporting documentation. Keep tightly coupled changes
   together so each commit is coherent. Keep lockfiles with dependency changes
   and tests with the behavior they validate.
3. Stage explicit paths or selected hunks. Avoid blanket `git add .` / `git add -A`.
   Never include unrelated work, secrets, build output, logs, or dependencies.
4. Review the staged diff and run checks appropriate to that commit.
5. Use concise imperative Conventional Commit subjects:
   `feat(auth): add phone OTP verification`,
   `fix(delivery): prevent duplicate retry sends`,
   `docs(plan): define implementation phases`,
   `chore(frontend): configure lint checks`.
   Add a body when motivation, migrations, or tradeoffs need explanation.
6. Commit in dependency order. Do not amend, squash, reset, or rewrite existing
   history unless requested. Do not fabricate tests, authorship, or commit dates.
7. Verify the resulting status and report commit IDs with their purpose. If a
   check or commit is blocked, explain it and leave the affected work visible.
