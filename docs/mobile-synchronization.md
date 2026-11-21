# Mobile cache consumption and synchronization — Phase 21

## Eligible reads and authority

Neon and authenticated server responses remain authoritative. The session manager
can serve fresh encrypted native snapshots for dashboard counts, first mailbox
pages with validated filters, notification preferences, owner details and already
delivered recipient details. Page cursors, history, draft/schedule editors,
capabilities, review tokens, OTPs, attachment bytes, signed links and writes remain
remote. Profile snapshots may be stored but never prove login: restore and
loadProfile still check `/auth/me` remotely. Web does not persist private snapshots.

The cache read deadline is the earliest of the record TTL, access-token expiry,
session expiry and 60 seconds after the most recent successful protected server
response. This verification window is memory-only and cannot survive a process
restart. A cached response never renews it. There is no offline sign-in. Foreground
restoration hides authenticated screens until remote verification succeeds.
Remote revocation cannot be discovered while offline; a previously authorized copy
may remain visible within this bounded window. This is an explicit limitation,
not an instant revocation guarantee. Backward-clock cache purge remains active.

Record TTLs remain profile/preferences/details 5 minutes, dashboard/mailbox page
60 seconds. Foreground/reconnect/mutation invalidation can discard copies earlier.
An expired/private access-denied copy is removed from the rendered screen before
refreshing. A failed manual refresh can retain only the still-valid displayed copy,
with its timestamp, deadline and a visible error. It never extends the deadline.

## Refresh, cancellation and ordering

- Normal focus/repeated navigation may use a fresh snapshot. Existing refresh
  actions pass `cache: 'reload'` and force a server check.
- Matching eligible GETs share one in-flight operation. Each caller cancels its
  own subscription; the transport aborts only when all callers cancel. A new
  request never joins an already aborted operation. Writes are never coalesced.
- Auth transitions synchronously suspend cache access and abort shared reads.
  Generation checks reject old in-flight results before capture or display.
- Any mutation invalidates all eligible snapshots before dispatch and again after
  settlement, including timeout/unknown/error results. Broad invalidation is
  deliberate for this small cache: message, settings, email-verification and
  attachment changes affect several projections. No stale success is substituted
  for an uncertain write; only subsequent GETs may reconcile it.
- Active cache-aware resources clear/reload on invalidation. Foreground uses the
  existing remote session restore. A disconnected-to-connected event invalidates
  active data and refreshes it. No IP-address/device-identity lookup is performed.
- Read failures use exponential backoff (2, 4, 8, 16, then 30 seconds) and honor a
  bounded server Retry-After. Per-path metadata is capped at 256 entries and is
  cleared on invalidation/auth transitions. UI recovery attempts are capped at
  two automatic retries, stop on blur, and never retry a write. A retry delay
  above 30 seconds requires a later explicit/user-driven read.
- An active view can refresh at expiry at most five times per focus session; its
  final expired copy is hidden until explicit refresh/refocus/reconnect. No
  background or unbounded delivery polling is introduced. Stop aborts work,
  clears timers and removes private displayed data.

Mailbox page 1 alone is cached. Canonical keys include mailbox, status and read
filter; duplicate/unknown query fields or pagination are not eligible. Appended
pages are tied to the exact first-page representation and discarded when it
changes, expires or is refreshed. Pagination itself remains remote.

Settings keep unsaved choices separately from the latest server baseline.
Background updates replace pristine fields but preserve user edits. Expiry hides
the form while retaining its unsaved choices in component memory for recovery.
Saving still requires a real server response and is never queued offline. Detail
view actions still pass through authoritative draft/schedule/access APIs; simply
viewing a cached recipient message never creates an opened receipt.

## Measured optimization and deliberate exclusions

Automated measurements use real host SQLite with fake HTTP transports: three
repeated eligible reads require one protected server request rather than three;
three simultaneous readers also share one. Forced refresh, expiry, invalidation
and uncertain-write reconciliation make new requests. Report counts as controlled
fixture evidence, not production latency or a guarantee for every navigation.

No measured server-side read hotspot justifies an additional Redis layer here.
Redis remains optional; PostgreSQL queues/leases are unchanged. Existing service
contracts do not offer a validated conditional-GET/304 protocol through the mobile
JSON response envelope, so this phase does not add speculative ETag handling or
cache authentication responses at a proxy. Native caching fails safely to server
reads when encryption/storage is unavailable; no fallback plaintext DB is used.

## Verification and release evidence

See the dated Phase 21 record in [the follow-up plan](follow-up-phases.md).
Unit/integration tests cover deduplication, subscriber cancellation, expired auth
windows, denied reads, invalidation races, bounded retry behavior and uncertain
writes. Synthetic rendered checks cover dashboard expiry, detail status placement,
settings edit preservation and pagination reset. Native proof and exact-commit
APK/deployment/release evidence must be recorded separately, not inferred from
browser fixtures or host SQLite tests. No real OTP/message is needed for these
checks. Persistent media and viewer work remain Phase 22.
