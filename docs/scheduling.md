# Scheduling and cancellation

Phase 9 saves private delivery plans. **Automatic delivery is not running.**
No queue, worker, provider call, recipient inbox access or external send is enabled.
Phase 10 will claim due messages and implement in-app delivery. Phone login still
uses the explicit development OTP adapter; public authentication is unavailable.

## Mobile flow

Save a draft and finish or remove pending uploads. Choose **Schedule this draft**,
enter a calendar date, 24-hour time and IANA timezone, and select an in-app choice
for every recipient. The profile timezone is the initial default; changing the
profile later does not move an existing schedule.

**Review schedule** resolves the actual instant on the server and shows its local
time, timezone, UTC offset, universal time, message, recipients and ready attachment
names. **Confirm schedule** persists that reviewed plan. Reviews expire after ten
minutes; changes require another review. Confirmation also rechecks that the time
is still at least one minute ahead. If a response is uncertain, check **Your
schedules** before changing the request; the app never automatically repeats writes.

**Your schedules** lists scheduled or canceled plans with bounded pagination and
refresh. Open a plan to edit subject, text and occasion, reschedule through another
review, or cancel. Cancellation preserves the plan and private content. **Move back
to drafts** clears its schedule and delivery choices so recipients or attachments
can be changed. A new schedule must be reviewed and confirmed afterward. Unsaved
choices and text edits prompt before leaving. Conflicts preserve local text until
an explicit reload/discard. Cached draft editors are discarded on schedule/reopen.

## Time and channel rules

- Dates use `YYYY-MM-DDTHH:mm`, interpreted in a named IANA timezone, not the
  phone's current zone or a numeric offset. The backend canonicalizes the zone and
  stores both the UTC instant and original local minute. UTC fields use
  PostgreSQL `timestamptz(3)`; local strings never determine when work is due.
- Instants must be at least 60 seconds ahead and within 3,660 days. Invalid dates,
  unknown zones, DST gaps and repeated local times are rejected. For a repeated
  time, choose an unambiguous minute outside the repeated interval.
- Conversion uses the free ISC-licensed
  [Temporal polyfill](https://github.com/js-temporal/temporal-polyfill), comparing
  its earlier/later interpretations and checking the local-time round trip.
  See [Temporal timezone rules](https://tc39.es/proposal-temporal/docs/timezone.html).
  Server runtime timezone data remains an operational dependency. The resolved
  instant is included in the review fingerprint, so a rules change between review
  and confirmation requires a new review.
- Only **IN_APP, planned** is available, for SELF or USER recipients whose Dearly
  account still exists. Every recipient needs exactly one supported choice.
  PHONE/EMAIL destinations remain valid in drafts but cannot be scheduled yet.
  SMS, WhatsApp and email capabilities explicitly report unavailable. No provider
  is selected or contacted, and Meta/WhatsApp Cloud API is not introduced.
- Messages require text or at least one ready attachment and at least one valid
  recipient. Every attachment must be READY. Scheduled/canceled attachment reads
  remain owner-only; reservations, uploads, finalization and removal are frozen.
- Until a dispatcher exists, even overdue plans remain SCHEDULED and editable.
  The detail screen says when its loaded schedule is overdue and states delivery
  has not run. Passing the due time does not mark anything sent or delivered.

## API

All routes require the current session, use the normal success/error envelope,
set `Cache-Control: no-store`, and filter by owner. Another user's message returns
404. Recipients gain no early content or attachment access.

Base: `/messages/schedules`.

| Method/path | Behavior |
| --- | --- |
| GET `/capabilities` | IN_APP intent-only availability; external channels unavailable; `backgroundDelivery: false` |
| GET `?status=SCHEDULED&limit=20&cursor=…` | Scheduled/canceled summaries, ascending UTC time/ID; default 20, max 50 |
| GET `/:id` | Current scheduled/canceled content, recipients, ready manifest, choices and version |
| POST `/:id/preview` | Review a DRAFT using version, localDateTime, timezone and deliveries |
| POST `/:id/confirm` | Confirm the same choices plus reviewToken |
| PATCH `/:id` | Versioned scheduled subject/text/occasion edits only |
| POST `/:id/reschedule/preview` | Review new localDateTime/timezone/version; retains choices |
| POST `/:id/reschedule` | Confirm that reschedule with reviewToken |
| POST `/:id/cancel` | `{version}`; SCHEDULED → CANCELED |
| POST `/:id/reopen` | `{version}`; CANCELED → DRAFT, clear schedule/intents |

A new schedule's `deliveries` is an array of
`{recipientId: '<draft-recipient UUID>', channels: ['IN_APP']}`. Use IDs returned by
the draft API, not account IDs. Strict bodies reject extra owner/state fields.
Each successful content/schedule transition increments the single message version.

Preview/confirmation serialize against attachment reservations/removal using a
message row lock. The lock uses schema-aware Prisma queries and a conditional
no-op timestamp update: it preserves the stored timestamp and version while
holding the row until transaction completion. Concurrent draft content changes
still use their existing version/status conditions. A conflicting operation gets
409 rather than overwriting the winner. Scheduling and delivery-intent inserts
commit together. Constraints tie each intent to a recipient of the same message,
prevent duplicate channel choices, and keep state/time metadata consistent.

A ten-minute HMAC review proof binds owner, message version/content/recipients,
attachment states/hashes/sizes, actual resolved instant, channels and action. Its
signing key is a domain-separated HMAC subkey of the existing private OTP pepper;
no key is exposed to the app. Rotation invalidates outstanding previews. Production
OTP/auth remains disabled and must be designed before public release. Proofs and
request bodies are never logged. The stored request hash permits an identical
manual confirmation retry to return the same version; a changed body or later
edit invalidates that retry. Cancel/reopen retry with the original version is
idempotent only while the immediately resulting state/version remains current.

## Database and verification

`202611160004_schedules` is additive: it extends MessageStatus, adds UTC/local/zone
metadata, a due-time index and a `delivery_intents` table. It preserves existing
drafts, recipients and attachments. Apply with `npm run prisma:deploy` in backend;
never reset the database. Future states such as dispatching/sent must deliberately
update the schedule-shape constraint in a new migration.

Run both packages' `npm run check`. Backend standard tests cover date boundaries,
quarter-hour offsets, New York and Lord Howe DST transitions, invalid input and
request validation. Opt-in backend integration tests use disposable PostgreSQL
schemas to check ownership, proof expiry/tampering, stale content/media, readiness,
confirmation retries, transitions, pagination and concurrent writes. Mobile
integration tests use the actual client/session/schedule service against Express
and PostgreSQL, including review, repeat confirmation, edit, reschedule, cancel
and return to drafts. They clean up only their temporary schemas. Use private
`AUTH_TEST_DATABASE_URL` as documented in [auth verification](authentication.md#verification);
never put credentials on a command line or in frontend configuration.

Phase 10 must recheck the current status/version, due instant, target account and
ready attachments when claiming work. It must coordinate cancellation/edits with
the same authoritative row, establish a dispatch boundary, persist per-recipient
outcomes and prevent duplicate in-app delivery. This phase has no queue records,
provider acceptance, delivery confirmations or sent/opened claims.
