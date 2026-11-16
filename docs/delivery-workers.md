# Durable in-app delivery (Phase 10)

Phase 10 implements a PostgreSQL-backed queue and a **separate worker process**.
It uses the existing Prisma/PostgreSQL stack and private filesystem adapter;
Redis, a paid queue, and external delivery services are not required. SMS,
WhatsApp and email remain unavailable. Authentication still uses local development
OTP simulation and is not ready for public release.

## Enablement and state boundary

New confirmations explicitly enable in-app delivery. Existing Phase 9 plans have
`deliveryEnabled=false` after migration: their confirmation promised no delivery,
so they remain paused until the owner reschedules and confirms a new review.
Editing text alone does not activate a paused plan. The mobile detail identifies
paused plans. A new review shows that confirmation enables delivery and warns if
the worker heartbeat is offline.

The message progresses from SCHEDULED → DISPATCHING → DELIVERED,
PARTIALLY_DELIVERED or FAILED. Editing/rescheduling/cancellation is allowed only
while SCHEDULED. The claim transaction locks the authoritative message row and
changes it to DISPATCHING, incrementing its version once and clearing old review
retry metadata. That commit is the boundary: cancellation first makes the work
obsolete; claim first prevents cancellation. A failed or retrying dispatch cannot
return to drafts. CANCELED → DRAFT remains available before dispatch.

DELIVERED means a private inbox record was committed for every intended in-app
recipient. PARTIALLY_DELIVERED means at least one succeeded and another failed.
FAILED means no recipient received a record. These states never mean provider
acceptance, device notification, reading or opening. Failed work retains safe
reason codes and per-intent attempt records; successful recipients are retained
when an operator retries remaining failures.

## Running locally

Apply the additive migration and build from `backend/`:

```sh
npm run prisma:deploy
npm run build
npm run dev
```

In a separate terminal, with the same working directory and private environment:

```sh
npm run delivery:worker
```

For a compiled worker use `node dist/workers/runDeliveryWorker.js`. Keep the API and
worker on the same private persistent storage volume and database. No worker starts
inside Express. Stopping the mobile app or API does not discard durable schedules;
the worker can deliver independently. If the worker stops, a restarted instance
catches up due schedules. The local poll interval is 15 seconds, so delivery can
occur after the requested instant; this is not a hard real-time deadline.

Stop the worker with Ctrl+C / SIGTERM. It stops claiming, completes its current
bounded operation, records a stopped heartbeat and disconnects. An abrupt crash
leaves a lease that another instance can reclaim. Use a supervisor to restart
crashed workers when hosted. No hosting, supervisor or paid account is configured
by this phase. Polling and retained records consume existing database compute and
storage quotas; the open-source worker does not imply unlimited free hosting. Stop
local workers when not developing. Never automatically enable billing or upgrades.

## Queue and retry semantics

- Each scan reads up to 100 enabled due SCHEDULED messages, using PostgreSQL time.
  It inserts work with a unique `(messageId, scheduleVersion)` identity. Scans are
  idempotent; missed scans catch up instead of relying on process-local timers.
- A worker examines up to 20 ready or expired candidates. It acquires the same
  schema-aware message lock used by schedule changes, then conditionally claims
  the work row. Concurrent workers cannot claim the same lease. It rechecks due
  time, enabled state and version before crossing the dispatch boundary.
- Each claim has a random fencing token and a 60-second lease. Token and lease
  are checked before inbox writes and again before commit using database time.
  A late or replaced worker cannot commit its result. STARTED attempts from a
  crashed claimant become ABANDONED on reclaim.
- Attachment readiness, exact bytes and SHA-256 are checked outside the database
  transaction with bounded streaming and a 20-second deadline. The final
  transaction rechecks metadata and recipient identities, then commits inbox
  rows, attempt outcomes and aggregate message/work state together. Database
  transactions have 15-second execution and acquisition bounds. No external
  provider calls or slow media reads hold a transaction open.
- An intent has at most one inbox record, enforced by a unique constraint. Completed
  recipients are skipped on operator recovery. Per-recipient/channel attempts have
  a unique `(workId, intentId, number)` identity and safe status/error codes.
- Transient storage/internal failures use five attempts, with delays of 5 seconds,
  30 seconds, 2 minutes and 10 minutes. Once exhausted, the work becomes FAILED.
  An unavailable/deleted recipient is a permanent per-intent failure, without
  falsely marking other successful recipients failed. Nothing retries forever.
- A stale schedule version/canceled plan becomes OBSOLETE. New content/time versions
  obtain a different job identity; old jobs never override their current schedule.

The row-lock/conditional-update approach relies on PostgreSQL's documented
[locking](https://www.postgresql.org/docs/current/explicit-locking.html) and
[Read Committed update semantics](https://www.postgresql.org/docs/current/transaction-iso.html).
Prisma queries qualify the configured schema, including disposable test schemas;
raw table queries must not assume the public search path through pooled Neon.

## Verified phone matching

SELF and USER recipients must reference an existing verified account. A PHONE
recipient may choose IN_APP only if its normalized E.164 phone currently belongs
to a verified Dearly account. The resolved binding is included in the signed review
fingerprint and saved on confirmation. Resolving PHONE does not enable SMS or
WhatsApp and does not disclose the matched account ID in the phone recipient API.
Duplicate destinations resolving to the same account are rejected for in-app
scheduling; remove an alias before review.

At delivery, the bound account must still exist, be verified, and (for PHONE)
still own that exact phone. A newly registered account with a recycled number
cannot receive the old message. Failure does not silently reassign the destination.
No phone/email-based account discovery endpoint is introduced.

## Inbox API and attachment access

All `/messages/inbox` routes require an authenticated session and return the usual
success/error envelope with private/no-store caching:

| Route | Result |
| --- | --- |
| GET `/messages/inbox?limit=20&cursor=…` | Delivered summaries for this user only; default 20/max 50, newest first |
| GET `/messages/inbox/:id` | Delivered text, subject, occasion, instant/timezone and ready attachment metadata |
| GET `/messages/inbox/:id/attachments/:attachmentId/content` | Authorized streamed/range file content |

Use an inbox record ID, not a message ID. A guessed ID, another recipient's inbox
record or an attachment belonging to a different message returns 404. There is no
inbox record before delivery, and reads additionally check delivery/due times
against database time. Responses omit other recipients, sender phone details,
storage paths, claim tokens and review proofs. Existing draft/media routes remain
owner-only; adding a recipient never grants early attachment access. Media reads
do not expose a public URL. Deleting an account/message through administrative
retention operations follows the schema cascades; permanent inbox history and
independent account-deletion policy remain later release work.

Phase 11 implements the [mobile mailboxes/dashboard](mailboxes.md), owned activity
and an explicit opened choice. Existing schedule details and filters show worker-
backed outcomes and remove edit/cancel controls after dispatch begins. They refresh explicitly rather than
inferring delivery from the phone's clock.

## Operations and bounded recovery

```sh
npm run delivery:status
npm run delivery:retry -- <work-UUID>
```

Status prints state counts, up to 20 failed work IDs, attempt counts/budgets and
allowlisted reason codes. It never prints message text, recipient identities,
credentials, attachment paths or lease tokens. Retry is an operator-only CLI, not
an unauthenticated HTTP action. Fix the underlying issue first (for example restore
the private file), then explicitly extend a failed work budget by five attempts.
The maximum total budget is 20. Completed/stale/canceled work and mismatched
message versions cannot be retried. Existing successful inbox records are skipped.
No operator recovery reassigns a deleted phone recipient to a new account.

`GET /health/worker` returns 200/running for a non-stopped heartbeat within 90
seconds; otherwise 503/offline (or unavailable without a database). Liveness
`/health` remains independent. Schedule capabilities report supported in-app
background delivery and the current worker status separately. A heartbeat is a
recent process signal, not proof of timely delivery or healthy storage; inspect
failed work and due backlog as part of operations. Logs use bounded event names
and safe codes, never raw exception bodies. Heartbeat/attempt/work retention is
not automated yet; plan an administrative retention policy before public scale.

## Verification

Both packages retain their `npm run check` commands. Opt-in database integration
uses private `AUTH_TEST_DATABASE_URL`, builds the backend first for child-process
checks, creates only random disposable schemas, and removes them afterward.
Delivery tests cover due-time/paused-plan isolation, ownership and file ranges,
cancellation/stale versions, competing claims, expired leases, bounded retries,
operator recovery, verified/recycled/deleted phone recipients, partial outcomes,
and two independent worker processes recovering a crashed claim. Unit tests cover
backoff, inbox validation, protected routes, poll failure recovery and shutdown
draining. Existing authentication, draft, media and schedule tests still run.
