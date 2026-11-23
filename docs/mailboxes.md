# Mailboxes, activity and opened tracking (Phase 11)

Dearly's signed-in home now shows account-scoped counts and links to six mailboxes.
The existing Expo SDK 58, Paper themes, NativeWind configuration, draft editor and
schedule-management flow remain in place. No dependency or paid service is added.

## Categories and truth

| Mailbox | Meaning |
| --- | --- |
| Created | Every message owned by this account, including drafts and canceled plans |
| Scheduled | Owned messages still in SCHEDULED; paused plans are labeled |
| Sent | Owned messages with evidence of at least one committed in-app delivery |
| Received | This account's own due, delivered in-app inbox records |
| Drafts | Owned DRAFT messages |
| Needs attention | Owned FAILED and PARTIALLY_DELIVERED messages |

Counts overlap deliberately. A partially delivered message appears in both Sent
and Needs attention. A self-delivery appears in both Sent and Received. A retrying
message with a previously successful recipient remains Sent even while its current
state is DISPATCHING. Failed filtering reflects current terminal failure/partial
states; it does not pretend an active retry has already failed.

Dashboard counts and each list/detail response use a repeatable-read PostgreSQL
snapshot. Counts are never inferred from the mobile clock. Sent evidence requires
an IN_APP inbox record or its committed successful delivery attempt; unsupported
SMS/WhatsApp/email acceptance records do not establish delivery or opening. If an
account/inbox record is administratively removed, retained successful in-app
attempts still establish historical sending; opened evidence may no longer be
retained. This phase does not define permanent account-deletion retention policy.

Owner lists use stable creation-time/ID ordering, newest first. Received uses
its delivery-time/inbox-ID ordering. All lists support bounded cursor pagination
(default 20, maximum 50), refresh, loading, empty and retry states. Owner views can
filter message state; Received filters all, unmarked or marked-as-opened records.
Cursors are bound to the category and filters, and never grant access to another
account. Changing filters aborts the previous request, clears the page and starts
again. Appending pages deduplicates IDs. Refresh errors retain the previous page
with a clear stale-data message. Confirmed 401/403/404 responses clear retained
private content instead of continuing to show an unavailable message.

## Details and actions

An owned detail shows subject, text, occasion, creation/update times, the saved
IANA timezone and UTC delivery instant, ready attachment previews, all of that
owner's recipients and separate per-channel outcomes. Partial delivery is explicitly
labeled. Attempt summaries contain safe state/reason codes and timestamps, not
claim tokens, worker IDs, storage paths, hashes or review proofs. The current
message state remains separate from each recipient's delivery/opened evidence.

Draft details link to the existing editor; SCHEDULED/CANCELED details link to the
existing versioned schedule-management screen. Once dispatch starts, edit/cancel/
reopen controls are absent. The server remains authoritative if a worker wins a
race after a detail was loaded. Ready attachment access remains private. Pending
uploads are managed in the draft editor, not treated as ready content in details.

Received details show only the recipient's delivered content and ready attachments,
with the sender's profile display name (or a neutral fallback), the scheduled
instant/timezone and the recipient's own delivery/opened times. They omit other
recipients, sender phone details and the owner's private editing history. A display
name is profile information, not verified real-world identity. Receiver attachment
paths use the caller's inbox record; draft/owner attachment routes never authorize
a recipient before delivery. Private downloads reuse the existing session-aware
streaming/cache adapter and are removed when a preview closes or its view unmounts.

## Explicit opened choice

GET requests, refreshing, viewing a message, background loading and playing an
attachment do **not** mark it opened. Received details explain that the message can
be read privately, then offer **Mark as opened**. Choosing it lets the sender see
the opened timestamp for that recipient. It does not prove reading, understanding,
notification display or an external-channel receipt.

The POST accepts an empty JSON body only and records database time. The caller must
own a committed due IN_APP inbox record. Concurrent/repeated requests preserve the
first opened timestamp and add only one OPENED activity event. It does not change
the business message version or delivery state. The mobile app never automatically
replays this write; after an uncertain response it tells the user to reload before
retrying. 'Unmarked' describes absence of the explicit choice, not unread content.

## Durable history

`202611170006_mailboxes` adds the nullable inbox opened timestamp, its delivery-time
constraint and `message_events`. Events are created in the same transaction as
actual draft/schedule changes, dispatch claims/outcomes, retries or first opened
choices. Preview/read/no-op retry calls create no duplicate mutation events.
Events include a kind, state, message version and database timestamp, without a
message-body copy. An internal monotonic sequence orders even tied timestamps;
it never appears in public responses. History cursors are event UUIDs scoped to
the owned message. The mobile detail shows bounded pages and offers Older/Latest
activity rather than downloading an unlimited history.

Pre-existing messages receive a BASELINE event at migration time, labeled 'Tracking
began — earlier changes are not recorded.' No earlier creation/edit/delivery events
are invented. History survives process restarts, but deleting a draft/message
cascades its history. Recipient details show only their own delivery/opened facts.
The operator retry and existing delivery-worker safety rules remain unchanged.
Apply the additive migration with `npm run prisma:deploy`; never reset the database.
Restart the separate worker using the new build so subsequent activity is recorded.

## API

All routes require a session, use the common response envelope, enforce ownership
on the server and set private/no-store caching. Foreign and missing message IDs
return the same 404 behavior.

| Route | Behavior |
| --- | --- |
| GET `/messages/dashboard` | Snapshot counts, unmarked count and server asOf time |
| GET `/messages/mailboxes?box=created&limit=20&cursor=…` | Owned or received summaries; categories above |
| GET `/messages/mailboxes?box=created&status=SCHEDULED` | State filter for owner mailboxes |
| GET `/messages/mailboxes?box=received&read=unopened` | Received all/opened/unopened filtering |
| GET `/messages/mailboxes/owned/:id` | Owned detail, individual outcomes and first history page |
| GET `/messages/mailboxes/owned/:id/history?limit=20&cursor=…` | Older owner-only activity |
| GET `/messages/inbox/:id` | Private delivered content, display-name attribution and own opened state |
| POST `/messages/inbox/:id/open` | Empty body; explicit, idempotent opened choice |
| GET `/messages/inbox/:id/attachments/:attachmentId/content` | Authorized private bytes/ranges |

Owned IDs are message IDs; received IDs are inbox IDs. Knowing one never grants
access through the other route. Strict inputs reject caller-supplied owner/read
status/timestamps and cross-filter cursors. Unknown channels cannot be shown as
confirmed external delivery, provider acceptance or opened receipts.

## Verification and boundaries

Run both packages' `npm run check`. Backend integration tests require private
`AUTH_TEST_DATABASE_URL`, use disposable schemas and cover baseline migration,
category overlap, two-account isolation, tied-date pagination, history/no-op
idempotency, explicit concurrent opened choices, private ranges and unsupported
external outcomes. A mobile integration test uses two real client/session managers
and Express/PostgreSQL to compose, schedule, deliver, browse separate mailboxes,
mark opened, inspect sender tracking and restore/sign out. Source checking and
client tests cover malformed payloads, late responses, focus/account clearing,
manual write retries, scope-correct media paths and safe errors. Existing delivery,
auth, draft, media and schedule suites remain regression checks.

Authentication is still development-only. Email, WhatsApp and SMS delivery,
external content links, notifications and public release work remain later phases.
See [worker operations](delivery-workers.md), [scheduling](scheduling.md) and the
[current project documentation](README.md) for exact completion evidence and native limits.

## Phase 12 extension

Configured EMAIL destinations now use the Gmail SMTP worker and revocable external
access. Earlier in-app-only statements describe the Phase 9–11 baseline. Email
`SUBMITTED` means SMTP acceptance; `PARTIALLY_SUBMITTED` preserves mixed failures,
and `DELIVERY_UNKNOWN` stops automatic resending after ambiguity. Received still
means an account-owned in-app inbox item; email never silently becomes account
login or a Dearly inbox item. Sender Sent includes accepted email submissions;
per-recipient detail keeps submission and opening separate from delivery proof.
See [email contracts](email-delivery.md) for current access and retry rules.

## Phase 13 WhatsApp extension

Configured PHONE recipients may explicitly choose WHATSAPP instead of IN_APP.
Consent is bound to schedule review and persisted; there is no automatic extra
channel. The shared external worker retains accepted/uncertain submissions and
per-provider budgets. Core sender readiness is visible. Authenticated scoped
acknowledgements can confirm notification delivery/read while private content
opening remains a separate action. Failed notification evidence appears in Failed
mailbox counts/lists and can recover from a later stronger receipt without another
send. See [WhatsApp contracts](whatsapp-delivery.md). Earlier unavailable-WhatsApp
statements describe the prior phase baseline; SMS remains unavailable.
