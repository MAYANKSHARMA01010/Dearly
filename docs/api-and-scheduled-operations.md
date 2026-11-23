# API reference and scheduled operations — Phase 23

## API reference

`GET /api/docs` serves self-hosted Swagger UI; `GET /api/openapi.json` returns the
OpenAPI 3.1.1 schema. These are public references containing synthetic examples,
relative server paths and no private settings or records. Normal API authentication,
ownership and state checks remain in force. The reference does not query accounts
or providers merely to render a page. It documents feature APIs, including private
media access, verified-email linking and signed provider callbacks; static Swagger
assets are explicitly allowlisted rather than treated as application APIs.

Request schemas derive from existing Zod validators in **input** mode, retaining
phone/country and pre-transform fields. Cross-field, ownership, timezone and budget
refinements cannot all be expressed in JSON Schema; runtime validation remains
mandatory. Responses describe public projections, never Prisma rows or storage
paths. Opaque pagination cursors must be reused with the same filters.

Execution HTTP verbs are disabled with `supportedSubmitMethods: []` and
`tryItOutEnabled: false`. External validation and query-string configuration are
disabled; authorization is not persisted. Scripts/styles are served locally with
CSP, no CDN or remote validator. This is documentation, not a provider-send console.
See [Swagger configuration](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/),
[OpenAPI](https://spec.openapis.org/oas/v3.1.1.html) and
[Zod JSON Schema](https://zod.dev/json-schema).

## Inventory and boundaries

Existing CLI jobs remain available for attachment cleanup, WhatsApp/SMS receipt
retention, delivery/push workers, sender status and backup/restore. Phase 23 adds a
bounded combined cleanup entrypoint and independent read-only service checks.
It does not replace durable delivery workers, retry messages, pair/reset/logout
WAHA, subscribe to incoming SMS, send test notifications or turn Redis into a queue.

Automatic backups are deliberately **not scheduled**: the existing backup tool
requires writers stopped, an independent encryption key and a verified durable
backup destination. Render disk is temporary; uploading private database backups
to public Actions artifacts is unacceptable. Keep the documented manual backup /
restore process until those prerequisites are supplied and verified.

## Credentials and private configuration

- `OPERATIONS_TOKEN`: independent random 32-byte lowercase hex credential for
  `POST /internal/operations/maintenance` only.
- `MONITORING_TOKEN`: a different random credential for
  `GET /internal/operations/status` only. It cannot perform cleanup.
- Missing configuration disables the corresponding endpoint. User access tokens,
  OTP peppers, provider keys, signing keys and link secrets are never substitutes.
  Credentials are checked in constant time after format validation, never accepted
  in URL queries and never logged. Tokens must differ.
- Keep the values in local `backend/.env`, Render private environment settings and
  same-named GitHub Actions repository secrets. Examples contain only instructions.
  `OPERATIONS_ENABLED=true` is a non-secret repository variable, set only after
  the correct migration, deployment and both credentials have been checked.
- Disable the repository variable and remove the endpoint token to revoke a job.
  Rotate one dedicated token across its two consumers; unrelated provider/session
  secrets are unaffected. The reference exposes token **names**, never values.

Browser activation creates new limited access from Actions to Render; it requires
confirmation before those credentials are installed. Endpoints remain disabled
until configured. No third-party monitoring account or paid plan is needed.

## Maintenance execution and recovery

A POST requires an empty JSON body and a UUID `X-Operations-Run`. The UUID is a
journal/idempotency key; reusing it returns the existing record without repeating
work, including FAILED/RUNNING/INTERRUPTED records. A timeout is uncertain: inspect
the protected journal/status, never blindly retry the POST.

A dedicated PostgreSQL transaction holds `pg_try_advisory_xact_lock(582823)` across
instances. The pinned transaction is compatible with transaction pooling; a
session-level advisory lock is not used. Lost lock connections cancel further
work. Another active batch returns 409. Process-local throttles supplement the
cross-instance lock and never provide durable scheduling.

A batch checks cancellation between operations, stops starting work after its
30-second deadline and applies a 10-second bound to object-store list/delete
requests. In-flight operations may finish after cancellation; existing DB/network
bounds and the lock transaction's 60-second idle limit remain the outer safeguards.
Cleanup is not one atomic transaction: completed safe deletions are not rolled back.

Each batch handles at most 10 stale/unreferenced attachment rows and 10 old orphan
objects, preserving existing upload lease checks and READY references. Object-store
inventory already caps pagination at 100 pages, now with per-request cancellation /
timeout. Receipt cleanup selects at most 100 expired rows per provider and rechecks
expiry when deleting. It never deletes delivery records or replays uncertain sends.
At most 100 finished journal records older than 30 days are removed per batch.

`operations_runs` stores only UUID, state, timestamps and numeric cleanup counts.
No message text, phone/email, provider payload, storage path or exception is stored.
States are RUNNING, SUCCEEDED, FAILED and INTERRUPTED. Under the cross-instance lock,
a later batch marks abandoned RUNNING records older than 60 seconds INTERRUPTED.
Failures remain visible; a new scheduled run with a new UUID processes remaining
safe work. There is no unbounded catch-up loop.

## Separate monitoring and alerts

The protected status endpoint evaluates database / delivery-worker health and
WAHA sender readiness independently. Queue diagnostics include enabled delivery
work overdue by more than one hour, expired leases and pending push counts, never
message identifiers or content. Overdue enabled work marks the queue unhealthy;
counts are observed snapshots, not delivery guarantees. WAHA uses a bounded 65-second read-only check
because a free instance may be sleeping. Neither check sends a code or mutates a
sender session. Its output contains only categorical statuses and the sanitized
latest maintenance record. No database credentials or gateway response bodies are
returned. Monitoring does not claim phone delivery or exact-time dispatch.

`Dearly scheduled operations` runs on the public repository's standard Ubuntu
runner, with read-only repository permissions and no signing/provider credentials.
It has a five-minute job timeout and one workflow concurrency group without
canceling active jobs. Forks, pull requests, alternate branches and an unset/false
activation variable cannot run production operations.

UTC schedules:

| Schedule | Work |
| --- | --- |
| `17 * * * *` | One bounded maintenance batch each hour at minute 17 |
| `43 */6 * * *` | Backend and WAHA checks every six hours at minute 43 |

Manual dispatch accepts maintenance, monitor or both. The client gives requests a
180-second timeout (including a cold API wake), refuses redirects/non-HTTPS URLs,
performs one POST and prints only constructed categorical results or fixed error
codes. Raw response/error bodies are never printed. A failed job is an alert in
Actions with a sanitized summary; enable Actions failure notifications in your
GitHub account to receive GitHub's alerts. No external email/SMS alert is sent.

Standard hosted runners for a public repository are
[free](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
[Scheduled Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
can be delayed or dropped and may disable after 60 days of repository inactivity.
Missed maintenance is handled by the next bounded batch; it is not an exact-time
scheduler. [Render Free](https://render.com/docs/free) sleeps after inactivity;
these jobs perform actual maintenance / occasional monitoring and are not frequent
keepalive pings. No paid Render cron service or quota-bypass workflow is used.

## Acceptance

Local tests cover full route inventory, OpenAPI validation, public reference safety,
independent credential scopes, input rejection, immutable run IDs, bounded batches,
safe failure records, sanitized scheduler output and no POST retry. Isolated real
PostgreSQL tests cover cross-connection lock contention, migrations, orphan cleanup,
failed-run replay prevention and interrupted-run recovery. Hosted activation and
observed workflow outcomes are recorded in the dated phase closeout after execution.

## Hosted activation — 22 November 2026

Version 1.5.0 is Live on release source `e8fb6b3`. The independent scoped secrets
are installed privately and `OPERATIONS_ENABLED=true` is set in GitHub Actions.
[First combined run](https://github.com/MAYANKSHARMA01010/Dearly/actions/runs/44987240246)
completed successfully: maintenance succeeded, backend ready and WAHA ready.
Unauthenticated monitoring and maintenance attempted with the monitoring key both
returned 401. See the [current project documentation](README.md)
for CI, deployment, signed APK and release evidence. No provider message was sent.
