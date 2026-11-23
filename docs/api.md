# API guide

Use the running backend's self-hosted reference for the complete endpoint inventory,
request schemas, safe examples and response projections:

- Local Swagger: [localhost:8080/api/docs](http://localhost:8080/api/docs)
- Hosted Swagger: [dearly-z8zm.onrender.com/api/docs](https://dearly-z8zm.onrender.com/api/docs)
- Schema: `GET /api/openapi.json` (OpenAPI 3.1.1)
- Source: [openapi.ts](../backend/src/docs/openapi.ts), backed by request validators

Swagger is read-only: Try it out, persisted authorization, remote validation and
query configuration are disabled. Assets are served locally. Loading the reference
does not query accounts/providers or send messages. Runtime ownership, cross-field,
timezone and quota checks remain mandatory beyond what JSON Schema can express.
Keep route-inventory/validator tests aligned when changing APIs; do not maintain a
second full schema in Markdown.

## Common contract

Feature JSON responses use `success`, `data` and `requestId`, or `success`, `error`
and `requestId`. Send JSON unless a route explicitly expects raw media. Private
responses use no-store caching. Dates are UTC ISO strings; local scheduling input
also supplies an IANA timezone. Unknown fields are rejected.

Protected routes require `Authorization: Bearer <accessToken>`. Refresh tokens are
not access tokens. Foreign/missing resource IDs return the same safe 404. Server
ownership checks are authoritative; a UUID, cursor, recipient entry or client guard
never grants access. Keep credentials and private bodies out of shared terminals,
URLs and screenshots. See [security and state rules](architecture.md).

## Service routes

| Route | Purpose |
| --- | --- |
| `GET /` | API identity and route discovery |
| `GET /health`, `GET /health/live` | Process liveness; no DB query |
| `GET /health/db`, `GET /health/ready` | Database connectivity/readiness |
| `GET /health/worker` | Recent delivery-worker heartbeat, not delivery proof |
| `GET /auth/otp/status` | Read-only login sender readiness |

Liveness can be healthy while storage, a worker or a provider is unavailable.
Protected operational diagnostics are described in [operations](operations.md).

## Authentication and profile

| Route | Action |
| --- | --- |
| `POST /auth/otp/request` | Request a challenge with phone and uppercase ISO country |
| `POST /auth/otp/resend` | Replace a challenge after cooldown |
| `POST /auth/otp/verify` | Verify challengeId and six-digit code; create session/account |
| `POST /auth/refresh` | Rotate both tokens; serialize calls and never replay uncertainty |
| `POST /auth/logout` | Revoke the bearer session |
| `GET /auth/me`, `PATCH /auth/me` | Read/update own name, email and timezone; phone/identity are immutable |
| `POST /auth/email/request`, `POST /auth/email/verify` | Link saved profile email after proof; not email login |

Phone input normalizes to E.164 using explicit country validation, without an
assumed +91. Real OTP responses identify the WhatsApp channel and never return a
code. Development simulation is explicitly local and rejected by release clients.
Requesting a code is a real write/send; status preparation must not trigger it.

## Draft and attachment workflow

`/messages/drafts` supports create/list; `/:id` supports read, versioned PATCH and
versioned DELETE. An empty create body can save an incomplete private draft.
Subject is at most 160 characters, text 20,000 UTF-16 units, occasion 80 and each
recipient label 80. Up to 50 recipient inputs are normalized/deduplicated in order.
SELF, USER, PHONE and EMAIL have distinct destination semantics. PATCH replaces
recipients when supplied; omitted fields remain unchanged. No automatic uncertain
create/update retry is safe.

```json
{
  "subject": "Read this later",
  "text": "Hello, future me.",
  "recipients": [{ "type": "SELF", "label": "Future me" }]
}
```

After saving, use `/messages/drafts/:draftId/attachments`:

1. POST reservation `{id, name, mime, bytes}` with a client-generated UUID.
2. PUT `/:id/content` as raw `application/octet-stream`, exact reserved length.
3. POST `/:id/finalize`; only READY confirms validation and private persistence.
4. GET metadata/content as owner; DELETE explicitly removes when editable.

After uncertainty, read the same reservation: READY is complete; UPLOADED needs
finalization; PENDING may need an explicit transfer retry; UPLOADING needs wait or
refresh. Do not make another reservation UUID to conceal an unknown result.
`/:id/content/access` returns authorized digest/size/MIME and a bounded access
window for the Android media cache. No storage path is exposed. Format/size limits
and retention are in [architecture](architecture.md#private-files-and-permissions).

## Scheduling workflow

Base: `/messages/schedules`. Read `/capabilities` before offering channels. List
or read owner plans through the base or `/:id`. Plan mutations use current versions:

| Route suffix | Action |
| --- | --- |
| `POST /:id/preview` | Review draft version, localDateTime, timezone and deliveries |
| `POST /:id/confirm` | Confirm exactly the reviewed plan with reviewToken |
| `PATCH /:id` | Edit scheduled subject/text/occasion while editable |
| `POST /:id/reschedule/preview`, `POST /:id/reschedule` | Review/confirm a new instant |
| `POST /:id/cancel` | Cancel before dispatch |
| `POST /:id/reopen` | Return canceled plan to drafts and clear delivery choices |

Deliveries use **draft-recipient IDs**, not target account IDs; each selects one
supported channel. The app's 12-hour clock converts to server local-minute input.
Review resolves the exact UTC instant and returns a short-lived proof. Confirmation
can fail if content, files, choices, timezone resolution or available time changed.
Do not silently accept a stale version or review. After an uncertain confirmation,
read saved schedules before deciding whether another explicit action is needed.
DISPATCHING ends edits/cancellation; retries do not reopen that boundary.

## Mailboxes and opening

Dashboard: `GET /messages/dashboard`. Lists:
`GET /messages/mailboxes?box=created|drafts|scheduled|sent|received|failed`.
Use valid status/read filters from Swagger and reuse opaque cursors with the same
filters. Default list size is 20, max 50; pagination is not a frozen snapshot.
Created covers owned messages; Sent and Failed can overlap for partial outcomes.
Received means committed recipient-owned inbox content, not mere provider acceptance.

Owned detail/history use `/messages/mailboxes/owned/:id` and `/:id/history` with
**message IDs**. Received detail uses `/messages/inbox/:id` with **inbox IDs**;
receiver projections omit other recipients and private owner history. Recipient
attachment content/access paths are under that same inbox record.

`POST /messages/inbox/:id/open` with an empty body is the explicit opened action.
Repeated/concurrent calls preserve the first timestamp. Reads, refreshes, playback
and background loading do not mark opened. Mutation history records actual events
transactionally, without private body copies or fabricated pre-tracking history.

## Notifications and external links

`/notifications` lists account updates/unread counts; `/:id` resolves a target;
`POST /:id/read` explicitly marks the notification read. Preferences GET/PATCH and
devices PUT/DELETE use the same namespace. Push registration binds an installation,
project and token to the session; logout disables it. Notification read state does
not mark message content opened. OS permission alone is not device registration.

`GET /external/` serves the companion page only. Explicit `POST /external/open`
accepts a bearer token for one due message; `POST /external/file` accepts its scoped
file handle. Owner-only `POST /external/deliveries/:id/revoke` revokes future bearer
access. Ordinary GET/scanner loads never open private content or record reading.
Callbacks at `/webhooks/waha` and `/webhooks/smsgate` require provider signatures
and strict outbound scope, not a user bearer token. See [delivery evidence](architecture.md#delivery-evidence-and-private-links).

## Errors and retries

| Status | Typical response |
| --- | --- |
| 400 | Validation, unsupported recipient or invalid time; correct input |
| 401 | Invalid session/code; follow the auth-specific recovery path |
| 404 | Missing, foreign or inaccessible resource |
| 409 | Version/state conflict; reload and explicitly resolve |
| 429 | Request/sender budget; honor bounded Retry-After when present |
| 503 | Disabled/unavailable capability, worker dependency or uncertain OTP dispatch |

Use documented safe error codes, not raw server exceptions. GET retries may be
bounded/abortable. Writes, refresh rotation and provider sends must not be silently
replayed after timeouts. Successful provider submission remains separate from
confirmed delivery and explicit content opening.
