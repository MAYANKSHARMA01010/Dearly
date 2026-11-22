# Dearly — project instructions

## Product and scope

Dearly lets users create messages now and deliver them later to themselves or
others for any occasion. Support text, photos, video, voice recordings, and files;
recipients may be Dearly users, phone numbers, or email addresses. Login is by
phone number and OTP only. Email is a delivery destination, not a login method.

Users must be able to view messages they created, scheduled, sent, or received,
including content, attachments, recipients, timestamps, and delivery status.
Implemented channels are in-app, WhatsApp, SMS, and email; provider acceptance,
phone arrival, and content opening remain separate evidence. Support drafts and editing,
rescheduling, and canceling messages before delivery.

Read the original [Phases 1–16](docs/implementation-phases.md), the current
[Phases 17–24 and acceptance checklist](docs/follow-up-phases.md), and
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

- Preserve the implemented phone-identity and verified-email-linking schema.
  Review schema changes and create traceable additive migrations;
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
  iQOO sender uses SIM 1. Temporary local callback tunneling, when needed, exposes
  only port 8082; hosted recipient links use the configured HTTPS origin.
- Track delivery per recipient and channel. Distinguish provider acceptance,
  delivery confirmation, and opening; only claim statuses supported by evidence.
- Phase 8 uses private filesystem attachments with owner-only APIs, bounded
  reservations and an explicit cleanup job. Follow [attachment contracts](docs/attachments.md);
  keep objects out of public/static serving and require durable private storage when hosted. The hosted deployment uses Neon
  private object storage; Render disk is only a disposable cache.
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
- Load Neon PostgreSQL credentials from the private environment for the selected
  local or hosted runtime; never
  copy its credentials into documentation, commits, logs, or frontend variables.
  The local backend port is `8080`. Frontend `EXPO_PUBLIC_API_URL` is the local
  URL (`http://localhost:8080`); `EXPO_PUBLIC_SERVER_API_URL` is now
  `https://dearly-z8zm.onrender.com` for hosted release builds. The API client prefers the hosted URL in development too; local is a secondary
  development configuration or an explicit local override. Releases require
  a remote HTTPS hosted URL;
  the backend is started separately with the documented scripts.

## Phase 15 notification boundaries

- Follow [notification contracts](docs/notifications-settings.md). Notifications,
  read state and preferences remain account-owned. Generic push data contains only
  a notification UUID; resolve it after login through the authenticated API. No
  private content appears on lock screens or in push logs. Opt-out never silently
  cancels schedules. Saved schedules retain reviewed channels; no automatic fallback.
- Device tokens belong to sessions. Check revocation/expiry and current account
  association before dispatch; stale receipts must not disable rotated tokens.
  Durable push jobs persist before sending; uncertain POSTs are not replayed.
- Local Android preview builds must produce APK, use private local signing, and
  exclude credentials/backend data from archives. Preserve working SDK 58 patches.
  Targeted SDK 58 patch alignment was verified in Phase 16; do not incidentally
  upgrade major versions or replace styling/navigation setup. Never claim real
  push/native acceptance from exports or fake transports. Hosted backend configuration and free-service limits are recorded in
  [Render deployment](docs/render-deployment.md).

## Phase 16 operations boundaries

- Follow [release operations](docs/release-operations.md) and the dated
  [verification record](docs/release-verification.md). The user requested all
  remaining implementation, then explicitly deferred APK/physical-device testing.
  Complete non-device work without repeating device prompts. Do not mark real
  push/native or hosted acceptance as passed from build/export evidence.
- Production entrypoints run strict preflight; preserve fail-closed configuration,
  persistent private storage and session/provider boundaries. Keep local port 8080
  and hosted URLs separate. Do not publish or deploy without authorization.
- Restore only authenticated backups into separate empty targets. Keep restore
  quarantine, revoke restored access, pause pending work and reconcile quotas and
  uncertain submissions before any manual release. Never auto-replay restored work,
  clean a live DB, rewrite migrations or log database-tool stderr/credentials.
- Keep the independent backup key, signing files, real production environments
  and archives private. CI uses disposable databases and fake transports, never
  live provider sends. Preserve unrelated local Git changes.

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

## Recipient links and semantic releases

- Real email, WhatsApp and SMS notifications must use the reachable hosted HTTPS
  content origin, including when dispatched by the local worker. Never send a
  localhost, loopback, LAN IP or local hostname to a recipient. Keep the app's
  development API URL separate from outgoing notification URLs. Prefer explicit
  CONTENT_PUBLIC_URL, then BACKEND_SERVER_URL, then the legacy EMAIL_PUBLIC_URL.
  The hosted viewer must share the same database, access-signing key and private
  storage as the dispatching worker. Do not rewrite or resend old deliveries.
- Include the public Dearly GitHub Releases download page in email and WhatsApp,
  and on the secure viewer reached from SMS. Preserve the single-segment SMS
  limit. Use accurate phone-number verification instructions. Never claim email
  login: email verification links a destination to the existing phone account.
  Follow docs/verified-recipients.md for proof, inbox matching and immutable
  recipient binding. Never trust an unverified profile email. Never imply an RC is stable.
- Use MAJOR.MINOR.PATCH (x.x.x): PATCH for compatible fixes, MINOR for compatible
  features, MAJOR for breaking changes. Before each actual release, use
  `node scripts/release.mjs prepare X.Y.Z` to synchronize VERSION, both package
  manifests/lockfiles and Expo version, and increment Android/iOS build numbers.
  Validate with `node scripts/release.mjs check`; publish matching `vX.Y.Z` tags
  or explicitly marked `vX.Y.Z-rc.N` prereleases. Never overwrite published assets
  or reuse a native build number. Build from the release commit, verify APK
  identity/signature, package/checksum the assets with the existing release tool,
  and record hosted deployment and device acceptance separately. A source commit
  alone does not mean a new APK or deployment exists. Do not bump versions on
  every development commit or label untested artifacts stable.

- Profile email verification is a separate authenticated flow. Use Gmail for email
  codes and WhatsApp first for phone login codes. Codes expire in five minutes,
  allow at most five attempts and require durable resend/sender limits. Saving a
  changed email clears its verification and pending codes. Never expose codes in
  logs or reuse phone OTP challenges for email. Restore consumes email challenges.
- Received may include due external phone/email deliveries only after a verified
  destination is matched and an account-owned inbox row is committed. Never
  redirect an already bound recipient, reveal undelivered content, or mark a
  refresh as opened. Explicit app opening updates content-read evidence separately
  from carrier/provider delivery evidence.

## Required closeout for deployed fixes

- A user-visible runtime fix is not finished when only committed or deployed.
  Unless the user explicitly defers the release, prepare the appropriate
  MAJOR.MINOR.PATCH increase, increment native build numbers, build and verify
  the signed APK, deploy the matching server code, then publish the matching
  GitHub release with APK/source ZIP/manifest/checksums and provide its link.
  Include all completed local fixes, including navigation corrections. Never end
  a deployment task with an older downloadable APK missing the fix.
- Main-branch runtime pushes must pass `scripts/release.mjs check-deploy BASE_SHA`;
  CI rejects a runtime deployment whose VERSION did not increase. Keep tests/docs
  commits scoped and do not mutate existing release tags or assets.
- Real OTP acceptance requires evidence beyond API liveness and fake tests. Check
  hosted sender readiness, request one specifically authorized real test, and
  distinguish gateway acceptance from arrival on the phone. If that permission or
  phone confirmation is pending, state it rather than calling OTP verified.
- Phone login must check read-only gateway readiness before generating an OTP or
  consuming cooldown/sender budgets. Cold-start polling may retry only GET status
  checks, never OTP POSTs. Keep the wait bounded, abortable and visible to the user.
  No silent SMS fallback, synthetic code or credential/session reset is permitted.

- User API preference: hosted backend first in development and release builds.
  Development may use the configured local URL only when the hosted URL is absent
  or EXPO_PUBLIC_API_TARGET=local is deliberately selected. Releases require hosted
  HTTPS. Never fail over an OTP/write after a network timeout: keep each request
  on one backend so accounts, challenges and submissions cannot silently split.
- Version gating compares the most recent reachable published release tag and
  forbids source-version regression. Iteration on an unpublished version is
  permitted until its release is published; a published version cannot be reused.

## Follow-up work: Phases 17–24

- Work only on the requested phase in [the follow-up plan](docs/follow-up-phases.md).
  Its checklist is the current completion index; dated verification records are
  evidence, not a claim that every later release passed every historical check.
- Distinguish implemented, verified, deployed, released and device-accepted work.
  Record exact commit/version, date, check and limitation. A health response does
  not prove phone delivery, and a platform export does not prove native behavior.
- Every UI change requires both Impeccable context/relevant playbook and a focused
  Stitch proposal before editing. Use synthetic briefs; preserve native patterns
  and Dearly's design system. If either is unavailable, report it and ask before
  doing UI edits with only one. Verify rendered states, not only source checks.
- Keep backend configuration credentials and operational sender/test identities
  private. User phone/email records remain authenticated database data, not global
  environment settings. EXPO_PUBLIC variables are public build configuration.
  Keep safe examples aligned with environment validation; never copy private values
  into examples, logs, documentation, CI output or release assets. Check Render
  privately and report variable names/status only. Credential replacement needs a
  coordinated rollout; do not regenerate signing/access keys casually.
- Phase 20 implements encrypted native SQLite snapshot storage; follow
  [mobile cache contracts](docs/mobile-cache.md). Phase 21 connects bounded
  reads/refresh/invalidation; follow
  [synchronization contracts](docs/mobile-synchronization.md). Persistent mobile
  media follows [persistent media contracts](docs/persistent-media.md) in Phase 22. Neon remains
  authoritative for access, schedules and delivery. Never
  cache OTP/auth decisions or schedule confirmation as authoritative. Define TTL,
  account isolation, logout purge, encryption/key handling and offline revocation
  limits before persisting private content. Redis must not become a durable queue.
- Phase 23 API reference and scheduled operations follow
  [the operations runbook](docs/api-and-scheduled-operations.md). Keep Swagger
  read-only, self-hosted and free of private data. Test route inventory and validator
  input contracts whenever routes change. Maintenance/monitor credentials are
  independent from user/provider credentials; never log them or accept them in URLs.
  Preserve cross-instance transaction locks, immutable run IDs, cancellation,
  bounded batches and sanitized outcomes. Actions schedules do real work, not
  keepalive traffic; missing activation/configuration must fail closed.
- Scheduled maintenance and service monitoring must be bounded and non-overlapping.
  On 22 November 2026, the user explicitly requested two cron-job.org liveness
  jobs, later reduced to once an hour to conserve the shared Render allowance:
  backend `/health/live` and WAHA `/ping`. These GETs
  must not query the database or carry credentials. See the deployment runbook
  for job IDs and limits. This scoped request supersedes the earlier no-keepalive
  preference; do not expand it to DB readiness or provider actions. Never bypass
  hosting quotas or promise exact delivery/continuous uptime on free services.
  Do not create paid Render cron services. Never
  schedule WAHA logout/reset/relink or automatic replay of uncertain submissions.
- Phase 24 coordinates release proposals, trusted local signing, exact-commit
  Render deployment and immutable publication; follow [the pipeline](docs/release-pipeline.md).
  Use `scripts/release/prepare.mjs` for semantic proposals and the explicit local
  coordinator for run/resume. No public-repository self-hosted runner is permitted.
  The Mac being offline leaves publication pending. Keep deployment identity and
  migration checksum gates, signer continuity, private journals, no repeated uncertain
  deployment POSTs and separate physical acceptance. Protect signing credentials and restrict signing runners to trusted
  release jobs; untrusted pull requests must never receive secrets or runner access.
- Documentation-only work needs link/path/whitespace checks and focused commits,
  not a version bump, rebuild, deployment or release. Runtime deployment closeout
  above still applies when runtime behavior changes. Do not mark a later phase
  done merely because its rules are documented here.


## Phase 24 release controls

- Keep source and remote main unchanged while a release coordinator runs. Add
  closing documentation after completion; documentation-only commits do not need
  another APK or deployment. Record release-source SHA separately from later docs.
- Linux draft verification must pass before publication. Only the trusted main-only
  manual draft-check job has contents-write access to read unpublished assets;
  public verification stays read-only. Never broaden this to pull requests/forks,
  persist its checkout token or give it signing/provider/DB/Render credentials.
- Verify source archive contents against the matching release checkout, independently
  of compression; never restore byte-identical compressed-ZIP comparisons. Never
  overwrite a failed published release to hide its failure: flag it and issue a
  properly versioned correction, preserving unique native build numbers.
- Phone OS permission, account Push alerts preference and device registration are
  separate requirements. Enable them through the authorized feature flow and
  distinguish gateway acceptance from observed arrival. A test-send permission is
  limited to its stated recipient/count; do not replay or send another automatically.

## Single-source environment configuration

- Maintain exactly `backend/.env`, `backend/.env.example`, `frontend/.env` and
  `frontend/.env.example` as the package dotenv files. Do not add production,
  local, WAHA, release or provider dotenv variants. Private files stay ignored
  and owner-readable only. The examples document every supported setting safely.
- Backend unprefixed settings are local; `HOSTED_` is an explicit complete hosted
  profile. Separate WAHA and Gmail profiles use the prefixes documented in
  `docs/environment-setup.md`. Never fall back to local provider credentials in
  production, merge paired senders or pass the whole backend file to a service.
- Use `scripts/environment.mjs` to select service settings in memory. Hosted
  platform settings still need deliberate synchronization; a local edit is not
  a deployment. No raw environment dumps in logs, screenshots or tool output.
- Deployment-specific URLs, sender credentials and build/project identity belong
  in the appropriate environment. Never put backend secrets in frontend config,
  EXPO_PUBLIC values, EAS profiles or APK assets. User-entered account/message data
  belongs in the authenticated database, not the environment. Fixed vendor origins,
  protocol identifiers, security bounds and test fixtures may remain in code.
- Preserve native signing/Firebase credential-file formats; they are not dotenv
  files and must not be pasted into env values. Tests use synthetic settings.
  Run environment isolation tests alongside package checks after configuration changes.
