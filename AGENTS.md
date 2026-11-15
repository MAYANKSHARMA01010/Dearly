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
  `App.js` starter has no Router setup; introduce it deliberately during the
  frontend foundation phase, preserving providers and feature UI in `src/screens/`.
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
- Track delivery per recipient and channel. Distinguish provider acceptance,
  delivery confirmation, and opening; only claim statuses supported by evidence.
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
  hosting is configured. Implement environment selection in the API client phase;
  the backend is started separately with the documented scripts.

## Verification and documentation

- Establish the baseline and use existing scripts where available. For frontend
  implementation, follow the lint/typecheck requirements in `frontend/AGENTS.md`.
  For backend implementation, run relevant build/type checks and focused tests.
- Add meaningful tests for authentication, access control, scheduling, retries,
  and delivery behavior as they are implemented. Exercise affected mobile flows.
- For documentation/placeholder-only work, check links, paths, scope, and
  `git diff --check`; do not install dependencies just to validate Markdown.
- Report exactly what passed, failed, or could not run. Backend entry points and
  checks now exist. Remaining frontend baseline issues for Phase 3: no lint script,
  and the previous direct TypeScript check parsed React Native dependency syntax
  unsuccessfully. Recheck rather than treating them as permanent exceptions.
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
