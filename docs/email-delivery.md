# Email delivery and external access

Phase 12 uses the user-selected Gmail SMTP transport through Nodemailer. Email
does not authenticate a Dearly account. Only explicit EMAIL destinations use it.

## Access decision (before implementation)

Use a revocable bearer link, not a claim that the recipient's identity is verified.
Possession grants access to exactly one due message and its ready attachments;
forwarding the link grants that same access. The mobile confirmation explains this.
Links expire seven days after dispatch, and the owner can revoke each recipient's
link. A separate private random key signs opaque access IDs. Tokens appear in the
URL fragment, are removed from browser history on load, and are posted only after
an explicit Open message action. GETs/email scanners do not mark messages opened.
No third-party assets, analytics, or raw attachment/storage URLs are used. File
handles are scoped HMACs. All content responses are no-store with strict CSP and
no-referrer. Revocation, expiry, due time and authorization are rechecked on every
content/file request. Existing sessions cannot bypass bearer authorization.

## Submission decision

Persist a unique per-intent submission marker before calling SMTP outside database
transactions. A crash or ambiguous result after this marker is UNKNOWN and is
never automatically resent. SMTP acceptance is SUBMITTED, not DELIVERED. Gmail
SMTP supplies no authenticated delivery/bounce webhook here; asynchronous bounces
must be reviewed in the sending mailbox and are not fabricated as app receipts.
Explicit provider rejection is FAILED. Only known pre-submission connection/auth
failures or explicit temporary SMTP rejections are safe to retry, with the existing
bounded work budget. Accepted and uncertain intents are skipped on every retry.
Reserve a durable conservative rolling 24-hour sender budget (default 100, maximum
500), counting uncertain submissions too. No billing or paid service is enabled.

## Local and hosted URLs

`EMAIL_PUBLIC_URL=http://localhost:8080` is local testing only: links open on this
Mac. A remotely accessible HTTPS URL must be configured before sending usable links
to other devices. Hosted URL remains unconfigured until hosting is arranged.
Configuration is not proof of inbox delivery. The user chose to perform the real
email test themselves; automated checks must not submit any live email.

## Configuration and APIs

- Existing SMTP settings plus `EMAIL_PUBLIC_URL`, `EXTERNAL_ACCESS_SECRET` (64 hex
  characters), and optional `EMAIL_DAILY_LIMIT` (1–500; default 100). Email capability
  is unavailable without both SMTP and access configuration. Production URL requires
  HTTPS. Keep the key stable; rotating it invalidates all previously issued links.
- Authenticated scheduling preview/confirm requires exactly one EMAIL choice for an
  EMAIL recipient. Other account/phone recipients still use IN_APP. Review proofs
  bind channel, recipient, content, files and time; no automatic channel fallback.
- `GET /external/` serves the empty companion page; `GET /external/viewer.js` serves
  its static script. Neither reads a private message or records an opening.
- `POST /external/open` accepts `{token}` and returns only that message, file
  handles and expiry. It records the first explicit opening atomically and once.
- `POST /external/file` accepts `{token,handle}` and streams one private ready file.
  Browser image/audio/video previews use a fetched blob; other files can be saved.
- Authenticated `POST /external/deliveries/:intentId/revoke` is owner-only and
  idempotent; it appends one EMAIL_LINK_REVOKED event. The mobile owned-detail view
  exposes revocation. No API returns an access token to a different account.
- Revocation/expiry prevents future reads; data already loaded or downloaded cannot
  be recalled. Closing the recipient tab clears its in-memory proof/content.

The worker preserves accepted, rejected and uncertain per-intent submissions across
restarts; it does not resend them during operator retries. Temporary known-safe
failures retry within the existing five-attempt work budget, then require operator
attention. Quota exhaustion may exhaust this budget before the 24-hour reset; review
and retry only after fixing the cause. In-app successes survive mixed retries.
Each SMTP call has a 30-second deadline; forced shutdown can leave a submission
marker uncertain, which is intentionally not replayed. Worker heartbeats continue
during long batches. A lease fences database changes, not the remote mail server;
SMTP has no exactly-once guarantee. Storage failures retain the existing preflight
checks before any provider call. Current Gmail sender/credentials stay private.

## Your real email test

The user chose to run this check themselves. No automated/live SMTP send was made.

1. Keep backend, Metro and the separate updated worker running. Create a synthetic
   draft in Dearly, add your own email as an EMAIL recipient, and choose Email on
   the schedule form. Use a time at least one minute ahead, then review/confirm.
2. When due, check owned message details: Submitted means Gmail accepted it; it
   does not promise Inbox placement. Check Inbox and Spam in your Gmail account.
3. Open the email's link on this Mac while using the current localhost setting.
   Choose Open message; verify only your test text/files are visible. Close the
   tab when finished. A physical phone needs a reachable HTTPS hosted URL instead.
4. Revoke the link from the mobile owned message details and reopen the original
   email link: further content/file requests should fail. Verify expiry with an
   isolated test fixture rather than changing a real recipient's timestamps.
5. Report receipt and opening to close the Phase 12 acceptance record. Do not mark
   the phase complete from a mock/capture transport or SMTP authentication alone.

## Validation record — 17 November 2026

Backend standard checks: 57 tests, lint/typecheck/build. Frontend standard checks:
73 tests and lint/typecheck. Full backend integration: 66 runner entries including
7 parent suites (59 scenarios), with isolated PostgreSQL schemas removed afterward.
Mobile integration: 3 scenarios. Additional focused email suite exercises explicit
owner-authorized revocation and event idempotency. Expo Doctor: 20/20; iOS export
built successfully. Functional browser checks covered opening, safe text rendering,
private file loading, fragment removal and revoked-link rejection; their synthetic
account/message/file were deleted afterward. Native Simulator window access was
unavailable; a new native email flow check remains unconfirmed. Real inbox delivery
and opening are pending the user's manual check, not claimed by these results.
