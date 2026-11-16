# Draft messages and recipients — Phase 6

Drafts are private saved work owned by the authenticated sender. This phase adds
backend APIs only. It does not attach files, schedule work, send messages, notify
recipients, or expose drafts to their intended recipients. The mobile composer is
Phase 7. Authentication still uses the development-only Phase 4/5 OTP setup.

## Setup and endpoints

From `backend/`, apply the reviewed additive migration with
`npm run prisma:deploy`, regenerate with `npm run prisma:generate`, and start
`npm run dev`. Preserve the existing private database URL and auth settings; do
not reset or push a schema. No new environment variables or dependencies are needed.

All requests use `Authorization: Bearer <accessToken>`. Auth is checked before
body/query/path validation; refresh tokens are not bearer access tokens. Responses
use the existing success/error/request-ID envelope and `Cache-Control: no-store`.
The base URL is `http://localhost:8080`.

| Method/path | Input | Success |
| --- | --- | --- |
| `POST /messages/drafts` | Optional `subject`, `text`, `occasion`, `recipients` | 201, full draft, version 1 |
| `GET /messages/drafts` | Optional `limit` and `cursor` query | 200, `{ items, nextCursor }` |
| `GET /messages/drafts/:id` | Draft UUID | 200, full owned draft |
| `PATCH /messages/drafts/:id` | Required numeric `version` and at least one editable field | 200, full updated draft with incremented version |
| `DELETE /messages/drafts/:id?version=1` | Required current version as query integer | 200, `{ id, deleted: true }` |

An empty create body `{}` saves an incomplete draft: empty text, null
subject/occasion, no recipients, status `DRAFT`. Recipient completeness and future
schedule/delivery eligibility are deliberately separate from saving a draft.
Create is not idempotent: each successful POST creates a new draft. Clients must
prevent duplicate submissions and must not blindly retry an uncertain POST.

Example create body (fictional, reserved destinations; no sending occurs):

```json
{
  "subject": "Read this later",
  "text": "Hello, future me.",
  "occasion": "Birthday",
  "recipients": [
    { "type": "SELF", "label": "Future me" },
    { "type": "PHONE", "phone": "2025550190", "country": "US" },
    { "type": "EMAIL", "email": "friend@example.com" }
  ]
}
```

Full draft fields are `id`, `status`, `subject`, `text`, `occasion`, `version`,
`createdAt`, `updatedAt`, and `recipients`. Timestamps are UTC ISO strings. Each
recipient has its generated `id`, `type`, optional owner-supplied `label` (returned
as null when unset), and its destination fields below. Owner IDs, internal
canonical keys, ordering positions, target-user contact information and provider
records are not exposed in the response.

## Validation and recipient semantics

| Field/type | Rules |
| --- | --- |
| `subject` | Optional, up to 160 characters; trimmed; null/blank clears |
| `text` | Optional, up to 20,000 UTF-16 code units; whitespace/newlines preserved; empty string clears |
| `occasion` | Optional custom label up to 80 characters, e.g. Birthday; trimmed; null/blank clears; no delivery date is implied |
| `recipients` | Optional array, at most 50 input entries before deduplication; empty array removes all |
| Recipient `label` | Optional owner-supplied name up to 80 characters, trimmed and nonblank when provided; nullable; never a verified account name |
| `SELF` | No destination input; resolves to the authenticated owner's account; response includes `userId`, `unavailable` |
| `USER` | Required existing `userId` UUID; response includes only that `userId`, `unavailable`, and owner-supplied label |
| `PHONE` | Required `phone` and explicit uppercase ISO `country`; full metadata validation and E.164 normalization; no extensions or implicit +91; response includes normalized `phone` and `country` |
| `EMAIL` | Required valid email up to 254 characters; trimmed and lowercased under this app's case-insensitive destination policy; response includes `email` |

Unknown fields are rejected, including `ownerId`, `status`, `scheduledAt`,
attachments, channel flags and target-user overrides. Null is not a substitute
for an empty text or recipient array. There is no directory/search endpoint in
this phase: selecting a USER requires an already-known account UUID. Missing
account targets return a generic `INVALID_RECIPIENTS` without contact details.

Deduplication preserves first-entry order and label. Repeated normalized phone
numbers, case-folded emails, or account UUIDs collapse to one entry. SELF and a
USER reference to the owner collapse to SELF. The database also enforces a unique
canonical destination per draft.

PHONE and EMAIL remain unlinked saved destinations even when they match an app
account's contact details. They do not resolve accounts or grant access. An account
target and that person's phone/email are distinct destination kinds and may coexist;
channel-level delivery deduplication belongs to the later delivery design. No
email/profile claim is proof of recipient identity. Even an explicit USER recipient
cannot list or read the sender's draft.

If a referenced user account is deleted later, its target pointer becomes null;
the draft remains with `type: USER`, `userId: null`, `unavailable: true`. It is not
reassigned to a matching contact or another account. The sender must remove or
replace that destination before later delivery eligibility checks. Account-deletion
endpoints are not added by this phase.

## Editing, deletion and concurrency

PATCH is partial. Omitted fields remain unchanged; supplied `recipients` replaces
the complete recipient set. Every successful PATCH increments the version, even
when the supplied value equals the previous one. For example:

```json
{ "version": 1, "text": "An updated thought." }
```

The update is transactional: ownership/version checks, target validation, message
changes and recipient replacement succeed together or roll back together. The
actual mutation includes owner ID, draft status and expected version in its SQL
condition. Two concurrent updates of version 1 cannot both win. A losing update
returns `409 VERSION_CONFLICT`; the client must reload and ask the user to resolve
changes. Do not silently submit the newest version with stale content.

DELETE uses the same version precondition, so an old editor cannot delete a draft
that another editor just saved. Deletion cascades its recipient rows. A second
delete returns 404. Draft bodies/recipient detail reads use a repeatable database
snapshot so content and recipient versions do not mix during replacement.

Versions are positive PostgreSQL integers; PATCH accepts up to 2,147,483,646 so
increment cannot overflow. DELETE accepts through 2,147,483,647. No automatic write
retry, soft delete, delivery cancellation or sent-message mutation is implemented.

## Listing and pagination

`limit` defaults to 20 and accepts 1–50. `items` contains summaries:
`id`, `status`, `subject`, `occasion`, `version`, `createdAt`, `updatedAt`,
`textPreview` (first 160 Unicode code points), and `recipientCount`. It excludes
full text and recipient contact details. An empty list returns `items: []` and
`nextCursor: null`.

Sort order is newest `createdAt` first, then descending `id` to handle equal
timestamps. Pass the returned opaque `nextCursor` unchanged on the next request.
Every page still filters by authenticated owner and DRAFT status; a cursor is a
range boundary, never an authorization credential. Invalid/malformed/oversized
cursors and ambiguous query values return 400. A valid forged range cannot reveal
another owner's drafts.

Pagination is not a frozen multi-request snapshot. New drafts may require a list
refresh; edits do not change creation order, and deletions may shorten later pages.
No global total or cross-account listing is provided.

## Errors and privacy

- `400 VALIDATION_ERROR`: invalid body, UUID, version, cursor, limit or unknown fields.
- `400 INVALID_RECIPIENTS`: one or more requested account destinations are unavailable.
- `401 UNAUTHORIZED`: missing, invalid, expired or revoked bearer session.
- `404 DRAFT_NOT_FOUND`: unknown draft or another account's draft, with the same safe error.
- `409 VERSION_CONFLICT`: owned draft changed; reload before editing/deleting.
- `409 DRAFT_NOT_EDITABLE`: reserved for an owned message that is no longer a draft.
- `503 AUTH_DISABLED`: authentication not enabled; draft routes remain closed.
- `503 DRAFTS_UNAVAILABLE`: authenticated route cannot obtain draft storage.

Baseline body limits, CORS and IP rate limits still apply; excess traffic returns
`429 RATE_LIMITED` with `Retry-After`.

Logs retain only safe request metadata. Text, subject, labels, destinations,
credentials and raw database errors are not logged. Owner filters are enforced
on the server; client route guards are not treated as authorization.

## Verification

`npm run check` in `backend/` runs lint, typechecking, all 31 standard tests and
build. `npm audit` reports zero vulnerabilities. Standard tests do not connect to
Neon or send messages.

The opt-in `npm run test:integration` uses a private `AUTH_TEST_DATABASE_URL`.
Draft tests create and drop only a random `dearly_draft_test_<uuid>` schema,
apply all migrations with qualified table/enum names, and authenticate two users
through the real HTTP contract. Coverage includes every recipient type, normalization,
recipient privacy, empty drafts, partial edits/clears, authorization, revoked sessions,
transaction rollback, concurrent update/delete conflicts, equal-timestamp pagination,
forged cursors, preview bounds, deleted targets and safe validation/errors/logging.
The existing auth regression suite remains part of that command. No provider sends
or public test accounts are required.

The versioned SQL predicate relies on PostgreSQL's documented
[Read Committed update behavior](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED),
which rechecks a row condition after waiting for a concurrent update.

Phase 7 will add the mobile composer/recipient flow, use these version preconditions,
map safe draft errors, and integrate authenticated draft requests without duplicate
write retries. Attachments, scheduling and delivery remain subsequent phases.
