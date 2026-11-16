# Mobile drafts — Phase 7

Signed-in users open **Your drafts** from home, create a draft, and explicitly
save it. Drafts can be incomplete. The editor supports a subject, message text,
preset/custom occasion, and reviewed recipients. It does not send anything.
The [draft API](draft-api.md) remains the authority for validation and ownership.

## Recipient entry

- **Myself:** the current Dearly account.
- **Dearly user:** an existing account's UUID, shared from its profile. No account
  directory, contact discovery, or contact permission is introduced.
- **Phone:** manual entry with an explicit country; normalized to E.164.
- **Email:** manual entry, trimmed and lowercased.

Recipient names are optional labels, not verified identities. Equivalent entries
are rejected locally; the server also deduplicates canonical destinations. The
owner's account ID and Myself refer to the same recipient. Adding recipients
never grants access to a private draft. An unavailable account must be removed or
replaced before saving. Cross-channel destination matching remains future work.
Finish adding or cancel a recipient before saving. The list supports removal and
shows the reviewed destinations. Limits match the server: subject 160, message
20,000 UTF-16 code units, occasion/recipient name 80, and up to 50 recipients.

## Save and recovery behavior

There is no autosave. A confirmed response displays the saved version; changing
content displays **Unsaved changes**. Repeated taps share one in-flight operation.
A confirmed create moves to the saved draft route; later saves use its current
version. Reads can renew an expired session and retry once. Writes never replay
automatically, including after session renewal.

A conflict keeps local edits and requires explicit confirmation before reloading
the saved version. Unknown network/timeout/malformed-response/server outcomes
block another write: check saved drafts first. The create endpoint has no
idempotency key, so automatic retry could create another copy. Foreground session
restoration during an in-flight write also marks its result uncertain. Explicit
navigation/discard prompts explain this uncertainty. Delete requires confirmation
and the current version. Missing/deleted drafts show recovery without stale text.

Unsaved content stays in memory for the current account and API environment.
Leaving the app temporarily gates private screens while checking the session;
models survive same-account restoration. Signing out or switching accounts/API
scope clears the workspace, and late results cannot repopulate it. Content is
never written to AsyncStorage or SecureStore. Closing/reloading the process loses
unsaved work, so save before closing. SecureStore continues to hold only auth
credentials and session-recovery metadata.

The list refreshes on focus, supports bounded cursor pagination, and presents
loading, empty, error and retry states. Existing Expo/Paper/NativeWind configuration
and versions are preserved; no dependency or backend migration was needed.

## Verification

From `frontend/`, run `npm run check` for lint, strict JavaScript/JSDoc type checks,
and 48 standard tests. The separate `npm run test:integration` requires a built
backend and private `AUTH_TEST_DATABASE_URL`. It runs auth and draft scenarios
against temporary PostgreSQL schemas and removes only those schemas afterward.
Never put the database URL on a command line or in client-visible configuration.

Draft integration exercises the actual mobile client/session/editor with the real
Express API: all four recipient types, single-dispatch create, list/reopen,
conflicting edits, explicit reload, versioned update/delete, recipient cascade and
signed-out access. Unit tests cover validation, safe response parsing, missing
records, uncertain writes, duplicate taps, scope clearing and late responses.
Platform exports validate bundling; they do not establish native hardware parity.
See the dated completion record in [the phase plan](implementation-phases.md) for
native verification and remaining limits.

Phase 8 adds [attachments, recording and uploads](attachments.md) to saved drafts.
Scheduling, delivery and inbox access remain later phases. OTP is still a local development simulation; no provider messages
are sent by these checks.
