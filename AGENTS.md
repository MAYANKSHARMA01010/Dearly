# Dearly project instructions

## Scope and context

- Dearly creates private drafts and delivers reviewed messages later through
  in-app, WhatsApp, SMS and Gmail channels. Phone OTP is login; verified email
  linking is a separate profile flow. Preserve the implemented behavior.
- Android APK and backend are the current acceptance/release targets. Do not
  launch iOS, run iOS exports or request APNs acceptance. Preserve existing iOS
  source/configuration and synchronized native metadata for possible future scope.
- Read [the documentation index](docs/README.md), relevant guides and nested
  AGENTS.md files before changes. When present, read `.local-notes/context.md`
  for current state and evidence; update it after meaningful work. Never repeat
  an old reset or infer standing live-send permission from historical tests.
- Work only on the requested scope. Distinguish implemented, verified, deployed,
  released and device-accepted work. A health check/export/fake transport is not
  evidence of phone arrival or a particular installed APK's behavior.

## Inspect and preserve

- Inspect status, diff, recent history and affected source/configuration first.
  Preserve unrelated user changes. Keep only necessary files/directories; avoid
  placeholders in populated folders, speculative dependencies and duplicate roots.
- Preserve actual Expo SDK 58, NativeWind v4, Paper/Safe Area, Babel, Metro,
  Tailwind and global CSS configuration. Do not upgrade incidentally. Frontend
  uses JavaScript/JSDoc, Expo Router in src/app and feature UI in src/screens.
  index.js loads CSS/Router; src/app/_layout.js owns providers/navigation. Never
  reintroduce App.js or a competing navigation container.
- Backend uses TypeScript, Node 22, Express, Prisma/PostgreSQL and Zod. Preserve
  routes → controllers → services; vendor I/O belongs in providers, maintenance
  in jobs, execution in workers, configuration in plural configs.
- Preserve additive migration history. Never reset data, push a schema, rewrite
  applied migrations, migrate/delete objects or rotate durable secrets without
  explicit direction and coordinated recovery/consumer verification.

## UI work

Every user-facing change requires both Impeccable and a focused official Stitch
consultation before editing. Read the global Impeccable skill, run context setup
and load the relevant playbook. Load the applicable Stitch Design skill and obtain
a sanitized proposal for the same scope. Reconcile hierarchy, typography, spacing,
accessibility, states and native conventions with the existing identity. Translate
ideas into React Native; do not paste web markup into native screens.

If either dependency is unavailable, identify it and ask before proceeding with
only one. Continue independent inspection meanwhile. Never upload credentials,
private records/source/screenshots without authorization, enable paid plans or
bypass quotas. Verify rendered behavior and relevant checks, and commit completed
screens coherently when doing screen-by-screen work.

## Configuration and privacy

- Maintain only backend/.env, backend/.env.example, frontend/.env and
  frontend/.env.example as package dotenv files. Private files stay ignored and
  owner-readable. Safe templates own key descriptions; no copied prod/local/WAHA
  or release dotenv variants. Canonical values appear once; HOSTED_ contains
  genuine differences. Follow [setup](docs/setup.md#environment-ownership).
- Use scripts/environment.mjs to select/filter service settings in memory. Never
  send the whole backend file to Render, WAHA, Neon, Actions, builds or logs.
  Platform synchronization is deliberate; a local edit is not a deployment.
  Check the deployed parser before changing legacy aliases. Preserve the explicit
  local-only exclusion list, paired identities and existing link/signing secrets.
- Secrets, sender/device identities and credential-file paths belong in private
  server settings. User-entered contact/message data belongs in authenticated DB
  records. EXPO_PUBLIC values are public. Native signing/Firebase server files
  stay private; Firebase Android client configuration is included in native builds.
- App API selection is hosted-first in development and release. Local port is
  8080; local API is an explicit development override or used when hosted is absent.
  Releases require remote HTTPS. Never fail over/replay an OTP/write after timeout.
- All real recipient links, even local-worker sends, require hosted HTTPS:
  CONTENT_PUBLIC_URL, then BACKEND_SERVER_URL, then legacy EMAIL_PUBLIC_URL.
  Reject loopback/LAN/local hostnames. API/worker/relay/viewer must share DB,
  private storage and access-signing identity. Include the public Releases page
  in email/WhatsApp and the SMS companion page; never imply email is login.
- Logs permit safe IDs/codes/status/timings only. No OTPs, tokens, bodies, private
  links, raw errors/SQL URLs, provider payloads or environment dumps. Check host
  logs privately and report categorical results, never copied sensitive output.

## Access, delivery and media invariants

Follow [architecture/security](docs/architecture.md) and [API workflows](docs/api.md).

- Server ownership/recipient checks are mandatory. Adding recipients grants no
  draft/early file access. Verified phone/email proof is required for inbox claims;
  bind once and never redirect old/recycled destinations. Imported inbox ownership
  survives later profile/link changes. GET/refresh/playback never marks opened.
- Foreground verification must keep navigation/editor state mounted behind a
  blocking privacy curtain. Android-owned pickers/permission activities can report
  background; do not reset the Stack or delete pending files on their return.
  Retained identity is never authorization: block requests/cache reads until
  remote verification succeeds; clear it on revocation/account mismatch.
- OTP dispatch is separate from scheduled messages. Read-only readiness precedes
  code generation/budget reservation. Cold-start polling retries only bounded,
  abortable GETs. Never replay uncertain OTP/refresh POSTs, expose development
  simulation publicly, silently fall back to SMS or fabricate delivery evidence.
- Preserve UTC instants, IANA zones, DST rejection, signed review expiry and
  version/content/media/recipient/consent binding. Use the shared message lock.
  DISPATCHING ends editing/canceling, including during retries. Paused plans need
  explicit review; never bulk-enable them or replay restored work.
- PostgreSQL queues, leases/fencing, unique inbox intents and transactional events
  are authoritative. Redis is optional, never a durable queue. External submission
  markers precede network I/O; unknown/accepted sends are not blindly replayed.
  Keep bounded retry budgets, per-channel outcomes and receipt/content-read evidence
  separate. Never claim exactly-once external delivery or unlimited free sends.
- WAHA uses the dedicated free Core sender; preserve local/hosted sessions
  independently. No incoming messages/history/contact import, unrelated receipt
  collection, logout/reset/relink as repair, or parallel gateways against one store.
  SMSGate uses the intended physical Android/device/SIM, outbound-only signed
  callbacks, matching signing keys and one carrier segment. No public phone API.
- Authenticated due inbox access is required for recipient media. Validate actual
  formats/bytes/hash and bounded ffprobe/PDF work; keep objects private. Scheduled
  attachments freeze until returned to drafts. API/worker must agree on storage.
- Ask before capturing microphone audio or sending any live OTP/SMS/email/push.
  Use specifically designated consenting recipients/counts; previous authorization
  is limited to that check. Automated suites use fake transports/synthetic media.
  Do not access unrelated apps' credentials, sessions or records.
- Request device permissions only at the feature action, explain Not now/Settings
  recovery and honor permanent denial. Login needs none. Use selected-item system
  pickers without broad media/contact grants. Stop recording on background/cancel.
- SQLCipher must be available before private cache writes; no plaintext fallback.
  Scope by account/API origin, bound TTL/disk, invalidate on mutations/auth changes,
  purge keys/copies on logout, and reject stale in-flight results. No offline login,
  authoritative cached schedule decision or offline write queue. Every retained
  media open authorizes online; temporary playback files differ from ciphertext.

## Operations and releases

Follow [operations/recovery](docs/operations.md) and [releases](docs/releases.md).

- Keep production preflight fail-closed, durable private hosted objects and
  ephemeral cache assertions honest. Preserve restore quarantine. Restore only
  authenticated backups into separate empty targets; protect the independent key.
  Never restore stale DB data as code rollback or auto-replay uncertain sends.
- Keep maintenance/monitoring credentials independent, scoped, private and out of
  URLs. Preserve journal UUID idempotency, cross-instance locks, cancellation and
  bounded work. Actions schedules do real maintenance/monitoring, not provider sends.
  User-requested external backend /health/live and WAHA /ping liveness jobs are
  hourly and must not query the DB in those handlers. Do not expand their scope.
- Use only usable free/open-source options; no paid upgrade, trial substitution,
  billing activation or quota bypass. The user excluded Meta Cloud API. Free
  sleeping hosts cannot guarantee exact dispatch/uptime. Report limits honestly.
- MAJOR.MINOR.PATCH: breaking → major, compatible feature → minor, fix → patch.
  Prepare via release tooling, synchronize manifests/native build numbers, check
  exact-source CI/migrations, sign locally, verify signer/native/archive identity,
  deploy exact source and publish immutable matching APK/ZIP/manifest/checksums.
  Never reuse a published version/build or overwrite a tag/asset. RC is not stable.
- A deployed user-facing runtime fix needs its matching signed APK/release unless
  explicitly deferred. Source alone does not update installed APKs. Docs-only
  changes need no version bump/build/deploy. Do not push/deploy unless requested.
- Keep source/main fixed during release coordination; inspect private journals
  before resume. Reconcile uncertain deploy POSTs without blind repetition. No
  public self-hosted signing runner or signing/provider/DB secrets in PR checks.
  Preserve source-pinned local/Linux draft verification and public verification.

## Checks, commits and documentation

- Runtime changes use appropriate focused tests and package npm run check. Native
  API/config changes require matching Expo docs, Doctor, Android export and device
  evidence as appropriate. Do not silence errors or substitute iOS/browser checks
  for Android acceptance. Docs-only work uses links/paths/anchors and diff --check.
- Make coherent Conventional Commits after completed scopes, with explicit staged
  paths/hunks, related tests/lockfiles together and reviewed diffs. No blanket add,
  unrelated files, fabricated results/dates, amend/reset/history rewrite unless asked.
  Respect the user's current main-only branch preference unless scope requires a
  separately authorized branch. Report commit and any unpushed/deferred state.
- Keep docs/ to README.md, setup.md, architecture.md, api.md, operations.md and
  releases.md. Update guides instead of adding phase/fix reports. Swagger owns
  detailed API schemas; env examples own key descriptions. Fresh clones must work
  without local history. Update links/anchors and agent/package references together.
- Dated execution evidence, progress, historical originals and AI continuity live
  in ignored .local-notes/. Never stage/upload it or include it in build/source
  archives. Keep narrative notes free of secrets and private message content.
- Run sh scripts/attention-sound.sh before a blocking question/handoff and final
  reply, as requested. Do not change volume, output device or Focus. Report playback
  failures; command success does not prove the user heard it.

## Local artifact hygiene

- Remove completed temporary build/probe/export/download output after verification;
  keep the latest verified package and small release journals. Check active
  coordinators/builds and configured path references before cleaning runtime areas.
- Check remote asset digests before removing old local release copies. Never
  delete installed dependencies, migrations, tests, signing/Firebase credentials,
  active service/session data or recovery backups as speculative "unused files."
- Historical screenshots/probe scripts/results belong in ignored local notes.
  Keep private file permissions and record what was removed, retained or archived.
